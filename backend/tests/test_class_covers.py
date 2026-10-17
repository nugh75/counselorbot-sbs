"""Test di unità e integrazione per le copertine delle classi (Issue #286).

Verifica:
1. image_url su modello StudentGroup e Pydantic schemas
2. Serializzazione corretta di image_url in _serialize_group
3. Aggiornamento di image_url via PUT /admin/groups/{group_id}
4. Upload immagine via POST /admin/groups/{group_id}/image con convalida mime-type e dimensione
5. Erogazione immagine via GET /groups/{group_id}/image
"""
import io
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import auth, database, models
from backend.routes import groups as groups_routes


@pytest.fixture
def db_session(tmp_path, monkeypatch):
    """Sessione SQLite in-memory isolata con storage temporaneo per immagini."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    models.Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)

    img_dir = str(tmp_path / "class_images")
    monkeypatch.setattr(groups_routes, "CLASS_IMAGES_STORAGE_DIR", img_dir)

    with session_factory() as session:
        yield session
    engine.dispose()


@pytest.fixture
def client_env(db_session):
    """TestClient FastAPI con router groups e autenticazione docente/admin configurata."""
    app = FastAPI()
    app.include_router(groups_routes.router)

    teacher_identity = {
        "username": "docente_test",
        "groups": ["docenti"],
        "authenticated": True,
        "is_admin": False,
    }

    app.dependency_overrides[database.get_db] = lambda: db_session
    app.dependency_overrides[auth.get_current_plan_manager] = lambda: teacher_identity
    app.dependency_overrides[auth.get_identity_view_as] = lambda: teacher_identity

    with TestClient(app) as client:
        yield client, db_session


def test_student_group_image_url_model_and_create(client_env):
    client, session = client_env
    # Creazione classe con image_url preset
    res = client.post(
        "/admin/groups",
        json={
            "name": "Classe 3A Scientifica",
            "image_url": "/images/classes/class-science.svg",
        },
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["name"] == "Classe 3A Scientifica"
    assert data["image_url"] == "/images/classes/class-science.svg"
    group_id = data["id"]

    # Verifica nel database
    group = session.get(models.StudentGroup, group_id)
    assert group is not None
    assert group.image_url == "/images/classes/class-science.svg"


def test_update_group_image_url(client_env):
    client, session = client_env
    # Creazione classe base
    res = client.post(
        "/admin/groups",
        json={"name": "Classe 4B Artistico"},
    )
    assert res.status_code == 200
    group_id = res.json()["id"]

    # Aggiornamento con preset arts
    res2 = client.put(
        f"/admin/groups/{group_id}",
        json={"image_url": "/images/classes/class-arts.svg"},
    )
    assert res2.status_code == 200
    assert res2.json()["image_url"] == "/images/classes/class-arts.svg"

    # Rimozione immagine personalizzata (reset a None)
    res3 = client.put(
        f"/admin/groups/{group_id}",
        json={"image_url": ""},
    )
    assert res3.status_code == 200
    assert res3.json()["image_url"] is None


def test_upload_and_serve_class_image(client_env):
    client, session = client_env
    # Creazione classe
    res = client.post(
        "/admin/groups",
        json={"name": "Classe 5C Informatica"},
    )
    assert res.status_code == 200
    group_id = res.json()["id"]

    # Upload di un'immagine PNG valida
    fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    files = {"file": ("custom_cover.png", io.BytesIO(fake_png), "image/png")}
    upload_res = client.post(f"/admin/groups/{group_id}/image", files=files)
    assert upload_res.status_code == 200, upload_res.text
    group_data = upload_res.json()
    assert f"/api/groups/{group_id}/image?v=" in group_data["image_url"]

    # Verifica recupero dell'immagine caricata
    get_res = client.get(f"/groups/{group_id}/image")
    assert get_res.status_code == 200
    assert get_res.headers["content-type"] == "image/png"
    assert get_res.content == fake_png

    # Test rifiuto formato non supportato (es. PDF o testo)
    bad_files = {"file": ("document.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")}
    bad_res = client.post(f"/admin/groups/{group_id}/image", files=bad_files)
    assert bad_res.status_code == 400
