"""Consultazione di fonti affidabili su internet.

Serve a due cose, con la stessa pipeline:
  - la sinossi di un'opera del catalogo letture (`synopsis_for`);
  - una domanda fattuale circoscritta durante la chat (`lookup`).

Regole non negoziabili implementate qui:
  - le fonti sono una whitelist chiusa, e ogni URL restituito viene ricontrollato
    contro i domini ammessi: nessun motore di ricerca generico, nessun dominio
    arbitrario;
  - la query esce sempre ripulita dai dati personali, anche quando la redazione
    dei log e' spenta;
  - ogni risultato porta fonte, URL, data di recupero e licenza: un testo senza
    provenienza non e' utilizzabile;
  - la rete che non risponde non e' un errore fatale: si torna a mani vuote e
    chi chiama dichiara l'assenza.

Le chiamate usano `urllib.request` come `reading_verification`, cosi' un test le
sostituisce intercettando `_get_json` e `_get_text`.
"""
from __future__ import annotations

import json
import logging
import os
import re
import unicodedata
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from urllib.parse import urlsplit

from .pii import redact_always

logger = logging.getLogger(__name__)

USER_AGENT = "CounselorBot/1.0 (+https://ai4educ.org; mailto:counselorbot@ai4educ.org)"
TIMEOUT_S = 4
# Un estratto piu' lungo non serve: in chat lo legge un modello, nel pannello lo
# accorcia un admin.
MAX_TEXT_CHARS = 700
MAX_QUERY_CHARS = 120
CACHE_TTL_DAYS = 30

# Whitelist chiusa. Aggiungere una fonte significa aggiungere qui il dominio e
# una funzione di recupero: non esiste un percorso generico.
ALLOWED_HOSTS = {
    "wikipedia": ("wikipedia.org",),
    "treccani": ("treccani.it",),
    "openlibrary": ("openlibrary.org",),
    "googlebooks": ("books.google.com", "books.google.it", "google.com"),
    "openalex": ("openalex.org", "doi.org"),
}
SOURCES = tuple(ALLOWED_HOSTS)

LICENSES = {
    "wikipedia": "Wikipedia, CC BY-SA 4.0",
    "treccani": "Treccani.it — Istituto della Enciclopedia Italiana",
    "openlibrary": "Open Library (Internet Archive)",
    "googlebooks": "Google Books",  # richiede GOOGLE_BOOKS_API_KEY
    "openalex": "OpenAlex, CC0",
}

# Per ogni tipo di opera, le fonti che hanno davvero una voce. L'ordine e' quello
# di tentativo: si ferma alla prima che risponde.
# Per un libro si parte dai cataloghi bibliografici e non da Wikipedia: un
# titolo puo' essere condiviso da un saggio e da un film uscito dopo, e
# l'enciclopedia risponde con quello che le e' piu' familiare.
SOURCES_BY_KIND = {
    "film": ("wikipedia",),
    "documentary": ("wikipedia",),
    "series": ("wikipedia",),
    "video": ("wikipedia",),
    "podcast": ("wikipedia",),
    "fiction": ("openlibrary", "wikipedia", "googlebooks"),
    "essay": ("openlibrary", "openalex", "wikipedia", "googlebooks"),
    "article": ("openalex", "wikipedia"),
}


@dataclass
class LookupResult:
    """Un estratto citabile: senza URL e data non esce da qui."""

    source: str
    title: str
    text: str
    url: str
    retrieved_at: str = ""
    license: str = ""
    query: str = ""

    def as_dict(self) -> dict:
        return {
            "source": self.source,
            "title": self.title,
            "text": self.text,
            "url": self.url,
            "retrieved_at": self.retrieved_at,
            "license": self.license,
            "query": self.query,
        }


# --- utilita' di testo -------------------------------------------------------

class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self.parts.append(data)


def html_to_text(fragment: str) -> str:
    parser = _TextExtractor()
    parser.feed(fragment or "")
    return re.sub(r"\s+", " ", "".join(parser.parts)).strip()


def shorten(text: str, limit: int = MAX_TEXT_CHARS) -> str:
    """Taglia sull'ultima frase intera che ci sta, o sull'ultima parola."""
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    head = text[:limit]
    for stop in (". ", "? ", "! "):
        cut = head.rfind(stop)
        if cut > limit * 0.5:
            return head[: cut + 1].strip()
    return head.rsplit(" ", 1)[0].rstrip(" ,;:") + "..."


