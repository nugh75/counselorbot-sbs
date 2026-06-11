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

import fcntl
import hashlib
import json
import logging
import os
import re
import subprocess
import threading
import time

import numpy as np

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
INDEX_PATH = os.path.join(INDEX_DIR, "site_rag_index.json")       # meta (no vettori)
EMB_PATH = os.path.join(INDEX_DIR, "site_rag_embeddings.npy")     # matrice embeddings
CACHE_PATH = os.path.join(INDEX_DIR, "site_embed_cache.npz")      # cache hash→vettore
LOCK_PATH = os.path.join(INDEX_DIR, ".build.lock")                # lock cross-worker

# Sorgenti escluse dal corpus (relative a docs/): materiali interni/di sviluppo,
# non contenuti del sito. Le mail organizzative (es. mail-olle) restano fuori.
EXCLUDED_PREFIXES = (
    "progetto/comunicazioni/",
    "progetto/organizzazione/",
    "prompting/",
    "implementazione/",
    "image/",
)

# Cartelle (relative a docs/) da cui ingerire i PDF direttamente (estrazione testo
# via pdftotext) quando non esiste una versione markdown convertita da graphify.
PDF_INCLUDE_DIRS = ("fonti", "questionari", "validazione")

# I 6 libri di riferimento voluminosi → categoria "approfondimenti" (peso basso),
# così non dominano il retrieval pur restando cercabili.
_GIANT_STEMS = {
    "imparare_a_dirigere_se_stessi",
    "portfolio_digitale",
    "dirigere_se_stessi_2020",
    "strumenti_e_metodologie",
    "promuovere_la_crescita_nelle_competenze_strategiche",
    "soft_skill",
}

# Pesi di fallback se la config DB non è disponibile/valida. Morbidi: penalizzano
# davvero solo i riferimenti esterni voluminosi (approfondimenti).
DEFAULT_CATEGORY_WEIGHTS = {
    "strumenti": 1.0, "guide": 1.0, "validazione": 1.0,
    "studi": 0.9, "convegni": 0.75, "approfondimenti": 0.5, "altro": 0.9,
}

# Quanti tra i migliori match GREZZI (per coseno) garantire sempre nel contesto,
# così il peso categoria non seppellisce mai l'evidenza più pertinente.
_RAW_GUARANTEE = 2


def category_for(source: str) -> str:
    """Macro-categoria di una sorgente, dal path relativo a docs/."""
    rp = (source or "").lower()
    stem = os.path.splitext(os.path.basename(rp))[0]
    if stem in _GIANT_STEMS or "/fonti-esterne-collegate/cnos-fap/" in rp:
        return "approfondimenti"
    if rp.startswith("validazione/"):
        return "validazione"
    if "/convegni/" in rp:  # cartella convegni = programmi/slide divulgative
        return "convegni"
    if "/strumenti/" in rp or rp.startswith("questionari/"):
        return "strumenti"
    if "/guide/" in rp or "/guide-html/" in rp or "/modelli-operativi/" in rp or stem.startswith("guida"):
        return "guide"
    # paper accademici (anche quelli "_Convegno_YYYY" a top-level) → studi
    if "/studi/" in rp or "/roma-tre-press/" in rp or "_convegno_" in rp:
        return "studi"
    return "altro"

# Parametri di chunking/retrieval (default; il top-k è anche da config).
_CHUNK_TARGET_CHARS = 1100
_CHUNK_OVERLAP_BLOCKS = 1
DEFAULT_TOP_K = 10
_GRAPH_EXPANSION_CAP = 4  # chunk extra portati via vicini nel grafo

# Versione della normalizzazione del markdown: cambiarla invalida l'indice
# salvato (forza il re-embed) anche se i file sorgente non sono cambiati.
_NORMALIZER_VERSION = 1


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


def _reflow_table_rows(text: str) -> str:
    """La conversione docx→md va a capo a ~80 char e spezza le righe di tabella
    (es. l'header continua sulla riga successiva), così GFM non le riconosce.
    Ricuce ogni riga di tabella (inizia con '|') finché non termina con '|'."""
    lines = text.split("\n")
    out: list[str] = []
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        if line.lstrip().startswith("|"):
            row = line.rstrip()
            i += 1
            # Unisci le continuazioni: righe che NON iniziano con '|' e non vuote.
            while not row.endswith("|") and i < n:
                cont = lines[i].strip()
                if not cont or cont.startswith("|"):
                    break
                row = row + " " + cont
                i += 1
            out.append(row)
        else:
            out.append(line)
            i += 1
    return "\n".join(out)


