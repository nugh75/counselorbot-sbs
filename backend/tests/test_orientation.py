"""Bussola: catalogo chiuso, sessioni private e nessuna scrittura su Taccuino o Libretto."""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import auth, database, models, orientation
from backend.ai_service import _requests_json_response
from backend.orientation import _clean_analysis, _tools_named_in, analyze_turn, fallback_analysis
from backend.routes import orientation as orientation_routes
from backend.routes.orientation import _merged_recommendations


_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_Session = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
for table in (
    models.ModelPreset.__table__,
    models.Counselor.__table__,
    models.QuestionnaireResult.__table__,
    models.LearnerProfileRevision.__table__,
    models.OrientationSession.__table__,
    models.StudentBooklet.__table__,
):
    table.create(bind=_engine, checkfirst=True)

_identity = {
    "username": "orientation.student",
    "email": "orientation.student@example.test",
    "groups": [],
    "is_admin": False,
    "is_researcher": False,
    "authenticated": True,
}


def _get_db():
    db = _Session()
    try:
        yield db
    finally:
        db.close()


def _get_identity():
    return dict(_identity)


class _FakeAIService:
    last_call = None
    # Risposta grezza da restituire al posto del JSON di default: serve a coprire
    # il ramo "testo libero", quello che scatta quando il JSON non e' forzato.
    override = None

    def __init__(self, db=None):
        self.config = {}
        self.disable_thinking = False
        self.reasoning_budget_override = None

    def get_response(self, *args, **kwargs):
        type(self).last_call = (args, kwargs)
        if type(self).override is not None:
            return type(self).override
        return """{
          "reply": "Hai descritto un obiettivo di studio concreto.",
          "recommendations": [
            {"id": "QSA", "reason": "Per osservare come organizzi lo studio."},
            {"id": "UNKNOWN", "reason": "Non appartiene al catalogo."},
            {"id": "IDEA", "reason": "Per mettere a fuoco il prossimo passo."}
          ],
          "notebook_draft": {
            "goal": "Voglio organizzare meglio il mio studio.",
            "private_fact": "Questo campo non deve passare."
          }
        }"""


orientation.AIService = _FakeAIService

app = FastAPI()
app.include_router(orientation_routes.router)
app.dependency_overrides[database.get_db] = _get_db
app.dependency_overrides[auth.get_current_user] = _get_identity
client = TestClient(app)


def _reset(username: str) -> None:
    db = _Session()
    try:
        db.query(models.OrientationSession).filter(models.OrientationSession.username == username).delete()
        db.query(models.LearnerProfileRevision).filter(models.LearnerProfileRevision.username == username).delete()
        db.query(models.QuestionnaireResult).filter(models.QuestionnaireResult.username == username).delete()
        db.query(models.StudentBooklet).filter(models.StudentBooklet.username == username).delete()
        db.commit()
    finally:
        db.close()


def test_fallback_is_localized_and_ranks_learning_intent():
    analysis = fallback_analysis("Voglio studiare con più concentrazione", "it")
    assert analysis.recommendations[0]["id"] == "QSA"
    assert "detailed exploration" not in analysis.recommendations[0]["reason"]


def test_disoriented_student_is_asked_about_the_area_instead_of_being_routed_to_idea():
    """Orientare chi non sa ancora che cosa cerca è compito della Bussola, non di IDEA."""
    analysis = fallback_analysis("Non so come muovermi, mi hanno detto di usare questa piattaforma", "it")
    assert analysis.recommendations == []
    assert "IDEA" not in analysis.reply
    assert analysis.informational is False
    assert "il modo in cui studi" in analysis.reply

    english = fallback_analysis("I have no clue how to move around here", "en")
    assert english.recommendations == []
    assert "the way you study" in english.reply


