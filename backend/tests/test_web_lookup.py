"""Test della consultazione di fonti esterne.

Interamente offline: `_get_json` e `_get_text` sono sostituiti con risposte
registrate, cosi' il test non dipende dalla rete ne' dalla disponibilita' di
Wikipedia o Treccani.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_web_lookup
"""
import os

os.environ.setdefault("COUNSELOR_TRANSLATE_DISABLED", "1")
os.environ.setdefault("ADMIN_SYNC_DISABLED", "1")

import json
from types import SimpleNamespace

from backend import models, web_lookup
from backend.skills import handlers
from backend.skills.context import SkillContext


class _Responses:
    """Risposte registrate per URL: una sostituzione esplicita della rete."""

    def __init__(self, json_map=None, text_map=None):
        self.json_map = json_map or {}
        self.text_map = text_map or {}
        self.calls = []

    def get_json(self, url):
        self.calls.append(url)
        for fragment, payload in self.json_map.items():
            if fragment in url:
                return payload
        return None

    def get_text(self, url):
        self.calls.append(url)
        for fragment, payload in self.text_map.items():
            if fragment in url:
                return payload
        return None


def _install(responses):
    web_lookup._get_json = responses.get_json
    web_lookup._get_text = responses.get_text
    return responses


def _restore():
    import importlib

    importlib.reload(web_lookup)


WIKI_SUMMARY = {
    "type": "standard",
    "title": "Mindset",
    "extract": "Mindset e' un saggio di Carol Dweck sulla differenza fra teoria fissa e teoria incrementale dell'intelligenza.",
    "content_urls": {"desktop": {"page": "https://it.wikipedia.org/wiki/Mindset"}},
}

TRECCANI_HTML = (
    '<html><head><script id="__NEXT_DATA__" type="application/json">'
    + json.dumps({"props": {"pageProps": {"data": {
        "title": "Divina Commedia",
        "content": "<p>Poema di <b>Dante Alighieri</b>, in tre cantiche.</p>",
    }}}})
    + "</script></head><body></body></html>"
)


# --- fonti -------------------------------------------------------------------

def test_wikipedia_returns_extract_url_and_license():
    _install(_Responses(json_map={"/page/summary/": WIKI_SUMMARY}))
    try:
        results = web_lookup.lookup("Mindset", sources=["wikipedia"], lang="it")
        assert len(results) == 1
        item = results[0]
        assert item.source == "wikipedia"
        assert "Carol Dweck" in item.text
        assert item.url == "https://it.wikipedia.org/wiki/Mindset"
        assert item.license.startswith("Wikipedia")
        assert item.retrieved_at
    finally:
        _restore()


def test_wikipedia_falls_back_to_search_when_the_title_is_not_exact():
    responses = _Responses(json_map={
        "list=search": {"query": {"search": [{"title": "Mindset"}]}},
    })
    calls = {"summary": 0}

    def get_json(url):
        if "/page/summary/" in url:
            calls["summary"] += 1
            # La prima chiamata (titolo grezzo) non trova nulla, la seconda si'.
            return None if calls["summary"] == 1 else WIKI_SUMMARY
        return responses.get_json(url)

    web_lookup._get_json = get_json
    try:
        results = web_lookup.lookup("mindset dweck libro", sources=["wikipedia"], lang="it")
        assert len(results) == 1 and calls["summary"] == 2
    finally:
        _restore()


def test_a_disambiguation_page_is_not_a_synopsis():
    page = dict(WIKI_SUMMARY, type="disambiguation")
    _install(_Responses(json_map={"/page/summary/": page}))
    try:
        assert web_lookup.lookup("Mercurio", sources=["wikipedia"]) == []
    finally:
        _restore()


def test_an_url_outside_the_whitelist_is_dropped():
    page = dict(WIKI_SUMMARY)
    page["content_urls"] = {"desktop": {"page": "https://wikipedia.org.evil.example/Mindset"}}
    _install(_Responses(json_map={"/page/summary/": page}))
    try:
        assert web_lookup.lookup("Mindset", sources=["wikipedia"]) == []
    finally:
        _restore()


def test_treccani_reads_the_entry_out_of_next_data():
    _install(_Responses(text_map={"/enciclopedia/": TRECCANI_HTML}))
    try:
        results = web_lookup.lookup("Divina Commedia", sources=["treccani"], lang="it")
        assert len(results) == 1
        assert results[0].text.startswith("Poema di Dante Alighieri")
        assert results[0].url.startswith("https://www.treccani.it/enciclopedia/")
    finally:
        _restore()


def test_openlibrary_accepts_the_description_in_both_shapes():
    _install(_Responses(json_map={
        "search.json": {"docs": [{"key": "/works/OL1W", "title": "Grit"}]},
        "/works/OL1W.json": {"description": {"value": "Uno studio sulla perseveranza."}},
    }))
    try:
        results = web_lookup.lookup("Grit", sources=["openlibrary"])
        assert results[0].text == "Uno studio sulla perseveranza."
        assert results[0].url == "https://openlibrary.org/works/OL1W"
    finally:
        _restore()


