"""Fonti esterne per un ramo dello strumento Idea.

Il gesto e' esplicito: nessuna ricerca parte da sola a ogni turno. Si cerca
quando la persona lo chiede, si vedono i risultati, e solo quelli scelti
restano attaccati al ramo. Cio' che resta entra nel contesto dei turni
successivi e nel PDF di conclusione.

Due gruppi, perche' sono due domande diverse:
  - `encyclopedia`: Wikipedia e Treccani, per sapere di cosa si sta parlando;
  - `works`: OpenAlex ed Europe PMC, per sapere chi l'ha studiato.

Il PDF ad accesso aperto e' l'unica cosa che esce dalla whitelist chiusa di
`web_lookup`: sta sull'editore o sul repository, e quell'host cambia a ogni
lavoro. Per questo il download ha regole sue - solo https, nessun indirizzo di
rete interna, solo `application/pdf`, un tetto di byte - ed e' contato.
"""
from __future__ import annotations

import ipaddress
import logging
import os
import re
import socket
import urllib.request
from urllib.parse import urlsplit

from sqlalchemy.orm import Session

from . import models, web_lookup

logger = logging.getLogger(__name__)

FEATURE_KEY = "idea_sources_enabled"
STORAGE_DIR = os.getenv("IDEA_SOURCES_STORAGE_DIR", "/app/uploads/idea-sources")

GROUPS = ("encyclopedia", "works")
ENCYCLOPEDIA_SOURCES = ("wikipedia", "treccani")

MAX_RESULTS = 12
# Quante ricerche per sessione. Il contatore vive nel processo: e' un tetto di
# cortesia verso le fonti, non un controllo di sicurezza.
MAX_SEARCHES_PER_SESSION = 10
_searches: dict[str, int] = {}
# Quanti PDF per sessione. Questo invece si conta sulle righe salvate, percio'
# sopravvive al riavvio: e' spazio su disco, non cortesia.
MAX_PDFS_PER_SESSION = 10
MAX_PDF_BYTES = 15 * 1024 * 1024
PDF_TIMEOUT_S = 20

# Quante fonti tenute entrano nel prompt, e quanto ne entra.
CONTEXT_MAX_ITEMS = 6
CONTEXT_ABSTRACT_CHARS = 300


class IdeaSourcesError(ValueError):
    """Richiesta che non puo' essere servita: quota, gruppo, voce assente."""


def enabled(db: Session) -> bool:
    row = db.query(models.Config).filter(models.Config.key == FEATURE_KEY).first()
    return str(getattr(row, "value", "true")).strip().lower() in ("1", "true", "yes", "on")


# --- ricerca -----------------------------------------------------------------

def _from_lookup(result: web_lookup.LookupResult) -> dict:
    return {
        "source": result.source,
        "title": result.title,
        "url": result.url,
        "doi": "",
        "authors": "",
        "year": "",
        "journal": "",
        "abstract": result.text,
        "oa_status": "",
        "pdf_url": "",
        "citations": 0,
        "license": result.license,
        "retrieved_at": result.retrieved_at,
    }


def search(
    db: Session,
    session_id: str,
    query: str,
    *,
    group: str = "works",
    limit: int = 8,
    year_from: int | None = None,
    oa_only: bool = True,
    lang: str = "it",
) -> list[dict]:
    """Cerca e basta: nessuna riga viene scritta finche' non si sceglie."""
    if group not in GROUPS:
        raise IdeaSourcesError(f"gruppo sconosciuto: {group}")
    query = (query or "").strip()
    if len(query) < 3:
        raise IdeaSourcesError("la ricerca ha bisogno di almeno tre caratteri")

    key = session_id or "anon"
    if _searches.get(key, 0) >= MAX_SEARCHES_PER_SESSION:
        raise IdeaSourcesError("ricerche esaurite per questa sessione")
    if len(_searches) > 5000:
        _searches.clear()
    _searches[key] = _searches.get(key, 0) + 1

    limit = max(1, min(int(limit or 8), MAX_RESULTS))
    if group == "encyclopedia":
        # L'enciclopedia si consulta con la cache: la stessa voce non si
        # ricompra, e il controllo sul titolo di `lookup` qui serve ancora.
        results = web_lookup.cached_lookup(
            db, query, sources=list(ENCYCLOPEDIA_SOURCES), lang=lang,
            limit=len(ENCYCLOPEDIA_SOURCES),
        )
        return [_from_lookup(item) for item in results][:limit]

    works = web_lookup.search_works(
        query, limit=limit, year_from=year_from, oa_only=oa_only,
        lang=lang if lang and lang != "it" else "",
    )
    return [work.as_dict() for work in works]


# --- fonti tenute ------------------------------------------------------------

def kept(db: Session, username: str, session_id: str, branch_id: str | None = None) -> list[models.IdeaSource]:
    query = (
        db.query(models.IdeaSource)
        .filter(
            models.IdeaSource.username == username,
            models.IdeaSource.session_id == session_id,
        )
    )
    if branch_id:
        query = query.filter(models.IdeaSource.branch_id == branch_id)
    return query.order_by(models.IdeaSource.id.asc()).all()