def test_platform_question_hands_the_catalog_to_the_model_instead_of_printing_it():
    """Il catalogo è materiale per il modello: la risposta resta di chi conosce il turno."""
    db = _Session()
    try:
        messages = (
            "Mi spieghi quali strumenti ci sono in CounselorBot?",
            "Mi spieghi quali cose si possono fare qui?",
            "Che cosa devo fare?",
            "cosa possso fare?",
            "non capisco cosa dovrei fare, ho aperto adesso il software",
        )
        prompts = []
        for message in messages:
            analysis = analyze_turn(db, message, "it")
            prompts.append(_FakeAIService.last_call[0][1])
            assert analysis.reply != orientation._PLATFORM_HELP["it"]
    finally:
        db.close()

    for prompt in prompts:
        assert "QSA e QSAr" in prompt
        assert "SAVICKAS" in prompt
        assert "pQBL" in prompt
        assert "Taccuino" in prompt
        assert "Never repeat a list or an explanation you already gave" in prompt


def test_the_catalog_is_not_reprinted_when_the_student_is_still_lost():
    """Seconda richiesta di aiuto: senza modello si chiede l'area, non si ripete la lista."""
    history = [
        {"role": "user", "content": "che cosa posso fare?"},
        {"role": "assistant", "content": orientation._PLATFORM_HELP["it"]},
    ]
    repeated = orientation._fallback_without_repetition(
        fallback_analysis("sono confuso non so da dove iniziare", "it"), history, "it"
    )
    assert repeated.reply != orientation._PLATFORM_HELP["it"]
    assert "il modo in cui studi" in repeated.reply

    first_time = orientation._fallback_without_repetition(
        fallback_analysis("sono confuso non so da dove iniziare", "it"), [], "it"
    )
    assert first_time.reply == orientation._PLATFORM_HELP["it"]


def test_tool_question_hands_the_canonical_description_to_the_model():
    db = _Session()
    try:
        prompts = {}
        for label, message, language in (
            ("QSA", "Che cosa è il QSA?", "it"),
            ("QSAr", "cos'è il QSAr?", "it"),
            ("IDEA", "Come funziona IDEA?", "it"),
            ("ZTPI", "What is ZTPI?", "en"),
        ):
            analyze_turn(db, message, language)
            prompts[label] = _FakeAIService.last_call[0][1]
        analyze_turn(db, "Voglio provare il QSA", "it")
        intent_prompt = _FakeAIService.last_call[0][1]
    finally:
        db.close()

    assert "strategie di studio" in prompts["QSA"]
    assert "versione breve" in prompts["QSAr"]
    assert "mappa" in prompts["IDEA"]
    assert "questionnaire about your relationship with past" in prompts["ZTPI"]
    # Nessun punto interrogativo: resta una richiesta di orientamento, non una domanda.
    assert "Canonical description" not in intent_prompt

    # Il fallback locale conserva la spiegazione completa per quando il modello cade.
    assert fallback_analysis("Che cosa è il QSA?", "it").informational is True
    assert fallback_analysis("Voglio provare il QSA", "it").informational is False


def test_asking_about_a_tool_also_proposes_it():
    """La risposta chiude con "se vuoi iniziare, dimmelo": la scheda deve esserci.

    Il turno resta informativo — non e' una diagnosi — ma senza raccomandazione
    chiedere del QSA non lo faceva comparire fra gli strumenti proposti.
    """
    analysis = fallback_analysis("Che cosa e' il QSA?", "it")
    assert analysis.informational is True
    assert [row["id"] for row in analysis.recommendations] == ["QSA"]

    # La panoramica di piattaforma non e' una richiesta su uno strumento: nessuna scheda.
    assert fallback_analysis("Cosa posso fare?", "it").recommendations == []


def test_tools_are_read_out_of_the_reply_as_whole_words():
    assert _tools_named_in("Partirei dal QSA, poi eventualmente SAVICKAS.") == ["QSA", "SAVICKAS"]
    # QSAr non e' QSA: il confine di parola li tiene distinti.
    assert _tools_named_in("Se hai poco tempo c'e' il QSAr.") == ["QSAr"]
    # "idea" minuscolo e' una parola italiana comune, e IDEA e' invite-only.
    assert _tools_named_in("Hai gia' un'idea concreta in testa?") == []
    assert _tools_named_in("Carica un PDF e usiamo pQBL.") == ["pqbl"]


