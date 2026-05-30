"""RAG index per il chatbot del sito competenzestrategiche.it.

Indice locale ibrido (vettori + grafo) costruito sui markdown convertiti da
`docs/graphify-out/converted/` con espansione del contesto via il grafo di
conoscenza in `docs/graphify-out/cache/semantic/*.json` (nodi/archi prodotti
dalla skill graphify).

- Embeddings: locali via Ollama (modello `embedding_model`, default bge-m3),
  calcolati attraverso `AIService.embed_texts`.
- Similarità: coseno in puro Python (corpus piccolo → niente numpy).
- Persistenza: un singolo JSON in `RAG_INDEX_DIR`; ricostruzione incrementale
  quando cambia la firma del corpus (hash dei file) o il modello di embedding.
- Grounding: la retrieval ritorna i chunk; è il prompt di sistema della route a
  imporre di rispondere SOLO dai materiali.

Il corpus `graphify-out` è ancora in costruzione (popolato da un altro LLM):
l'indice si ricostruisce da solo quando compaiono nuovi file convertiti.
"""
from __future__ import annotations

import json
import logging
import math
import os
import re
import threading
import time

logger = logging.getLogger(__name__)

# --- Percorsi (override via env in Docker) ---
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(_BACKEND_DIR)

DOCS_DIR = os.environ.get("RAG_DOCS_DIR", os.path.join(_REPO_ROOT, "docs"))
INDEX_DIR = os.environ.get("RAG_INDEX_DIR", os.path.join(_REPO_ROOT, ".rag_index"))
GRAPHIFY_DIR = os.path.join(DOCS_DIR, "graphify-out")
CONVERTED_DIR = os.path.join(GRAPHIFY_DIR, "converted")
SEMANTIC_DIR = os.path.join(GRAPHIFY_DIR, "cache", "semantic")
STAT_INDEX_PATH = os.path.join(GRAPHIFY_DIR, "cache", "stat-index.json")
INDEX_PATH = os.path.join(INDEX_DIR, "site_rag_index.json")

# Sorgenti escluse dal corpus (relative a docs/): materiali interni/di sviluppo,
# non contenuti del sito. Le mail organizzative (es. mail-olle) restano fuori.
EXCLUDED_PREFIXES = (
    "progetto/comunicazioni/",
    "progetto/organizzazione/",
    "prompting/",
    "implementazione/",
    "image/",
)

# Parametri di chunking/retrieval (default; il top-k è anche da config).
_CHUNK_TARGET_CHARS = 1100
_CHUNK_OVERLAP_BLOCKS = 1
DEFAULT_TOP_K = 6
_GRAPH_EXPANSION_CAP = 4  # chunk extra portati via vicini nel grafo


# ---------------------------------------------------------------------------
# Util di basso livello
# ---------------------------------------------------------------------------
def _relpath_from_source(path: str) -> str:
    """Normalizza un percorso sorgente (assoluto, eventualmente di un'altra
    macchina) in path relativo a docs/. graphify salva path assoluti."""
    if not path:
        return ""
    p = path.replace("\\", "/")
    marker = "/docs/"
    if marker in p:
        return p.split(marker, 1)[1]
    return p.lstrip("/")


def _is_excluded(relpath: str) -> bool:
    rp = relpath.replace("\\", "/").lstrip("/")
    return any(rp.startswith(prefix) for prefix in EXCLUDED_PREFIXES)


def _hash8_from_converted_name(filename: str) -> str:
    """`Nome_<hash8>.md` → `<hash8>` (8 hex). Stringa vuota se non combacia."""
    m = re.search(r"_([0-9a-f]{8})\.md$", filename)
    return m.group(1) if m else ""


def _first_heading(text: str) -> str:
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("#"):
            return s.lstrip("#").strip()
    return ""


