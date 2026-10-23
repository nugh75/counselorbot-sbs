from pathlib import Path

from fastapi.testclient import TestClient

from backend.main import app
from backend.version import __version__


def test_version_endpoint_reports_repository_version():
    # No context manager: the lifespan (database seeding) is not needed here.
    response = TestClient(app).get("/version")
    assert response.status_code == 200
    assert response.json() == {"version": __version__}
    assert __version__ == (Path(__file__).resolve().parents[2] / "VERSION").read_text().strip()