def test_a_prose_reply_drives_the_panel_from_what_it_named():
    """Ramo testo libero: senza questo, un refuso dello studente svuotava il turno.

    Il classificatore locale guarda le parole dello studente, e su "Qss" non
    trova nulla; il modello invece aveva appena scritto "QSA" nella risposta.
    """
    db = _Session()
    try:
        _FakeAIService.override = "Presumo QSA. Lo compili sul sito e poi ne parliamo qui."
        analysis = analyze_turn(db, "Qss", "it")
    finally:
        _FakeAIService.override = None
        db.close()

    assert [row["id"] for row in analysis.recommendations] == ["QSA"]


def test_the_panel_summarises_the_session_not_the_last_turn():
    previous = [{"id": "SAVICKAS", "reason": "prima"}, {"id": "pqbl", "reason": "prima"}]

    # Le nuove entrano in testa, le vecchie scalano.
    merged = _merged_recommendations(previous, [{"id": "QSA", "reason": "adesso"}])
    assert [row["id"] for row in merged] == ["QSA", "SAVICKAS", "pqbl"]

    # Nessuna proposta: il turno non tocca il pannello.
    assert _merged_recommendations(previous, []) == previous

    # Uno strumento gia' presente risale invece di duplicarsi, e il tetto resta tre.
    merged = _merged_recommendations(merged, [{"id": "pqbl", "reason": "adesso"}])
    assert [row["id"] for row in merged] == ["pqbl", "QSA", "SAVICKAS"]
    assert merged[0]["reason"] == "adesso"


def test_prompt_says_what_an_already_completed_questionnaire_unlocks():
    db = _Session()
    try:
        analyze_turn(db, "Ho gia' compilato il QSA", "it")
        prompt = _FakeAIService.last_call[0][1]
    finally:
        db.close()

    # Avere i risultati apre la chat guidata: non e' un motivo per cambiare strumento.
    assert "already filled in one of the six questionnaires is not finished with it" in prompt
    assert "Never ask the student to type or paste scores into this conversation" in prompt
    # E le raccomandazioni sono schede, non prosa.
    assert "clickable cards under this conversation" in prompt


def test_prompt_carries_the_questionnaire_address_only_where_it_applies():
    """La Bussola raccomanda uno strumento: deve anche dire dove si compila.

    In italiano i sei questionari si fanno su competenzestrategiche.it, quindi il
    prompt porta gli indirizzi esatti e le credenziali del sito; nelle altre cinque
    lingue si compilano in app, quindi non deve comparire nessun indirizzo. La
    regola finale vieta di inventare link, per cui senza questo blocco il modello
    non poteva darne nessuno.
    """
    db = _Session()
    try:
        analyze_turn(db, "Voglio capire come studio", "it")
        italian = _FakeAIService.last_call[0][1]
        analyze_turn(db, "I want to understand how I study", "en")
        english = _FakeAIService.last_call[0][1]
    finally:
        db.close()

    assert "https://www.competenzestrategiche.it/QSA/" in italian
    assert "https://www.competenzestrategiche.it/QAP/" in italian
    assert "1087" in italian and "counselor" in italian
    assert "copied verbatim" in italian

    assert "competenzestrategiche.it/QSA/" not in english
    assert "1087" not in english
    assert "inside CounselorBot" in english


def test_orientation_uses_the_selected_counselor_without_forced_json():
    db = _Session()
    try:
        preset = models.ModelPreset(
            name="Orientation test",
            provider="ollama",
            model="test-model",
            disable_thinking=True,
            reasoning_budget=321,
        )
        db.add(preset)
        db.flush()
        counselor = models.Counselor(
            slug="orientation-test",
            name="Ada",
            persona="Speak with calm precision.",
            preset_id=preset.id,
            language=["*"],
            is_active=True,
        )
        db.add(counselor)
        db.commit()
        db.refresh(counselor)

        _FakeAIService.last_call = None
        analyze_turn(db, "Voglio organizzare meglio lo studio", "it", counselor_id=counselor.id)
        args, kwargs = _FakeAIService.last_call
    finally:
        db.close()

    assert "Return ONLY JSON" in args[1]
    assert "four to six sentences" in args[1]
    assert "formulaic empathy" in args[1]
    assert "Speak with calm precision." in args[1]
    assert kwargs["provider"] == "ollama"
    assert kwargs["model"] == "test-model"
    assert kwargs["json_mode"] is False


