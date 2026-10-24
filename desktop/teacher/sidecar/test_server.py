"""Sidecar contracts without application data or the backend lifespan."""
import importlib.util
import io
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import threading
import time
from types import SimpleNamespace
from urllib.request import urlopen

import pytest

ENTRYPOINT = Path(__file__).with_name("server.py")
spec = importlib.util.spec_from_file_location("desktop_server", ENTRYPOINT)
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


def test_defaults_are_loopback_and_lifeline_is_explicit(monkeypatch):
    monkeypatch.delenv("HOST", raising=False)
    monkeypatch.delenv("PORT", raising=False)
    args = server.parse_args([])
    assert (args.host, args.port, args.lifeline, args.minimal) == ("127.0.0.1", 8000, False, False)
    assert server.parse_args(["--lifeline", "--minimal"]).lifeline


def test_socket_reserves_only_loopback_and_does_not_listen():
    with server.bind("127.0.0.1", 0) as sock:
        assert sock.getsockname()[0] == "127.0.0.1"
        with socket.socket() as client:
            assert client.connect_ex(sock.getsockname()) != 0


def test_occupied_port_exits_four():
    with socket.socket() as occupied:
        occupied.bind(("127.0.0.1", 0))
        occupied.listen()
        with pytest.raises(SystemExit) as error:
            server.bind(*occupied.getsockname())
        assert error.value.code == 4


def test_data_directories_and_sqlite_parent_are_writable(tmp_path):
    env = {name: str(tmp_path / name) for name in server.DIR_VARIABLES}
    env["DATABASE_URL"] = f"sqlite:///{tmp_path / 'db' / 'test.sqlite3'}"
    server.check_data_dirs(env)
    assert all(Path(value).is_dir() for name, value in env.items() if name != "DATABASE_URL")
    assert (tmp_path / "db").is_dir()
    assert not list(tmp_path.rglob(".write-test"))


def test_unusable_data_exits_three(tmp_path):
    blocked = tmp_path / "file"
    blocked.write_text("not a directory")
    with pytest.raises(SystemExit) as error:
        server.check_data_dirs({"DATA_DIR": str(blocked / "uploads")})
    assert error.value.code == 3


def test_eof_requests_clean_stop_then_enforces_deadline():
    app = SimpleNamespace(should_exit=False)
    forced = threading.Event()
    codes = []

    def exit_now(code):
        codes.append(code)
        forced.set()

    closed = server.watch_stdin(app, io.BytesIO(b"ignored"), grace=0.02, exit_now=exit_now)
    assert closed.wait(1)
    assert app.should_exit
    assert forced.wait(1)
    assert codes == [0]


def test_open_pipe_keeps_server_alive_until_eof():
    read_fd, write_fd = os.pipe()
    app = SimpleNamespace(should_exit=False)
    with os.fdopen(read_fd, "rb") as stream:
        closed = server.watch_stdin(app, stream, grace=0.01, exit_now=lambda _: None)
        try:
            assert not closed.wait(0.03)
            assert not app.should_exit
        finally:
            os.close(write_fd)
        assert closed.wait(1)
        assert app.should_exit


@pytest.mark.parametrize("started,stopped,expected", [(True, False, 0), (False, False, 3), (False, True, 0)])
def test_main_uses_one_worker_and_classifies_startup(monkeypatch, started, stopped, expected):
    import contextlib

    app = SimpleNamespace(router=SimpleNamespace(lifespan_context=None))
    fake = SimpleNamespace(started=started, should_exit=False, run=lambda **_: None)
    config = {}
    redaction_installed = []
    monkeypatch.setitem(sys.modules, "backend", SimpleNamespace(main=SimpleNamespace(app=app)))
    monkeypatch.setitem(sys.modules, "backend.log_privacy", SimpleNamespace(
        install_log_redaction=lambda: redaction_installed.append(True),
    ))
    monkeypatch.setitem(sys.modules, "uvicorn", SimpleNamespace(
        Config=lambda application, **kwargs: config.update(kwargs), Server=lambda _: fake,
    ))
    monkeypatch.setattr(server, "check_data_dirs", lambda: None)
    monkeypatch.setattr(server, "watch_stdin", lambda _: SimpleNamespace(is_set=lambda: stopped))
    with contextlib.closing(socket.socket()) as sock:
        monkeypatch.setattr(server, "bind", lambda *_: sock)
        with pytest.raises(SystemExit) as error:
            server.main(["--port", "12345", "--lifeline", "--minimal"])
    assert error.value.code == expected
    assert config["workers"] == 1
    assert config["host"] == "127.0.0.1"
    assert redaction_installed == [True]
    assert app.router.lifespan_context is not None


def test_real_uvicorn_stops_when_parent_pipe_closes(tmp_path):
    # Synthetic application, isolated PYTHONPATH and port; no real DB or data.
    backend = tmp_path / "backend"
    backend.mkdir()
    (backend / "__init__.py").write_text("")
    source = ENTRYPOINT.resolve().parents[3] / "backend"
    for module in ("pii.py", "log_privacy.py"):
        shutil.copyfile(source / module, backend / module)
    shutil.copytree(source / "privacy", backend / "privacy",
                    ignore=shutil.ignore_patterns("__pycache__", "corpus"))
    (backend / "main.py").write_text(
        "from fastapi import FastAPI\napp = FastAPI()\n"
        "@app.get('/health')\ndef health(): return {'status': 'ok'}\n"
    )
    with socket.socket() as reserve:
        reserve.bind(("127.0.0.1", 0))
        port = reserve.getsockname()[1]
    env = {key: value for key, value in os.environ.items()
           if key not in server.DIR_VARIABLES and key not in ("DATABASE_URL", "HOST", "PORT")}
    env["PYTHONPATH"] = str(tmp_path)
    with subprocess.Popen([sys.executable, str(ENTRYPOINT), "--lifeline", "--port", str(port)],
                          cwd=tmp_path, env=env, stdin=subprocess.PIPE,
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) as child:
        try:
            deadline = time.monotonic() + 60
            while True:
                try:
                    with urlopen(f"http://127.0.0.1:{port}/health", timeout=0.2) as response:
                        assert response.status == 200
                    break
                except OSError:
                    assert child.poll() is None
                    assert time.monotonic() < deadline
                    time.sleep(0.05)
            child.stdin.close()
            assert child.wait(timeout=12) == 0
        finally:
            if child.poll() is None:
                child.kill()
                child.wait()