def test_openalex_rebuilds_the_abstract_from_the_inverted_index():
    _install(_Responses(json_map={"api.openalex.org": {"results": [{
        "title": "Teaching a lay theory",
        "doi": "https://doi.org/10.1073/pnas.1524360113",
        "abstract_inverted_index": {"A": [0], "brief": [1], "intervention": [2]},
    }]}}))
    try:
        results = web_lookup.lookup("lay theory", sources=["openalex"])
        assert results[0].text == "A brief intervention"
    finally:
        _restore()


def test_a_source_that_finds_nothing_lets_the_next_one_try():
    _install(_Responses(json_map={
        "/page/summary/": None,
        "search.json": {"docs": [{"key": "/works/OL2W", "title": "Mindset"}]},
        "/works/OL2W.json": {"description": "Saggio sulla forma mentis."},
    }))
    try:
        results = web_lookup.lookup("Mindset", sources=["wikipedia", "openlibrary"])
        assert len(results) == 1 and results[0].source == "openlibrary"
    finally:
        _restore()


def test_google_books_is_not_called_without_a_key():
    import os

    key = os.environ.pop("GOOGLE_BOOKS_API_KEY", None)
    responses = _install(_Responses(json_map={"googleapis.com": {"items": [{"volumeInfo": {
        "title": "X", "description": "Y", "infoLink": "https://books.google.com/x"}}]}}))
    try:
        assert web_lookup.lookup("Mindset", sources=["googlebooks"]) == []
        assert responses.calls == [], "senza chiave non deve partire nessuna richiesta"
    finally:
        if key is not None:
            os.environ["GOOGLE_BOOKS_API_KEY"] = key
        _restore()


# --- query -------------------------------------------------------------------

def test_the_query_leaves_without_personal_data():
    assert "[email]" in web_lookup.scrub_query("scrivimi a mario.rossi@example.com per Mindset")
    assert "example.com" not in web_lookup.scrub_query("mario.rossi@example.com")


def test_quoted_text_becomes_the_query():
    assert web_lookup.scrub_query('di cosa parla "Il posto delle fragole"?') == "Il posto delle fragole"


def test_a_long_message_is_capped():
    assert len(web_lookup.scrub_query("parola " * 100)) <= web_lookup.MAX_QUERY_CHARS


def test_the_author_page_is_not_accepted_as_the_work():
    """Il caso che rompe una sinossi: la ricerca risponde con la biografia."""
    author_page = {
        "type": "standard", "title": "Ingmar Bergman",
        "extract": "Regista e sceneggiatore svedese.",
        "content_urls": {"desktop": {"page": "https://it.wikipedia.org/wiki/Ingmar_Bergman"}},
    }
    _install(_Responses(json_map={"/page/summary/": author_page}))
    try:
        assert web_lookup.lookup(
            "Il posto delle fragole", sources=["wikipedia"],
            expect_titles=["Il posto delle fragole"]) == []
        # Senza titolo atteso (domanda fattuale) il controllo non si applica.
        assert len(web_lookup.lookup("Ingmar Bergman", sources=["wikipedia"])) == 1
    finally:
        _restore()


def test_a_homonym_that_lengthens_the_title_is_refused():
    page = {
        "type": "standard", "title": "Stevie Wonder",
        "extract": "Cantante e polistrumentista statunitense.",
        "content_urls": {"desktop": {"page": "https://it.wikipedia.org/wiki/Stevie_Wonder"}},
    }
    _install(_Responses(json_map={"/page/summary/": page}))
    try:
        assert web_lookup.lookup("Wonder", sources=["wikipedia"], expect_titles=["Wonder"]) == []
    finally:
        _restore()


def test_a_subtitle_or_a_qualifier_still_counts_as_the_same_work():
    page = dict(WIKI_SUMMARY, title="Mindset: The New Psychology of Success")
    _install(_Responses(json_map={"/page/summary/": page}))
    try:
        assert len(web_lookup.lookup("Mindset", sources=["wikipedia"], expect_titles=["Mindset"])) == 1
    finally:
        _restore()

    qualified = dict(WIKI_SUMMARY, title="Whiplash (film 2014)")
    _install(_Responses(json_map={"/page/summary/": qualified}))
    try:
        assert len(web_lookup.lookup("Whiplash", sources=["wikipedia"], expect_titles=["Whiplash"])) == 1
    finally:
        _restore()


# --- sinossi -----------------------------------------------------------------

def test_a_film_is_looked_up_by_title_before_its_director():
    page = {
        "type": "standard", "title": "Smultronstallet",
        "extract": "Un anziano professore ripercorre la propria vita.",
        "content_urls": {"desktop": {"page": "https://it.wikipedia.org/wiki/Smultronstallet"}},
    }
    responses = _install(_Responses(json_map={"/page/summary/": page}))
    try:
        result = web_lookup.synopsis_for({
            "title": "Il posto delle fragole", "original_title": "Smultronstallet",
            "kind": "film", "creators": ["Ingmar Bergman"],
        }, lang="it")
        assert result is not None
        # Prima il titolo originale da solo: col regista vince la sua biografia.
        assert "Bergman" not in responses.calls[0]
    finally:
        _restore()