def _chunk_markdown(text: str) -> list[str]:
    """Spezza il markdown in chunk ~_CHUNK_TARGET_CHARS rispettando i blocchi
    (paragrafi separati da riga vuota), con un blocco di overlap fra chunk."""
    blocks = [b.strip() for b in re.split(r"\n\s*\n", text) if b.strip()]
    if not blocks:
        return []
    chunks: list[str] = []
    cur: list[str] = []
    cur_len = 0
    for block in blocks:
        if cur and cur_len + len(block) > _CHUNK_TARGET_CHARS:
            chunks.append("\n\n".join(cur))
            cur = cur[-_CHUNK_OVERLAP_BLOCKS:] if _CHUNK_OVERLAP_BLOCKS else []
            cur_len = sum(len(b) for b in cur)
        cur.append(block)
        cur_len += len(block)
    if cur:
        chunks.append("\n\n".join(cur))
    return chunks


# ---------------------------------------------------------------------------
# Lettura corpus + grafo graphify
# ---------------------------------------------------------------------------
def _load_hash_to_relpath() -> dict[str, str]:
    """Da stat-index.json: hash completo del file -> path relativo a docs/."""
    out: dict[str, str] = {}
    try:
        with open(STAT_INDEX_PATH, encoding="utf-8") as f:
            stat = json.load(f)
    except Exception as e:
        logger.debug("stat-index non leggibile (%s): %s", STAT_INDEX_PATH, e)
        return out
    for abs_path, meta in stat.items():
        h = (meta or {}).get("hash")
        if h:
            out[h] = _relpath_from_source(abs_path)
    return out


def _build_basename_to_relpath() -> dict[str, str]:
    """Mappa basename-senza-estensione -> relpath (relativo a docs/), camminando
    docs/ ma saltando graphify-out. Serve a risolvere la sorgente reale dei file
    convertiti quando lo schema di hash di graphify non combacia con stat-index."""
    out: dict[str, str] = {}
    if not os.path.isdir(DOCS_DIR):
        return out
    for root, dirs, files in os.walk(DOCS_DIR):
        if "graphify-out" in dirs:
            dirs.remove("graphify-out")
        for fn in files:
            stem = os.path.splitext(fn)[0]
            relpath = os.path.relpath(os.path.join(root, fn), DOCS_DIR).replace("\\", "/")
            # Preferisci una sorgente non esclusa se ci sono omonimi.
            if stem not in out or (_is_excluded(out[stem]) and not _is_excluded(relpath)):
                out[stem] = relpath
    return out


