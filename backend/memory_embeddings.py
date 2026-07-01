"""Retrieval semantico per le memorie (episodi di sessione, strategie).

Usa `AIService.embed_texts` (Ollama, default bge-m3) con una piccola cache
npz persistente, stessa filosofia di `rag_index._EmbeddingCache` ma per testi
brevi e volatili. Qualsiasi anomalia (Ollama spento, modello non configurato,
risposta malformata, AIService mockato nei test) produce `None`: il chiamante
ricade sul matching keyword esistente. La chat non deve mai fallire per colpa
del retrieval semantico.
"""

from __future__ import annotations

import hashlib
import logging
import os
import threading
from pathlib import Path
from typing import List, Optional

import numpy as np


logger = logging.getLogger(__name__)

# Sotto questa similarità coseno l'elemento è considerato non pertinente.
DEFAULT_MIN_SIMILARITY = 0.35
# Oltre questo numero di vettori la cache scarta gli inserimenti più vecchi.
MAX_CACHE_ENTRIES = 4000


def _default_cache_path() -> Path:
    base = Path(os.environ.get("SESSION_MEMORY_DIR", "session_memory"))
    return Path(os.environ.get("MEMORY_EMBED_CACHE", str(base / ".embed_cache.npz")))


class MemoryEmbedder:
    """Ranking per similarità coseno di testi brevi, con cache su disco."""

    def __init__(self, cache_path: Path | None = None) -> None:
        self._lock = threading.Lock()
        self._cache_path = cache_path or _default_cache_path()
        self._vectors: dict[str, np.ndarray] = {}
        self._loaded = False

    def rank(
        self,
        ai_service,
        query: str,
        items: List[str],
        limit: int,
        min_similarity: float = DEFAULT_MIN_SIMILARITY,
    ) -> Optional[List[int]]:
        """Indici di `items` pertinenti a `query`, ordinati per similarità decrescente.

        Ritorna None se il ranking semantico non è disponibile (il chiamante
        deve usare il fallback keyword); lista vuota se nulla supera la soglia.
        """
        query = (query or "").strip()
        if not query or not items or ai_service is None:
            return None
        try:
            model = str(getattr(ai_service, "embedding_model", "") or "")
            if not model:
                return None
            vectors = self._embed_cached(ai_service, model, [query] + list(items))
            if vectors is None:
                return None
            query_vec, item_matrix = vectors[0], vectors[1:]
            similarities = item_matrix @ query_vec
            ranked = [
                (float(score), index)
                for index, score in enumerate(similarities)
                if float(score) >= min_similarity
            ]
            ranked.sort(key=lambda row: (row[0], row[1]), reverse=True)
            return [index for _, index in ranked[:limit]]
        except Exception as e:
            logger.debug("Ranking semantico non disponibile, fallback keyword: %s", e)
            return None

    # --- embedding + cache ---

    def _embed_cached(self, ai_service, model: str, texts: List[str]) -> Optional[np.ndarray]:
        keys = [self._key(model, text) for text in texts]
        with self._lock:
            self._ensure_loaded()
            cached = {key: self._vectors[key] for key in keys if key in self._vectors}
        missing = [(key, text) for key, text in zip(keys, texts) if key not in cached]

        if missing:
            raw = ai_service.embed_texts([text for _, text in missing], model=model)
            matrix = np.asarray(raw, dtype=np.float32)
            if matrix.ndim != 2 or matrix.shape[0] != len(missing) or matrix.shape[1] < 8:
                return None
            norms = np.linalg.norm(matrix, axis=1, keepdims=True)
            norms[norms == 0] = 1.0
            matrix = matrix / norms
            with self._lock:
                for (key, _), vector in zip(missing, matrix):
                    cached[key] = vector
                    self._vectors[key] = vector
                while len(self._vectors) > MAX_CACHE_ENTRIES:
                    self._vectors.pop(next(iter(self._vectors)))
                self._save()

        try:
            return np.stack([cached[key] for key in keys])
        except ValueError:
            # Dimensioni incoerenti tra cache e nuovo modello: cache inservibile.
            with self._lock:
                self._vectors.clear()
                self._save()
            return None

    @staticmethod
    def _key(model: str, text: str) -> str:
        return hashlib.sha256(f"{model}\n{text}".encode("utf-8")).hexdigest()

    def _ensure_loaded(self) -> None:
        if self._loaded:
            return
        self._loaded = True
        if not self._cache_path.exists():
            return
        try:
            data = np.load(self._cache_path, allow_pickle=True)
            keys = data["keys"].tolist()
            vecs = data["vecs"]
            self._vectors = {key: vecs[i] for i, key in enumerate(keys)}
        except Exception as e:
            logger.warning("Cache embedding memoria non leggibile (%s), ricostruita", e)
            self._vectors = {}

    def _save(self) -> None:
        try:
            self._cache_path.parent.mkdir(parents=True, exist_ok=True)
            grouped: dict[int, list[tuple[str, np.ndarray]]] = {}
            for key, vector in self._vectors.items():
                arr = np.asarray(vector, dtype=np.float32).reshape(-1)
                if arr.size:
                    grouped.setdefault(int(arr.shape[0]), []).append((key, arr))
            kept = max(grouped.values(), key=len) if grouped else []
            self._vectors = {key: vector for key, vector in kept}
            keys = list(self._vectors.keys())
            vecs = np.stack(list(self._vectors.values())) if keys else np.zeros((0, 0), dtype=np.float32)
            with open(self._cache_path, "wb") as f:
                np.savez(f, keys=np.array(keys, dtype=object), vecs=vecs)
        except Exception as e:
            logger.warning("Salvataggio cache embedding memoria fallito: %s", e)


memory_embedder = MemoryEmbedder()