def _normalize_markdown(text: str) -> str:
    """Pulisce il markdown convertito per una lettura/retrieval migliori:
    rimuove i commenti HTML, ricuce le tabelle spezzate, comprime i leader di
    puntini/ellissi dei moduli, normalizza le righe vuote."""
    if not text:
        return text
    # Commenti HTML (es. "<!-- converted from X.docx -->")
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    # Tabelle spezzate dal wrapping
    text = _reflow_table_rows(text)
    # Leader di compilazione: ellissi unicode o puntini lunghi → marcatore breve
    text = re.sub(r"…{2,}", "…", text)
    text = re.sub(r"\.{4,}", "…", text)
    text = re.sub(r"(?:\s*[._]){6,}", " ___", text)  # underscore/puntini spaziati
    # Spazi finali + righe vuote multiple
    text = "\n".join(ln.rstrip() for ln in text.split("\n"))
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _split_long_block(block: str, limit: int) -> list[str]:
    """Spezza un blocco troppo lungo (tipico dei PDF senza righe vuote) in pezzi
    <= limit, su confini di frase quando possibile."""
    if len(block) <= limit:
        return [block]
    pieces: list[str] = []
    cur = ""
    for sent in re.split(r"(?<=[.!?])\s+", block):
        if len(sent) > limit:
            if cur.strip():
                pieces.append(cur.strip())
                cur = ""
            for k in range(0, len(sent), limit):
                pieces.append(sent[k:k + limit])
            continue
        if cur and len(cur) + len(sent) + 1 > limit:
            pieces.append(cur.strip())
            cur = ""
        cur = f"{cur} {sent}".strip()
    if cur.strip():
        pieces.append(cur.strip())
    return pieces


def _extract_pdf_text(abspath: str) -> str:
    """Estrae il testo da un PDF via pdftotext (poppler). Stringa vuota se fallisce."""
    try:
        res = subprocess.run(
            ["pdftotext", "-q", abspath, "-"],
            capture_output=True,
            timeout=180,
        )
        if res.returncode != 0:
            return ""
        return res.stdout.decode("utf-8", errors="replace").replace("\f", "\n\n")
    except Exception as e:
        logger.warning("pdftotext fallito per %s: %s", abspath, e)
        return ""


def _chunk_markdown(text: str) -> list[str]:
    """Spezza il markdown in chunk ~_CHUNK_TARGET_CHARS rispettando i blocchi
    (paragrafi separati da riga vuota), con un blocco di overlap fra chunk."""
    raw_blocks = [b.strip() for b in re.split(r"\n\s*\n", text) if b.strip()]
    blocks: list[str] = []
    for b in raw_blocks:
        blocks.extend(_split_long_block(b, _CHUNK_TARGET_CHARS))
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
                text = _normalize_markdown(f.read())
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
    # --- PDF ingeriti direttamente (quando manca una versione convertita) ---
    covered_sources = {c["source"] for c in chunks}
    for subdir in PDF_INCLUDE_DIRS:
        base = os.path.join(DOCS_DIR, subdir)
        if not os.path.isdir(base):
            continue
        for root, _dirs, files in os.walk(base):
            for fn in sorted(files):
                if not fn.lower().endswith(".pdf"):
                    continue
                abspath = os.path.join(root, fn)
                relpath = os.path.relpath(abspath, DOCS_DIR).replace("\\", "/")
                if _is_excluded(relpath):
                    continue
                # Firma registrata SEMPRE (anche se saltato), per combaciare con
                # _corpus_signature ed evitare rebuild perpetui.
                try:
                    stat = os.stat(abspath)
                    signature[relpath] = f"{stat.st_size}:{int(stat.st_mtime)}"
                except OSError:
                    signature[relpath] = "pdf"
                if relpath in covered_sources:
                    continue
                raw = _extract_pdf_text(abspath)
                if not raw.strip():
                    logger.info("PDF senza testo estraibile (saltato): %s", relpath)
                    continue
                text = _normalize_markdown(raw)
                title = os.path.splitext(fn)[0].replace("_", " ")
                doc_chunks = _chunk_markdown(text)
                logger.info("PDF ingerito: %s (%d chunk)", relpath, len(doc_chunks))
                for i, chunk_text in enumerate(doc_chunks):
                    chunks.append({
                        "id": f"{relpath}#{i}",
                        "source": relpath,
                        "title": title,
                        "text": chunk_text,
                    })

    # Stato del grafo semantico (deve combaciare con _corpus_signature).
    if os.path.isdir(SEMANTIC_DIR):
        gfiles = [f for f in os.listdir(SEMANTIC_DIR) if f.endswith(".json")]
        gmt = 0
        for fn in gfiles:
            try:
                gmt = max(gmt, int(os.path.getmtime(os.path.join(SEMANTIC_DIR, fn))))
            except OSError:
                pass
        signature["__graph__"] = f"{len(gfiles)}:{gmt}"
    # La versione del normalizzatore entra nella firma: cambiarla forza il re-embed.
    signature["__normalizer_version__"] = str(_NORMALIZER_VERSION)
    return chunks, signature


