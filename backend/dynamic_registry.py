"""Dynamic Instrument Registry e cache dei codici strumento.

Fornisce un rilassamento dei gate storici hardcoded permettendo di registrare
e validare dinamicamente qualsiasi strumento creato in amministrazione.
Include cache in memoria con TTL e fallback difensivo sui set storici.
"""
from __future__ import annotations

import logging
import time
from typing import Callable, Optional, Set

logger = logging.getLogger(__name__)

# Set storici di ripiego per garantire assoluta backward-compatibility
HISTORIC_INSTRUMENT_CODES: frozenset[str] = frozenset({
    "QSA", "QSAr", "ZTPI", "SAVICKAS", "QPCS", "QPCC", "QAP", "IDEA",
    "EVENTO_STUDIO", "EVENTO_PROFESSIONALE", "OBIETTIVO_STUDIO", "OBIETTIVO_DOCENZA",
})

# Cache in-memory
_CACHE_TTL_SECONDS = 30.0
_cache_timestamp: float = 0.0
_cache_all_codes: set[str] = set()
_cache_active_codes: set[str] = set()
_custom_session_factory: Optional[Callable] = None


def set_session_factory(factory: Optional[Callable]) -> None:
    """Configura una factory di sessione DB personalizzata (utile per test isolati)."""
    global _custom_session_factory
    _custom_session_factory = factory
    invalidate_instrument_cache()


def register_instrument_in_cache(code: str, *, is_active: bool = True) -> None:
    """Registra direttamente uno strumento nella cache in-memory."""
    global _cache_timestamp, _cache_all_codes, _cache_active_codes
    if not code:
        return
    c = str(code).strip()
    _cache_all_codes.add(c)
    if is_active:
        _cache_active_codes.add(c)
    if _cache_timestamp == 0.0:
        _cache_timestamp = time.monotonic()


def invalidate_instrument_cache() -> None:
    """Invalida la cache in memoria degli strumenti."""
    global _cache_timestamp, _cache_all_codes, _cache_active_codes
    _cache_timestamp = 0.0
    _cache_all_codes = set()
    _cache_active_codes = set()


def _refresh_cache_if_needed(db=None) -> None:
    """Ricarica la cache dal database se scaduta o non inizializzata."""
    global _cache_timestamp, _cache_all_codes, _cache_active_codes
    now = time.monotonic()
    if db is None and _cache_timestamp > 0 and (now - _cache_timestamp) < _CACHE_TTL_SECONDS:
        return

    owned_session = False
    if db is None:
        if _custom_session_factory is not None:
            try:
                db = _custom_session_factory()
                owned_session = True
            except Exception as e:
                logger.debug(f"dynamic_registry: custom_session_factory fallita: {e}")
                return
        else:
            try:
                from .database import SessionLocal
                db = SessionLocal()
                owned_session = True
            except Exception as e:
                logger.debug(f"dynamic_registry: impossibile creare SessionLocal: {e}")
                return

    try:
        from . import models
        rows = db.query(models.Instrument.code, models.Instrument.is_active).all()
        all_codes = {str(r[0]) for r in rows if r[0]}
        active_codes = {str(r[0]) for r in rows if r[0] and bool(r[1])}

        _cache_all_codes = all_codes
        _cache_active_codes = active_codes
        _cache_timestamp = now
    except Exception as e:
        logger.debug(f"dynamic_registry: errore caricamento strumenti da DB: {e}")
    finally:
        if owned_session and db is not None:
            try:
                db.close()
            except Exception:
                pass


def get_registered_instrument_codes(db=None, *, require_active: bool = False) -> set[str]:
    """Restituisce l'insieme dei codici strumento registrati nel DB + fallback storico."""
    _refresh_cache_if_needed(db)
    base = set(HISTORIC_INSTRUMENT_CODES)
    if require_active:
        return base | _cache_active_codes
    return base | _cache_all_codes


def is_registered_instrument(code: str, db=None, *, require_active: bool = False) -> bool:
    """Verifica se un codice strumento e' registrato (supporta confronto case-insensitive)."""
    if not code or not isinstance(code, str):
        return False
    target = code.strip()
    if not target:
        return False

    # Fast path: fallback storico esatto
    if target in HISTORIC_INSTRUMENT_CODES:
        return True

    codes = get_registered_instrument_codes(db, require_active=require_active)
    if target in codes:
        return True

    # Case-insensitive check
    target_lower = target.lower()
    for c in codes:
        if c.lower() == target_lower:
            return True
    return False


class DynamicInstrumentSet(set):
    """Set dinamico trasparente che combina fallback storico e lookup DB.

    Eredita da `set` per consentire `in`, `len()`, iterazioni e serializzazioni
    senza regressioni di tipo.
    """

    def __init__(self, fallback_codes: frozenset[str] | set[str] | tuple[str, ...], *, require_active: bool = False):
        super().__init__(fallback_codes)
        self._fallback = frozenset(fallback_codes)
        self._require_active = require_active

    def __contains__(self, item: object) -> bool:
        if not isinstance(item, str):
            return False
        # Fast path
        if super().__contains__(item):
            return True
        return is_registered_instrument(item, require_active=self._require_active)

    def __iter__(self):
        codes = set(self._fallback)
        try:
            codes.update(get_registered_instrument_codes(require_active=self._require_active))
        except Exception:
            pass
        return iter(codes)

    def __len__(self) -> int:
        codes = set(self._fallback)
        try:
            codes.update(get_registered_instrument_codes(require_active=self._require_active))
        except Exception:
            pass
        return len(codes)
