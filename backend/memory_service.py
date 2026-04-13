"""
SessionMemory – gestione riassunti conversazionali in-memory con TTL.

Mantiene un riassunto cumulativo per ogni session_id.
Il riassunto cresce step-by-step ed è iniettato nel contesto LLM.
"""

import threading
import time
from typing import Dict, Optional

# Durata massima di una sessione in secondi (2 ore)
DEFAULT_TTL_SECONDS = 7200

# Lunghezza massima del riassunto cumulativo (in caratteri).
# 10 step × 80 parole × ~5 char ≈ 4000 char. Limite a 6000 per avere margine.
MAX_SUMMARY_CHARS = 6000


class _SessionData:
    __slots__ = ("summary", "last_access")

    def __init__(self) -> None:
        self.summary: str = ""
        self.last_access: float = time.time()

    def touch(self) -> None:
        self.last_access = time.time()


class SessionMemory:
    """Thread-safe in-memory store per riassunti conversazionali."""

    def __init__(self, ttl_seconds: int = DEFAULT_TTL_SECONDS) -> None:
        self._store: Dict[str, _SessionData] = {}
        self._lock = threading.Lock()
        self._ttl = ttl_seconds

    # --- Public API ---

    def get_summary(self, session_id: str) -> str:
        """Restituisce il riassunto cumulativo della sessione (stringa vuota se assente)."""
        with self._lock:
            data = self._store.get(session_id)
            if data is None:
                return ""
            data.touch()
            return data.summary

    def set_summary(self, session_id: str, new_summary: str) -> None:
        """Sostituisce il riassunto della sessione con la versione aggiornata (rolling summary)."""
        if not new_summary or not new_summary.strip():
            return
        with self._lock:
            data = self._store.get(session_id)
            if data is None:
                data = _SessionData()
                self._store[session_id] = data
            data.summary = new_summary.strip()[:MAX_SUMMARY_CHARS]
            data.touch()

    def clear(self, session_id: str) -> None:
        """Cancella la sessione."""
        with self._lock:
            self._store.pop(session_id, None)

    def cleanup_expired(self) -> int:
        """Rimuove sessioni scadute. Restituisce il numero di sessioni rimosse."""
        now = time.time()
        with self._lock:
            expired = [
                sid
                for sid, data in self._store.items()
                if (now - data.last_access) > self._ttl
            ]
            for sid in expired:
                del self._store[sid]
            return len(expired)


# Istanza singleton usata dall'applicazione
session_memory = SessionMemory()
