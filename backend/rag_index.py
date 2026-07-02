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

# --- Collezione separata: documenti specifici di CounselorBot (la piattaforma) ---
# Cartella semplice di markdown/PDF (niente pipeline graphify, niente grafo): è una
# base di conoscenza distinta da competenzestrategiche.it, selezionabile a parte
# nell'assistente. Indice persistito in file dedicati nella stessa INDEX_DIR.
COUNSELORBOT_DOCS_DIR = os.environ.get(
    "COUNSELORBOT_DOCS_DIR", os.path.join(_REPO_ROOT, "docs-counselorbot")
)
COUNSELORBOT_INDEX_PATH = os.path.join(INDEX_DIR, "counselorbot_rag_index.json")
COUNSELORBOT_EMB_PATH = os.path.join(INDEX_DIR, "counselorbot_embeddings.npy")
COUNSELORBOT_CACHE_PATH = os.path.join(INDEX_DIR, "counselorbot_embed_cache.npz")
COUNSELORBOT_LOCK_PATH = os.path.join(INDEX_DIR, ".counselorbot.build.lock")

# Nomi pubblici delle collezioni (combaciano col toggle del frontend).
COLLECTION_COMPETENZE = "competenzestrategiche"
COLLECTION_COUNSELORBOT = "counselorbot"
COLLECTION_FRAMEWORK = "framework"
COLLECTION_QUESTIONARI = "questionari"

# --- Percorsi per le nuove collezioni plain ---
FRAMEWORK_DOCS_DIR = os.environ.get(
    "FRAMEWORK_DOCS_DIR", os.path.join(_REPO_ROOT, "docs", "fonti", "competenze-strategiche")
)
QUESTIONARI_DOCS_DIR = os.environ.get(
    "QUESTIONARI_DOCS_DIR", os.path.join(_REPO_ROOT, "docs", "questionari")
)
VALIDAZIONE_DOCS_DIR = os.environ.get(
    "VALIDAZIONE_DOCS_DIR", os.path.join(_REPO_ROOT, "docs", "validazione")
)

# Indici separati per le nuove collezioni
FRAMEWORK_INDEX_PATH = os.path.join(INDEX_DIR, "framework_rag_index.json")
FRAMEWORK_EMB_PATH = os.path.join(INDEX_DIR, "framework_embeddings.npy")
FRAMEWORK_CACHE_PATH = os.path.join(INDEX_DIR, "framework_embed_cache.npz")
FRAMEWORK_LOCK_PATH = os.path.join(INDEX_DIR, ".framework.build.lock")

QUESTIONARI_INDEX_PATH = os.path.join(INDEX_DIR, "questionari_rag_index.json")
QUESTIONARI_EMB_PATH = os.path.join(INDEX_DIR, "questionari_embeddings.npy")
QUESTIONARI_CACHE_PATH = os.path.join(INDEX_DIR, "questionari_embed_cache.npz")
QUESTIONARI_LOCK_PATH = os.path.join(INDEX_DIR, ".questionari.build.lock")

# Le guide che definiscono il progetto competenzestrategiche (solo queste, niente altro).
_GUIDE_STEMS = {"guida_2019", "guida_2023"}

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


# ---------------------------------------------------------------------------
# Collezione "plain" (cartella semplice di .md/.pdf, senza graphify né grafo)
# ---------------------------------------------------------------------------
def _empty_graph():
    """Grafo vuoto: le collezioni plain non hanno espansione via grafo."""
    return {}, {}, {}