def test_plain_text_reply_is_kept_and_uses_local_ranking():
    class _PlainService(_FakeAIService):
        def get_response(self, *args, **kwargs):
            type(self).last_call = (args, kwargs)
            return "Il QSA osserva come studi e ti restituisce un profilo utile per capire da dove partire."

    orientation.AIService = _PlainService
    db = _Session()
    try:
        analysis = analyze_turn(db, "Voglio organizzare meglio lo studio", "it")
        args, kwargs = _PlainService.last_call
    finally:
        orientation.AIService = _FakeAIService
        db.close()

    assert analysis.reply.startswith("Il QSA osserva come studi")
    assert [row["id"] for row in analysis.recommendations] == ["QSA"]
    assert kwargs["model"] == "qwen3.8:latest"
    assert kwargs["json_mode"] is False


def test_model_output_is_filtered_through_closed_contract():
    fallback = fallback_analysis("una scelta per il mio futuro", "it")
    cleaned = _clean_analysis(
        {
            "reply": "Riflessione",
            "recommendations": [
                {"id": "QAP", "reason": "Scelte future"},
                {"id": "QAP", "reason": "Duplicato"},
                {"id": "NOT_REAL", "reason": "Fuori catalogo"},
                {"id": "IDEA", "reason": "Mettere a fuoco"},
            ],
            "notebook_draft": {"goal": "Scegliere", "diagnosis": "vietata"},
        },
        fallback,
    )
    assert [row["id"] for row in cleaned.recommendations] == ["QAP", "IDEA"]
    # La Bussola consiglia soltanto: nessun campo del Taccuino esce dall'analisi.
    assert not hasattr(cleaned, "notebook_draft")


def test_new_student_stays_gated_until_one_orientation_is_completed():
    username = "orientation.new"
    _identity["username"] = username
    _reset(username)

    initial = client.get("/orientation/status").json()
    assert initial["eligible"] is True
    assert initial["required"] is True
    assert initial["completed"] is False

    started = client.post("/orientation/sessions", json={"language": "it"}).json()
    pending = client.get("/orientation/status").json()
    assert pending["required"] is True
    assert pending["in_progress_session_id"] == started["session_id"]

    client.post(
        f"/orientation/sessions/{started['session_id']}/message",
        json={"message": "Voglio organizzare meglio lo studio", "language": "it"},
    )
    assert client.get("/orientation/status").json()["required"] is True


def test_first_orientation_completes_without_touching_the_notebook():
    username = "orientation.student"
    _identity["username"] = username
    _reset(username)

    db = _Session()
    try:
        db.add(models.LearnerProfileRevision(
            username=username,
            data={"context": "Frequento il quarto anno."},
            source="manual",
        ))
        db.commit()
    finally:
        db.close()

    # Un utente con attività preesistente è esente dalla prima Bussola, ma può
    # comunque aprirla volontariamente.
    status = client.get("/orientation/status")
    assert status.status_code == 200
    assert status.json()["legacy_exempt"] is True
    assert status.json()["required"] is False

    started = client.post("/orientation/sessions", json={"language": "it"})
    assert started.status_code == 200
    session_id = started.json()["session_id"]
    assert started.json()["messages"][0]["role"] == "assistant"
    assert client.get("/orientation/status").json()["required"] is False

    turn = client.post(
        f"/orientation/sessions/{session_id}/message",
        json={"message": "Voglio organizzare meglio lo studio", "language": "it"},
    )
    assert turn.status_code == 200
    assert [row["id"] for row in turn.json()["recommendations"]] == ["QSA", "IDEA"]
    assert "notebook_draft" not in turn.json()

    help_turn = client.post(
        f"/orientation/sessions/{session_id}/message",
        json={"message": "Mi spieghi quali strumenti ci sono in CounselorBot?", "language": "it"},
    )
    assert help_turn.status_code == 200
    assert help_turn.json()["messages"][-1]["content"] != orientation._PLATFORM_HELP["it"]
    assert [row["id"] for row in help_turn.json()["recommendations"]] == ["QSA", "IDEA"]

    # L'endpoint di revisione del Taccuino non esiste più: la Bussola consiglia e basta.
    assert client.post(
        f"/orientation/sessions/{session_id}/notebook-review",
        json={"data": {"goal": "Organizzare lo studio."}},
    ).status_code == 404

    completed = client.post(f"/orientation/sessions/{session_id}/complete")
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"

    status = client.get("/orientation/status").json()
    assert status["completed"] is True
    assert status["required"] is False

    # Nessuna revisione scritta dalla Bussola: resta solo quella dello studente.
    db = _Session()
    try:
        revisions = (
            db.query(models.LearnerProfileRevision)
            .filter(models.LearnerProfileRevision.username == username)
            .all()
        )
        assert [row.source for row in revisions] == ["manual"]
    finally:
        db.close()

    reopened = client.get(f"/orientation/sessions/{session_id}")
    assert reopened.status_code == 200
    assert reopened.json()["messages"] == completed.json()["messages"]

    new_session = client.post(
        "/orientation/sessions",
        json={"language": "it", "new_session": True},
    )
    assert new_session.status_code == 200
    assert new_session.json()["session_id"] != session_id
    assert client.get("/orientation/status").json()["required"] is False