def _slug(text: str) -> str:
    plain = unicodedata.normalize("NFKD", (text or "").casefold())
    plain = "".join(c for c in plain if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", plain).strip("-")


def scrub_query(text: str) -> str:
    """Query pronta a uscire: niente PII, niente messaggi lunghi.

    Il testo fra virgolette, quando c'e', e' l'unica parte che interessa: e'
    quasi sempre il titolo dell'opera o il termine su cui verte la domanda.
    """
    text = (text or "").strip()
    quoted = re.search(r"[\"«“']([^\"»”']{3,80})[\"»”']", text)
    if quoted:
        text = quoted.group(1)
    text = redact_always(text) or ""
    text = re.sub(r"\s+", " ", text).strip()
    return text[:MAX_QUERY_CHARS]


def _words(text: str) -> set[str]:
    plain = unicodedata.normalize("NFKD", (text or "").casefold())
    plain = "".join(c for c in plain if not unicodedata.combining(c))
    return {w for w in re.split(r"[^a-z0-9]+", plain) if len(w) > 2}


def _title_core(title: str) -> set[str]:
    """Parole del titolo senza qualificatori: "(film 2014)", sottotitoli dopo :."""
    core = re.sub(r"\(.*?\)", " ", title or "")
    core = re.split(r"[:;—–]", core)[0]
    return _words(core)


def _title_matches(found: str, expected) -> bool:
    """Vero se il titolo trovato e' quell'opera, non un'altra cosa che le somiglia.

    Il titolo trovato puo' aggiungere solo qualificatori — "Whiplash (film 2014)",
    "Mindset: The New Psychology of Success" — mai parole nuove nel titolo vero.
    E' la regola che scarta i due errori tipici dei motori di ricerca: la pagina
    dell'autore al posto dell'opera ("Il posto delle fragole" -> "Ingmar
    Bergman") e l'omonimo che allunga il titolo ("Wonder" -> "Stevie Wonder").
    """
    expected = [e for e in (expected or ()) if str(e).strip()]
    if not expected:
        return True
    core = _title_core(found)
    for candidate in expected:
        wanted = _words(candidate)
        if not core or not wanted:
            if _slug(found) == _slug(candidate):
                return True
            continue
        # Sottoinsieme, senza soglia sulla lunghezza: un titolo trovato piu'
        # corto e' quasi sempre lo stesso titolo senza sottotitolo ("Mindset"
        # per "Mindset: The New Psychology of Success").
        if core <= wanted:
            return True
    return False


def _allowed(source: str, url: str) -> bool:
    host = (urlsplit(url or "").hostname or "").casefold()
    return bool(host) and any(
        host == dom or host.endswith(f".{dom}") for dom in ALLOWED_HOSTS.get(source, ())
    )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# --- rete --------------------------------------------------------------------

def _get_text(url: str) -> str | None:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_S) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="replace")
    except Exception as exc:  # rete assente, 404, rate limit: nessuno e' fatale
        logger.info("web_lookup: richiesta non riuscita su %s: %s", url, exc)
        return None


def _get_json(url: str) -> dict | None:
    raw = _get_text(url)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.info("web_lookup: risposta non JSON da %s: %s", url, exc)
        return None


# --- fonti -------------------------------------------------------------------

def _wikipedia(query: str, lang: str) -> LookupResult | None:
    lang = (lang or "it")[:2] or "it"
    base = f"https://{lang}.wikipedia.org"
    data = _get_json(f"{base}/api/rest_v1/page/summary/{urllib.parse.quote(query.replace(' ', '_'))}")
    if not data or data.get("type", "").endswith("not_found") or not data.get("extract"):
        search = _get_json(
            f"{base}/w/api.php?action=query&list=search&format=json&srlimit=1"
            f"&srsearch={urllib.parse.quote(query)}"
        )
        hits = (((search or {}).get("query") or {}).get("search")) or []
        if not hits:
            return None
        title = hits[0].get("title") or ""
        data = _get_json(f"{base}/api/rest_v1/page/summary/{urllib.parse.quote(title.replace(' ', '_'))}")
    if not data or not data.get("extract"):
        return None
    if data.get("type") == "disambiguation":
        # Una pagina di disambiguazione non dice di cosa parla l'opera.
        return None
    url = (((data.get("content_urls") or {}).get("desktop") or {}).get("page")) or ""
    if not _allowed("wikipedia", url):
        return None
    return LookupResult(
        source="wikipedia", title=data.get("title") or query,
        text=shorten(data["extract"]), url=url,
        retrieved_at=_now(), license=LICENSES["wikipedia"], query=query,
    )