def _collect_plain_corpus(docs_dir: str) -> tuple[list[dict], dict[str, str]]:
    """Ingerisce tutti i .md e .pdf sotto docs_dir direttamente (niente graphify).

    Ritorna (chunks, signature). La firma usa size/mtime dei file: deve combaciare
    con _plain_signature per non innescare rebuild perpetui."""
    chunks: list[dict] = []
    signature: dict[str, str] = {}
    if not os.path.isdir(docs_dir):
        logger.warning("Cartella collezione plain assente: %s", docs_dir)
        signature["__normalizer_version__"] = str(_NORMALIZER_VERSION)
        return chunks, signature
    for root, _dirs, files in os.walk(docs_dir):
        for fn in sorted(files):
            low = fn.lower()
            abspath = os.path.join(root, fn)
            relpath = os.path.relpath(abspath, docs_dir).replace("\\", "/")
            if low.endswith(".md"):
                try:
                    with open(abspath, encoding="utf-8") as f:
                        text = _normalize_markdown(f.read())
                except Exception as e:
                    logger.warning("Impossibile leggere %s: %s", abspath, e)
                    continue
                try:
                    signature[relpath] = str(int(os.path.getmtime(abspath)))
                except OSError:
                    signature[relpath] = "md"
            elif low.endswith(".pdf"):
                try:
                    st = os.stat(abspath)
                    signature[relpath] = f"{st.st_size}:{int(st.st_mtime)}"
                except OSError:
                    signature[relpath] = "pdf"
                raw = _extract_pdf_text(abspath)
                if not raw.strip():
                    logger.info("PDF senza testo estraibile (saltato): %s", relpath)
                    continue
                text = _normalize_markdown(raw)
            else:
                continue
            title = _first_heading(text) or os.path.splitext(fn)[0].replace("_", " ")
            for i, chunk_text in enumerate(_chunk_markdown(text)):
                chunks.append({"id": f"{relpath}#{i}", "source": relpath, "title": title, "text": chunk_text})
    signature["__normalizer_version__"] = str(_NORMALIZER_VERSION)
    return chunks, signature


def _plain_signature(docs_dir: str) -> dict[str, str]:
    """Firma metadati-only (nomi + size/mtime) per una collezione plain."""
    sig: dict[str, str] = {}
    if os.path.isdir(docs_dir):
        for root, _dirs, files in os.walk(docs_dir):
            for fn in sorted(files):
                low = fn.lower()
                if not (low.endswith(".md") or low.endswith(".pdf")):
                    continue
                relpath = os.path.relpath(os.path.join(root, fn), docs_dir).replace("\\", "/")
                try:
                    st = os.stat(os.path.join(root, fn))
                    sig[relpath] = f"{st.st_size}:{int(st.st_mtime)}" if low.endswith(".pdf") else str(int(st.st_mtime))
                except OSError:
                    sig[relpath] = "f"
    sig["__normalizer_version__"] = str(_NORMALIZER_VERSION)
    return sig


SCOPE_CONFIG_PATH = os.path.join(INDEX_DIR, "rag_scope.json")
_scope_lock = threading.Lock()


def _normalize_source(source: str) -> str:
    return (source or "").strip().lstrip("/").replace("\\", "/")


