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

# Lunghezza massima del riassunto cumulativo (in caratteri, ~6000 token)
MAX_SUMMARY_CHARS = 24000


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

    def append_summary(self, session_id: str, new_chunk: str) -> None:
        """Appende un nuovo blocco di riassunto alla sessione, troncando i blocchi più vecchi se necessario."""
        if not new_chunk or not new_chunk.strip():
            return
        with self._lock:
            data = self._store.get(session_id)
            if data is None:
                data = _SessionData()
                self._store[session_id] = data
            if data.summary:
                data.summary += "\n\n" + new_chunk.strip()
            else:
                data.summary = new_chunk.strip()
            # Tronca i blocchi più vecchi se si supera il limite
            if len(data.summary) > MAX_SUMMARY_CHARS:
                blocks = data.summary.split("\n\n")
                while len("\n\n".join(blocks)) > MAX_SUMMARY_CHARS and len(blocks) > 1:
                    blocks.pop(0)
                data.summary = "\n\n".join(blocks)
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