# L'ordine degli attributi dello script cambia fra build di Next: si aggancia
# all'id, non alla stringa esatta.
_NEXT_DATA_RE = re.compile(
    r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.DOTALL
)


def _treccani_page(url: str) -> dict | None:
    """`props.pageProps.data` di una pagina Treccani, o None."""
    html = _get_text(url)
    if not html:
        return None
    match = _NEXT_DATA_RE.search(html)
    if not match:
        return None
    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError:
        return None
    data = ((payload.get("props") or {}).get("pageProps") or {}).get("data")
    return data if isinstance(data, dict) else None


def _treccani(query: str, lang: str) -> LookupResult | None:
    del lang  # Treccani e' una fonte italiana: la lingua non cambia l'endpoint.
    url = f"https://www.treccani.it/enciclopedia/{_slug(query)}/"
    data = _treccani_page(url)
    if not (data and data.get("content")):
        # Treccani risponde a una voce inesistente con 200 e una pagina generica:
        # l'assenza di `content` significa "non trovata", non errore.
        search = _treccani_page(
            f"https://www.treccani.it/enciclopedia/ricerca/{urllib.parse.quote(query)}/"
        )
        matches = (search or {}).get("matches") or []
        first = matches[0] if matches and isinstance(matches[0], dict) else None
        if not (first and first.get("url")):
            return None
        url = urllib.parse.urljoin("https://www.treccani.it", first["url"])
        data = _treccani_page(url)
        if not (data and data.get("content")):
            return None
    text = html_to_text(data.get("content") or "")
    if not text or not _allowed("treccani", url):
        return None
    return LookupResult(
        source="treccani", title=html_to_text(data.get("title") or "") or query,
        text=shorten(text), url=url,
        retrieved_at=_now(), license=LICENSES["treccani"], query=query,
    )


def _openlibrary(query: str, lang: str) -> LookupResult | None:
    del lang
    search = _get_json(
        "https://openlibrary.org/search.json?limit=1&fields=key,title,author_name"
        f"&q={urllib.parse.quote(query)}"
    )
    docs = (search or {}).get("docs") or []
    if not docs:
        return None
    key = str(docs[0].get("key") or "")
    if not key.startswith("/works/"):
        return None
    work = _get_json(f"https://openlibrary.org{key}.json") or {}
    description = work.get("description")
    if isinstance(description, dict):
        description = description.get("value")
    if not isinstance(description, str) or not description.strip():
        return None
    url = f"https://openlibrary.org{key}"
    if not _allowed("openlibrary", url):
        return None
    return LookupResult(
        source="openlibrary", title=docs[0].get("title") or query,
        text=shorten(description.strip()), url=url,
        retrieved_at=_now(), license=LICENSES["openlibrary"], query=query,
    )


def _googlebooks(query: str, lang: str) -> LookupResult | None:
    del lang
    # Senza chiave l'API risponde 429 dalla maggior parte degli IP condivisi:
    # meglio non chiamarla affatto che sprecare un tentativo a ogni ricerca.
    key = os.environ.get("GOOGLE_BOOKS_API_KEY", "").strip()
    if not key:
        return None
    data = _get_json(
        "https://www.googleapis.com/books/v1/volumes?maxResults=1"
        f"&q={urllib.parse.quote(query)}&key={urllib.parse.quote(key)}"
    )
    items = (data or {}).get("items") or []
    if not items:
        return None
    info = items[0].get("volumeInfo") or {}
    description = str(info.get("description") or "").strip()
    url = str(info.get("infoLink") or "")
    if not description or not _allowed("googlebooks", url):
        return None
    return LookupResult(
        source="googlebooks", title=info.get("title") or query,
        text=shorten(description), url=url,
        retrieved_at=_now(), license=LICENSES["googlebooks"], query=query,
    )


