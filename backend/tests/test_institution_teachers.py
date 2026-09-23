"""Membership permissions against a dedicated PostgreSQL test database.

Run: python -m backend.tests.test_institution_teachers
Only rows created by this suite are removed; production tables are never used.
"""
import os
import unittest
import uuid
from urllib.parse import urlsplit, urlunsplit

import psycopg2
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend import auth, models
from backend.institution_access import require_institution_teacher
from backend.routes import institutions


class InstitutionTeacherTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = urlsplit(os.environ["DATABASE_URL"])
        name = "counselorbot_membership_test"
        admin_url = urlunsplit(source._replace(path="/postgres"))
        connection = psycopg2.connect(admin_url)
        try:
            connection.autocommit = True
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s", (name,))
                if not cursor.fetchone():
                    cursor.execute(f'CREATE DATABASE "{name}"')
        finally:
            connection.close()
        cls.engine = create_engine(urlunsplit(source._replace(path=f"/{name}")))
        for model in (models.Institution, models.InstitutionTeacher):
            model.__table__.create(cls.engine, checkfirst=True)
        cls.Session = sessionmaker(bind=cls.engine)

    def setUp(self):
        self.db = self.Session()
        token = uuid.uuid4().hex
        self.schools = [models.Institution(slug=f"membership-{token}-{i}", name=f"School {i}", kind="school", is_active=True) for i in range(2)]
        self.db.add_all(self.schools)
        self.db.commit()
        self.identity = {"username": "admin-test", "authenticated": True, "is_admin": True, "groups": ["admins"]}
        app = FastAPI()
        app.include_router(institutions.router)
        app.dependency_overrides[auth.get_identity] = lambda: self.identity
        app.dependency_overrides[institutions.get_db] = lambda: self.db
        self.client = TestClient(app)
        self.path = f"/admin/institutions/{self.schools[0].id}/teachers"

    def tearDown(self):
        self.client.close()
        self.db.rollback()
        for school in self.schools:
            self.db.delete(school)
        self.db.commit()
        self.db.close()

    def teacher(self, username="teacher-test", **extra):
        self.identity = {"username": username, "authenticated": True, "is_admin": False, "groups": ["docenti"], **extra}

    def grant(self):
        response = self.client.post(self.path, json={"username": "teacher-test"})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_admin_grants_idempotently_and_records_actor(self):
        first = self.grant()
        second = self.grant()
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(len(self.client.get(self.path).json()), 1)
        row = self.db.get(models.InstitutionTeacher, first["id"])
        self.assertEqual(row.created_by, "admin-test")
        self.assertEqual(row.updated_by, "admin-test")

    def test_teacher_reads_only_explicit_associations(self):
        self.grant()
        self.teacher()
        response = self.client.get("/teacher/institutions")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([i["id"] for i in response.json()], [self.schools[0].id])
        require_institution_teacher(self.db, self.identity, self.schools[0].id)
        with self.assertRaises(HTTPException) as raised:
            require_institution_teacher(self.db, self.identity, self.schools[1].id)
        self.assertEqual(raised.exception.status_code, 403)

    def test_role_alone_and_self_declared_school_do_not_grant_access(self):
        self.teacher(institution_id=self.schools[0].id, institution_slug=self.schools[0].slug)
        self.assertEqual(self.client.get("/teacher/institutions").json(), [])
        self.assertEqual(self.client.post(self.path, json={"username": "teacher-test"}).status_code, 403)
        self.assertEqual(self.client.get(self.path).status_code, 403)

    def test_another_teacher_has_no_access(self):
        membership = self.grant()
        self.teacher("another-teacher")
        self.assertEqual(self.client.get("/teacher/institutions").json(), [])
        self.assertEqual(self.client.delete(f'{self.path}/{membership["id"]}').status_code, 403)

    def test_membership_does_not_assign_teacher_role(self):
        self.grant()
        self.teacher(groups=["studenti"])
        self.assertEqual(self.client.get("/teacher/institutions").status_code, 403)
        with self.assertRaises(HTTPException):
            require_institution_teacher(self.db, self.identity, self.schools[0].id)

    def test_researcher_cannot_manage_membership(self):
        self.teacher(groups=["researchers"], is_researcher=True)
        self.assertEqual(self.client.post(self.path, json={"username": "teacher-test"}).status_code, 403)
        self.assertEqual(self.client.get(self.path).status_code, 403)

    def test_revocation_and_reactivation_preserve_id(self):
        membership = self.grant()
        self.assertEqual(self.client.delete(f'{self.path}/{membership["id"]}').status_code, 200)
        self.assertEqual(self.client.get(self.path).json(), [])
        self.teacher()
        self.assertEqual(self.client.get("/teacher/institutions").json(), [])
        with self.assertRaises(HTTPException):
            require_institution_teacher(self.db, self.identity, self.schools[0].id)
        self.identity.update(username="admin-test", is_admin=True, groups=["admins"])
        self.assertEqual(self.grant()["id"], membership["id"])

    def test_inactive_institution_blocks_grant_and_teacher_access(self):
        self.grant()
        self.schools[0].is_active = False
        self.db.commit()
        self.assertEqual(self.client.post(self.path, json={"username": "teacher-test"}).status_code, 409)
        self.teacher()
        self.assertEqual(self.client.get("/teacher/institutions").json(), [])

    def test_membership_id_cannot_cross_institution(self):
        membership = self.grant()
        wrong = f'/admin/institutions/{self.schools[1].id}/teachers/{membership["id"]}'
        self.assertEqual(self.client.delete(wrong).status_code, 404)
        self.assertEqual(len(self.client.get(self.path).json()), 1)

    def test_invalid_usernames_and_missing_institution(self):
        for name in ("", "   ", "teacher name", "x" * 256):
            self.assertEqual(self.client.post(self.path, json={"username": name}).status_code, 422)
        response = self.client.post(self.path, json={"username": "  docente@example.test  "})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["username"], "docente@example.test")
        self.assertEqual(self.client.post('/admin/institutions/2147483647/teachers', json={"username": "teacher-test"}).status_code, 404)

    def test_anonymous_cannot_read_or_write(self):
        self.identity = {"authenticated": False, "is_admin": False, "groups": []}
        self.assertEqual(self.client.get(self.path).status_code, 401)
        self.assertEqual(self.client.get('/teacher/institutions').status_code, 401)
        self.assertEqual(self.client.post(self.path, json={"username": "teacher-test"}).status_code, 401)


if __name__ == "__main__":
    unittest.main(verbosity=2)
