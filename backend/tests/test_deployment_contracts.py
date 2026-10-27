"""Contratti di configurazione dei due deployment: server web e app desktop.

Controlli statici sui file di deploy, senza import: il server web portabile e
l'app desktop del docente non devono mai condividere il fornitore di identità,
e l'immagine backend deve usare un Python in grado di importare il codice
(`datetime.UTC` esiste da Python 3.11).

Il controllo nasce da un guasto reale: l'istanza portabile del Mac montava il
checkout in un'immagine Python 3.10 e il backend non riusciva a importare
`backend.main`, quindi ogni richiesta (login compreso) tornava
`ECONNREFUSED`.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PORTABLE_COMPOSE = ROOT / "docker-compose.portable.yml"
DOCKERFILE = ROOT / "backend" / "Dockerfile"
ENV_EXAMPLE = ROOT / ".env.example"
DESKTOP_SUPERVISOR = (
    ROOT / "desktop" / "teacher" / "src-tauri" / "src" / "supervisor.rs"
)

#: prima versione di Python con `datetime.UTC`
MIN_PYTHON = (3, 11)


def _service_block(service: str) -> str:
    """Righe del servizio Compose, fino al servizio successivo."""
    lines = PORTABLE_COMPOSE.read_text(encoding="utf-8").splitlines()
    header = f"  {service}:"
    for index, line in enumerate(lines):
        if line.rstrip() == header:
            block = []
            for following in lines[index + 1 :]:
                if following.strip() and not following.startswith("    "):
                    break
                block.append(following)
            return "\n".join(block)
    raise AssertionError(f"servizio {service} assente da {PORTABLE_COMPOSE.name}")


def _python_version(value: str) -> tuple[int, int]:
    match = re.search(r"python:(\d+)\.(\d+)", value)
    assert match, f"immagine Python non riconosciuta: {value!r}"
    return int(match.group(1)), int(match.group(2))


def test_portable_web_keeps_the_ai4auth_sign_in():
    backend = _service_block("counselorbot-backend")
    assert "AUTH_PROVIDER: ai4auth" in backend
    assert 'COUNSELORBOT_PROFILE: ""' in backend


def test_desktop_shell_keeps_its_own_local_sign_in():
    source = DESKTOP_SUPERVISOR.read_text(encoding="utf-8")
    assert '("AUTH_PROVIDER".into(), "local".into())' in source
    assert '("COUNSELORBOT_AUTH_PROVIDER".into(), "local".into())' in source


def test_backend_image_python_can_import_the_code():
    for path in (DOCKERFILE, PORTABLE_COMPOSE, ENV_EXAMPLE):
        text = path.read_text(encoding="utf-8")
        for value in re.findall(r"python:\d+\.\d+-slim", text):
            assert _python_version(value) >= MIN_PYTHON, (
                f"{path.name} punta a {value}: il backend importa datetime.UTC "
                "(Python 3.11+) e non partirebbe"
            )
