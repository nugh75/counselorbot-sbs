"""Test dell'accesso HTTP alle icone del catalogo.

Eseguibile senza pytest:
    docker exec counselorbot_backend python -m backend.tests.test_diagram_icon_http
"""
from pathlib import Path

import pytest

from backend.diagram_icon_catalog import DIAGRAM_ICONS, ICON_CATALOG
from backend.routes.diagram import ICONS_DIR, list_diagram_icons, read_diagram_icon
from fastapi import HTTPException


def test_every_catalogued_icon_has_a_file_on_disk():
    missing = [icon for icon in DIAGRAM_ICONS if not (ICONS_DIR / f"{icon}.svg").is_file()]
    assert missing == []


def test_an_icon_outside_the_catalogue_is_not_served():
    with pytest.raises(HTTPException) as raised:
        read_diagram_icon("unicorno")
    assert raised.value.status_code == 404


def test_a_path_cannot_escape_the_icon_directory():
    with pytest.raises(HTTPException) as raised:
        read_diagram_icon("../diagram_icon_catalog")
    assert raised.value.status_code == 404


def test_a_catalogued_icon_is_served_as_svg_with_a_long_cache():
    response = read_diagram_icon("brain")
    assert Path(response.path).name == "brain.svg"
    assert response.media_type == "image/svg+xml"
    assert "immutable" in response.headers["cache-control"]


def test_the_index_carries_a_searchable_word_for_every_icon():
    icons = list_diagram_icons("it")["icons"]
    assert len(icons) == len(ICON_CATALOG)
    assert {"id", "meaning", "label"} == set(icons[0])
    assert next(icon for icon in icons if icon["id"] == "brain")["label"] == "Memoria e ragionamento"
    english = list_diagram_icons("en")["icons"]
    assert next(icon for icon in english if icon["id"] == "brain")["label"] == "memory or reasoning"


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(pytest.main([__file__, "-q"]))