def _load_graph():
    """Aggrega i JSON del grafo semantico graphify.

    Ritorna: adjacency {node_id: set(neighbor_id)}, relpath->node_id,
    node_id->relpath. Ogni file semantic/<fullhash>.json contiene nodi (con
    source_file) e archi fra node id."""
    adjacency: dict[str, set] = {}
    relpath_to_node: dict[str, str] = {}
    node_to_relpath: dict[str, str] = {}
    if not os.path.isdir(SEMANTIC_DIR):
        return adjacency, relpath_to_node, node_to_relpath
    for name in os.listdir(SEMANTIC_DIR):
        if not name.endswith(".json"):
            continue
        try:
            with open(os.path.join(SEMANTIC_DIR, name), encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue
        for node in data.get("nodes", []):
            nid = node.get("id")
            rp = _relpath_from_source(node.get("source_file", ""))
            if nid and rp:
                node_to_relpath[nid] = rp
                relpath_to_node[rp] = nid
        for edge in data.get("edges", []):
            s, t = edge.get("source"), edge.get("target")
            if s and t:
                adjacency.setdefault(s, set()).add(t)
                adjacency.setdefault(t, set()).add(s)
    return adjacency, relpath_to_node, node_to_relpath


def _collect_corpus() -> tuple[list[dict], dict[str, str]]:
    """Legge i markdown convertiti (esclusi i prefissi interni) e li spezza.

    Ritorna (chunks, signature) dove ogni chunk è
    {id, source, title, text} e signature è {filename: hash8} (firma corpus)."""
    chunks: list[dict] = []
    signature: dict[str, str] = {}
    if not os.path.isdir(CONVERTED_DIR):
        logger.warning("Cartella converted assente: %s", CONVERTED_DIR)
        return chunks, signature

    hash_to_relpath = _load_hash_to_relpath()
    basename_to_relpath = _build_basename_to_relpath()

    for filename in sorted(os.listdir(CONVERTED_DIR)):
        if not filename.endswith(".md"):
            continue
        hash8 = _hash8_from_converted_name(filename)
        # Risolvi la sorgente reale per applicare le esclusioni e citare il file.
        # 1) hash esatto via stat-index (preciso) → 2) basename sul filesystem docs
        # (robusto allo schema di hash di graphify) → 3) fallback al nome convertito.
        relpath = ""
        if hash8:
            for full_hash, rp in hash_to_relpath.items():
                if full_hash.startswith(hash8):
                    relpath = rp
                    break
        if not relpath:
            stem = re.sub(r"_[0-9a-f]{8}$", "", os.path.splitext(filename)[0])
            relpath = basename_to_relpath.get(stem, "")
        if not relpath:
            relpath = filename  # fallback: usa il nome convertito
        if _is_excluded(relpath):
            logger.info("Corpus: escluso %s", relpath)
            continue

        path = os.path.join(CONVERTED_DIR, filename)
        try:
            with open(path, encoding="utf-8") as f:
                text = f.read()
        except Exception as e:
            logger.warning("Impossibile leggere %s: %s", path, e)
            continue

        signature[filename] = hash8 or str(int(os.path.getmtime(path)))
        title = _first_heading(text) or os.path.splitext(os.path.basename(relpath))[0]
        for i, chunk_text in enumerate(_chunk_markdown(text)):
            chunks.append({
                "id": f"{filename}#{i}",
                "source": relpath,
                "title": title,
                "text": chunk_text,
            })
    return chunks, signature


# ---------------------------------------------------------------------------
# Indice
# ---------------------------------------------------------------------------
class SiteRagIndex:
    """Indice in-memory persistito su disco. Thread-safe per build/reload."""

    def __init__(self):
        self._lock = threading.Lock()
        self.chunks: list[dict] = []
        self.embeddings: list[list[float]] = []
        self.norms: list[float] = []
        self.adjacency: dict[str, set] = {}
        self.relpath_to_node: dict[str, str] = {}
        self.node_to_relpath: dict[str, str] = {}
        self.signature: dict[str, str] = {}
        self.embedding_model: str = ""
        self.built_at: float = 0.0
        self._loaded = False

    # --- persistenza ---
    def _load_from_disk(self) -> bool:
        if not os.path.exists(INDEX_PATH):
            return False
        try:
            with open(INDEX_PATH, encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            logger.warning("Indice RAG non leggibile: %s", e)
            return False
        self.chunks = data.get("chunks", [])
        self.embeddings = data.get("embeddings", [])
        self.norms = [math.sqrt(sum(x * x for x in v)) for v in self.embeddings]
        self.adjacency = {k: set(v) for k, v in data.get("adjacency", {}).items()}
        self.relpath_to_node = data.get("relpath_to_node", {})
        self.node_to_relpath = data.get("node_to_relpath", {})
        self.signature = data.get("signature", {})
        self.embedding_model = data.get("embedding_model", "")
        self.built_at = data.get("built_at", 0.0)
        self._loaded = True
        return True

    def _save_to_disk(self):
        os.makedirs(INDEX_DIR, exist_ok=True)
        tmp = INDEX_PATH + ".tmp"
        payload = {
            "embedding_model": self.embedding_model,
            "built_at": self.built_at,
            "signature": self.signature,
            "chunks": self.chunks,
            "embeddings": self.embeddings,
            "adjacency": {k: sorted(v) for k, v in self.adjacency.items()},
            "relpath_to_node": self.relpath_to_node,
            "node_to_relpath": self.node_to_relpath,
        }
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        os.replace(tmp, INDEX_PATH)

    # --- build / ensure ---
    def _current_signature(self):
        chunks, signature = _collect_corpus()
        return chunks, signature

    def needs_rebuild(self, ai_service) -> bool:
        if not self._loaded and not self._load_from_disk():
            return True
        if self.embedding_model != (ai_service.embedding_model or "qwen3-embedding:4b"):
            return True
        _, signature = self._current_signature()
        return signature != self.signature

    def build(self, ai_service):
        """(Ri)costruisce l'indice: raccolta corpus → embeddings → grafo → salva."""
        with self._lock:
            chunks, signature = self._current_signature()
            if not chunks:
                logger.warning("Nessun documento nel corpus RAG (converted vuoto?).")
                self.chunks, self.embeddings, self.norms = [], [], []
                self.signature = signature
                self.embedding_model = ai_service.embedding_model or "qwen3-embedding:4b"
                self.built_at = time.time()
                self.adjacency, self.relpath_to_node, self.node_to_relpath = _load_graph()
                self._loaded = True
                self._save_to_disk()
                return
            texts = [c["text"] for c in chunks]
            logger.info("RAG build: %d chunk, modello embedding=%s", len(texts), ai_service.embedding_model)
            embeddings = ai_service.embed_texts(texts)
            self.chunks = chunks
            self.embeddings = embeddings
            self.norms = [math.sqrt(sum(x * x for x in v)) for v in embeddings]
            self.signature = signature
            self.embedding_model = ai_service.embedding_model or "qwen3-embedding:4b"
            self.built_at = time.time()
            self.adjacency, self.relpath_to_node, self.node_to_relpath = _load_graph()
            self._loaded = True
            self._save_to_disk()
            logger.info("RAG build completato: %d chunk indicizzati", len(self.chunks))

    def ensure(self, ai_service):
        if self.needs_rebuild(ai_service):
            self.build(ai_service)

    # --- retrieval ibrida ---
    def search(self, ai_service, query: str, top_k: int = DEFAULT_TOP_K):
        """Ritorna lista di {score, source, title, text} ordinata per rilevanza,
        con espansione via grafo dei documenti vicini ai migliori risultati."""
        self.ensure(ai_service)
        if not self.chunks:
            return []
        q_vec = ai_service.embed_query(query)
        if not q_vec:
            return []
        q_norm = math.sqrt(sum(x * x for x in q_vec))

        scored = []
        for idx, emb in enumerate(self.embeddings):
            n = self.norms[idx]
            if not n or not q_norm:
                scored.append((0.0, idx))
                continue
            dot = sum(x * y for x, y in zip(q_vec, emb))
            scored.append((dot / (q_norm * n), idx))
        scored.sort(key=lambda t: t[0], reverse=True)

        top = scored[:top_k]
        selected_idx = {idx for _, idx in top}
        selected_sources = {self.chunks[idx]["source"] for _, idx in top}

        # Espansione via grafo: per le sorgenti top, porta i vicini non ancora presi.
        neighbor_sources: set[str] = set()
        for src in selected_sources:
            nid = self.relpath_to_node.get(src)
            if not nid:
                continue
            for neigh in self.adjacency.get(nid, ()):  # node id vicini
                rp = self.node_to_relpath.get(neigh)
                if rp and rp not in selected_sources:
                    neighbor_sources.add(rp)

        if neighbor_sources:
            extra = []
            for score, idx in scored:
                if idx in selected_idx:
                    continue
                if self.chunks[idx]["source"] in neighbor_sources:
                    extra.append((score, idx))
                if len(extra) >= _GRAPH_EXPANSION_CAP:
                    break
            top = top + extra

        results = []
        for score, idx in top:
            c = self.chunks[idx]
            results.append({
                "score": round(float(score), 4),
                "source": c["source"],
                "title": c["title"],
                "text": c["text"],
            })
        return results

    def stats(self) -> dict:
        return {
            "loaded": self._loaded,
            "n_chunks": len(self.chunks),
            "n_sources": len({c["source"] for c in self.chunks}),
            "n_graph_nodes": len(self.node_to_relpath),
            "embedding_model": self.embedding_model,
            "built_at": self.built_at,
            "docs_dir": DOCS_DIR,
            "index_path": INDEX_PATH,
        }


# Istanza singola condivisa dal router.
site_rag_index = SiteRagIndex()


def build_context(results: list[dict], max_chars: int = 8000) -> tuple[str, list[str]]:
    """Compone il blocco di contesto citato per il prompt e l'elenco fonti."""
    parts = []
    sources: list[str] = []
    used = 0
    for i, r in enumerate(results, 1):
        snippet = r["text"].strip()
        header = f"[FONTE {i}] {r['title']} ({r['source']})"
        block = f"{header}\n{snippet}"
        if used + len(block) > max_chars and parts:
            break
        parts.append(block)
        used += len(block)
        if r["source"] not in sources:
            sources.append(r["source"])
    return "\n\n---\n\n".join(parts), sources
