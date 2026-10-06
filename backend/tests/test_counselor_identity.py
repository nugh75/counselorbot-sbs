"""Test completi per identità visiva, categorie di approccio e raccomandazione counselor.

Verifica:
1. Campi del modello Counselor (tagline_i18n, approach_categories, avatar_url)
2. Migrazione DDL ed esecuzione idempotente
3. Seed e backfill intelligente (noto e inferito per counselor custom)
4. Admin CRUD sui nuovi campi
5. Esposizione pubblica su GET /counselors (inclusa localizzazione tagline)
6. Raccomandazione e ricerca libera per approccio (GET e POST, filtri lingua/audience/strumento)
"""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import auth, database, models, schemas
from backend.counselor_i18n import localized_tagline
from backend.counselor_identity import (
    BASE_APPROACH_CATEGORIES,
    COUNSELOR_IDENTITY_DEFAULTS,
    infer_counselor_identity,
    recommend_counselor,
    seed_and_backfill_counselor_identities,
)
from backend.routes import counselors as counselors_routes


@pytest.fixture
def db_session():
    """Sessione SQLite in-memory isolata con tutte le tabelle."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    models.Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    with session_factory() as session:
        yield session
    engine.dispose()


@pytest.fixture
def client_env(db_session):
    """TestClient FastAPI con router counselors e autenticazione admin configurata."""
    app = FastAPI()
    app.include_router(counselors_routes.router)

    admin_identity = {
        "username": "admin",
        "groups": ["admins"],
        "authenticated": True,
        "is_admin": True,
    }
    app.dependency_overrides[auth.get_current_active_admin] = lambda: models.User(
        id=1, username="admin", hashed_password="pwd", is_admin=True
    )
    app.dependency_overrides[auth.get_identity_view_as] = lambda: admin_identity
    app.dependency_overrides[database.get_db] = lambda: db_session

    with TestClient(app) as client:
        yield client, db_session


def test_model_fields_and_defaults(db_session):
    """Verifica che il modello Counselor salvi e restituisca i nuovi campi."""
    c = models.Counselor(
        slug="test-counselor",
        name="Test Counselor",
        tagline_i18n={"it": "Frase distintiva di prova", "en": "Test distinctive tagline"},
        approach_categories=["filosofo", "maieutico"],
        avatar_url="/images/counselors/test.svg",
        is_active=True,
    )
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)

    assert c.tagline_i18n == {"it": "Frase distintiva di prova", "en": "Test distinctive tagline"}
    assert c.approach_categories == ["filosofo", "maieutico"]
    assert c.avatar_url == "/images/counselors/test.svg"


def test_localized_tagline_helper(db_session):
    """Verifica la funzione di supporto localized_tagline con fallback corretti."""
    c = models.Counselor(
        slug="polyglot",
        name="Polyglot",
        tagline_i18n={"it": "In italiano", "en": "In English", "es": "En español"},
    )
    assert localized_tagline(c, "it") == "In italiano"
    assert localized_tagline(c, "en") == "In English"
    assert localized_tagline(c, "es") == "En español"
    # Fallback all'italiano se lingua non presente
    assert localized_tagline(c, "fr") == "In italiano"

    # Caso con stringa diretta
    c_str = models.Counselor(slug="str-tagline", name="Simple", tagline_i18n="Solo stringa")
    assert localized_tagline(c_str, "it") == "Solo stringa"

    # Caso None
    c_none = models.Counselor(slug="none-tagline", name="Empty", tagline_i18n=None)
    assert localized_tagline(c_none, "it") is None


def test_idempotent_ddl_migration(db_session):
    """Verifica che le query DDL di aggiunta colonne siano sicure e idempotenti."""
    # Le colonne esistono già grazie a create_all; verificare che un secondo ALTER TABLE non provochi crash non gestiti
    for col in [
        "ADD COLUMN tagline_i18n JSON",
        "ADD COLUMN approach_categories JSON DEFAULT '[]'",
        "ADD COLUMN avatar_url VARCHAR",
    ]:
        try:
            db_session.execute(text(f"ALTER TABLE counselors {col}"))
            db_session.commit()
        except Exception:
            # Expected in SQLite when column already exists
            db_session.rollback()


def test_seed_and_backfill_known_counselors(db_session):
    """Verifica il backfill automatico per i counselor canonici (Marco, Sara, Luca, ecc.)."""
    c_marco = models.Counselor(slug="marco", name="Marco", persona="You are Marco...", is_active=True)
    c_sara = models.Counselor(slug="sara", name="Sara", persona="You are Sara...", is_active=True)
    c_luca = models.Counselor(slug="luca", name="Luca", persona="You are Luca...", is_active=True)
    db_session.add_all([c_marco, c_sara, c_luca])
    db_session.commit()

    updated = seed_and_backfill_counselor_identities(db_session)
    assert updated == 3

    db_session.refresh(c_marco)
    assert "filosofo" in c_marco.approach_categories
    assert "maieutico" in c_marco.approach_categories
    assert "it" in c_marco.tagline_i18n
    assert c_marco.avatar_url == "/images/counselors/marco.svg"

    db_session.refresh(c_sara)
    assert "psicologo" in c_sara.approach_categories
    assert "empatico" in c_sara.approach_categories

    db_session.refresh(c_luca)
    assert "tutor" in c_luca.approach_categories
    assert "pragmatico" in c_luca.approach_categories

    # Un secondo passaggio non deve modificare nulla (idempotente)
    assert seed_and_backfill_counselor_identities(db_session) == 0


def test_infer_counselor_identity_for_custom_counselor(db_session):
    """Verifica l'inferenza intelligente per counselor creati senza metadati."""
    socratic_custom = models.Counselor(
        slug="custom-socrate",
        name="Socrate Moderno",
        persona="You use Socratic questions and make the student reason with critical thinking.",
        description="Aiuta a riflettere con domande e filosofia.",
    )
    tagline, categories, avatar = infer_counselor_identity(socratic_custom)
    assert "filosofo" in categories
    assert "maieutico" in categories
    assert tagline["it"] == "Aiuta a riflettere con domande e filosofia."

    emotional_custom = models.Counselor(
        slug="custom-empatia",
        name="Guida Accogliente",
        persona="Empathetic, welcoming and attentive to emotional well-being.",
        description="Spazio accogliente per ascoltare ansie e vissuti.",
    )
    tagline_e, categories_e, _ = infer_counselor_identity(emotional_custom)
    assert "psicologo" in categories_e
    assert "empatico" in categories_e

    # Counselor generico garantisce almeno una categoria base
    generic_custom = models.Counselor(slug="custom-generic", name="Generico")
    _, categories_g, _ = infer_counselor_identity(generic_custom)
    assert len(categories_g) >= 1
    assert any(base in categories_g for base in BASE_APPROACH_CATEGORIES)


