"""The backend image must default to a Python that can import the code (#981).

The backend uses ``datetime.UTC`` (Python 3.11+). With the old
``python:3.10-slim`` default a fresh Docker install could not even import
``backend/ai_service.py``. This guard reads the build configuration and fails
if the default slips back to 3.10.
"""
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
DEFAULT = "python:3.12-slim"


def _read(relative):
    path = ROOT / relative
    if not path.exists():
        # Inside the backend image the repository root files are not copied.
        pytest.skip(f"{relative} not available in this environment")
    return path.read_text(encoding="utf-8")


def test_dockerfile_defaults_to_python_312():
    dockerfile = _read("backend/Dockerfile")
    assert f"ARG PYTHON_BASE_IMAGE={DEFAULT}" in dockerfile
    assert "python:3.10" not in dockerfile


@pytest.mark.parametrize("compose_file", ["docker-compose.yml", "docker-compose.portable.yml"])
def test_compose_files_default_to_python_312(compose_file):
    compose = _read(compose_file)
    assert f"PYTHON_BASE_IMAGE: ${{COUNSELORBOT_PYTHON_BASE_IMAGE:-{DEFAULT}}}" in compose
    assert "python:3.10" not in compose


def test_env_example_documents_the_312_default():
    example = _read(".env.example")
    assert f"mirror.gcr.io/library/{DEFAULT}" in example
    assert "python:3.10" not in example


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
