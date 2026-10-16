"""Privacy policy for embeddings (block 4): what may reach an external provider.

Each test proves one guarantee listed in docs/operations/embedding-providers.md.
Fake SDK clients only: real HTTP transport fails the test.
"""

import asyncio
from unittest.mock import Mock

import httpx
import pytest

from backend import embedding_service as embeddings, models, pii_ner, rag_index as rag
from backend.ai_service import AIError
from backend.chat_preparation import _retrieval_queries
from backend.memory_embeddings import MemoryEmbedder
from backend.memory_service import session_memory
from backend.tests.test_embedding_provider import db, fake_client, service  # noqa: F401
from backend.tests.test_rag_embedding_degradation import _Corpus, _index

EXTERNAL = ["mistral", "openrouter"]
STUDENT_TEXT = "Sono Mario Rossi, mario.rossi@example.com, C1 4/9 e A2r 3,5/9, 75%"


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    monkeypatch.setattr(httpx.Client, "send", Mock(side_effect=AssertionError("real HTTP")))
    monkeypatch.setattr(rag, "_embedding_cooldown", rag._EmbeddingCooldown(300))
    monkeypatch.setattr(embeddings, "_ner_failures", {})


def external(db, monkeypatch, provider, **config):  # noqa: F811
    monkeypatch.setenv(f"API_KEY_{provider.upper()}", "fake-system")
    client, constructor, calls = fake_client(monkeypatch, provider)
    config.setdefault("pii_ner_enabled", "false")
    return service(db, provider, **config), constructor, calls


def sent_texts(calls):
    return [text for call in calls for text in call.get("inputs", call.get("input"))]


# --- Memories and episodes never reach an external client --------------------

@pytest.mark.parametrize("provider", EXTERNAL)
def test_memories_and_episodes_never_reach_external_client(db, monkeypatch, tmp_path, provider):  # noqa: F811
    ai, constructor, _ = external(db, monkeypatch, provider)
    episodes = ["Mario ha parlato di ansia da esame", "Obiettivo: pianificare lo studio"]

    # Episode retrieval falls back to keyword overlap, without any client.
    assert session_memory._retrieve_episodes(episodes, "pianificare studio", 1, ai) == [episodes[1]]
    assert MemoryEmbedder(tmp_path / "m.npz").rank(ai, "ansia", episodes, 1) is None

    # Defence in depth: even if a caller mislabels the provider as local, the
    # single exit point refuses private text for the configured external provider.
    ai.embedding_provider = "ollama"
    assert MemoryEmbedder(tmp_path / "m2.npz").rank(ai, "ansia", episodes, 1) is None
    with pytest.raises(AIError) as exc:
        ai.embed_texts(episodes, purpose="private", public_corpus=True)
    assert exc.value.code == "embedding_privacy_blocked"
    constructor.assert_not_called()
    assert db.query(models.Log).count() == 0


# --- External queries are anonymized and carry no scores ---------------------

def test_chat_query_for_external_embedding_omits_scores_context():
    scores = "PROFILO QSA DELLO STUDENTE:\n- C1 (Autoefficacia): 4/9"
    query, vector_query = _retrieval_queries(
        "Strategie cognitive", "come studio meglio?", scores, "coda risposta", external_embedding=True)
    assert "4/9" in query and "PROFILO" in query  # BM25/local query keeps the profile in-process
    assert vector_query == "Strategie cognitive come studio meglio? coda risposta"
    assert _retrieval_queries("Step", "msg", scores, "", external_embedding=False) == (
        f"Step msg {scores}", None)


@pytest.mark.parametrize("provider", EXTERNAL)
def test_external_query_is_anonymized_and_score_free(db, monkeypatch, tmp_path, provider):  # noqa: F811
    ai, constructor, calls = external(db, monkeypatch, provider, pii_ner_enabled="true")
    monkeypatch.setattr(pii_ner, "_ner_entities", lambda text, base, model: [
        ("nome", "Mario Rossi")] if "Mario Rossi" in text else [])
    index = _index(tmp_path, _Corpus())
    index.public_corpus = True

    assert index.search(ai, "Testo " + STUDENT_TEXT, vector_query=STUDENT_TEXT)
    assert len(calls) == 2  # public documents, then the query
    sent = sent_texts([calls[1]])
    assert len(sent) == 1
    for leaked in ("Mario Rossi", "mario.rossi@example.com", "4/9", "3,5/9", "75%"):
        assert leaked not in sent[0]
    assert "[[PII:NOME:1]]" in sent[0] and "[[PII:EMAIL:1]]" in sent[0]
    assert "C1" in sent[0] and "A2r" in sent[0]  # factor names stay useful for retrieval
    # Accounting never stores the text.
    assert all("Mario" not in str(row.details) for row in db.query(models.Log))


