"""Programmi esterni assenti: rilevamento e degradazione (F1-04).

Simula le installazioni senza Graphviz (app desktop) svuotando le cartelle di
ricerca: nessun binario vero serve, tranne nell'ultimo test che lo usa se c'e'.
Senza database e senza rete.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_native_deps
"""
import os
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi import HTTPException

from backend import diagram_render, native_deps
from backend.diagram_render import (
    DiagramSpecError,
    GraphvizUnavailableError,
    parse_spec,
    render,
)
from backend.pdf_images import render_pdf_pages

SPEC = parse_spec({
    "type": "cycle",
    "title": "Circolo",
    "nodes": [{"id": "a", "label": "Ansia"}, {"id": "b", "label": "Rimando"}],
    "edges": [{"from": "a", "to": "b"}, {"from": "b", "to": "a"}],
})


class _Env:
    """Ambiente di ricerca controllato, ripristinato all'uscita."""

    def __init__(self, path: str = "", native_bin_dir: str = ""):
        self.values = {"PATH": path, "NATIVE_BIN_DIR": native_bin_dir}

    def __enter__(self):
        self.saved = {key: os.environ.get(key) for key in self.values}
        self.saved_dirs = native_deps._PLATFORM_DIRS
        native_deps._PLATFORM_DIRS = {}
        os.environ.update(self.values)
        diagram_render._render_cached.cache_clear()
        return self

    def __exit__(self, *exc):
        for key, value in self.saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        native_deps._PLATFORM_DIRS = self.saved_dirs
        diagram_render._render_cached.cache_clear()


def _fake_program(directory: str, name: str) -> str:
    path = Path(directory) / (name + (".exe" if sys.platform == "win32" else ""))
    path.write_text("")
    path.chmod(path.stat().st_mode | stat.S_IEXEC)
    return str(path)


def test_capabilities_report_missing_graphviz():
    with _Env():
        assert native_deps.find_program("dot") is None
        assert native_deps.native_capabilities() == {
            "diagrams": {"available": False, "program": "graphviz"},
        }


def test_bundled_dir_is_searched_before_path():
    with tempfile.TemporaryDirectory() as bundled, tempfile.TemporaryDirectory() as system:
        expected = _fake_program(bundled, "dot")
        _fake_program(system, "dot")
        with _Env(path=system, native_bin_dir=bundled):
            assert os.path.samefile(native_deps.find_program("dot"), expected)
            assert native_deps.native_capabilities()["diagrams"]["available"] is True


def test_macos_homebrew_dirs_are_searched_without_shell_path():
    with tempfile.TemporaryDirectory() as homebrew:
        expected = _fake_program(homebrew, "dot")
        with _Env():
            native_deps._PLATFORM_DIRS = {sys.platform: (homebrew,)}
            assert os.path.samefile(native_deps.find_program("dot"), expected)


def test_render_without_graphviz_raises_a_dedicated_spec_error():
    with _Env(), pytest.raises(GraphvizUnavailableError) as raised:
        render(SPEC)
    # PDF e Telegram catturano DiagramSpecError e ripiegano sul testo.
    assert isinstance(raised.value, DiagramSpecError)
    assert raised.value.code == "diagram.errors.graphvizUnavailable"


def test_render_route_answers_503_with_code_without_graphviz():
    from backend.routes import diagram as diagram_routes

    with _Env(), pytest.raises(HTTPException) as raised:
        diagram_routes._image_response(SPEC, theme="light", fmt="svg", embed_title=False, lang="it")
    assert raised.value.status_code == 503
    assert raised.value.detail["code"] == "diagram.errors.graphvizUnavailable"


def test_every_layout_runs_through_the_single_dot_binary():
    calls = []

    def fake_run(command, **kwargs):
        calls.append(command)
        return subprocess.CompletedProcess(command, 0, stdout=b"PNG", stderr=b"")

    with tempfile.TemporaryDirectory() as bundled:
        dot = _fake_program(bundled, "dot")
        with _Env(native_bin_dir=bundled):
            original = diagram_render.subprocess.run
            diagram_render.subprocess.run = fake_run
            try:
                assert render(SPEC, fmt="png") == b"PNG"
            finally:
                diagram_render.subprocess.run = original
        assert os.path.samefile(calls[0][0], dot)
    assert calls[0][1:3] == ["-Kcirco", "-Tpng"]


def test_pdf_pages_render_with_pymupdf_without_poppler():
    import pymupdf

    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "two.pdf")
        with pymupdf.open() as doc:
            for text in ("uno", "due"):
                doc.new_page(width=200, height=100).insert_text((20, 50), text)
            doc.save(path)
        with _Env():  # nessun pdftoppm raggiungibile
            images = render_pdf_pages(path, dpi=144, first_page=1, last_page=6)
            tail = render_pdf_pages(path, dpi=72, first_page=2, last_page=2)
    assert [image.size for image in images] == [(400, 200), (400, 200)]
    assert images[0].mode == "RGB"
    assert [image.size for image in tail] == [(200, 100)]


@pytest.mark.skipif(native_deps.find_program("dot") is None, reason="graphviz non installato")
def test_real_graphviz_draws_every_layout():
    for diagram_type in ("flow", "cycle", "relation", "hierarchy", "mindmap"):
        spec = SPEC.model_copy(update={"type": diagram_type})
        assert render(spec).startswith(b"<svg")
        assert render(spec, fmt="png").startswith(b"\x89PNG")


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if not name.startswith("test_") or not callable(fn):
            continue
        if name == "test_real_graphviz_draws_every_layout" and native_deps.find_program("dot") is None:
            continue
        try:
            fn()
        except Exception as exc:  # pragma: no cover - percorso di esecuzione manuale
            failures += 1
            print(f"FAIL {name}: {exc}")
    print("OK: test_native_deps" if not failures else f"{failures} test falliti")
    sys.exit(1 if failures else 0)