def _load_scope_config() -> dict:
    try:
        with open(SCOPE_CONFIG_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except Exception as e:
        logger.warning("Configurazione scope RAG non leggibile: %s", e)
        return {}


def _save_scope_config(data: dict):
    os.makedirs(INDEX_DIR, exist_ok=True)
    tmp = SCOPE_CONFIG_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
    os.replace(tmp, SCOPE_CONFIG_PATH)


def _scope_entry(data: dict, collection: str) -> dict:
    entry = data.setdefault(collection, {})
    include = entry.get("include")
    exclude = entry.get("exclude")
    if not isinstance(include, list):
        entry["include"] = []
    if not isinstance(exclude, list):
        entry["exclude"] = []
    return entry


def _scope_sources(collection: str, key: str) -> set[str]:
    entry = _load_scope_config().get(collection, {})
    values = entry.get(key, []) if isinstance(entry, dict) else []
    return {_normalize_source(v) for v in values if _normalize_source(v)}


def _scope_signature(collection: str) -> str:
    entry = _load_scope_config().get(collection, {})
    payload = json.dumps(entry if isinstance(entry, dict) else {}, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]


def default_scope_for(collection: str, source: str) -> bool:
    """Scope predefinito della collezione, prima dei flag manuali admin."""
    src = _normalize_source(source).lower()
    stem = os.path.splitext(os.path.basename(src))[0]
    ext = os.path.splitext(src)[1]
    if collection == COLLECTION_COMPETENZE:
        return ext == ".pdf" and stem in _GUIDE_STEMS
    if collection == COLLECTION_FRAMEWORK:
        if "/graphify-out/" in src or "/schede-bibliografiche/" in src:
            return False
        return ext == ".pdf" and src.startswith("fonti/") and stem not in _GUIDE_STEMS
    if collection == COLLECTION_QUESTIONARI:
        if "/graphify-out/" in src or "/schede-bibliografiche/" in src:
            return False
        return ext == ".pdf" and src.startswith("questionari/")
    return ext in {".md", ".pdf"}


def source_in_scope(collection: str, source: str, default_in_scope: bool | None = None) -> bool:
    src = _normalize_source(source)
    if not src:
        return False
    if src in _scope_sources(collection, "exclude"):
        return False
    if src in _scope_sources(collection, "include"):
        return True
    return default_scope_for(collection, src) if default_in_scope is None else bool(default_in_scope)


def source_scope_state(collection: str, source: str, default_in_scope: bool | None = None) -> dict:
    src = _normalize_source(source)
    includes = _scope_sources(collection, "include")
    excludes = _scope_sources(collection, "exclude")
    default = default_scope_for(collection, src) if default_in_scope is None else bool(default_in_scope)
    if src in excludes:
        return {"in_scope": False, "default": default, "forced": True}
    if src in includes:
        return {"in_scope": True, "default": default, "forced": True}
    return {"in_scope": default, "default": default, "forced": False}


def set_source_scope(collection: str, source: str, in_scope: bool) -> dict:
    src = _normalize_source(source)
    if not src:
        raise ValueError("Sorgente non valida")
    with _scope_lock:
        data = _load_scope_config()
        entry = _scope_entry(data, collection)
        include = {_normalize_source(v) for v in entry.get("include", []) if _normalize_source(v)}
        exclude = {_normalize_source(v) for v in entry.get("exclude", []) if _normalize_source(v)}
        include.discard(src)
        exclude.discard(src)
        if in_scope:
            include.add(src)
        else:
            exclude.add(src)
        entry["include"] = sorted(include)
        entry["exclude"] = sorted(exclude)
        _save_scope_config(data)
    return source_scope_state(collection, src)


def _resolve_collection_source(collection: str, source: str) -> str | None:
    src = _normalize_source(source)
    for root in docs_roots_for(collection):
        root_abs = os.path.realpath(root)
        path = os.path.realpath(os.path.normpath(os.path.join(root, src)))
        if path.startswith(root_abs + os.sep) and os.path.isfile(path):
            return path
    return None


def _collect_direct_source(collection: str, source: str) -> tuple[list[dict], dict[str, str]]:
    src = _normalize_source(source)
    path = _resolve_collection_source(collection, src)
    if not path:
        return [], {}
    ext = os.path.splitext(path)[1].lower()
    try:
        st = os.stat(path)
        sig = {src: f"{st.st_size}:{int(st.st_mtime)}"}
    except OSError:
        sig = {src: "f"}
    if ext == ".md":
        try:
            with open(path, encoding="utf-8") as f:
                text = _normalize_markdown(f.read())
        except Exception as e:
            logger.warning("Impossibile leggere sorgente inclusa %s: %s", path, e)
            return [], sig
    elif ext == ".pdf":
        raw = _extract_pdf_text(path)
        if not raw.strip():
            logger.info("PDF incluso nello scope ma senza testo estraibile: %s", src)
            return [], sig
        text = _normalize_markdown(raw)
    else:
        return [], sig
    title = _first_heading(text) or os.path.splitext(os.path.basename(src))[0].replace("_", " ")
    chunks = [
        {"id": f"{src}#forced-{i}", "source": src, "title": title, "text": chunk_text}
        for i, chunk_text in enumerate(_chunk_markdown(text))
    ]
    return chunks, sig


def _forced_include_signature(collection: str) -> dict[str, str]:
    sig: dict[str, str] = {}
    for source in sorted(_scope_sources(collection, "include")):
        _chunks, source_sig = _collect_direct_source(collection, source)
        sig.update(source_sig)
    return sig


def _add_scope_signature(collection: str, sig: dict[str, str]) -> dict[str, str]:
    out = dict(sig)
    out.update(_forced_include_signature(collection))
    out[f"__scope_{collection}__"] = _scope_signature(collection)
    return out


def _collect_forced_include_chunks(collection: str, existing_sources: set[str]) -> tuple[list[dict], dict[str, str]]:
    chunks: list[dict] = []
    sig: dict[str, str] = {}
    for source in sorted(_scope_sources(collection, "include") - existing_sources):
        extra_chunks, extra_sig = _collect_direct_source(collection, source)
        chunks.extend(extra_chunks)
        sig.update(extra_sig)
    return chunks, sig


def _apply_scope(collection: str, chunks: list[dict], sig: dict[str, str], keep) -> tuple[list[dict], dict[str, str]]:
    filtered = [
        c for c in chunks
        if source_in_scope(collection, c.get("source", ""), keep(c.get("source", "")))
    ]
    existing_sources = {c["source"] for c in filtered}
    extra_chunks, extra_sig = _collect_forced_include_chunks(collection, existing_sources)
    filtered.extend(extra_chunks)
    scoped_sig = _add_scope_signature(collection, sig)
    scoped_sig.update(extra_sig)
    return filtered, scoped_sig


def _scoped_corpus_signature(collection: str) -> dict[str, str]:
    return _add_scope_signature(collection, _corpus_signature())


def _collect_scoped_plain(collection: str, docs_dir: str) -> tuple[list[dict], dict[str, str]]:
    chunks, sig = _collect_plain_corpus(docs_dir)
    return _apply_scope(collection, chunks, sig, keep=lambda _src: True)


def _scoped_plain_signature(collection: str, docs_dir: str) -> dict[str, str]:
    return _add_scope_signature(collection, _plain_signature(docs_dir))


def _collect_guides_only() -> tuple[list[dict], dict[str, str]]:
    """Graphify: solo le guide PDF del progetto competenzestrategiche.it."""
    chunks, sig = _collect_corpus()
    return _filter_chunks(COLLECTION_COMPETENZE, chunks, sig,
        keep=lambda src: default_scope_for(COLLECTION_COMPETENZE, src))


def _collect_framework() -> tuple[list[dict], dict[str, str]]:
    """Graphify: tutti i PDF/markdown teorici tranne le guide."""
    chunks, sig = _collect_corpus()
    return _filter_chunks(COLLECTION_FRAMEWORK, chunks, sig,
        keep=lambda src: default_scope_for(COLLECTION_FRAMEWORK, src))


def _collect_questionari_graphify() -> tuple[list[dict], dict[str, str]]:
    """Graphify: solo i documenti sotto questionari/."""
    chunks, sig = _collect_corpus()
    return _filter_chunks(COLLECTION_QUESTIONARI, chunks, sig,
        keep=lambda src: default_scope_for(COLLECTION_QUESTIONARI, src))


def _filter_chunks(collection: str, chunks: list[dict], sig: dict[str, str], keep) -> tuple[list[dict], dict[str, str]]:
    """Filtra i chunk per prefisso/nome sorgente."""
    return _apply_scope(collection, chunks, sig, keep=keep)


def _collect_counselorbot_plus_validazione() -> tuple[list[dict], dict[str, str]]:
    """Collezione counselorbot: docs-counselorbot/ + docs/validazione/."""
    chunks_a, sig_a = _collect_plain_corpus(COUNSELORBOT_DOCS_DIR)
    chunks_b, sig_b = _collect_plain_corpus(VALIDAZIONE_DOCS_DIR)
    sig = {**sig_a, **sig_b}
    return _apply_scope(COLLECTION_COUNSELORBOT, chunks_a + chunks_b, sig, keep=lambda _src: True)


def _counselorbot_validazione_signature() -> dict[str, str]:
    sig_a = _plain_signature(COUNSELORBOT_DOCS_DIR)
    sig_b = _plain_signature(VALIDAZIONE_DOCS_DIR)
    return _add_scope_signature(COLLECTION_COUNSELORBOT, {**sig_a, **sig_b})


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

    def __init__(self, *, docs_dir: str, index_path: str, emb_path: str,
                 cache_path: str, lock_path: str, collector, graph_loader,
                 signature_fn, mode: str = "graphify"):
        self._lock = threading.Lock()
        # Config della collezione (paths + funzioni di raccolta/grafo/firma).
        self.docs_dir = docs_dir
        self.index_path = index_path
        self.emb_path = emb_path
        self.cache_path = cache_path
        self.lock_path = lock_path
        self._collector = collector
        self._graph_loader = graph_loader
        self._signature_fn = signature_fn
        self.mode = mode
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
        if not os.path.exists(self.index_path) or not os.path.exists(self.emb_path):
            return False
        try:
            with open(self.index_path, encoding="utf-8") as f:
                data = json.load(f)
            matrix = np.load(self.emb_path)
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
        tmp_json = self.index_path + ".tmp"
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
        np.save(self.emb_path, self.matrix if self.matrix is not None else np.zeros((0, 1), dtype=np.float32))
        os.replace(tmp_json, self.index_path)

    # --- build / ensure ---
    def _is_current(self, ai_service) -> bool:
        """L'indice in memoria è già allineato a corpus + modello?"""
        if not self._loaded or self.matrix is None:
            return False
        if self.embedding_model != (ai_service.embedding_model or "qwen3-embedding:4b"):
            return False
        return self._signature_fn() == self.signature

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
            with open(self.lock_path, "w") as lockf:
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
        chunks, signature = self._collector()
        self.adjacency, self.relpath_to_node, self.node_to_relpath = self._graph_loader()
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
        cache = _EmbeddingCache(self.cache_path)
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
            "collection": self.mode,
            "n_chunks": len(self.chunks),
            "n_sources": len({c["source"] for c in self.chunks}),
            "n_graph_nodes": len(self.node_to_relpath),
            "embedding_model": self.embedding_model,
            "built_at": self.built_at,
            "docs_dir": self.docs_dir,
            "index_path": self.index_path,
        }


