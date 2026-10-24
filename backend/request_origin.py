"""Origine della richiesta: tunnel o locale (ADR-0002 §2.7, F1-19).

Tutte le richieste arrivano dal frontend su loopback: l'origine la decide il
frontend (intestazioni ``cf-*`` => tunnel) e la firma con
``COUNSELORBOT_FRONTEND_SECRET``. Qui la si accetta solo con il segreto giusto
(confronto a tempo costante). Fail-closed: segreto non configurato, assente o
errato, o valore sconosciuto => ``tunnel`` e nessun IP del client.

Chi la usa (F1-06 sessioni docente, F1-07 rotte admin, F1-13 limiti di
abbinamento) la consulta solo con ``AUTH_PROVIDER=local``; senza segreto, come
in produzione Docker, ogni richiesta risulta ``tunnel``.
"""
import os
import secrets
from dataclasses import dataclass
from typing import Literal, Optional

ORIGIN_HEADER = "x-counselorbot-origin"
CLIENT_IP_HEADER = "x-counselorbot-client-ip"
SECRET_HEADER = "x-counselorbot-frontend-secret"
ORIGINS = ("tunnel", "local")


@dataclass(frozen=True)
class RequestOrigin:
    origin: Literal["tunnel", "local"]
    client_ip: Optional[str] = None

    @property
    def is_local(self) -> bool:
        return self.origin == "local"


UNTRUSTED = RequestOrigin("tunnel")


def request_origin(headers) -> RequestOrigin:
    """Origine firmata dal frontend; ``headers`` e' ``request.headers``."""
    expected = os.environ.get("COUNSELORBOT_FRONTEND_SECRET", "")
    supplied = headers.get(SECRET_HEADER, "")
    if not expected or not secrets.compare_digest(supplied.encode(), expected.encode()):
        return UNTRUSTED
    origin = headers.get(ORIGIN_HEADER, "")
    if origin not in ORIGINS:
        return UNTRUSTED
    return RequestOrigin(origin, headers.get(CLIENT_IP_HEADER) or None)