def _abstract_from_inverted_index(index: dict) -> str:
    """OpenAlex conserva l'abstract come indice invertito parola -> posizioni."""
    if not isinstance(index, dict):
        return ""
    positions: list[tuple[int, str]] = []
    for word, spots in index.items():
        for spot in spots or ():
            positions.append((int(spot), str(word)))
    return " ".join(word for _, word in sorted(positions))


def _openalex(query: str, lang: str) -> LookupResult | None:
    del lang
    data = _get_json(
        f"https://api.openalex.org/works?per_page=1&search={urllib.parse.quote(query)}"
    )
    results = (data or {}).get("results") or []
    if not results:
        return None
    work = results[0]
    abstract = _abstract_from_inverted_index(work.get("abstract_inverted_index") or {})
    if not abstract.strip():
        return None
    url = str(work.get("doi") or work.get("id") or "")
    if not _allowed("openalex", url):
        return None
    return LookupResult(
        source="openalex", title=work.get("title") or query,
        text=shorten(abstract.strip()), url=url,
        retrieved_at=_now(), license=LICENSES["openalex"], query=query,
    )


_FETCHERS = {
    "wikipedia": _wikipedia,
    "treccani": _treccani,
    "openlibrary": _openlibrary,
    "googlebooks": _googlebooks,
    "openalex": _openalex,
}


# --- API pubblica ------------------------------------------------------------

def lookup(
    query: str,
    *,
    sources: tuple[str, ...] | list[str] | None = None,
    lang: str = "it",
    limit: int = 1,
    expect_titles=(),
) -> list[LookupResult]:
    """Interroga le fonti in ordine e ritorna i primi `limit` estratti trovati.

    `expect_titles` accende il controllo di identita': la voce trovata deve
    essere quell'opera, non l'autore o un omonimo. Resta vuoto per una domanda
    fattuale, dove il titolo atteso non esiste.
    """
    query = scrub_query(query)
    if not query:
        return []
    wanted = [s for s in (sources or SOURCES) if s in _FETCHERS]
    found: list[LookupResult] = []
    for source in wanted:
        if len(found) >= max(1, limit):
            break
        try:
            result = _FETCHERS[source](query, lang)
        except Exception as exc:  # una fonte rotta non deve fermare le altre
            logger.info("web_lookup: fonte %s non utilizzabile: %s", source, exc)
            continue
        if not (result and result.text):
            continue
        if not _title_matches(result.title, expect_titles):
            logger.info("web_lookup: %s ha risposto '%s', non e' l'opera cercata",
                        source, result.title)
            continue
        found.append(result)
    return found


# Un titolo puo' essere condiviso da un libro e da un film uscito dopo, e le
# enciclopedie aprono la voce dichiarando il medium: e' il segnale piu' semplice
# per accorgersi di aver preso l'opera sbagliata.
_SCREEN_KINDS = {"film", "documentary", "series", "video"}
_SCREEN_DECLARATION = re.compile(
    r"\b(e['\u2019]?\s+un\s+film|e['\u2019]?\s+una\s+serie|film\s+d[i']\s?animazione|"
    r"is\s+a\s+(?:\d{4}\s+)?(?:american\s+|british\s+|italian\s+)?(?:animated\s+)?(?:film|movie)|"
    r"is\s+an?\s+.{0,20}television\s+series)",
    re.IGNORECASE,
)


def _wrong_medium(text: str, kind: str) -> bool:
    """Vero se l'estratto descrive un film ma la voce di catalogo non lo e'."""
    if (kind or "").lower() in _SCREEN_KINDS:
        return False
    plain = unicodedata.normalize("NFKD", (text or "")[:200])
    plain = "".join(c for c in plain if not unicodedata.combining(c))
    return bool(_SCREEN_DECLARATION.search(plain))