# Collezione: solo le guide ufficiali del progetto (graphify).
site_rag_index = SiteRagIndex(
    docs_dir=DOCS_DIR,
    index_path=INDEX_PATH, emb_path=EMB_PATH,
    cache_path=CACHE_PATH, lock_path=LOCK_PATH,
    collector=_collect_guides_only,
    graph_loader=_load_graph,
    signature_fn=lambda: _scoped_corpus_signature(COLLECTION_COMPETENZE),
    mode="graphify",
)

# Collezione: CounselorBot piattaforma + validazione (plain, docs_dir esterno).
counselorbot_rag_index = SiteRagIndex(
    docs_dir=COUNSELORBOT_DOCS_DIR,
    index_path=COUNSELORBOT_INDEX_PATH,
    emb_path=COUNSELORBOT_EMB_PATH,
    cache_path=COUNSELORBOT_CACHE_PATH,
    lock_path=COUNSELORBOT_LOCK_PATH,
    collector=_collect_counselorbot_plus_validazione,
    graph_loader=_empty_graph,
    signature_fn=_counselorbot_validazione_signature,
    mode="plain",
)

# Collezione: framework teorico e articoli di ricerca (graphify).
framework_rag_index = SiteRagIndex(
    docs_dir=DOCS_DIR,
    index_path=FRAMEWORK_INDEX_PATH,
    emb_path=FRAMEWORK_EMB_PATH,
    cache_path=FRAMEWORK_CACHE_PATH,
    lock_path=FRAMEWORK_LOCK_PATH,
    collector=_collect_framework,
    graph_loader=_load_graph,
    signature_fn=lambda: _scoped_corpus_signature(COLLECTION_FRAMEWORK),
    mode="graphify",
)

