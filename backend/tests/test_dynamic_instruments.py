"""Test per C1: Schema DB, Dynamic Instrument Registry e supporto runtime per percorsi e chat guidate create dinamicamente."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import auth, database, models, schemas
from backend.ai_service import AIService
from backend.api_models import ChatRequest, MemoryEventRequest
from backend.chat_logic import _ensure_questionnaire_guided_steps
from backend.chat_preparation import prepare_chat_turn
from backend.dynamic_registry import (
    DynamicInstrumentSet,
    HISTORIC_INSTRUMENT_CODES,
    get_registered_instrument_codes,
    invalidate_instrument_cache,
    is_registered_instrument,
)
from backend.prompt_map import build_prompt_map, ordered_instruments
from backend.routes import admin, memory, survey
from backend.schemas import FROZEN_SESSION_TYPES, FrozenSessionCreate, FrozenSessionMessage


@pytest.fixture
def db_session():
    """In-memory SQLite isolato con schema completo."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    database.Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    from backend.dynamic_registry import set_session_factory
    set_session_factory(session_factory)
    with session_factory() as db:
        yield db
    set_session_factory(None)
    engine.dispose()


@pytest.fixture
def client_env(db_session):
    """Client API con router admin, survey e memory."""
    app = FastAPI()
    app.include_router(admin.router)
    app.include_router(survey.router)
    app.include_router(memory.router)

    current_identity = {
        "username": "studente.test",
        "groups": ["studenti"],
        "authenticated": True,
        "is_admin": False,
        "is_researcher": False,
    }

    def override_db():
        yield db_session

    app.dependency_overrides[database.get_db] = override_db
    app.dependency_overrides[database.get_personal_ai_db] = override_db
    app.dependency_overrides[auth.get_identity] = lambda: dict(current_identity)
    app.dependency_overrides[auth.get_identity_view_as] = lambda: dict(current_identity)

    with TestClient(app) as client:
        yield client, db_session, current_identity


def test_dynamic_instrument_crud_and_metadata(client_env):
    """Creazione/aggiornamento di uno strumento dinamico con metadati e bozza/attivo."""
    client, db, identity = client_env
    invalidate_instrument_cache()

    # Creazione via admin (diventiamo admin)
    identity["is_admin"] = True
    payload = {
        "code": "ORIENTA_TEST",
        "name_it": "Percorso Orientamento",
        "name_en": "Orientation Path",
        "is_active": False,
        "tool_category": "guided",
        "target_audience": "student",
        "icon": "compass",
        "color_theme": "purple",
        "interview_mode": "interactive",
        "description_i18n": {"it": "Percorso guidato di orientamento", "en": "Guided orientation path"},
    }
    r = client.post("/admin/instruments", json=payload)
    assert r.status_code == 200, r.text
    created = r.json()
    assert created["code"] == "ORIENTA_TEST"
    assert created["is_active"] is False
    assert created["tool_category"] == "guided"
    assert created["color_theme"] == "purple"

    # Studente (non-admin): la bozza NON deve essere visibile in /instruments
    identity["is_admin"] = False
    r_student = client.get("/instruments")
    assert r_student.status_code == 200
    student_codes = [x["code"] for x in r_student.json()]
    assert "ORIENTA_TEST" not in student_codes

    # Admin: la bozza DEVE essere visibile in /instruments con tutti i metadati
    identity["is_admin"] = True
    r_admin = client.get("/instruments")
    assert r_admin.status_code == 200
    admin_instruments = {x["code"]: x for x in r_admin.json()}
    assert "ORIENTA_TEST" in admin_instruments
    inst_data = admin_instruments["ORIENTA_TEST"]
    assert inst_data["is_active"] is False
    assert inst_data["tool_category"] == "guided"
    assert inst_data["icon"] == "compass"
    assert inst_data["color_theme"] == "purple"
    assert inst_data["interview_mode"] == "interactive"
    assert inst_data["description_i18n"]["it"] == "Percorso guidato di orientamento"

    # Aggiornamento: pubblicazione attiva (is_active=True)
    r_up = client.put("/admin/instruments/ORIENTA_TEST", json={"is_active": True, "color_theme": "emerald"})
    assert r_up.status_code == 200
    updated = r_up.json()
    assert updated["is_active"] is True
    assert updated["color_theme"] == "emerald"

    # Ora lo studente lo vede
    identity["is_admin"] = False
    r_student_after = client.get("/instruments")
    student_codes_after = [x["code"] for x in r_student_after.json()]
    assert "ORIENTA_TEST" in student_codes_after