def test_filter_strips_score_figures_and_caps_length():
    config = {"pii_ner_enabled": "false"}
    out = embeddings.filter_external_query(
        config, ["Profilo C1 4 / 9, T3 2.5/5, data 12/05/2001, 80 %" + " parola" * 2000])
    assert not any(figure in out[0] for figure in ("4 / 9", "2.5/5", "12/05", "/2001", "80 %"))
    assert out[0].startswith("Profilo C1 , T3 , data [[PII:DATA:1]], parola")
    assert len(out[0].encode("utf-8")) <= embeddings.EXTERNAL_QUERY_MAX_BYTES
    with pytest.raises(embeddings.EmbeddingError) as exc:
        embeddings.filter_external_query(config, ["4/9 75%"])
    assert exc.value.code == "embedding_query_empty"


@pytest.mark.parametrize("text", [
    "C1 4 su 9", "C1 punteggio: 4", "C1 percentile 75", "C1 75° percentile", "C1 voto 8",
    "C1 4 out of 9", "C1 score: 4", "C1 75th percentile", "C1 4 points",
    "C1 4 de 9", "C1 puntuación: 7", "C1 percentil 75",
    "C1 4 sur 9", "C1 80e centile",
    "C1 4 von 9", "C1 Punktzahl: 4", "C1 Perzentil 75", "C1 4 Punkte",
    "C1 4 av 9", "C1 poäng 7", "C1 percentil 75",
    "C1 punteggio 4/9", "C1 stanine 4",
])
def test_filter_strips_written_score_notations_in_the_interface_languages(text):
    assert embeddings.filter_external_query({"pii_ner_enabled": "false"}, [text]) == ["C1"]


def test_filter_keeps_ordinary_numbers_useful_for_retrieval():
    text = "Studio 3 ore al giorno, capitolo 2 e 3, C1 A2r"
    assert embeddings.filter_external_query({"pii_ner_enabled": "false"}, [text]) == [text]


@pytest.mark.parametrize("provider", EXTERNAL)
def test_external_query_anonymized_even_when_chat_redaction_is_off(db, monkeypatch, provider):  # noqa: F811
    ai, _, calls = external(db, monkeypatch, provider, external_pii_redact="false")
    ai.embed_query("scrivimi a mario.rossi@example.com", public_corpus=True)
    assert "mario.rossi@example.com" not in sent_texts(calls)[0]


@pytest.mark.parametrize("provider", EXTERNAL)
def test_ner_down_with_block_policy_keeps_query_local_without_cooldown(db, monkeypatch, tmp_path, provider):  # noqa: F811
    ai, _, calls = external(db, monkeypatch, provider, pii_ner_enabled="true")

    def ner_down(*args):
        raise httpx.ConnectError("detector down")

    monkeypatch.setattr(pii_ner, "_ner_entities", ner_down)
    with pytest.raises(AIError) as exc:
        ai.embed_query("Mario Rossi", public_corpus=True)
    assert exc.value.code == "embedding_privacy_blocked" and calls == []

    index = _index(tmp_path, _Corpus())
    index.public_corpus = True
    assert index.search(ai, "Testo Mario Rossi")  # BM25 answers
    documents_only = len(calls)
    assert documents_only == 1 and "Mario" not in str(sent_texts(calls))
    # The provider is healthy: no provider cooldown. Once the short NER retry
    # interval has passed, later queries embed again.
    monkeypatch.setattr(pii_ner, "_ner_entities", lambda *args: [])
    now = embeddings._clock()
    monkeypatch.setattr(embeddings, "_clock", lambda: now + embeddings.NER_RETRY_SECONDS)
    assert index.search(ai, "Testo Mario Rossi")
    assert len(calls) == documents_only + 1


@pytest.mark.parametrize("fallback,sent", [("block", []), ("send_raw", ["mail [[PII:EMAIL:1]]"])])
def test_failed_ner_is_not_retried_during_its_cooldown(db, monkeypatch, fallback, sent):  # noqa: F811
    ai, _, calls = external(db, monkeypatch, "mistral", pii_ner_enabled="true",
                            external_pii_fallback=fallback)
    now = [1000.0]
    monkeypatch.setattr(embeddings, "_clock", lambda: now[0])
    ner = Mock(side_effect=httpx.ConnectError("down"))
    monkeypatch.setattr(pii_ner, "_ner_entities", ner)
    for _ in range(3):
        try:
            ai.embed_query("mail mario.rossi@example.com", public_corpus=True)
        except AIError as exc:
            assert exc.code == "embedding_privacy_blocked"
    # One detector timeout per cooldown; the policy stays fail-closed meanwhile.
    assert ner.call_count == 1 and sent_texts(calls) == sent * 3
    assert embeddings.ner_status(ai.config) == "unreachable"
    now[0] += embeddings.NER_RETRY_SECONDS
    ner.side_effect, ner.return_value = None, []
    ai.embed_query("mail mario.rossi@example.com", public_corpus=True)
    assert ner.call_count == 2 and embeddings.ner_status(ai.config) == "unknown"
    assert sent_texts(calls)[-1] == "mail [[PII:EMAIL:1]]"