# Collezione: questionari e strumenti (graphify).
questionari_rag_index = SiteRagIndex(
    docs_dir=DOCS_DIR,
    index_path=QUESTIONARI_INDEX_PATH,
    emb_path=QUESTIONARI_EMB_PATH,
    cache_path=QUESTIONARI_CACHE_PATH,
    lock_path=QUESTIONARI_LOCK_PATH,
    collector=_collect_questionari_graphify,
    graph_loader=_load_graph,
    signature_fn=lambda: _scoped_corpus_signature(COLLECTION_QUESTIONARI),
    mode="graphify",
)

RAG_COLLECTIONS = {
    COLLECTION_COMPETENZE: site_rag_index,
    COLLECTION_COUNSELORBOT: counselorbot_rag_index,
    COLLECTION_FRAMEWORK: framework_rag_index,
    COLLECTION_QUESTIONARI: questionari_rag_index,
}

# Etichette leggibili per le collezioni predefinite (le dinamiche hanno la
# label nel loro .collection.json).
BUILTIN_COLLECTION_LABELS = {
    COLLECTION_COMPETENZE: "Competenze Strategiche (sito)",
    COLLECTION_COUNSELORBOT: "CounselorBot (piattaforma)",
    COLLECTION_FRAMEWORK: "Framework teorico",
    COLLECTION_QUESTIONARI: "Questionari e strumenti",
}


# ---------------------------------------------------------------------------
# Collezioni dinamiche (create dall'admin a runtime)
# ---------------------------------------------------------------------------
# Ogni collezione dinamica è una sottocartella di DYNAMIC_ROOT contenente
# .md/.pdf (modalità plain, nessun grafo) più un file meta `.collection.json`
# ({"id": slug, "label": ...}). Gli indici vivono in INDEX_DIR con prefisso
# `dyn_<slug>_` e sopravvivono al riavvio come quelli builtin.
DYNAMIC_ROOT = os.environ.get(
    "RAG_DYNAMIC_COLLECTIONS_DIR", os.path.join(_REPO_ROOT, "rag-collections")
)
_COLLECTION_META_FILE = ".collection.json"
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,40}$")