def test_dynamic_frozen_session_validation(db_session):
    """Validazione dinamica di sessioni congelate (frozen session) per strumenti dinamici."""
    db_session.add(models.Instrument(
        code="DYN_FROZEN",
        name_it="Test Frozen",
        is_active=True,
        tool_category="guided",
    ))
    db_session.commit()
    invalidate_instrument_cache()

    # Strumento registrato a DB: validazione FrozenSessionCreate ha successo
    session_payload = FrozenSessionCreate(
        session_id="sess-frozen-1",
        questionnaire_type="DYN_FROZEN",
        messages=[FrozenSessionMessage(role="user", content="Ciao")],
    )
    assert session_payload.questionnaire_type == "DYN_FROZEN"

    # Strumenti storici: sempre supportati
    for code in ("QSA", "QSAr", "ZTPI", "SAVICKAS", "IDEA", "EVENTO_STUDIO"):
        fs = FrozenSessionCreate(session_id=f"sess-{code}", questionnaire_type=code, messages=[])
        assert fs.questionnaire_type == code

    # Strumento inesistente: fallisce con errore di validazione
    with pytest.raises(Exception) as exc_info:
        FrozenSessionCreate(
            session_id="sess-bad",
            questionnaire_type="NON_EXISTENT_TOOL_XYZ",
            messages=[],
        )
    assert "unsupported questionnaire_type" in str(exc_info.value).lower()


def test_dynamic_session_memory_event(client_env):
    """Validazione dinamica della session memory per strumenti dinamici."""
    client, db, _ = client_env
    db.add(models.Instrument(
        code="DYN_MEM",
        name_it="Test Memoria",
        is_active=True,
    ))
    db.commit()
    invalidate_instrument_cache()

    # Invio evento di memoria con strumento dinamico valido
    r = client.post("/memory/event", json={
        "session_id": "sess-mem-1",
        "questionnaire_type": "DYN_MEM",
        "phase": "intro",
        "step_label": "Introduzione",
        "completed_step": False,
        "user_message": "Sto riflettendo sulle mie competenze",
    })
    assert r.status_code == 200
    assert r.json() == {"status": "recorded"}

    # Strumento storico valido
    r_hist = client.post("/memory/event", json={
        "session_id": "sess-mem-2",
        "questionnaire_type": "QSA",
        "phase": "qsa-c1",
    })
    assert r_hist.status_code == 200

    # Strumento sconosciuto non registrato
    r_bad = client.post("/memory/event", json={
        "session_id": "sess-mem-3",
        "questionnaire_type": "UNKNOWN_XYZ",
        "phase": "intro",
    })
    assert r_bad.status_code == 400
    assert "unsupported questionnaire_type" in r_bad.text.lower()