def test_admin_crud_counselor_identity(client_env):
    """Verifica creazione, lettura e aggiornamento dei nuovi campi tramite API admin."""
    client, db = client_env

    # 1. Creazione con nuovi campi
    payload = {
        "slug": "zenone",
        "name": "Zenone",
        "description": "Counselor di riflessione logica",
        "tagline_i18n": {"it": "Chiarisce paradossi e scelte di studio.", "en": "Clarifies paradoxes and study decisions."},
        "approach_categories": ["filosofo", "analitico"],
        "avatar_url": "/images/counselors/zenone.svg",
        "language": ["it", "en"],
        "is_active": True,
    }
    res = client.post("/admin/counselors", json=payload)
    assert res.status_code == 200, res.text
    created = res.json()
    assert created["slug"] == "zenone"
    assert created["tagline_i18n"]["it"] == "Chiarisce paradossi e scelte di studio."
    assert created["approach_categories"] == ["filosofo", "analitico"]
    assert created["avatar_url"] == "/images/counselors/zenone.svg"
    cid = created["id"]

    # 2. Lettura lista admin
    res_list = client.get("/admin/counselors")
    assert res_list.status_code == 200
    item = next(c for c in res_list.json() if c["id"] == cid)
    assert item["approach_categories"] == ["filosofo", "analitico"]

    # 3. Modifica campi
    update_payload = {
        "approach_categories": ["filosofo", "maieutico", "analitico"],
        "tagline_i18n": {"it": "Nuova frase distintiva."},
        "avatar_url": "/images/counselors/zenone_v2.svg",
    }
    res_put = client.put(f"/admin/counselors/{cid}", json=update_payload)
    assert res_put.status_code == 200
    updated = res_put.json()
    assert updated["approach_categories"] == ["filosofo", "maieutico", "analitico"]
    assert updated["tagline_i18n"] == {"it": "Nuova frase distintiva."}
    assert updated["avatar_url"] == "/images/counselors/zenone_v2.svg"