def synopsis_for(reading: dict, lang: str = "it") -> LookupResult | None:
    """Bozza di sinossi per una voce del catalogo.

    Cerca col titolo originale quando c'e' (le fonti indicizzano quello) e
    aggiunge il primo autore o regista per disambiguare gli omonimi.
    """
    titles = [str(reading.get(key) or "").strip()
              for key in ("original_title", "title")]
    titles = [t for t in titles if t]
    if not titles:
        return None
    creators = reading.get("creators") or []
    # Il titolo da solo per primo: aggiungere l'autore fa vincere la sua
    # biografia nei risultati di ricerca. L'autore resta un ripiego.
    queries = list(dict.fromkeys(titles + ([f"{titles[0]} {creators[0]}"] if creators else [])))
    sources = list(SOURCES_BY_KIND.get(str(reading.get("kind") or "essay"), ("wikipedia",)))
    if (lang or "it").startswith("it") and "treccani" not in sources:
        sources.append("treccani")
    kind = str(reading.get("kind") or "essay")
    for query in queries:
        for source in sources:
            results = lookup(query, sources=(source,), lang=lang, limit=1, expect_titles=titles)
            if not results:
                continue
            if _wrong_medium(results[0].text, kind):
                logger.info("web_lookup: %s descrive un film, ma '%s' non lo e'", source, query)
                continue
            return results[0]
    return None


# --- cache -------------------------------------------------------------------

def _cache_key(query: str, sources, lang: str) -> str:
    import hashlib

    payload = f"{lang}|{','.join(sources)}|{query.casefold()}"
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def cached_lookup(
    db,
    query: str,
    *,
    sources: tuple[str, ...] | list[str] | None = None,
    lang: str = "it",
    limit: int = 1,
    ttl_days: int = CACHE_TTL_DAYS,
) -> list[LookupResult]:
    """`lookup` con memoria: la stessa domanda non ricompra la stessa pagina."""
    from . import models

    query = scrub_query(query)
    if not query:
        return []
    wanted = tuple(s for s in (sources or SOURCES) if s in _FETCHERS)
    key = _cache_key(query, wanted, lang)
    if db is not None:
        row = (
            db.query(models.WebLookupCache)
            .filter(models.WebLookupCache.cache_key == key)
            .first()
        )
        fresh_after = datetime.now(timezone.utc) - timedelta(days=ttl_days)
        fetched_at = getattr(row, "fetched_at", None)
        if fetched_at is not None and fetched_at.tzinfo is None:
            fetched_at = fetched_at.replace(tzinfo=timezone.utc)
        if row is not None and fetched_at is not None and fetched_at >= fresh_after:
            return [LookupResult(**item) for item in (row.payload or [])][:limit]

    results = lookup(query, sources=wanted, lang=lang, limit=limit)
    if db is not None and results:
        try:
            db.merge(models.WebLookupCache(
                cache_key=key, query=query, language=lang,
                sources=list(wanted), payload=[r.as_dict() for r in results],
                fetched_at=datetime.now(timezone.utc),
            ))
            db.commit()
        except Exception as exc:  # la cache che non scrive non rompe il turno
            logger.info("web_lookup: cache non scritta (%s)", exc)
            db.rollback()
    return results


def render_block(results: list[LookupResult]) -> str:
    """Blocco per il prompt: estratti con la fonte attaccata, mai senza."""
    if not results:
        return ""
    lines = [
        "[WEB_SOURCES]",
        "Estratti recuperati ora da fonti pubbliche, per rispondere a una domanda "
        "puntuale. Usali solo per i fatti chiesti, cita la fonte con il suo nome e "
        "il link, e distingui cio' che dice la fonte da cio' che aggiungi tu. "
        "Non sono raccomandazioni: non proporre queste opere come letture.",
    ]
    for item in results:
        lines.append(f"- {item.title} — {item.source} ({item.url}), consultato il {item.retrieved_at[:10]}")
        lines.append(f"    {item.text}")
    return "\n".join(lines)


# --- CLI ---------------------------------------------------------------------

def _main() -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Consulta le fonti affidabili whitelisted.")
    parser.add_argument("query")
    parser.add_argument("--source", action="append", choices=SOURCES, dest="sources")
    parser.add_argument("--lang", default="it")
    parser.add_argument("--limit", type=int, default=1)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    results = lookup(args.query, sources=args.sources, lang=args.lang, limit=args.limit)
    if args.json:
        print(json.dumps([r.as_dict() for r in results], ensure_ascii=False, indent=2))
    elif not results:
        print("Nessuna fonte affidabile ha una voce per questa richiesta.")
    else:
        for item in results:
            print(f"# {item.title} — {item.source}\n{item.url}\n\n{item.text}\n")
    return 0 if results else 1


if __name__ == "__main__":
    raise SystemExit(_main())
