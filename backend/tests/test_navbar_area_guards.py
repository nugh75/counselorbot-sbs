"""Navbar area entries and their server guards agree (P0, docs/operations/audit-navbar.md).

HTTP fixtures with synthetic identities: no database, SSO or network.
"""
import re
from pathlib import Path

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from backend import auth

ANONYMOUS = {"username": "", "groups": [], "is_admin": False, "is_researcher": False, "authenticated": False}
STUDENT = {"username": "studente.sintetico", "groups": ["studenti"], "is_admin": False, "is_researcher": False, "authenticated": True}
TEACHER = {"username": "docente.sintetico", "groups": ["docenti"], "is_admin": False, "is_researcher": False, "authenticated": True}
RESEARCHER = {"username": "ricerca.sintetica", "groups": ["ricercatori"], "is_admin": False, "is_researcher": True, "authenticated": True}
ADMIN = {"username": "admin.sintetico", "groups": ["admins"], "is_admin": True, "is_researcher": False, "authenticated": True}

# Area -> the dependency behind its API; the navbar shows the entry to the same
# roles (frontend/src/lib/roles.ts: canUsePersonalPage, canUseTeacherAssistant,
# canUseResearchConsole).
AREAS = {
    "/profilo": auth.get_current_user,
    "/docente": auth.get_current_plan_manager,
    "/admin": auth.get_current_active_admin,
}
EXPECTED = {
    "A": (ANONYMOUS, {"/profilo": 401, "/docente": 401, "/admin": 401}),
    "S": (STUDENT, {"/profilo": 200, "/docente": 403, "/admin": 403}),
    "D": (TEACHER, {"/profilo": 200, "/docente": 200, "/admin": 403}),
    "R": (RESEARCHER, {"/profilo": 200, "/docente": 200, "/admin": 200}),
    "M": (ADMIN, {"/profilo": 200, "/docente": 200, "/admin": 200}),
}


def _client(identity):
    app = FastAPI()
    for path, guard in AREAS.items():
        app.add_api_route(path, lambda who=Depends(guard): {"username": who["username"]})
    app.dependency_overrides[auth.get_identity] = lambda: dict(identity)
    return TestClient(app)


@pytest.mark.parametrize("role", EXPECTED)
def test_area_guards_match_navbar_roles(role):
    identity, statuses = EXPECTED[role]
    client = _client(identity)
    assert {path: client.get(path).status_code for path in AREAS} == statuses


def test_teacher_markers_match_the_frontend():
    roles = (Path(__file__).resolve().parents[2] / "frontend/src/lib/roles.ts").read_text()
    for name, markers in (("TEACHER_MARKERS", auth.TEACHER_GROUP_MARKERS), ("RESEARCH_MARKERS", auth.RESEARCH_GROUP_MARKERS)):
        listed = re.search(rf"const {name} = \[(.*?)\];", roles).group(1)
        assert tuple(re.findall(r"'([^']+)'", listed)) == tuple(markers), name


if __name__ == "__main__":
    raise SystemExit(pytest.main([__file__, "-q"]))