_dynamic_lock = threading.Lock()
_dynamic_indexes: dict[str, "SiteRagIndex"] = {}


def _dynamic_dir(slug: str) -> str:
    return os.path.join(DYNAMIC_ROOT, slug)


def is_valid_slug(slug: str) -> bool:
    return bool(slug) and bool(_SLUG_RE.match(slug))


def is_dynamic_collection(slug: str | None) -> bool:
    """True se esiste una collezione dinamica con questo slug."""
    if not slug or slug in RAG_COLLECTIONS or not is_valid_slug(slug):
        return False
    return os.path.isdir(_dynamic_dir(slug))


def _make_dynamic_index(slug: str) -> "SiteRagIndex":
    d = _dynamic_dir(slug)
    return SiteRagIndex(
        docs_dir=d,
        index_path=os.path.join(INDEX_DIR, f"dyn_{slug}_rag_index.json"),
        emb_path=os.path.join(INDEX_DIR, f"dyn_{slug}_embeddings.npy"),
        cache_path=os.path.join(INDEX_DIR, f"dyn_{slug}_embed_cache.npz"),
        lock_path=os.path.join(INDEX_DIR, f".dyn_{slug}.build.lock"),
        collector=lambda: _collect_scoped_plain(slug, d),
        graph_loader=_empty_graph,
        signature_fn=lambda: _scoped_plain_signature(slug, d),
        mode="plain",
    )


def get_dynamic_index(slug: str) -> "SiteRagIndex":
    with _dynamic_lock:
        idx = _dynamic_indexes.get(slug)
        if idx is None:
            idx = _make_dynamic_index(slug)
            _dynamic_indexes[slug] = idx
        return idx


def _read_collection_label(slug: str) -> str:
    try:
        with open(os.path.join(_dynamic_dir(slug), _COLLECTION_META_FILE), encoding="utf-8") as f:
            return str(json.load(f).get("label") or slug)
    except Exception:
        return slug


def list_collections() -> list[dict]:
    """Tutte le collezioni disponibili: builtin + dinamiche."""
    out = [
        {"id": cid, "label": BUILTIN_COLLECTION_LABELS.get(cid, cid),
         "mode": idx.mode, "builtin": True}
        for cid, idx in RAG_COLLECTIONS.items()
    ]
    if os.path.isdir(DYNAMIC_ROOT):
        for name in sorted(os.listdir(DYNAMIC_ROOT)):
            if name in RAG_COLLECTIONS or not is_valid_slug(name):
                continue
            if not os.path.isdir(_dynamic_dir(name)):
                continue
            out.append({"id": name, "label": _read_collection_label(name),
                        "mode": "plain", "builtin": False})
    return out


def create_dynamic_collection(slug: str, label: str) -> dict:
    """Crea la cartella + meta di una nuova collezione dinamica.

    Solleva ValueError su slug non valido o già esistente."""
    if not is_valid_slug(slug):
        raise ValueError("Slug non valido: minuscole, cifre, '-' o '_', 2-41 caratteri")
    if slug in RAG_COLLECTIONS or os.path.isdir(_dynamic_dir(slug)):
        raise ValueError(f"Collezione '{slug}' già esistente")
    d = _dynamic_dir(slug)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, _COLLECTION_META_FILE), "w", encoding="utf-8") as f:
        json.dump({"id": slug, "label": label or slug, "created_at": time.time()},
                  f, ensure_ascii=False)
    return {"id": slug, "label": label or slug, "mode": "plain", "builtin": False}


def delete_dynamic_collection(slug: str):
    """Rimuove cartella documenti + file indice di una collezione dinamica."""
    import shutil
    if not is_dynamic_collection(slug):
        raise ValueError(f"Collezione dinamica '{slug}' non trovata")
    shutil.rmtree(_dynamic_dir(slug), ignore_errors=True)
    for p in (
        os.path.join(INDEX_DIR, f"dyn_{slug}_rag_index.json"),
        os.path.join(INDEX_DIR, f"dyn_{slug}_embeddings.npy"),
        os.path.join(INDEX_DIR, f"dyn_{slug}_embed_cache.npz"),
        os.path.join(INDEX_DIR, f".dyn_{slug}.build.lock"),
    ):
        try:
            os.remove(p)
        except OSError:
            pass
    with _dynamic_lock:
        _dynamic_indexes.pop(slug, None)