def test_a_film_with_the_same_title_is_not_the_synopsis_of_a_book():
    """"Il paradosso del tempo" e' un saggio di Zimbardo e un film del 2024."""
    film_page = {
        "type": "standard", "title": "Il paradosso del tempo",
        "extract": "Il paradosso del tempo e' un film del 2024 diretto da Bernardo Britto.",
        "content_urls": {"desktop": {"page": "https://it.wikipedia.org/wiki/Il_paradosso_del_tempo"}},
    }
    _install(_Responses(json_map={"/page/summary/": film_page}))
    try:
        assert web_lookup.synopsis_for({
            "title": "Il paradosso del tempo", "kind": "essay",
        }, lang="it") is None
        # La stessa pagina resta valida per una voce di catalogo che e' un film.
        assert web_lookup.synopsis_for({
            "title": "Il paradosso del tempo", "kind": "film",
        }, lang="it") is not None
    finally:
        _restore()


def test_an_article_starts_from_openalex():
    responses = _install(_Responses(json_map={"api.openalex.org": {"results": []}}))
    try:
        web_lookup.synopsis_for({"title": "Lay theory", "kind": "article"}, lang="en")
        assert responses.calls and "openalex" in responses.calls[0]
    finally:
        _restore()


# --- blocco per il prompt ----------------------------------------------------

def test_the_block_carries_source_link_and_date():
    _install(_Responses(json_map={"/page/summary/": WIKI_SUMMARY}))
    try:
        block = web_lookup.render_block(web_lookup.lookup("Mindset", sources=["wikipedia"]))
        assert "[WEB_SOURCES]" in block
        assert "https://it.wikipedia.org/wiki/Mindset" in block
        assert "non proporre queste opere come letture" in block
    finally:
        _restore()


# --- gating nella chat -------------------------------------------------------

class _FakeDB:
    """Sostituisce il DB per il solo gating: risponde per classe interrogata.

    Il test verifica quando la skill esce in rete, non la persistenza: quella
    vive nel database di test insieme al resto del catalogo.
    """

    def __init__(self, enabled: bool):
        self.enabled = enabled
        self.model = None

    def query(self, model):
        self.model = model
        return self

    def filter(self, *args, **kwargs):
        return self

    def first(self):
        if self.model is models.Config:
            return SimpleNamespace(value="true" if self.enabled else "false")
        return None

    def merge(self, obj):
        return obj

    def commit(self):
        return None

    def rollback(self):
        return None


def _ctx(db, message):
    return SkillContext(questionnaire_type="QSA", language="it", intent="factual",
                        session_id="s1", message=message, db=db)


def test_the_skill_stays_off_until_an_admin_turns_it_on():
    _install(_Responses(json_map={"/page/summary/": WIKI_SUMMARY}))
    try:
        out = handlers.web_lookup_sources(_ctx(_FakeDB(False), "di cosa parla Mindset?"), {})
        assert out.applicable is False
        assert "web_lookup_enabled" in out.reason
    finally:
        _restore()


def test_when_enabled_the_skill_returns_a_citable_block():
    _install(_Responses(json_map={"/page/summary/": WIKI_SUMMARY}))
    handlers._web_lookup_calls.clear()
    try:
        out = handlers.web_lookup_sources(_ctx(_FakeDB(True), 'di cosa parla "Mindset"?'), {})
        assert "[WEB_SOURCES]" in out.text
        assert out.slot == "knowledge"
        assert out.ids == ["https://it.wikipedia.org/wiki/Mindset"]
    finally:
        handlers._web_lookup_calls.clear()
        _restore()


def test_without_a_source_the_absence_is_declared_not_filled_from_memory():
    _install(_Responses())
    handlers._web_lookup_calls.clear()
    try:
        out = handlers.web_lookup_sources(_ctx(_FakeDB(True), "di cosa parla Qwertyuiop?"), {})
        assert "Nessuna fonte affidabile" in out.text
        assert "non rispondere a memoria" in out.text
    finally:
        handlers._web_lookup_calls.clear()
        _restore()


def test_a_session_cannot_consult_without_limit():
    _install(_Responses(json_map={"/page/summary/": WIKI_SUMMARY}))
    handlers._web_lookup_calls.clear()
    try:
        db = _FakeDB(True)
        for _ in range(handlers.WEB_LOOKUP_MAX_PER_SESSION):
            handlers.web_lookup_sources(_ctx(db, 'di cosa parla "Mindset"?'), {})
        out = handlers.web_lookup_sources(_ctx(db, 'di cosa parla "Mindset"?'), {})
        assert out.applicable is False
        assert "budget" in out.reason
    finally:
        handlers._web_lookup_calls.clear()
        _restore()


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok   {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