def _corpus_signature() -> dict[str, str]:
    """Firma del corpus calcolata SOLO da metadati (nomi + mtime/size), senza
    leggere/estate i contenuti. Deve combaciare con la signature prodotta da
    _collect_corpus, così needs_rebuild non ri-estrae i PDF a ogni query."""
    sig: dict[str, str] = {}
    if os.path.isdir(CONVERTED_DIR):
        hash_to_relpath = _load_hash_to_relpath()
        basename_to_relpath = _build_basename_to_relpath()
        for filename in sorted(os.listdir(CONVERTED_DIR)):
            if not filename.endswith(".md"):
                continue
            hash8 = _hash8_from_converted_name(filename)
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
                relpath = filename
            if _is_excluded(relpath):
                continue
            path = os.path.join(CONVERTED_DIR, filename)
            sig[filename] = hash8 or str(int(os.path.getmtime(path)))
    for subdir in PDF_INCLUDE_DIRS:
        base = os.path.join(DOCS_DIR, subdir)
        if not os.path.isdir(base):
            continue
        for root, _dirs, files in os.walk(base):
            for fn in sorted(files):
                if not fn.lower().endswith(".pdf"):
                    continue
                relpath = os.path.relpath(os.path.join(root, fn), DOCS_DIR).replace("\\", "/")
                if _is_excluded(relpath):
                    continue
                try:
                    st = os.stat(os.path.join(root, fn))
                    sig[relpath] = f"{st.st_size}:{int(st.st_mtime)}"
                except OSError:
                    sig[relpath] = "pdf"
    # Stato del grafo semantico graphify: cambia quando vengono aggiunti/aggiornati
    # frammenti in cache/semantic → forza il reload del grafo (re-embed cache-hit).
    if os.path.isdir(SEMANTIC_DIR):
        gfiles = [f for f in os.listdir(SEMANTIC_DIR) if f.endswith(".json")]
        gmt = 0
        for fn in gfiles:
            try:
                gmt = max(gmt, int(os.path.getmtime(os.path.join(SEMANTIC_DIR, fn))))
            except OSError:
                pass
        sig["__graph__"] = f"{len(gfiles)}:{gmt}"
    sig["__normalizer_version__"] = str(_NORMALIZER_VERSION)
    return sig


class _EmbeddingCache:
    """Cache hash(testo+modello)→vettore, persistita su .npz. Evita di ri-embeddare
    i chunk invariati a ogni rebuild (con migliaia di chunk fa la differenza)."""

    def __init__(self, path: str):
        self.path = path
        self.model = ""
        self._map: dict[str, int] = {}
        self._vecs: np.ndarray | None = None

    @staticmethod
    def key(model: str, text: str) -> str:
        return hashlib.sha256(f"{model}\n{text}".encode("utf-8")).hexdigest()

    def load(self, model: str):
        self.model = model
        self._map = {}
        self._vecs = None
        if not os.path.exists(self.path):
            return
        try:
            data = np.load(self.path, allow_pickle=True)
            if str(data["model"]) != model:
                return  # modello diverso → cache non valida
            keys = data["keys"].tolist()
            self._vecs = data["vecs"]
            self._map = {k: i for i, k in enumerate(keys)}
        except Exception as e:
            logger.warning("Cache embedding non leggibile: %s", e)

    def get(self, key: str):
        i = self._map.get(key)
        return None if (i is None or self._vecs is None) else self._vecs[i]

    def save(self, keys: list[str], matrix: np.ndarray, model: str):
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            with open(self.path, "wb") as f:
                np.savez(f, model=model, keys=np.array(keys, dtype=object), vecs=matrix)
        except Exception as e:
            logger.warning("Salvataggio cache embedding fallito: %s", e)