@pytest.mark.parametrize("provider", EXTERNAL)
def test_ner_down_with_send_raw_still_applies_deterministic_filter(db, monkeypatch, provider):  # noqa: F811
    ai, _, calls = external(db, monkeypatch, provider, pii_ner_enabled="true",
                            external_pii_fallback="send_raw")
    monkeypatch.setattr(pii_ner, "_ner_entities", Mock(side_effect=httpx.ConnectError("down")))
    ai.embed_query("mail mario.rossi@example.com 4/9", public_corpus=True)
    assert sent_texts(calls) == ["mail [[PII:EMAIL:1]]"]


@pytest.mark.parametrize("provider", EXTERNAL)
def test_queries_and_documents_require_a_public_corpus(db, monkeypatch, provider):  # noqa: F811
    ai, constructor, _ = external(db, monkeypatch, provider)
    for call in (lambda: ai.embed_query("domanda"), lambda: ai.embed_texts(["documento interno"])):
        with pytest.raises(AIError) as exc:
            call()
        assert exc.value.code == "embedding_privacy_blocked"
    constructor.assert_not_called()


# --- Dynamic collections are not publishable by default ----------------------

@pytest.fixture
def dynamic_root(monkeypatch, tmp_path):
    root = tmp_path / "collections"
    monkeypatch.setattr(rag, "DYNAMIC_ROOT", str(root))
    monkeypatch.setattr(rag, "INDEX_DIR", str(tmp_path / "index"))
    monkeypatch.setattr(rag, "_dynamic_indexes", {})
    return root


@pytest.mark.parametrize("provider", EXTERNAL)
def test_dynamic_collection_is_bm25_only_until_flagged(db, monkeypatch, dynamic_root, provider):  # noqa: F811
    from backend.routes.rag_docs import RagCollectionUpdate, rag_update_collection

    ai, constructor, calls = external(db, monkeypatch, provider)
    created = rag.create_dynamic_collection("interni", "Materiali interni")
    assert created["api_publishable"] is False
    (dynamic_root / "interni" / "verbale.md").write_text("# Verbale\n\nTesto riservato del consiglio.")
    index = rag.get_dynamic_index("interni")

    assert index.search(ai, "consiglio riservato")  # BM25 result
    constructor.assert_not_called()
    assert index.matrix is None
    assert next(c for c in rag.list_collections() if c["id"] == "interni")["api_publishable"] is False

    # Admin opt-in (same cached index object: the flag is read from disk at each use).
    flagged = asyncio.run(rag_update_collection(
        "interni", RagCollectionUpdate(api_publishable=True), current_user={"is_admin": True}))
    assert flagged["api_publishable"] is True
    # This contract tests publication consent and query filtering. Complete the
    # worker synchronously; threaded/session isolation is tested separately.
    index.build(ai)
    assert index.search(ai, "consiglio riservato")
    assert len(calls) == 2  # documents, then the filtered query
    assert index.matrix is not None

    # Opt-out: existing external vectors stay unused and nothing else is sent.
    asyncio.run(rag_update_collection(
        "interni", RagCollectionUpdate(api_publishable=False), current_user={"is_admin": True}))
    assert index.search(ai, "consiglio riservato", retrieval_mode="vector")
    assert len(calls) == 2


def test_builtin_collections_cannot_change_publishability(dynamic_root):
    from fastapi import HTTPException
    from backend.routes.rag_docs import RagCollectionUpdate, rag_update_collection

    with pytest.raises(HTTPException) as exc:
        asyncio.run(rag_update_collection(
            rag.COLLECTION_COMPETENZE, RagCollectionUpdate(api_publishable=False),
            current_user={"is_admin": True}))
    assert exc.value.status_code == 400
    assert all(c["api_publishable"] for c in rag.list_collections() if c["builtin"])


# --- OpenRouter zero-retention routing ---------------------------------------

@pytest.mark.parametrize("provider", EXTERNAL)
def test_openrouter_requests_providers_without_data_retention(db, monkeypatch, provider):  # noqa: F811
    ai, _, calls = external(db, monkeypatch, provider)
    ai.embed_texts(["corpus pubblico"], public_corpus=True)
    ai.embed_query("domanda", public_corpus=True)
    for call in calls:
        if provider == "openrouter":
            assert call["extra_body"] == {"provider": {"data_collection": "deny", "zdr": True}}
        else:
            assert "extra_body" not in call
