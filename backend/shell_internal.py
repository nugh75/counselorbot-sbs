"""Rotte `/internal/*` riservate al guscio dell'app desktop (ADR-0002 §2.6).

Una richiesta passa solo se arriva da loopback, non porta intestazioni `Cf-*` o
`X-Forwarded-*` (aggiunte da Cloudflare e dal rewrite `/api` di Next), non porta
`X-CounselorBot-Origin` (la imposta il frontend, ADR-0002 §2.7) e presenta
`X-CounselorBot-Shell-Secret` uguale a `COUNSELORBOT_SHELL_SECRET`. Senza il
segreto nell'ambiente (server, portable) le rotte non esistono. Ogni rifiuto e'
un 404, come per una rotta che non c'e'.

Il controllo e' un middleware ASGI e non una dipendenza del router: copre anche
i percorsi `/internal/*` che nessun router dichiara.
"""
import hmac
import os

from fastapi import APIRouter
from starlette.responses import JSONResponse

SECRET_ENV = "COUNSELORBOT_SHELL_SECRET"
SECRET_HEADER = b"x-counselorbot-shell-secret"
ORIGIN_HEADER = b"x-counselorbot-origin"
FORBIDDEN_PREFIXES = (b"cf-", b"x-forwarded-")
LOOPBACK_HOSTS = {"127.0.0.1", "::1"}

router = APIRouter(prefix="/internal", tags=["internal"])


@router.get("/ping")
def ping():
    """Il guscio verifica che sulla porta risponda il backend che ha avviato lui."""
    return {"status": "ok"}


def _is_internal_path(path: str) -> bool:
    return path == "/internal" or path.startswith("/internal/")


def is_shell_request(scope) -> bool:
    expected = os.getenv(SECRET_ENV, "")
    if not expected:
        return False
    client = scope.get("client")
    if not client or client[0] not in LOOPBACK_HOSTS:
        return False
    presented = None
    for name, value in scope.get("headers", []):
        name = name.lower()
        if name.startswith(FORBIDDEN_PREFIXES) or name == ORIGIN_HEADER:
            return False
        if name == SECRET_HEADER:
            if presented is not None:
                return False
            presented = value
    return presented is not None and hmac.compare_digest(presented, expected.encode())


class ShellInternalMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket") and _is_internal_path(scope["path"]) and not is_shell_request(scope):
            if scope["type"] == "websocket":
                await send({"type": "websocket.close", "code": 1008})
            else:
                await JSONResponse({"detail": "Not Found"}, status_code=404)(scope, receive, send)
            return
        await self.app(scope, receive, send)