def collection_exists(collection: str | None) -> bool:
    return bool(collection) and (collection in RAG_COLLECTIONS or is_dynamic_collection(collection))


def upload_dir_for(collection: str) -> str | None:
    """Cartella scrivibile in cui l'admin carica i documenti della collezione.

    Per le collezioni graphify i nuovi file sono comunque ingeriti direttamente
    (pdftotext/markdown) al reindex; il grafo semantico va rigenerato a parte."""
    if collection == COLLECTION_COUNSELORBOT:
        return COUNSELORBOT_DOCS_DIR
    if collection == COLLECTION_QUESTIONARI:
        return QUESTIONARI_DOCS_DIR
    if collection in (COLLECTION_FRAMEWORK, COLLECTION_COMPETENZE):
        return FRAMEWORK_DOCS_DIR
    if is_dynamic_collection(collection):
        return _dynamic_dir(collection)
    return None


def docs_roots_for(collection: str) -> list[str]:
    """Radici a cui sono relativi i `source` dei chunk della collezione."""
    if collection == COLLECTION_COUNSELORBOT:
        return [COUNSELORBOT_DOCS_DIR, VALIDAZIONE_DOCS_DIR]
    if collection in (COLLECTION_FRAMEWORK, COLLECTION_COMPETENZE, COLLECTION_QUESTIONARI):
        return [DOCS_DIR]
    if is_dynamic_collection(collection):
        return [_dynamic_dir(collection)]
    return [DOCS_DIR]


def get_index(collection: str | None) -> "SiteRagIndex":
    """Indice della collezione richiesta (default: competenzestrategiche)."""
    coll = collection or COLLECTION_COMPETENZE
    if coll in RAG_COLLECTIONS:
        return RAG_COLLECTIONS[coll]
    if is_dynamic_collection(coll):
        return get_dynamic_index(coll)
    return site_rag_index


def _safe_doc_abspath(relpath: str, docs_dir: str = DOCS_DIR) -> str | None:
    """Path assoluto dentro docs_dir, o None se esce dalla cartella (anti path-traversal)."""
    docs_root = os.path.abspath(docs_dir)
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


def _plain_document_preview(source: str, docs_dir: str):
    """Anteprima per una collezione plain: PDF originale o markdown del file."""
    low = source.lower()
    p = _safe_doc_abspath(source, docs_dir)
    if not p or not os.path.isfile(p):
        return None
    if low.endswith(".pdf"):
        return ("pdf", p)
    if low.endswith(".md"):
        with open(p, encoding="utf-8") as f:
            text = _normalize_markdown(f.read())
        title = _first_heading(text) or os.path.splitext(os.path.basename(source))[0].replace("_", " ")
        return ("markdown", text, title)
    return None


def get_document_preview(source: str, collection: str = COLLECTION_COMPETENZE):
    """Risolve l'anteprima per una sorgente citata, nella collezione indicata.

    Ritorna:
    - ("pdf", abspath)              se l'originale è un PDF leggibile;
    - ("markdown", text, title)     altrimenti (markdown convertito, o il file
                                    stesso se è già .md);
    - None                          se non anteprimabile.
    """
    if collection == COLLECTION_COUNSELORBOT:
        # Cerca prima in docs-counselorbot, poi in validazione
        preview = _plain_document_preview(source, COUNSELORBOT_DOCS_DIR)
        if preview:
            return preview
        return _plain_document_preview(source, VALIDAZIONE_DOCS_DIR)
    if is_dynamic_collection(collection):
        return _plain_document_preview(source, _dynamic_dir(collection))
    if collection == COLLECTION_FRAMEWORK:
        return _plain_document_preview(source, DOCS_DIR)
    if collection == COLLECTION_QUESTIONARI:
        return _plain_document_preview(source, DOCS_DIR)
    if collection == COLLECTION_COMPETENZE:
        return _plain_document_preview(source, DOCS_DIR)
    low = source.lower()
    # PDF originale -> anteprima diretta
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
    # Il file sorgente e' gia' markdown
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
