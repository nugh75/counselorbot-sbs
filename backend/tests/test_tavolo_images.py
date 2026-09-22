"""Le immagini del catalogo del tavolo: caricamento massivo con CSV,
completamento delle immagini senza riga, catalogo e file pubblici, pruning
degli id sconosciuti alla scrittura del tavolo.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_tavolo_images
"""
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from backend import auth, database, models
from backend.routes import tavolo as tavolo_routes
from backend.routes import tavolo_images as routes
from backend.tavolo import parse_graph

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 28


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(routes, "STORAGE_DIR", str(tmp_path))
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    models.Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False)
    app = FastAPI()
    app.include_router(routes.router)
    app.dependency_overrides[database.get_db] = lambda: sessions()
    app.dependency_overrides[routes.get_db] = lambda: sessions()
    app.dependency_overrides[auth.get_current_active_admin] = lambda: {
        "username": "direttrice", "is_admin": True,
    }
    with TestClient(app) as test_client:
        yield test_client


def upload(client, images, csv_bytes=b"nome_file;nome;utilizzo\n"):
    parts = [("files", (name, content, "image/png")) for name, content in images]
    parts.append(("csv_file", ("catalogo.csv", csv_bytes, "text/csv")))
    return client.post("/admin/tavolo-images", files=parts)


def test_the_csv_names_and_its_usage_reach_the_catalog(client):
    csv_bytes = ("nome_file;nome;utilizzo\n"
                 "studio.png;Studio;Abitudini di studio\n").encode()
    response = upload(client, [("studio.png", PNG)], csv_bytes)
    assert response.status_code == 200
    assert response.json() == {"created": 1, "unlisted": []}
    catalog = client.get("/tavolo-images").json()["images"]
    assert len(catalog) == 1
    assert catalog[0]["name"] == "Studio"
    assert catalog[0]["usage"] == "Abitudini di studio"


def test_the_comma_separated_csv_is_just_as_good(client):
    csv_bytes = ("nome_file,nome,utilizzo\n"
                 "studio.png,Studio,Repasso serale\n").encode()
    response = upload(client, [("studio.png", PNG)], csv_bytes)
    assert response.status_code == 200
    assert client.get("/tavolo-images").json()["images"][0]["usage"] == "Repasso serale"


def test_an_image_without_a_csv_row_is_kept_and_asked_to_be_completed(client):
    csv_bytes = b"nome_file;nome;utilizzo\nstudio.png;Studio;Abitudini di studio\n"
    response = upload(client, [("studio.png", PNG), ("foto.jpg", JPG)], csv_bytes)
    assert response.status_code == 200
    assert response.json()["unlisted"] == ["foto.jpg"]
    catalog = client.get("/tavolo-images").json()["images"]
    orphan = next(image for image in catalog if image["name"] == "foto")
    assert orphan["usage"] == ""


def test_a_row_matched_without_extension_names_the_file(client):
    csv_bytes = b"nome_file;nome;utilizzo\nfoto;La mia foto;Quando il tempo conta\n"
    assert upload(client, [("foto.jpg", JPG)], csv_bytes).status_code == 200
    catalog = client.get("/tavolo-images").json()["images"]
    assert catalog[0]["name"] == "La mia foto"
    assert catalog[0]["usage"] == "Quando il tempo conta"


def test_an_unknown_format_is_refused_and_loses_nothing(client):
    response = upload(client, [("appunto.txt", b"testo")], b"")
    assert response.status_code == 422
    assert client.get("/tavolo-images").json()["images"] == []


def test_an_oversized_image_is_refused(client, monkeypatch):
    monkeypatch.setattr(routes, "MAX_FILE_BYTES", 8)
    assert upload(client, [("studio.png", PNG)], b"").status_code == 413


def test_the_catalog_has_a_cap(client, monkeypatch):
    monkeypatch.setattr(routes, "MAX_TOTAL_IMAGES", 1)
    csv_bytes = b"nome_file;nome;utilizzo\nuno.png;Uno;\ndue.png;Due;\n"
    response = upload(client, [("uno.png", PNG), ("due.png", PNG)], csv_bytes)
    assert response.status_code == 409


def test_only_the_administration_uploads_edits_and_deletes(client):
    app = client.app
    for allowed in (True, False):
        app.dependency_overrides[auth.get_current_active_admin] = (
            (lambda: {"username": "direttrice", "is_admin": True}) if allowed
            else (lambda: (_ for _ in ()).throw(HTTPException(status_code=403, detail="solo admin")))
        )
        assert upload(client, [("studio.png", PNG)], b"").status_code == (200 if allowed else 403)
    app.dependency_overrides[auth.get_current_active_admin] = lambda: {
        "username": "direttrice", "is_admin": True,
    }
    image_id = client.get("/tavolo-images").json()["images"][0]["id"]
    filled = client.patch(f"/admin/tavolo-images/{image_id}",
                          json={"name": "Studio", "usage": "Abitudini di studio"})
    assert filled.status_code == 200
    assert filled.json()["usage"] == "Abitudini di studio"
    assert client.delete(f"/admin/tavolo-images/{image_id}").status_code == 200
    assert client.get("/tavolo-images").json()["images"] == []


def test_the_public_file_route_serves_the_catalog_and_404s_the_rest(client):
    upload(client, [("studio.png", PNG)], b"nome_file;nome;utilizzo\nstudio.png;Studio;\n")
    image_id = client.get("/tavolo-images").json()["images"][0]["id"]
    served = client.get(f"/tavolo-images/{image_id}/file")
    assert served.status_code == 200
    assert served.headers["content-type"] == "image/png"
    assert served.content.startswith(b"\x89PNG")
    assert client.get("/tavolo-images/mai-esistito/file").status_code == 404


def test_an_unknown_image_id_is_lost_on_write_not_the_table():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    models.Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    db.add(models.TavoloImage(id="noto", name="Not", usage="", storage_path="",
                              original_name="noto.png", content_type="image/png", created_by="a"))
    db.commit()
    graph = parse_graph({"title": "", "nodes": [
        {"id": "a", "label": "Uno", "image": "noto"},
        {"id": "b", "label": "Due", "image": "inventato"},
    ], "edges": []})
    pruned = tavolo_routes._prune_images(db, graph)
    images = {node.id: node.image for node in pruned.nodes}
    assert images == {"a": "noto", "b": None}
