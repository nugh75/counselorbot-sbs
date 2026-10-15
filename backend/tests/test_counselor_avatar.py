"""Test di unità e integrazione per l'upload e serving dell'avatar/copertina dei counselor (Issue #288).

Verifica:
1. Upload immagine avatar PNG/SVG per un counselor esistente
2. Aggiornamento corretto di counselor.avatar e counselor.avatar_url nel DB
3. Erogazione pubblica dell'avatar con headers Cache-Control
4. Rifiuto formati non supportati (es. PDF)
5. Rifiuto file vuoti
6. Rifiuto file superiori a 5MB
7. Errore 404 per counselor inesistente o avatar non trovato
"""
import io
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import auth, database, models
from backend.routes import counselors as counselors_routes


@pytest.fixture
def db_session(tmp_path, monkeypatch):
    """Sessione SQLite in-memory isolata con storage temporaneo per avatar counselor."""
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    models.Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)

    avatar_dir = str(tmp_path / "counselor_avatars")
    monkeypatch.setattr(counselors_routes, "COUNSELOR_AVATARS_STORAGE_DIR", avatar_dir)

    with session_factory() as session:
        yield session
    engine.dispose()


@pytest.fixture
def client_env(db_session):
    """TestClient FastAPI con router counselors e autenticazione admin configurata."""
    app = FastAPI()
    app.include_router(counselors_routes.router)

    admin_identity = {
        "username": "admin_test",
        "groups": ["admin"],
        "authenticated": True,
        "is_admin": True,
    }

    app.dependency_overrides[database.get_db] = lambda: db_session
    app.dependency_overrides[auth.get_current_active_admin] = lambda: admin_identity
    app.dependency_overrides[auth.get_current_user] = lambda: admin_identity
    app.dependency_overrides[auth.get_identity_view_as] = lambda: admin_identity

    with TestClient(app) as client:
        yield client, db_session


def test_upload_and_serve_counselor_avatar(client_env):
    client, session = client_env

    # 1. Crea counselor di test
    counselor = models.Counselor(
        slug="serena",
        name="Serena",
        description="Counselor orientatore di prova",
        persona="Sei Serena, counselor orientatore empatico.",
        language=["*"],
        sort_order=1,
        is_active=True,
    )
    session.add(counselor)
    session.commit()
    session.refresh(counselor)
    counselor_id = counselor.id

    # 2. Upload avatar PNG valido
    fake_png = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    files = {"file": ("serena_cover.png", io.BytesIO(fake_png), "image/png")}
    res = client.post(f"/api/admin/counselors/{counselor_id}/avatar", files=files)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["avatar"] == f"/api/counselors/{counselor_id}/avatar"

    # Verifica nel database
    session.refresh(counselor)
    assert counselor.avatar == f"/api/counselors/{counselor_id}/avatar"
    assert counselor.avatar_url == f"/api/counselors/{counselor_id}/avatar"

    # 3. Serving avatar pubblico via GET
    get_res = client.get(f"/api/counselors/{counselor_id}/avatar")
    assert get_res.status_code == 200
    assert get_res.headers["content-type"] == "image/png"
    assert "max-age=3600" in get_res.headers["cache-control"]
    assert get_res.content == fake_png

    # Test anche il path senza prefisso /api
    get_res_plain = client.get(f"/counselors/{counselor_id}/avatar")
    assert get_res_plain.status_code == 200
    assert get_res_plain.content == fake_png


def test_upload_svg_counselor_avatar(client_env):
    client, session = client_env

    counselor = models.Counselor(
        slug="marco-tech",
        name="Marco Tech",
        language=["*"],
        sort_order=2,
        is_active=True,
    )
    session.add(counselor)
    session.commit()
    session.refresh(counselor)

    svg_content = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>'
    files = {"file": ("marco.svg", io.BytesIO(svg_content), "image/svg+xml")}
    res = client.post(f"/admin/counselors/{counselor.id}/avatar", files=files)
    assert res.status_code == 200
    assert res.json()["avatar"] == f"/api/counselors/{counselor.id}/avatar"

    get_res = client.get(f"/api/counselors/{counselor.id}/avatar")
    assert get_res.status_code == 200
    assert "image/svg+xml" in get_res.headers["content-type"]
    assert get_res.content == svg_content


def test_validation_errors(client_env):
    client, session = client_env

    counselor = models.Counselor(
        slug="val-test",
        name="Val Test",
        language=["*"],
        sort_order=3,
        is_active=True,
    )
    session.add(counselor)
    session.commit()
    session.refresh(counselor)

    # 1. Formato non supportato (PDF)
    bad_files = {"file": ("doc.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")}
    res_bad = client.post(f"/api/admin/counselors/{counselor.id}/avatar", files=bad_files)
    assert res_bad.status_code == 400
    assert "Formato non supportato" in res_bad.json()["detail"]

    # 2. File vuoto
    empty_files = {"file": ("empty.png", io.BytesIO(b""), "image/png")}
    res_empty = client.post(f"/api/admin/counselors/{counselor.id}/avatar", files=empty_files)
    assert res_empty.status_code == 400
    assert "vuoto" in res_empty.json()["detail"]

    # 3. File troppo grande (>5MB)
    huge_payload = b"0" * (5 * 1024 * 1024 + 10)
    huge_files = {"file": ("huge.png", io.BytesIO(huge_payload), "image/png")}
    res_huge = client.post(f"/api/admin/counselors/{counselor.id}/avatar", files=huge_files)
    assert res_huge.status_code == 413

    # 4. Counselor non esistente
    files_ok = {"file": ("cover.png", io.BytesIO(b"\x89PNG\r\n"), "image/png")}
    res_404 = client.post("/api/admin/counselors/99999/avatar", files=files_ok)
    assert res_404.status_code == 404

    # 5. Avatar non trovato
    get_404 = client.get("/api/counselors/88888/avatar")
    assert get_404.status_code == 404
