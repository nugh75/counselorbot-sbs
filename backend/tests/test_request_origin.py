"""Origine della richiesta firmata dal frontend, fail-closed (F1-19).

Senza database e senza rete.
"""
import pytest
from starlette.datastructures import Headers

from backend.request_origin import RequestOrigin, request_origin

SECRET = "fixture-frontend-secret"


def _headers(**values):
    return Headers({name.replace("_", "-"): value for name, value in values.items()})


@pytest.fixture
def frontend_secret(monkeypatch):
    monkeypatch.setenv("COUNSELORBOT_FRONTEND_SECRET", SECRET)


def test_signed_local_origin_is_trusted(frontend_secret):
    result = request_origin(_headers(
        x_counselorbot_origin="local",
        x_counselorbot_client_ip="127.0.0.1",
        x_counselorbot_frontend_secret=SECRET,
    ))
    assert result == RequestOrigin("local", "127.0.0.1")
    assert result.is_local


def test_signed_tunnel_origin_carries_cloudflare_ip(frontend_secret):
    result = request_origin(_headers(
        x_counselorbot_origin="tunnel",
        x_counselorbot_client_ip="203.0.113.7",
        x_counselorbot_frontend_secret=SECRET,
    ))
    assert result == RequestOrigin("tunnel", "203.0.113.7")
    assert not result.is_local


@pytest.mark.parametrize("secret", [None, "", "guessed-secret", SECRET + "x", SECRET[:-1]])
def test_missing_or_wrong_secret_is_tunnel_without_ip(frontend_secret, secret):
    values = {"x_counselorbot_origin": "local", "x_counselorbot_client_ip": "10.0.0.1"}
    if secret is not None:
        values["x_counselorbot_frontend_secret"] = secret
    assert request_origin(_headers(**values)) == RequestOrigin("tunnel", None)


@pytest.mark.parametrize("origin", [None, "", "LOCAL", "loopback", "local,tunnel"])
def test_unknown_origin_is_tunnel(frontend_secret, origin):
    values = {"x_counselorbot_frontend_secret": SECRET, "x_counselorbot_client_ip": "127.0.0.1"}
    if origin is not None:
        values["x_counselorbot_origin"] = origin
    assert request_origin(_headers(**values)) == RequestOrigin("tunnel", None)


@pytest.mark.parametrize("configured", [None, ""])
def test_unconfigured_backend_never_trusts_origin(monkeypatch, configured):
    """Produzione Docker: nessun segreto, nemmeno un segreto vuoto apre la porta."""
    if configured is None:
        monkeypatch.delenv("COUNSELORBOT_FRONTEND_SECRET", raising=False)
    else:
        monkeypatch.setenv("COUNSELORBOT_FRONTEND_SECRET", configured)
    for supplied in ("", "anything"):
        result = request_origin(_headers(
            x_counselorbot_origin="local",
            x_counselorbot_client_ip="127.0.0.1",
            x_counselorbot_frontend_secret=supplied,
        ))
        assert result == RequestOrigin("tunnel", None)


def test_signed_origin_without_client_ip(frontend_secret):
    result = request_origin(_headers(x_counselorbot_origin="local", x_counselorbot_frontend_secret=SECRET))
    assert result == RequestOrigin("local", None)