def keep(
    db: Session,
    username: str,
    session_id: str,
    branch_id: str,
    items: list[dict],
    *,
    with_pdf: bool = True,
) -> list[models.IdeaSource]:
    """Attacca al ramo le voci scelte. Una gia' tenuta non si duplica."""
    if not branch_id:
        raise IdeaSourcesError("serve il ramo a cui attaccare la fonte")

    existing = {row.url for row in kept(db, username, session_id, branch_id)}
    saved = []
    for item in items or []:
        url = str(item.get("url") or "").strip()
        title = str(item.get("title") or "").strip()
        if not url or not title or url in existing:
            continue
        row = models.IdeaSource(
            username=username,
            session_id=session_id,
            branch_id=branch_id,
            source=str(item.get("source") or "")[:40],
            title=title[:500],
            url=url[:1000],
            doi=str(item.get("doi") or "")[:200] or None,
            authors=str(item.get("authors") or "")[:500] or None,
            year=str(item.get("year") or "")[:8] or None,
            journal=str(item.get("journal") or "")[:300] or None,
            abstract=str(item.get("abstract") or "") or None,
            oa_status=str(item.get("oa_status") or "")[:40] or None,
            license=str(item.get("license") or "")[:200] or None,
            retrieved_at=str(item.get("retrieved_at") or "")[:40] or None,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        existing.add(url)
        saved.append(row)

        pdf_url = str(item.get("pdf_url") or "").strip()
        if with_pdf and pdf_url:
            path = _download_pdf(db, username, session_id, row.id, pdf_url)
            if path:
                row.pdf_path = path
                db.commit()
                db.refresh(row)
    return saved


def remove(db: Session, username: str, session_id: str, source_id: int) -> bool:
    row = (
        db.query(models.IdeaSource)
        .filter(
            models.IdeaSource.id == source_id,
            models.IdeaSource.username == username,
            models.IdeaSource.session_id == session_id,
        )
        .first()
    )
    if row is None:
        return False
    if row.pdf_path:
        try:
            os.remove(row.pdf_path)
        except OSError as exc:
            logger.info("idea_sources: PDF gia' assente (%s): %s", row.pdf_path, exc)
    db.delete(row)
    db.commit()
    return True


# --- PDF ad accesso aperto ---------------------------------------------------

def _is_public_host(host: str) -> bool:
    """Falso per gli indirizzi che non devono essere raggiunti da qui.

    Un URL arrivato dal client non puo' diventare una richiesta verso la rete
    interna: e' l'unico modo in cui questo download potrebbe fare danni.
    """
    if not host:
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    for info in infos:
        try:
            address = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if (address.is_private or address.is_loopback or address.is_link_local
                or address.is_reserved or address.is_multicast):
            return False
    return True


def _pdf_path_for(session_id: str, source_id: int) -> str:
    folder = os.path.join(STORAGE_DIR, re.sub(r"[^A-Za-z0-9_-]+", "-", session_id)[:80])
    os.makedirs(folder, exist_ok=True)
    return os.path.join(folder, f"{source_id}.pdf")


def _download_pdf(db: Session, username: str, session_id: str, source_id: int, url: str) -> str:
    """Scarica il PDF quando si puo'; l'assenza non e' un errore.

    Il PDF sta fuori dalla whitelist chiusa - e' l'editore o il repository che
    la fonte indica - quindi qui non ci si fida della provenienza: conta cio'
    che la risposta dichiara di essere e quanto pesa.
    """
    parts = urlsplit(url)
    if parts.scheme != "https" or not _is_public_host(parts.hostname or ""):
        logger.info("idea_sources: PDF rifiutato, indirizzo non ammesso: %s", url)
        return ""

    already = sum(
        1 for row in kept(db, username, session_id) if row.pdf_path
    )
    if already >= MAX_PDFS_PER_SESSION:
        logger.info("idea_sources: tetto di PDF raggiunto per la sessione %s", session_id)
        return ""

    request = urllib.request.Request(url, headers={"User-Agent": web_lookup.USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=PDF_TIMEOUT_S) as response:
            if urlsplit(response.geturl()).scheme != "https":
                logger.info("idea_sources: PDF rifiutato, redirezione fuori da https: %s", url)
                return ""
            content_type = (response.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            if content_type != "application/pdf":
                logger.info("idea_sources: %s non e' un PDF (%s)", url, content_type or "senza tipo")
                return ""
            declared = response.headers.get("Content-Length")
            if declared and int(declared) > MAX_PDF_BYTES:
                logger.info("idea_sources: PDF troppo grande dichiarato (%s byte)", declared)
                return ""
            payload = response.read(MAX_PDF_BYTES + 1)
    except Exception as exc:  # la rete che non risponde non e' un errore fatale
        logger.info("idea_sources: PDF non scaricato da %s: %s", url, exc)
        return ""

    if len(payload) > MAX_PDF_BYTES or not payload.startswith(b"%PDF"):
        logger.info("idea_sources: PDF scartato dopo il download (%s byte)", len(payload))
        return ""

    path = _pdf_path_for(session_id, source_id)
    try:
        with open(path, "wb") as handle:
            handle.write(payload)
    except OSError as exc:
        logger.warning("idea_sources: PDF non salvabile in %s: %s", path, exc)
        return ""
    return path


# --- contesto per il modello -------------------------------------------------

def context_for(db: Session, username: str, session_id: str, branch_id: str | None) -> str:
    """Le fonti tenute del ramo, come le vede il modello.

    Solo quelle del ramo a fuoco: le fonti di un altro ramo non c'entrano con
    quel che si sta facendo qui, e occuperebbero il contesto della mappa.
    """
    rows = kept(db, username, session_id, branch_id)
    if not rows:
        return ""
    lines = [
        "Sources the person chose to keep for this branch. They are material, "
        "not recommendations: use them for what they say, name the source and "
        "its link when you use one, and keep what they say apart from what you "
        "add. Never cite one you have not been given here.",
    ]
    for row in rows[:CONTEXT_MAX_ITEMS]:
        head = " · ".join(part for part in (
            row.title,
            row.authors or "",
            row.year or "",
            row.journal or "",
            row.source,
        ) if part)
        lines.append(f"- {head} ({row.url})")
        if row.abstract:
            lines.append(f"    {web_lookup.shorten(row.abstract, CONTEXT_ABSTRACT_CHARS)}")
    return "\n".join(lines)
