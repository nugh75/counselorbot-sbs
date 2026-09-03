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
    "europepmc": ("europepmc.org", "doi.org"),
}
SOURCES = tuple(ALLOWED_HOSTS)

LICENSES = {
    "wikipedia": "Wikipedia, CC BY-SA 4.0",
    "treccani": "Treccani.it — Istituto della Enciclopedia Italiana",
    "openlibrary": "Open Library (Internet Archive)",
    "googlebooks": "Google Books",  # richiede GOOGLE_BOOKS_API_KEY
    "openalex": "OpenAlex, CC0",
    "europepmc": "Europe PMC, abstract ad accesso aperto",
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
    "article": ("openalex", "europepmc", "wikipedia"),
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
    # Lingua in cui la fonte ha risposto: Wikipedia segue la richiesta, i
    # cataloghi bibliografici rispondono in inglese comunque. Chi salva il testo
    # deve metterlo sotto questa lingua, non sotto quella richiesta.
    language: str = "en"

    def as_dict(self) -> dict:
        return {
            "source": self.source,
            "title": self.title,
            "text": self.text,
            "url": self.url,
            "retrieved_at": self.retrieved_at,
            "license": self.license,
            "query": self.query,
            "language": self.language,
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


# Parole molto frequenti e poco ambigue fra le sei lingue dell'interfaccia.
_STOPWORDS = {
    "it": {"di", "che", "non", "per", "una", "come", "sono", "nel", "alla", "gli", "dei", "suo"},
    "en": {"the", "and", "with", "that", "this", "from", "his", "her", "which", "about", "have"},
    "es": {"que", "los", "las", "una", "por", "con", "para", "como", "pero", "sus", "vida"},
    "fr": {"les", "des", "une", "sur", "pas", "que", "qui", "dans", "pour", "est", "plus", "alors"},
    "de": {"und", "der", "die", "das", "nicht", "mit", "sich", "ist", "auf", "den", "ein"},
    "sv": {"och", "att", "det", "som", "med", "for", "inte", "har", "den", "till", "pa"},
}


def guess_language(text: str, default: str = "en") -> str:
    """Lingua del testo fra le sei supportate, o `default` se non si distingue.

    Serve a non archiviare come inglese una descrizione che la fonte ha in
    francese: Open Library e Google Books rispondono nella lingua dell'edizione.
    """
    words = [w for w in re.split(r"[^a-z]+", _plain_keep_shape(text)) if w]
    if len(words) < 12:
        return default
    counts = {lang: sum(1 for w in words if w in stop) for lang, stop in _STOPWORDS.items()}
    best = max(counts, key=lambda lang: counts[lang])
    runner_up = max((c for lang, c in counts.items() if lang != best), default=0)
    # Serve un margine: due lingue vicine si contendono le stesse parole corte.
    return best if counts[best] >= 3 and counts[best] > runner_up else default


# Rumore tipico delle descrizioni di catalogo: grassetti markdown, note fra
# parentesi quadre ereditate da Wikipedia, riga di attribuzione finale.
_DESCRIPTION_NOISE = (
    (re.compile(r"\*\*+"), ""),
    (re.compile(r"\[\d{1,3}\]"), ""),
    (re.compile(r"\s*-{4,}.*$", re.DOTALL), ""),
    (re.compile(r"\s*\(\[source\]\[\d+\]\)", re.IGNORECASE), ""),
)


def clean_description(text: str) -> str:
    for pattern, replacement in _DESCRIPTION_NOISE:
        text = pattern.sub(replacement, text or "")
    return re.sub(r"\s+", " ", text).strip()


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


# Apertura interrogativa da togliere: alle fonti serve l'entita', non la
# domanda. "Cos'e' la metacognizione?" -> "metacognizione".
_QUESTION_LEAD = re.compile(
    r"^\s*(?:mi\s+)?(?:sai\s+dire|puoi\s+dirmi|spiegami|dimmi|"
    r"tell\s+me|explain)?\s*"
    r"(?:(?:che\s+)?cos\W?\s*e\b|che\s+cosa\s+e\b|"
    r"cosa\s+(?:significa|vuol\s+dire)|"
    r"di\s+(?:cosa|che)\s+(?:parla|tratta)|la\s+trama\s+di|qual\s+e\s+la\s+trama\s+di|"
    r"chi\s+(?:e|era|sono|erano|ha\s+scritto|ha\s+diretto)|"
    r"in\s+che\s+anno\s+e\s+(?:uscito|uscita)|quando\s+e\s+(?:uscito|uscita|nato|nata|morto|morta)|"
    r"what\s+(?:is|are|was|were)|who\s+(?:is|was|were|wrote|directed)|what\s+does|"
    r"que\s+es|que\s+significa|quien\s+(?:es|fue|era|escribio)|de\s+que\s+trata|"
    r"qu\W?est-ce\s+que|qui\s+(?:est|etait|a\s+ecrit)|que\s+veut\s+dire|de\s+quoi\s+parle|"
    r"was\s+ist|was\s+bedeutet|wer\s+(?:ist|war)|worum\s+geht\s+es\s+in|"
    r"vad\s+(?:ar|betyder)|vem\s+(?:ar|var|skrev)|vad\s+handlar)\b",
    re.IGNORECASE,
)
_LEADING_ARTICLE = re.compile(
    r"^\s*(?:il|lo|la|i|gli|le|un|uno|una|the|an?|el|los|las|les|der|die|das|den|det)\s+"
    r"|^\s*l\W\s*",
    re.IGNORECASE,
)


def _plain_keep_shape(text: str) -> str:
    """Minuscole senza accenti, stessa lunghezza: gli indici restano validi."""
    normalized = unicodedata.normalize("NFKD", (text or "").casefold())
    return "".join(c for c in normalized if not unicodedata.combining(c))


def scrub_query(text: str) -> str:
    """Query pronta a uscire: l'entita' cercata, senza PII e senza la domanda.

    Il testo fra virgolette, quando c'e', e' l'unica parte che interessa: e'
    quasi sempre il titolo dell'opera. Altrimenti si toglie l'apertura
    interrogativa, perche' una fonte cerca "metacognizione", non "cos'e' la
    metacognizione?".
    """
    text = (text or "").strip()
    quoted = re.search(r"[\"«“']([^\"»”']{3,80})[\"»”']", text)
    if quoted:
        text = quoted.group(1)
    else:
        plain = _plain_keep_shape(text)
        lead = _QUESTION_LEAD.match(plain)
        if lead and len(text) > lead.end():
            # Gli indici valgono anche sull'originale: la normalizzazione non
            # cambia il numero di caratteri.
            text = text[lead.end():].strip()
            # "cos'e'" lascia l'apostrofo di chiusura: e' la convenzione ASCII
            # usata in tutto il progetto per gli accenti.
            text = text.lstrip(" '\u2019\"")
            article = _LEADING_ARTICLE.match(_plain_keep_shape(text))
            if article and len(text) > article.end():
                text = text[article.end():].strip()
        text = text.strip(" \t?!.,;:")
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


_SEQUEL_MARKER = re.compile(r"\b(\d{1,2}|ii|iii|iv|v|vi)$")


def _sequel_marker(title: str) -> str:
    """Numero finale del titolo: "Inside Out 2" -> "2", "Inside Out" -> ""."""
    core = re.sub(r"\(.*?\)", " ", title or "").strip()
    core = re.split(r"[:;—–]", core)[0].strip()
    plain = _plain_keep_shape(core).strip()
    match = _SEQUEL_MARKER.search(plain)
    return match.group(1) if match else ""


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
        # Un seguito non e' l'opera: "Inside Out 2" non racconta "Inside Out",
        # e il numero finale sfugge al confronto per parole.
        if _sequel_marker(found) != _sequel_marker(candidate):
            continue
        # Sottoinsieme, senza soglia sulla lunghezza: un titolo trovato piu'
        # corto e' quasi sempre lo stesso titolo senza sottotitolo ("Mindset"
        # per "Mindset: The New Psychology of Success").
        if core <= wanted:
            return True
    return False


def _same_root(a: str, b: str) -> bool:
    """Due parole con la stessa radice: basta un prefisso comune di 6 lettere."""
    if a == b:
        return True
    shared = 0
    for ca, cb in zip(a, b):
        if ca != cb:
            break
        shared += 1
    return shared >= 6


def _title_covers_query(found: str, query: str) -> bool:
    """Vero se il titolo trovato contiene cio' che era stato chiesto.

    Controllo piu' morbido di `_title_matches`, per le domande libere dove non
    esiste un titolo atteso: la voce puo' essere piu' specifica della domanda
    ("Vygotskij" -> "Lev Semenovic Vygotskij"), ma non puo' parlare d'altro
    ("Mindset" -> "The Witch"). Senza questo controllo una redirezione
    inattesa dell'enciclopedia diventa una risposta sicura di se' e sbagliata.
    """
    asked = _words(query)
    found_words = _words(found)
    if not asked or not found_words:
        return True
    # Confronto tollerante alla morfologia: si chiede "procrastinare" e la voce
    # si chiama "procrastinazione".
    hits = sum(1 for word in asked if any(_same_root(word, other) for other in found_words))
    # Contenimento sul piu' corto dei due: la domanda puo' portare parole in
    # piu' ("mindset dweck libro" -> voce "Mindset") e la voce puo' essere piu'
    # completa della domanda ("Vygotskij" -> "Lev Semenovic Vygotskij").
    return hits / min(len(asked), len(found_words)) >= 0.6


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
        retrieved_at=_now(), license=LICENSES["wikipedia"], query=query, language=lang,
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
        # Una domanda di significato vive nel vocabolario, non nell'enciclopedia.
        vocab_url = f"https://www.treccani.it/vocabolario/{_slug(query)}/"
        vocab = _treccani_page(vocab_url)
        if vocab and vocab.get("content"):
            url, data = vocab_url, vocab
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
        retrieved_at=_now(), license=LICENSES["treccani"], query=query, language="it",
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
    description = clean_description(description)
    if not description:
        return None
    return LookupResult(
        source="openlibrary", title=docs[0].get("title") or query,
        text=shorten(description), url=url,
        retrieved_at=_now(), license=LICENSES["openlibrary"], query=query,
        language=guess_language(description),
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
    description = clean_description(description)
    return LookupResult(
        source="googlebooks", title=info.get("title") or query,
        text=shorten(description), url=url,
        retrieved_at=_now(), license=LICENSES["googlebooks"], query=query,
        language=guess_language(description),
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


_DOI_RE = re.compile(r"\b(10\.\d{4,9}/\S+)\s*$")


def _as_doi(query: str) -> str:
    """Il DOI dentro la query, se la query e' un DOI: si risolve, non si cerca."""
    match = _DOI_RE.search((query or "").strip())
    return match.group(1).rstrip(".,;") if match else ""


def _openalex(query: str, lang: str) -> LookupResult | None:
    del lang
    doi = _as_doi(query)
    if doi:
        work = _get_json(f"https://api.openalex.org/works/doi:{urllib.parse.quote(doi)}")
        results = [work] if work else []
    else:
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


def _europepmc(query: str, lang: str) -> LookupResult | None:
    """Abstract ad accesso aperto: copre i lavori che OpenAlex lascia senza."""
    del lang
    doi = _as_doi(query)
    term = f'DOI:"{doi}"' if doi else query
    data = _get_json(
        "https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&resultType=core"
        f"&pageSize=1&query={urllib.parse.quote(term)}"
    )
    results = ((data or {}).get("resultList") or {}).get("result") or []
    if not results:
        return None
    record = results[0]
    abstract = str(record.get("abstractText") or "").strip()
    if not abstract:
        return None
    record_doi = str(record.get("doi") or doi or "").strip()
    if record_doi:
        url = f"https://doi.org/{record_doi}"
    else:
        url = f"https://europepmc.org/article/{record.get('source', 'MED')}/{record.get('id', '')}"
    if not _allowed("europepmc", url):
        return None
    return LookupResult(
        source="europepmc", title=record.get("title") or query,
        text=shorten(html_to_text(abstract)), url=url,
        retrieved_at=_now(), license=LICENSES["europepmc"], query=query,
    )


_FETCHERS = {
    "wikipedia": _wikipedia,
    "treccani": _treccani,
    "openlibrary": _openlibrary,
    "googlebooks": _googlebooks,
    "openalex": _openalex,
    "europepmc": _europepmc,
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
        related = (_title_matches(result.title, expect_titles) if expect_titles
                   else _title_covers_query(result.title, query))
        if not related:
            logger.info("web_lookup: %s ha risposto '%s', non e' cio' che era stato chiesto",
                        source, result.title)
            continue
        found.append(result)
    return found


# Un titolo puo' essere condiviso da un libro e da un film uscito dopo, e le
# enciclopedie aprono la voce dichiarando il medium: e' il segnale piu' semplice
# per accorgersi di aver preso l'opera sbagliata.
_SCREEN_KINDS = {"film", "documentary", "series", "video"}
_SCREEN_DECLARATION = re.compile(
    r"\b(e['\u2019]?\s+un(?:a)?\s+(?:film|serie|documentario|miniserie)|"
    r"film\s+d[i']\s?animazione|"
    r"is\s+an?\s+[\w\s,'-]{0,60}?(?:film|movie|documentary|miniseries|"
    r"television\s+series|tv\s+series))",
    re.IGNORECASE,
)


def _declares_screen_work(text: str) -> bool:
    plain = unicodedata.normalize("NFKD", (text or "")[:220])
    plain = "".join(c for c in plain if not unicodedata.combining(c))
    return bool(_SCREEN_DECLARATION.search(plain))


def _medium_conflict(text: str, kind: str) -> bool:
    """Vero quando l'estratto e il tipo della voce non parlano della stessa cosa.

    Vale nei due sensi, e servono entrambi: un film omonimo non e' la sinossi di
    un saggio ("Il paradosso del tempo"), e la capitale achemenide non e' la
    sinossi del film "Persepolis".
    """
    declares_screen = _declares_screen_work(text)
    if (kind or "").lower() in _SCREEN_KINDS:
        return not declares_screen
    return declares_screen


def _creator_is_named(text: str, title: str, creators) -> bool:
    """Vero se la voce nomina almeno un autore dell'opera.

    Una pagina enciclopedica su un'opera nomina quasi sempre chi l'ha fatta.
    Senza questo controllo il titolo di un saggio finisce sulla voce del
    concetto omonimo: "Cosmo" di Sagan diventa la voce filosofica "cosmo".
    """
    surnames = [
        _plain_keep_shape(str(name).split()[-1])
        for name in (creators or []) if str(name).strip()
    ]
    if not surnames:
        return True
    haystack = _plain_keep_shape(f"{title} {text}")
    return any(len(surname) > 2 and surname in haystack for surname in surnames)


def synopsis_for(
    reading: dict,
    lang: str = "it",
    sources: tuple[str, ...] | list[str] | None = None,
) -> LookupResult | None:
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
    kind = str(reading.get("kind") or "essay")
    year = reading.get("year")
    # Il titolo da solo per primo: aggiungere l'autore fa vincere la sua
    # biografia nei risultati di ricerca. L'autore resta un ripiego.
    queries = list(titles)
    doi = str((reading.get("identifiers") or {}).get("doi") or "").strip()
    if doi:
        # Un lavoro con un identificatore non si cerca per titolo: si risolve.
        queries.insert(0, doi)
    if kind in _SCREEN_KINDS:
        # Le enciclopedie disambiguano i film col qualificatore, e un titolo
        # nudo finisce sull'omonimo o sul seguito: "Lady Bird" -> "Lady Bird
        # (film)", "Inside Out" -> "Inside Out (film 2015)".
        for title in list(titles):
            queries.append(f"{title} (film)")
            if year:
                queries.append(f"{title} (film {year})")
                queries.append(f"{title} ({year} film)")
    if creators:
        queries.append(f"{titles[0]} {creators[0]}")
    queries = list(dict.fromkeys(queries))
    sources = list(sources or SOURCES_BY_KIND.get(str(reading.get("kind") or "essay"), ("wikipedia",)))
    if (lang or "it").startswith("it") and "treccani" not in sources:
        sources.append("treccani")
    for query in queries:
        for source in sources:
            results = lookup(query, sources=(source,), lang=lang, limit=1, expect_titles=titles)
            if not results:
                continue
            if _medium_conflict(results[0].text, kind):
                logger.info("web_lookup: %s ha risposto su un altro tipo di opera per '%s'",
                            source, query)
                continue
            # Solo per le opere scritte: la voce di un film e' gia' protetta dal
            # qualificatore e dal controllo del medium, e il suo estratto puo'
            # essere troppo corto per nominare la regia.
            if kind not in _SCREEN_KINDS and not _creator_is_named(
                    results[0].text, results[0].title, creators):
                logger.info("web_lookup: %s ha risposto '%s' senza nominare l'autore",
                            source, results[0].title)
                continue
            return results[0]
    return None


# --- cache -------------------------------------------------------------------

# Cambia quando cambiano le regole di validazione: le risposte gia' in cache
# sono state accettate dalle regole vecchie e vanno ricalcolate.
_CACHE_VERSION = 2


def _cache_key(query: str, sources, lang: str) -> str:
    import hashlib

    payload = f"v{_CACHE_VERSION}|{lang}|{','.join(sources)}|{query.casefold()}"
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


# --- ricerca tematica --------------------------------------------------------

# Cercare un tema non e' cercare un'entita'. `lookup` pretende che il titolo
# trovato ricalchi la domanda, ed e' giusto quando si chiede "di cosa parla
# Mindset": una redirezione dell'enciclopedia diventerebbe una risposta sicura e
# sbagliata. Ma su "dispersione scolastica nella secondaria" nessun titolo
# ricalca la domanda, e quel controllo restituirebbe sempre il vuoto. Qui il
# titolo non e' un criterio: lo sono i filtri (anno, lingua, accesso aperto) e
# l'ordine di pertinenza che la fonte stessa dichiara.
WORK_SOURCES = ("openalex", "europepmc")
MAX_WORKS = 20
# Un abstract e' piu' lungo di un estratto di enciclopedia: serve a decidere se
# il lavoro c'entra, e mezza frase non basta a deciderlo.
MAX_ABSTRACT_CHARS = 900
MAILTO = USER_AGENT.split("mailto:")[-1].rstrip(") ") if "mailto:" in USER_AGENT else ""


@dataclass
class WorkResult:
    """Un lavoro scientifico con quel che serve a citarlo e a giudicarlo."""

    source: str
    title: str
    url: str
    doi: str = ""
    authors: str = ""
    year: str = ""
    journal: str = ""
    abstract: str = ""
    oa_status: str = ""
    # Dove sta il PDF ad accesso aperto, quando esiste. Non e' un dominio della
    # whitelist: e' l'editore o il repository, e cambia a ogni lavoro. Chi
    # scarica deve verificarlo da se'.
    pdf_url: str = ""
    citations: int = 0
    license: str = ""
    retrieved_at: str = ""
    query: str = ""

    def as_dict(self) -> dict:
        return {
            "source": self.source, "title": self.title, "url": self.url, "doi": self.doi,
            "authors": self.authors, "year": self.year, "journal": self.journal,
            "abstract": self.abstract, "oa_status": self.oa_status, "pdf_url": self.pdf_url,
            "citations": self.citations, "license": self.license,
            "retrieved_at": self.retrieved_at, "query": self.query,
        }


def _doi_key(value: str) -> str:
    """Il DOI nudo, minuscolo: la stessa opera arriva da due fonti scritta in
    due modi ("https://doi.org/10.1/x" e "10.1/X")."""
    text = (value or "").strip().lower()
    for prefix in ("https://doi.org/", "http://doi.org/", "doi:"):
        if text.startswith(prefix):
            text = text[len(prefix):]
    return text.strip("/")


def _search_openalex(query: str, limit: int, year_from, oa_only: bool, lang: str) -> list[WorkResult]:
    filters = []
    if oa_only:
        filters.append("open_access.is_oa:true")
    if year_from:
        filters.append(f"publication_year:>{int(year_from) - 1}")
    if lang:
        filters.append(f"language:{lang[:2]}")
    params = {
        "search": query,
        "per_page": min(max(1, limit), MAX_WORKS),
        "sort": "relevance_score:desc",
    }
    if MAILTO:
        params["mailto"] = MAILTO
    if filters:
        params["filter"] = ",".join(filters)
    data = _get_json(f"https://api.openalex.org/works?{urllib.parse.urlencode(params)}")

    out = []
    for hit in (data or {}).get("results") or []:
        location = hit.get("primary_location") or {}
        source_meta = location.get("source") or {}
        access = hit.get("open_access") or {}
        best = hit.get("best_oa_location") or {}
        url = str(hit.get("doi") or location.get("landing_page_url") or hit.get("id") or "")
        if not _allowed("openalex", url):
            continue
        out.append(WorkResult(
            source="openalex",
            title=str(hit.get("title") or "").strip(),
            url=url,
            doi=_doi_key(str(hit.get("doi") or "")),
            authors="; ".join(
                str(((entry or {}).get("author") or {}).get("display_name") or "").strip()
                for entry in (hit.get("authorships") or [])
                if ((entry or {}).get("author") or {}).get("display_name")
            ),
            year=str(hit.get("publication_year") or ""),
            journal=str(source_meta.get("display_name") or ""),
            abstract=shorten(
                _abstract_from_inverted_index(hit.get("abstract_inverted_index") or {}),
                MAX_ABSTRACT_CHARS,
            ),
            oa_status=str(access.get("oa_status") or ""),
            pdf_url=str(best.get("pdf_url") or access.get("oa_url") or ""),
            citations=int(hit.get("cited_by_count") or 0),
            license=LICENSES["openalex"],
            retrieved_at=_now(),
            query=query,
        ))
    return out


def _search_europepmc(query: str, limit: int, year_from, oa_only: bool, lang: str) -> list[WorkResult]:
    del lang  # Europe PMC indicizza in inglese: la lingua non cambia la ricerca.
    terms = [query]
    if oa_only:
        terms.append("OPEN_ACCESS:y")
    if year_from:
        terms.append(f"PUB_YEAR:[{int(year_from)} TO 3000]")
    params = {
        "format": "json",
        "resultType": "core",
        "pageSize": min(max(1, limit), MAX_WORKS),
        "query": " AND ".join(terms),
    }
    data = _get_json(
        "https://www.ebi.ac.uk/europepmc/webservices/rest/search?"
        + urllib.parse.urlencode(params)
    )

    out = []
    for record in ((data or {}).get("resultList") or {}).get("result") or []:
        doi = _doi_key(str(record.get("doi") or ""))
        url = f"https://doi.org/{doi}" if doi else f"https://europepmc.org/article/MED/{record.get('pmid') or ''}"
        if not _allowed("europepmc", url):
            continue
        pdf_url = ""
        for entry in ((record.get("fullTextUrlList") or {}).get("fullTextUrl") or []):
            if str((entry or {}).get("documentStyle") or "").lower() == "pdf":
                pdf_url = str(entry.get("url") or "")
                break
        out.append(WorkResult(
            source="europepmc",
            title=str(record.get("title") or "").strip(),
            url=url,
            doi=doi,
            authors=str(record.get("authorString") or "").strip(),
            year=str(record.get("pubYear") or ""),
            journal=str(record.get("journalTitle") or ""),
            abstract=shorten(str(record.get("abstractText") or "").strip(), MAX_ABSTRACT_CHARS),
            oa_status="open" if str(record.get("isOpenAccess") or "").upper() == "Y" else "",
            pdf_url=pdf_url,
            citations=int(record.get("citedByCount") or 0),
            license=LICENSES["europepmc"],
            retrieved_at=_now(),
            query=query,
        ))
    return out


_WORK_SEARCHERS = {
    "openalex": _search_openalex,
    "europepmc": _search_europepmc,
}


def search_works(
    query: str,
    *,
    sources: tuple[str, ...] | list[str] | None = None,
    limit: int = 8,
    year_from: int | None = None,
    oa_only: bool = True,
    lang: str = "",
) -> list[WorkResult]:
    """Lavori scientifici pertinenti a un tema, gia' deduplicati per DOI.

    La query esce ripulita dalle PII come ogni altra chiamata verso l'esterno.
    Una fonte che non risponde non ferma le altre.
    """
    query = redact_always((query or "").strip())[:MAX_QUERY_CHARS].strip()
    if len(query) < 3:
        return []
    wanted = [s for s in (sources or WORK_SOURCES) if s in _WORK_SEARCHERS]
    found: list[WorkResult] = []
    seen: set[str] = set()
    for source in wanted:
        try:
            results = _WORK_SEARCHERS[source](query, limit, year_from, oa_only, lang)
        except Exception as exc:  # una fonte rotta non deve fermare le altre
            logger.info("web_lookup: ricerca su %s non utilizzabile: %s", source, exc)
            continue
        for work in results:
            key = work.doi or work.url.casefold()
            if not work.title or key in seen:
                continue
            seen.add(key)
            found.append(work)
    return found[:min(max(1, limit), MAX_WORKS)]


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