# ---------------------------------------------------------------------------
# Indice
# ---------------------------------------------------------------------------
class SiteRagIndex:
    """Indice in-memory persistito su disco. Thread-safe per build/reload."""

    def __init__(self):
        self._lock = threading.Lock()
        self.chunks: list[dict] = []
        self.categories: list[str] = []            # macro-categoria per chunk (allineata a chunks)
        self.matrix: np.ndarray | None = None     # (n, d) float32
        self.norms: np.ndarray | None = None       # (n,) float32
        self.adjacency: dict[str, set] = {}
        self.relpath_to_node: dict[str, str] = {}
        self.node_to_relpath: dict[str, str] = {}
        self.signature: dict[str, str] = {}
        self.embedding_model: str = ""
        self.built_at: float = 0.0
        self._loaded = False

    # --- persistenza (meta in JSON, vettori in .npy) ---
    def _load_from_disk(self) -> bool:
        if not os.path.exists(INDEX_PATH) or not os.path.exists(EMB_PATH):
            return False
        try:
            with open(INDEX_PATH, encoding="utf-8") as f:
                data = json.load(f)
            matrix = np.load(EMB_PATH)
        except Exception as e:
            logger.warning("Indice RAG non leggibile: %s", e)
            return False
        self.chunks = data.get("chunks", [])
        self.categories = [category_for(c["source"]) for c in self.chunks]
        self.matrix = matrix.astype(np.float32, copy=False)
        self.norms = np.linalg.norm(self.matrix, axis=1) if len(self.matrix) else np.zeros(0, dtype=np.float32)
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
        tmp_json = INDEX_PATH + ".tmp"
        payload = {
            "embedding_model": self.embedding_model,
            "built_at": self.built_at,
            "signature": self.signature,
            "chunks": self.chunks,
            "adjacency": {k: sorted(v) for k, v in self.adjacency.items()},
            "relpath_to_node": self.relpath_to_node,
            "node_to_relpath": self.node_to_relpath,
        }
        with open(tmp_json, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)
        np.save(EMB_PATH, self.matrix if self.matrix is not None else np.zeros((0, 1), dtype=np.float32))
        os.replace(tmp_json, INDEX_PATH)

    # --- build / ensure ---
    def _is_current(self, ai_service) -> bool:
        """L'indice in memoria è già allineato a corpus + modello?"""
        if not self._loaded or self.matrix is None:
            return False
        if self.embedding_model != (ai_service.embedding_model or "qwen3-embedding:4b"):
            return False
        return _corpus_signature() == self.signature

    def needs_rebuild(self, ai_service) -> bool:
        if not self._loaded and not self._load_from_disk():
            return True
        return not self._is_current(ai_service)

    def build(self, ai_service):
        """(Ri)costruisce l'indice. Lock cross-worker (file) per evitare che i 4
        worker uvicorn embeddino lo stesso corpus in parallelo: chi non costruisce
        ricarica da disco il risultato dell'altro."""
        with self._lock:
            os.makedirs(INDEX_DIR, exist_ok=True)
            with open(LOCK_PATH, "w") as lockf:
                try:
                    fcntl.flock(lockf, fcntl.LOCK_EX)
                except OSError:
                    pass
                # Un altro worker potrebbe aver costruito mentre attendevamo il lock.
                self._load_from_disk()
                if self._is_current(ai_service):
                    return
                self._do_build(ai_service)

    def _do_build(self, ai_service):
        model = ai_service.embedding_model or "qwen3-embedding:4b"
        chunks, signature = _collect_corpus()
        self.adjacency, self.relpath_to_node, self.node_to_relpath = _load_graph()
        self.chunks = chunks
        self.categories = [category_for(c["source"]) for c in chunks]
        self.signature = signature
        self.embedding_model = model
        self.built_at = time.time()
        self._loaded = True

        if not chunks:
            logger.warning("Nessun documento nel corpus RAG.")
            self.matrix = np.zeros((0, 1), dtype=np.float32)
            self.norms = np.zeros(0, dtype=np.float32)
            self._save_to_disk()
            return

        texts = [c["text"] for c in chunks]
        cache = _EmbeddingCache(CACHE_PATH)
        cache.load(model)
        keys = [_EmbeddingCache.key(model, t) for t in texts]
        vectors: list = [None] * len(texts)
        miss_idx, miss_txt = [], []
        for i, k in enumerate(keys):
            v = cache.get(k)
            if v is None:
                miss_idx.append(i)
                miss_txt.append(texts[i])
            else:
                vectors[i] = v
        logger.info(
            "RAG build: %d chunk (cache hit %d, da embeddare %d) modello=%s",
            len(texts), len(texts) - len(miss_txt), len(miss_txt), model,
        )
        if miss_txt:
            new = ai_service.embed_texts(miss_txt)
            for j, idx in enumerate(miss_idx):
                vectors[idx] = np.asarray(new[j], dtype=np.float32)

        self.matrix = np.asarray(vectors, dtype=np.float32)
        self.norms = np.linalg.norm(self.matrix, axis=1)
        cache.save(keys, self.matrix, model)
        self._save_to_disk()
        logger.info("RAG build completato: %d chunk indicizzati", len(self.chunks))

    def ensure(self, ai_service):
        if self.needs_rebuild(ai_service):
            self.build(ai_service)

    # --- retrieval ibrida ---
    def search(self, ai_service, query: str, top_k: int = DEFAULT_TOP_K,
               audience: str = "studente", weights: dict | None = None,
               audience_weights: dict | None = None, max_per_source: int = 3,
               min_score: float = 0.0):
        """Retrieval ibrido con priorità per macro-categoria.

        score pesato = coseno × peso(categoria) × moltiplicatore(pubblico). Applica
        soglia minima sul coseno grezzo e un tetto di chunk per documento, poi
        espande via grafo. Ritorna {score, weighted, category, source, title, text}."""
        self.ensure(ai_service)
        if not self.chunks or self.matrix is None or len(self.matrix) == 0:
            return []
        q_vec = ai_service.embed_query(query)
        if not q_vec:
            return []
        q = np.asarray(q_vec, dtype=np.float32)
        q_norm = float(np.linalg.norm(q))
        if q_norm == 0.0:
            return []

        weights = weights or DEFAULT_CATEGORY_WEIGHTS
        aud = (audience_weights or {}).get(audience, {})

        # Coseno vettorizzato, poi score pesato per macro-categoria + pubblico.
        sims = (self.matrix @ q) / (self.norms * q_norm + 1e-9)

        def cat_weight(idx: int) -> float:
            cat = self.categories[idx] if idx < len(self.categories) else "altro"
            base = weights.get(cat, DEFAULT_CATEGORY_WEIGHTS.get(cat, 0.8))
            return float(base) * float(aud.get(cat, 1.0))

        # Boost lessicale: query del tipo "cosa dice <autore> su X" → il nome
        # dell'autore/strumento è nel nome del file ma pesa poco nell'embedding.
        # Se un termine (≥4 lettere) della domanda è nel basename della sorgente, boosta.
        qterms = {t for t in re.findall(r"[a-zàèéìòùç0-9]{4,}", query.lower())}

        def name_boost(idx: int) -> float:
            stem = self.chunks[idx]["source"].rsplit("/", 1)[-1].lower()
            return 1.4 if any(t in stem for t in qterms) else 1.0

        # Candidati sopra soglia, ordinati per score pesato.
        cand = []  # (weighted, raw, idx)
        for idx in range(len(sims)):
            raw = float(sims[idx])
            if raw < min_score:
                continue
            cand.append((raw * cat_weight(idx) * name_boost(idx), raw, idx))
        if not cand:
            # Tutto sotto soglia (probabile fuori tema): prendi comunque i top grezzi,
            # così il prompt di grounding può dichiarare che non è nei materiali.
            for i in np.argsort(-sims)[:top_k]:
                idx = int(i)
                cand.append((float(sims[idx]) * cat_weight(idx), float(sims[idx]), idx))
        cand.sort(key=lambda t: -t[0])

        # Selezione top_k con cap per sorgente (diversità).
        per_src: dict[str, int] = {}
        top = []
        for wsc, raw, idx in cand:
            src = self.chunks[idx]["source"]
            if per_src.get(src, 0) >= max_per_source:
                continue
            per_src[src] = per_src.get(src, 0) + 1
            top.append((wsc, raw, idx))
            if len(top) >= top_k:
                break

        selected_idx = {idx for _, _, idx in top}

        # Garanzia: includi i migliori match grezzi (il peso categoria non deve
        # escludere l'evidenza più pertinente, es. un paper accademico). ESCLUDE
        # 'approfondimenti' (i libroni esterni), che NON vanno mai forzati dentro.
        guaranteed = 0
        for i in np.argsort(-sims):
            idx = int(i)
            if float(sims[idx]) < min_score or guaranteed >= _RAW_GUARANTEE:
                break
            cat = self.categories[idx] if idx < len(self.categories) else "altro"
            if cat == "approfondimenti" or idx in selected_idx:
                continue
            selected_idx.add(idx)
            top.append((float(sims[idx]) * cat_weight(idx), float(sims[idx]), idx))
            guaranteed += 1

        selected_sources = {self.chunks[idx]["source"] for _, _, idx in top}

        # Espansione via grafo: porta vicini delle sorgenti top non ancora presi.
        neighbor_sources: set[str] = set()
        for src in selected_sources:
            nid = self.relpath_to_node.get(src)
            if not nid:
                continue
            for neigh in self.adjacency.get(nid, ()):
                rp = self.node_to_relpath.get(neigh)
                if rp and rp not in selected_sources:
                    neighbor_sources.add(rp)

        if neighbor_sources:
            extra = []
            for wsc, raw, idx in cand:
                if idx in selected_idx:
                    continue
                src = self.chunks[idx]["source"]
                if src in neighbor_sources and per_src.get(src, 0) < max_per_source:
                    per_src[src] = per_src.get(src, 0) + 1
                    extra.append((wsc, raw, idx))
                if len(extra) >= _GRAPH_EXPANSION_CAP:
                    break
            top = top + extra

        results = []
        for wsc, raw, idx in sorted(top, key=lambda t: -t[0]):  # presenta per score pesato (rilevanza)
            c = self.chunks[idx]
            results.append({
                "score": round(raw, 4),
                "weighted": round(wsc, 4),
                "category": self.categories[idx] if idx < len(self.categories) else "altro",
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


def _safe_doc_abspath(relpath: str) -> str | None:
    """Path assoluto dentro DOCS_DIR, o None se esce dalla cartella (anti path-traversal)."""
    docs_root = os.path.abspath(DOCS_DIR)
    p = os.path.normpath(os.path.join(docs_root, relpath))
    if p == docs_root or p.startswith(docs_root + os.sep):
        return p
    return None


def _source_to_converted_map() -> dict[str, str]:
    """relpath sorgente -> path del markdown convertito (stessa risoluzione di _collect_corpus)."""
    out: dict[str, str] = {}
    if not os.path.isdir(CONVERTED_DIR):
        return out
    hash_to_relpath = _load_hash_to_relpath()
    basename_to_relpath = _build_basename_to_relpath()
    for filename in os.listdir(CONVERTED_DIR):
        if not filename.endswith(".md"):
            continue
        hash8 = _hash8_from_converted_name(filename)
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
            relpath = filename
        out[relpath] = os.path.join(CONVERTED_DIR, filename)
    return out


def get_document_preview(source: str):
    """Risolve l'anteprima per una sorgente citata.

    Ritorna:
    - ("pdf", abspath)              se l'originale è un PDF leggibile;
    - ("markdown", text, title)     altrimenti (markdown convertito, o il file
                                    stesso se è già .md);
    - None                          se non anteprimabile.
    """
    low = source.lower()
    # PDF originale → anteprima diretta
    if low.endswith(".pdf"):
        p = _safe_doc_abspath(source)
        if p and os.path.isfile(p):
            return ("pdf", p)
    # Markdown convertito (per docx/altri formati)
    conv = _source_to_converted_map().get(source)
    if conv and os.path.isfile(conv):
        with open(conv, encoding="utf-8") as f:
            text = _normalize_markdown(f.read())
        title = _first_heading(text) or os.path.splitext(os.path.basename(source))[0].replace("_", " ")
        return ("markdown", text, title)
    # Il file sorgente è già markdown
    if low.endswith(".md"):
        p = _safe_doc_abspath(source)
        if p and os.path.isfile(p):
            with open(p, encoding="utf-8") as f:
                text = _normalize_markdown(f.read())
            title = _first_heading(text) or os.path.splitext(os.path.basename(source))[0].replace("_", " ")
            return ("markdown", text, title)
    return None


def build_context(results: list[dict], max_chars: int = 10000) -> tuple[str, list[str]]:
    """Compone il blocco di contesto citato per il prompt e l'elenco fonti."""
    parts = []
    sources: list[str] = []
    used = 0
    for i, r in enumerate(results, 1):
        snippet = r["text"].strip()
        header = f"[SOURCE {i}] {r['title']} ({r['source']})"
        block = f"{header}\n{snippet}"
        if used + len(block) > max_chars and parts:
            break
        parts.append(block)
        used += len(block)
        if r["source"] not in sources:
            sources.append(r["source"])
    return "\n\n---\n\n".join(parts), sources