def test_dynamic_instrument_prompt_map(client_env):
    """Mappa dei prompt per strumento dinamico e presenza in ordered_instruments."""
    client, db, identity = client_env
    identity["is_admin"] = True

    # 1. Strumento dinamico con 0 step: deve comparire in ordered_instruments
    db.add(models.Instrument(code="EMPTY_DYN", name_it="Vuoto", is_active=True))
    db.commit()
    invalidate_instrument_cache()

    inst_list = ordered_instruments(db)
    codes_in_list = {x["id"] for x in inst_list}
    assert "EMPTY_DYN" in codes_in_list

    # 2. Strumento dinamico con 2 step
    db.add(models.Instrument(code="DYN_STEPS", name_it="Con Step", is_active=True))
    db.add(models.GuidedStep(
        id="ds-step1",
        questionnaire_type="DYN_STEPS",
        sort_order=1,
        label="Accoglienza",
        prompt="Presenta il percorso...",
        system_prompt_mode="generic",
        color_theme="blue",
    ))
    db.add(models.GuidedStep(
        id="ds-step2",
        questionnaire_type="DYN_STEPS",
        sort_order=2,
        label="Esplorazione",
        prompt="Fai domande sui progetti...",
        system_prompt_mode="dyn-explore",
        color_theme="purple",
    ))
    db.commit()

    prompt_map = build_prompt_map(db, "DYN_STEPS")
    assert prompt_map is not None
    assert prompt_map["instrument"] == "DYN_STEPS"
    steps = [s for s in prompt_map["levels"]["steps"] if not s.get("fixed")]
    assert len(steps) == 2
    assert steps[0]["id"] == "ds-step1"
    assert steps[1]["id"] == "ds-step2"

    # Verifica etichette convenzionali generate per chiavi non hardcoded
    inst_entries = prompt_map["levels"]["instrument"]
    meta_entries = [e for e in inst_entries if e["role"] == "meta"]
    assert len(meta_entries) >= 1
    assert "DYN_STEPS" in meta_entries[0]["label"]

    # Endpoint admin prompt-map per strumento dinamico
    r_map = client.get("/admin/prompt-map?instrument=DYN_STEPS")
    assert r_map.status_code == 200
    data = r_map.json()
    assert data["instrument"] == "DYN_STEPS"


def test_dynamic_instrument_chat_preparation(db_session):
    """Esecuzione di preparazione turno chat per strumento dinamico e preservazione strumenti esistenti."""
    # Registra strumento dinamico con step
    db_session.add(models.Instrument(
        code="DYN_CHAT",
        name_it="Chat Dinamica",
        is_active=True,
        target_audience="student",
        tool_category="guided",
    ))
    db_session.add(models.GuidedStep(
        id="dc-intro",
        questionnaire_type="DYN_CHAT",
        sort_order=1,
        label="Intro Dinamica",
        prompt="Spiega brevemente il percorso.",
        system_prompt_mode="generic",
    ))
    db_session.commit()
    invalidate_instrument_cache()

    ai_service = AIService(db_session)

    # 1. Preparazione turno per strumento dinamico
    req_dyn = ChatRequest(
        mode="generic",
        phase="dc-intro",
        questionnaire_type="DYN_CHAT",
        use_phase_prompt=True,
        message="",
    )
    prepared_dyn = prepare_chat_turn(
        db_session,
        ai_service,
        req_dyn,
        session_id="dyn-sess-1",
        identity={"username": "alice", "is_admin": False},
        include_retrieval=False,
        include_history=False,
    )
    assert prepared_dyn.questionnaire_type == "DYN_CHAT"
    assert prepared_dyn.step_label == "Intro Dinamica"
    assert "Spiega brevemente il percorso." in prepared_dyn.effective_message

    # 2. Preservazione integrale di QSA: nessuna regressione
    db_session.add(models.Instrument(
        code="QSA",
        name_it="Questionario Strategie",
        is_active=True,
        tool_category="assessment",
    ))
    db_session.commit()
    _ensure_questionnaire_guided_steps(db_session, "QSA")

    req_qsa = ChatRequest(
        mode="generic",
        phase="intro",
        questionnaire_type="QSA",
        use_phase_prompt=True,
        message="",
    )
    prepared_qsa = prepare_chat_turn(
        db_session,
        ai_service,
        req_qsa,
        session_id="qsa-sess-1",
        identity={"username": "alice", "is_admin": False},
        include_retrieval=False,
        include_history=False,
    )
    assert prepared_qsa.questionnaire_type == "QSA"
    assert prepared_qsa.step_label != ""


def test_ensure_questionnaire_guided_steps_safety(db_session):
    """_ensure_questionnaire_guided_steps non deve fallire su strumenti dinamici."""
    # Strumento dinamico senza template hardcoded
    _ensure_questionnaire_guided_steps(db_session, "COMPLETELY_NEW_DYNAMIC_TOOL")
    # Nessun record creato e nessuna eccezione
    count = db_session.query(models.GuidedStep).filter(
        models.GuidedStep.questionnaire_type == "COMPLETELY_NEW_DYNAMIC_TOOL"
    ).count()
    assert count == 0