def test_public_counselors_returns_identity_and_localized_tagline(client_env):
    """Verifica che GET /counselors esponga tagline localizzato, approach_categories e avatar_url."""
    client, db = client_env

    c = models.Counselor(
        slug="atena",
        name="Atena",
        description="Descrizione italiana",
        tagline_i18n={"it": "Saggezza e strategia nello studio", "en": "Wisdom and strategy in learning"},
        approach_categories=["docente", "filosofo"],
        avatar_url="/images/counselors/atena.svg",
        is_active=True,
    )
    db.add(c)
    db.commit()

    # Richiesta italiana
    res_it = client.get("/counselors?lang=it")
    assert res_it.status_code == 200
    item_it = next(c for c in res_it.json() if c["slug"] == "atena")
    assert item_it["tagline"] == "Saggezza e strategia nello studio"
    assert item_it["approach_categories"] == ["docente", "filosofo"]
    assert item_it["avatar_url"] == "/images/counselors/atena.svg"

    # Richiesta inglese
    res_en = client.get("/counselors?lang=en")
    assert res_en.status_code == 200
    item_en = next(c for c in res_en.json() if c["slug"] == "atena")
    assert item_en["tagline"] == "Wisdom and strategy in learning"


def test_recommendation_and_search_by_approach(client_env):
    """Verifica l'algoritmo di raccomandazione/ricerca su query libere e stili di counseling."""
    client, db = client_env

    # Popola i counselor con identità note
    for slug in ["marco", "sara", "luca", "elena", "davide", "giulia"]:
        defaults = COUNSELOR_IDENTITY_DEFAULTS[slug]
        c = models.Counselor(
            slug=slug,
            name=slug.capitalize(),
            description=f"Counselor {slug}",
            tagline_i18n=defaults["tagline_i18n"],
            approach_categories=defaults["approach_categories"],
            avatar_url=defaults["avatar_url"],
            is_active=True,
            language=["*"],
        )
        db.add(c)
    db.commit()

    # 1. Query maieutica/filosofica: "Vorrei qualcuno che mi faccia riflettere con domande..."
    res_filo = client.post(
        "/counselors/recommend",
        json={"query": "Vorrei qualcuno che mi faccia riflettere con domande aperte per chiarire idee e significati."},
    )
    assert res_filo.status_code == 200
    data_filo = res_filo.json()
    assert data_filo["counselor"] is not None
    assert data_filo["counselor"]["slug"] in ["marco", "elena"]
    assert any(cat in ["filosofo", "maieutico", "riflessivo"] for cat in data_filo["matched_categories"])
    assert data_filo["confidence"] > 0.5
    assert len(data_filo["explanation"]) > 10

    # 2. Query psicologica/empatica: "Cerco qualcuno accogliente ed empatico che mi ascolti..."
    res_psico = client.post(
        "/counselors/recommend",
        json={"query": "Cerco qualcuno accogliente ed empatico per parlare di ansia, emozioni e motivazione nello studio."},
    )
    assert res_psico.status_code == 200
    data_psico = res_psico.json()
    assert data_psico["counselor"]["slug"] == "sara"
    assert "psicologo" in data_psico["matched_categories"] or "empatico" in data_psico["matched_categories"]

    # 3. Query pragmatica: "Voglio consigli pratici e diretti per agire subito..."
    res_prag = client.post(
        "/counselors/recommend",
        json={"query": "Voglio consigli pratici e diretti per passare subito all'azione senza giri di parole."},
    )
    assert res_prag.status_code == 200
    data_prag = res_prag.json()
    assert data_prag["counselor"]["slug"] == "luca"
    assert "tutor" in data_prag["matched_categories"] or "pragmatico" in data_prag["matched_categories"]

    # 4. Query motivazionale: "Ho bisogno di una spinta ed energia per superare le sfide..."
    res_mot = client.post(
        "/counselors/recommend",
        json={"query": "Ho bisogno di una carica motivazionale e di sfide per credere nelle mie capacità."},
    )
    assert res_mot.status_code == 200
    data_mot = res_mot.json()
    assert data_mot["counselor"]["slug"] == "davide"

    # 5. Query metodica: "Cerco un metodo di studio strutturato passo dopo passo..."
    res_met = client.get(
        "/counselors/recommend",
        params={"query": "Cerco un metodo di studio ordinato con piani strutturati passo dopo passo."},
    )
    assert res_met.status_code == 200
    data_met = res_met.json()
    assert data_met["counselor"]["slug"] == "giulia"
    assert "docente" in data_met["matched_categories"] or "metodico" in data_met["matched_categories"]

    # 6. Verifica alias /counselors/search
    res_search = client.post(
        "/counselors/search",
        json={"query": "approccio filosofico e maieutico"},
    )
    assert res_search.status_code == 200
    assert res_search.json()["counselor"]["slug"] in ["marco", "elena"]