def test_session_keeps_the_counselor_chosen_before_the_conversation():
    username = "orientation.with-counselor"
    _identity["username"] = username
    _reset(username)
    db = _Session()
    try:
        counselor = models.Counselor(
            slug="session-counselor",
            name="Clio",
            language=["*"],
            is_active=True,
        )
        db.add(counselor)
        db.commit()
        db.refresh(counselor)
        counselor_id = counselor.id
    finally:
        db.close()

    started = client.post(
        "/orientation/sessions",
        json={"language": "it", "new_session": True, "counselor_id": counselor_id},
    )
    assert started.status_code == 200
    assert started.json()["counselor_id"] == counselor_id
    assert "Clio" in started.json()["messages"][0]["content"]


def test_existing_session_adopts_the_counselor_without_losing_history():
    username = "orientation.adopt-counselor"
    _identity["username"] = username
    _reset(username)

    # Sessione aperta prima della scelta (vecchio flusso), con un turno già scritto.
    started = client.post("/orientation/sessions", json={"language": "it"})
    assert started.status_code == 200
    assert started.json()["counselor_id"] is None
    session_id = started.json()["session_id"]
    client.post(
        f"/orientation/sessions/{session_id}/message",
        json={"message": "Voglio organizzare meglio lo studio", "language": "it"},
    )

    db = _Session()
    try:
        counselor = models.Counselor(
            slug="adopt-counselor",
            name="Giulio",
            language=["*"],
            is_active=True,
        )
        db.add(counselor)
        db.commit()
        db.refresh(counselor)
        counselor_id = counselor.id
    finally:
        db.close()

    resumed = client.post(
        "/orientation/sessions",
        json={"language": "it", "new_session": False, "counselor_id": counselor_id},
    )
    assert resumed.status_code == 200
    assert resumed.json()["session_id"] == session_id
    assert resumed.json()["counselor_id"] == counselor_id
    messages = resumed.json()["messages"]
    assert "Giulio" in messages[0]["content"]
    assert any(row["content"] == "Voglio organizzare meglio lo studio" for row in messages)

    _FakeAIService.last_call = None
    turn = client.post(
        f"/orientation/sessions/{session_id}/message",
        json={"message": "Vorrei concentrarmi di più", "language": "it"},
    )
    assert turn.status_code == 200
    assert turn.json()["counselor_id"] == counselor_id
    assert _FakeAIService.last_call is not None


def test_orientation_sessions_are_private():
    owner = "orientation.owner"
    intruder = "orientation.intruder"
    _identity["username"] = owner
    _reset(owner)
    _reset(intruder)
    session_id = client.post(
        "/orientation/sessions",
        json={"language": "it", "new_session": True},
    ).json()["session_id"]

    _identity["username"] = intruder
    assert client.get(f"/orientation/sessions/{session_id}").status_code == 404
    assert client.post(
        f"/orientation/sessions/{session_id}/message",
        json={"message": "Provo ad accedere", "language": "it"},
    ).status_code == 404
