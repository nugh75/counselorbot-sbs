"""Verifica bibliografica delle letture certificate.

Controlla che titolo, anno e autori di una voce del catalogo corrispondano a un
record reale. La fonte e' OpenAlex (copre articoli e una parte dei libri) e,
quando la voce dichiara un DOI, la risoluzione diretta del DOI.

Per narrativa, film, serie, podcast e video non esiste una fonte automatica
affidabile: la funzione lo dichiara invece di fingere un controllo. L'esito non
decide da solo lo stato della voce — lo legge l'admin, che certifica.
"""
from __future__ import annotations

import json
import logging
import re
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

OPENALEX_API = "https://api.openalex.org/works"
# OpenAlex chiede un contatto nello user-agent per la "polite pool".
USER_AGENT = "CounselorBot/1.0 (mailto:counselorbot@ai4educ.org)"
# Tipi per cui una fonte bibliografica automatica ha senso.
VERIFIABLE_KINDS = {"essay", "article"}
TIMEOUT_S = 15


def _plain(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", (text or "").casefold())
    stripped = "".join(c for c in normalized if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9 ]+", " ", stripped).strip()


def _title_similarity(a: str, b: str) -> float:
    """Sovrapposizione fra le parole significative dei due titoli (0..1)."""
    wa = {w for w in _plain(a).split() if len(w) > 2}
    wb = {w for w in _plain(b).split() if len(w) > 2}
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)


def _get(url: str) -> dict | None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            return json.load(response)
    except Exception as exc:  # rete assente, 404, rate limit: nessuno e' fatale
        logger.info("Verifica bibliografica non riuscita su %s: %s", url, exc)
        return None


def _result(source: str, match, **extra) -> dict:
    return {
        "source": source,
        "match": match,
        "checked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        **extra,
    }


def verify_reading(reading: dict) -> dict:
    """Verifica una voce del catalogo. `reading` e' un dict con almeno `title` e `kind`.

    Ritorna sempre un esito: `match` True/False quando il controllo e' stato
    possibile, None quando per quel tipo non esiste una fonte automatica.
    """
    kind = (reading.get("kind") or "essay").strip().lower()
    title = (reading.get("title") or "").strip()
    original = (reading.get("original_title") or "").strip()
    year = reading.get("year")
    identifiers = reading.get("identifiers") or {}
    doi = str(identifiers.get("doi") or "").strip()

    if doi:
        data = _get(f"{OPENALEX_API}/doi:{urllib.parse.quote(doi, safe='')}")
        if data and data.get("id"):
            found_title = data.get("display_name") or ""
            found_year = data.get("publication_year")
            similarity = max(_title_similarity(title, found_title),
                             _title_similarity(original, found_title) if original else 0.0)
            return _result("openalex-doi", True, found_title=found_title,
                           found_year=found_year, title_similarity=round(similarity, 2),
                           year_matches=(found_year == year) if year else None)
        return _result("openalex-doi", False, note="DOI non risolto su OpenAlex")

    if kind not in VERIFIABLE_KINDS:
        return _result("manual", None,
                       note=f"nessuna fonte automatica per il tipo '{kind}': verifica a mano")

    query = original or title
    if not query:
        return _result("manual", None, note="titolo mancante")

    data = _get(f"{OPENALEX_API}?search={urllib.parse.quote(query)}&per-page=5")
    candidates = (data or {}).get("results") or []
    best, best_score = None, 0.0
    for item in candidates:
        score = _title_similarity(query, item.get("display_name") or "")
        if score > best_score:
            best, best_score = item, score
    if not best or best_score < 0.5:
        return _result("openalex", False, note="nessun record con titolo compatibile",
                       best_candidate=(best or {}).get("display_name"),
                       title_similarity=round(best_score, 2))

    found_year = best.get("publication_year")
    authors = [
        (a.get("author") or {}).get("display_name", "")
        for a in (best.get("authorships") or [])
    ]
    declared = " ".join(reading.get("creators") or [])
    author_seen = any(
        surname and surname in _plain(" ".join(authors))
        for surname in [_plain(part).split()[-1] for part in (reading.get("creators") or []) if part]
    ) if declared else None

    return _result(
        "openalex",
        True,
        found_title=best.get("display_name"),
        found_year=found_year,
        openalex_id=best.get("id"),
        title_similarity=round(best_score, 2),
        year_matches=(found_year == year) if year else None,
        author_matches=author_seen,
    )