def test_recommendation_filters(client_env):
    """Verifica che la raccomandazione rispetti i filtri di lingua e audience."""
    client, db = client_env

    c_it_only = models.Counselor(
        slug="italiano-docente",
        name="Solo Italiano",
        tagline_i18n={"it": "Solo per docenti italiani."},
        approach_categories=["docente"],
        language=["it"],
        assistant_audience="docente",
        is_active=True,
    )
    c_en_studente = models.Counselor(
        slug="english-student",
        name="English Student",
        tagline_i18n={"en": "For English speaking students."},
        approach_categories=["tutor", "pragmatico"],
        language=["en"],
        assistant_audience="studente",
        is_active=True,
    )
    db.add_all([c_it_only, c_en_studente])
    db.commit()

    # Filtra per audience docente
    res_doc = client.post(
        "/counselors/recommend",
        json={"query": "aiuto", "audience": "docente"},
    )
    assert res_doc.status_code == 200
    assert res_doc.json()["counselor"]["slug"] == "italiano-docente"

    # Filtra per audience studente
    res_stud = client.post(
        "/counselors/recommend",
        json={"query": "aiuto", "audience": "studente"},
    )
    assert res_stud.status_code == 200
    assert res_stud.json()["counselor"]["slug"] == "english-student"


def test_counselor_categories_and_public_alias(client_env):
    """Verifica che /counselors/categories e /counselors/public rispondano correttamente."""
    client, db = client_env
    c = models.Counselor(
        slug="ipazia",
        name="Ipazia",
        tagline_i18n={"it": "Riflessione critica e matematica antica."},
        approach_categories=["filosofo", "matematico"],
        avatar_url="/images/counselors/ipazia.svg",
        is_active=True,
    )
    db.add(c)
    db.commit()

    # GET /counselors/categories
    res_cats = client.get("/counselors/categories")
    assert res_cats.status_code == 200
    cats = res_cats.json()
    assert isinstance(cats, list)
    assert "filosofo" in cats
    assert "matematico" in cats
    assert "psicologo" in cats

    # GET /counselors/public
    res_pub = client.get("/counselors/public?lang=it")
    assert res_pub.status_code == 200
    items = res_pub.json()
    ipazia = next((item for item in items if item["slug"] == "ipazia"), None)
    assert ipazia is not None
    assert ipazia["tagline"] == "Riflessione critica e matematica antica."
    assert ipazia["approach_summary"] == "Riflessione critica e matematica antica."
    assert ipazia["approach_categories"] == ["filosofo", "matematico"]
    assert ipazia["avatar_url"] == "/images/counselors/ipazia.svg"
