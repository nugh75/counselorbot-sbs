"""Test suite for P7: Teacher-Student Authorization & Admin Access Layer.

Covers:
- TeacherStudentGrant backfill and sync from GroupMembership / GroupShare
- Category, period, and class-scope authorization (G5 resolution)
- IDOR prevention and institution isolation returning 404
- Immediate grant revocation on share deletion or student leave
- Technical admin pseudonymized view on L1 unless break-glass
- Break-glass grant creation, revocation, and fail-closed privacy event recording
"""
from datetime import datetime, timedelta, timezone
import importlib
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from backend import auth, database, models
from backend.privacy import authz
from backend.privacy.types import Decision, PrivacyRole, Principal, ResourceRef
from backend.routes import admin, groups, privacy, survey
from backend.tests.artifact_database import artifact_session

migration_mod = importlib.import_module("backend.migrations.20261025_teacher_student_grants")
backfill_grants = migration_mod.backfill_grants


def test_backfill_grants_idempotent():
    with artifact_session() as db:
        group = models.StudentGroup(code="GRP-BF1", name="Backfill Group", owner_username="prof.rossi")
        db.add(group)
        db.flush()

        m1 = models.GroupMembership(group_id=group.id, username="student.one", joined_via="web")
        m2 = models.GroupMembership(group_id=group.id, username="student.two", joined_via="web")
        db.add_all([m1, m2])
        db.commit()

        # First run should create 2 grants
        created = backfill_grants(db)
        assert created == 2

        grants = db.query(models.TeacherStudentGrant).filter_by(group_id=group.id).all()
        assert len(grants) == 2
        for g in grants:
            assert g.teacher_username == "prof.rossi"
            assert g.student_username in ("student.one", "student.two")
            assert g.basis == "institutional_assignment"
            assert "result" in g.categories
            assert "conversation" in g.categories
            assert "notebook" not in g.categories  # G5 fix: notebook not granted by default
            assert g.revoked_at is None

        # Second run should be idempotent
        created2 = backfill_grants(db)
        assert created2 == 0


def test_authorize_data_access_student_self():
    with artifact_session() as db:
        student_user = {"username": "student.self", "is_admin": False, "is_researcher": False}
        p = authz.principal_from_identity(student_user)
        r = ResourceRef(subject="student.self", kind="result")
        dec = authz.authorize_data_access(p, "read", r, "orientation", db=db)
        assert dec.allowed is True
        assert dec.reason_code == "privacy.authz.self"

        assert authz.check_teacher_student_access(
            db=db,
            user_identity=student_user,
            student_username="student.self",
            category="result",
        ) is True


def test_authorize_data_access_teacher_valid_and_revoked():
    with artifact_session() as db:
        group = models.StudentGroup(code="GRP-T1", name="Group T1", owner_username="prof.rossi")
        db.add(group)
        db.flush()

        now = datetime.now(timezone.utc)
        grant = models.TeacherStudentGrant(
            teacher_username="prof.rossi",
            student_username="student.t1",
            group_id=group.id,
            basis="institutional_assignment",
            categories=["result", "conversation"],
            purposes=["teaching"],
            valid_from=now - timedelta(days=5),
            valid_until=now + timedelta(days=360),
        )
        db.add(grant)
        db.commit()

        teacher_user = {"username": "prof.rossi", "is_admin": False, "is_researcher": False, "groups": ["docenti"]}

        # Active grant -> True
        assert authz.check_teacher_student_access(
            db=db,
            user_identity=teacher_user,
            student_username="student.t1",
            category="result",
            group_id=group.id,
            resource_created_at=now - timedelta(days=2),
        ) is True

        # Unauthorized teacher -> 404
        other_teacher = {"username": "prof.bianchi", "is_admin": False, "is_researcher": False, "groups": ["docenti"]}
        with pytest.raises(HTTPException) as exc_info:
            authz.check_teacher_student_access(
                db=db,
                user_identity=other_teacher,
                student_username="student.t1",
                category="result",
                group_id=group.id,
            )
        assert exc_info.value.status_code == 404

        # Category out of scope (e.g. notebook) -> 404 (G5 resolution)
        with pytest.raises(HTTPException) as exc_info:
            authz.check_teacher_student_access(
                db=db,
                user_identity=teacher_user,
                student_username="student.t1",
                category="notebook",
                group_id=group.id,
            )
        assert exc_info.value.status_code == 404

        # Period out of scope (created before grant start) -> 404
        with pytest.raises(HTTPException) as exc_info:
            authz.check_teacher_student_access(
                db=db,
                user_identity=teacher_user,
                student_username="student.t1",
                category="result",
                group_id=group.id,
                resource_created_at=now - timedelta(days=10),
            )
        assert exc_info.value.status_code == 404

        # Revoked grant -> 404
        grant.revoked_at = now
        grant.revoked_by = "prof.rossi"
        db.commit()

        with pytest.raises(HTTPException) as exc_info:
            authz.check_teacher_student_access(
                db=db,
                user_identity=teacher_user,
                student_username="student.t1",
                category="result",
                group_id=group.id,
            )
        assert exc_info.value.status_code == 404


def test_authorize_data_access_institution_isolation():
    with artifact_session() as db:
        inst = models.Institution(
            slug="liceo-roma",
            name="Liceo Roma",
            kind="school",
        )
        db.add(inst)
        db.flush()

        group = models.StudentGroup(
            code="GRP-INST1",
            name="Group Inst 1",
            owner_username="prof.rossi",
            institution_id=inst.id,
        )
        db.add(group)
        db.flush()

        grant = models.TeacherStudentGrant(
            teacher_username="prof.rossi",
            student_username="student.inst",
            group_id=group.id,
            basis="institutional_assignment",
            categories=["result"],
            purposes=["teaching"],
            valid_from=datetime.now(timezone.utc) - timedelta(days=1),
        )
        db.add(grant)
        db.commit()

        # Teacher who is NOT in this institution -> 404
        teacher_unlinked = {
            "username": "prof.rossi",
            "is_admin": False,
            "is_researcher": False,
            "groups": ["docenti"],
        }
        with pytest.raises(HTTPException) as exc_info:
            authz.check_teacher_student_access(
                db=db,
                user_identity=teacher_unlinked,
                student_username="student.inst",
                category="result",
                group_id=group.id,
            )
        assert exc_info.value.status_code == 404

        # Link teacher to institution -> now allowed
        db.add(models.InstitutionTeacher(
            institution_id=inst.id,
            username="prof.rossi",
            is_active=True,
            created_by="admin",
            updated_by="admin",
        ))
        db.commit()

        assert authz.check_teacher_student_access(
            db=db,
            user_identity=teacher_unlinked,
            student_username="student.inst",
            category="result",
            group_id=group.id,
        ) is True


def test_group_students_learner_profile_masked_g5():
    """G5 fix: teacher listing students must have learner_profile / notebook masked."""
    with artifact_session() as db:
        group = models.StudentGroup(code="GRP-G5", name="G5 Class", owner_username="prof.rossi")
        db.add(group)
        db.flush()

        # Add student membership
        db.add(models.GroupMembership(
            group_id=group.id,
            username="student.private",
            joined_via="web",
        ))
        # Add student sensitive learner profile
        db.add(models.LearnerProfileRevision(
            username="student.private",
            data={"notes": "private student sensitive thoughts", "hobbies": "music"},
            source="manual",
        ))
        db.commit()

        app = FastAPI()
        app.include_router(groups.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: {
            "username": "prof.rossi", "authenticated": True, "is_admin": False, "is_researcher": False, "groups": ["docenti"]
        }

        with TestClient(app) as client:
            res = client.get(f"/admin/groups/{group.id}/students")
            assert res.status_code == 200
            data = res.json()
            assert len(data["students"]) == 1
            student = data["students"][0]
            assert student["username"] == "student.private"
            # Crucial G5 verification: learner_profile must be None / masked
            assert student["learner_profile"] is None


def test_group_shares_grant_lifecycle_and_idor():
    """Test co-teacher share creation, access, revocation, and IDOR protection."""
    with artifact_session() as db:
        group = models.StudentGroup(code="GRP-SHARE", name="Share Class", owner_username="prof.rossi")
        db.add(group)
        db.flush()

        now = datetime.now(timezone.utc)
        db.add(models.GroupMembership(group_id=group.id, username="student.alice", joined_via="web", created_at=now))
        res = models.QuestionnaireResult(
            username="student.alice",
            session_id="sess-alice-1",
            questionnaire_type="QSA",
            scores={"C1": 5},
            submitted_at=now,
        )
        db.add(res)
        db.add(models.Log(
            username="student.alice",
            session_id="sess-alice-1",
            action="chat_message",
            details={"user_input": "Ciao", "bot_response": "Risposta"},
        ))
        db.commit()

        # Backfill owner grant
        backfill_grants(db)

        current_identity = {"username": "prof.rossi", "authenticated": True, "is_admin": False, "is_researcher": False, "groups": ["docenti"]}
        app = FastAPI()
        app.include_router(groups.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: current_identity

        with TestClient(app) as client:
            # 1. Owner can access result
            resp = client.get(f"/admin/groups/{group.id}/students/student.alice/results/{res.id}")
            assert resp.status_code == 200

            # 2. Other teacher (prof.bianchi) gets 404 (IDOR protection)
            current_identity["username"] = "prof.bianchi"
            resp = client.get(f"/admin/groups/{group.id}/students/student.alice/results/{res.id}")
            assert resp.status_code == 404

            # 3. Owner shares group with prof.bianchi
            current_identity["username"] = "prof.rossi"
            share_res = client.post(f"/admin/groups/{group.id}/shares", json={"shared_with_username": "prof.bianchi"})
            assert share_res.status_code == 200
            share_id = share_res.json()["id"]

            # 4. Now prof.bianchi has active grant and can access result
            current_identity["username"] = "prof.bianchi"
            resp = client.get(f"/admin/groups/{group.id}/students/student.alice/results/{res.id}")
            assert resp.status_code == 200

            # 5. Owner removes share -> immediate revocation of prof.bianchi's grant
            current_identity["username"] = "prof.rossi"
            del_res = client.delete(f"/admin/groups/{group.id}/shares/{share_id}")
            assert del_res.status_code == 200

            # 6. prof.bianchi immediately gets 404 again
            current_identity["username"] = "prof.bianchi"
            resp = client.get(f"/admin/groups/{group.id}/students/student.alice/results/{res.id}")
            assert resp.status_code == 404


def test_student_leaves_group_revokes_grant():
    """When a student leaves a group, teacher grant is revoked and result returns 404."""
    with artifact_session() as db:
        group = models.StudentGroup(code="GRP-LEAVE", name="Leave Class", owner_username="prof.rossi")
        db.add(group)
        db.flush()

        now = datetime.now(timezone.utc)
        db.add(models.GroupMembership(group_id=group.id, username="student.bob", joined_via="web", created_at=now))
        res = models.QuestionnaireResult(
            username="student.bob",
            session_id="sess-bob-1",
            questionnaire_type="QSA",
            scores={"C1": 5},
            submitted_at=now,
        )
        db.add(res)
        db.commit()

        backfill_grants(db)

        current_identity = {"username": "prof.rossi", "authenticated": True, "is_admin": False, "is_researcher": False, "groups": ["docenti"]}
        app = FastAPI()
        app.include_router(groups.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = lambda: current_identity

        with TestClient(app) as client:
            resp = client.get(f"/admin/groups/{group.id}/students/student.bob/results/{res.id}")
            assert resp.status_code == 200

            # Student leaves group
            membership = db.query(models.GroupMembership).filter_by(group_id=group.id, username="student.bob").first()
            current_identity["username"] = "student.bob"
            current_identity["groups"] = ["studenti"]
            leave_resp = client.delete(f"/user/groups/{membership.id}")
            assert leave_resp.status_code == 200

            # Teacher now gets 404
            current_identity["username"] = "prof.rossi"
            current_identity["groups"] = ["docenti"]
            resp = client.get(f"/admin/groups/{group.id}/students/student.bob/results/{res.id}")
            assert resp.status_code == 404


def test_break_glass_api_and_admin_pseudonymization(monkeypatch):
    """Test L1 technical admin pseudonymization and break-glass lifecycle."""
    # Force L1 environment (production)
    monkeypatch.setenv("ENVIRONMENT", "production")

    with artifact_session() as db:
        now = datetime.now(timezone.utc)
        res = models.QuestionnaireResult(
            username="mario.rossi",
            session_id="sess-mario-1",
            questionnaire_type="QSA",
            scores={"C1": 8},
            submitted_at=now,
        )
        db.add(res)

        log = models.Log(
            username="mario.rossi",
            email="mario@scuola.it",
            session_id="sess-mario-1",
            action="chat_message",
            details={"user_input": "ciao", "bot_response": "salve"},
            timestamp=now,
        )
        db.add(log)
        db.commit()

        admin_identity = {
            "username": "admin.tech",
            "is_admin": True,
            "is_researcher": False,
            "authenticated": True,
        }

        app = FastAPI()
        app.include_router(privacy.router)
        app.include_router(survey.router)
        app.include_router(admin.router)
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_active_admin] = lambda: admin_identity
        app.dependency_overrides[auth.get_current_user] = lambda: admin_identity

        with TestClient(app) as client:
            # 1. Without break-glass, /admin/questionnaire-results returns pseudonymized username
            q_res = client.get("/admin/questionnaire-results")
            assert q_res.status_code == 200
            items = q_res.json()
            assert len(items) == 1
            pseudonymized_name = items[0]["username"]
            assert pseudonymized_name != "mario.rossi"
            assert "mario" not in pseudonymized_name

            # 2. Without break-glass, /admin/logs returns pseudonymized username and null email
            logs_res = client.get("/admin/logs")
            assert logs_res.status_code == 200
            log_items = logs_res.json()
            assert len(log_items) == 1
            assert log_items[0]["username"] != "mario.rossi"
            assert log_items[0]["email"] is None

            # 3. Attempt break-glass with reason too short (< 10 chars) -> 422
            bg_invalid = client.post("/privacy/break-glass", json={
                "subject_username": "mario.rossi",
                "resource_kind": "result",
                "resource_id": str(res.id),
                "reason": "short",
                "duration_hours": 2,
            })
            assert bg_invalid.status_code == 422

            # 4. Valid break-glass -> 200, creates break-glass record and privacy event
            bg_valid = client.post("/privacy/break-glass", json={
                "subject_username": "mario.rossi",
                "resource_kind": "*",
                "resource_id": "*",
                "reason": "Indagine tecnica su ticket di assistenza #1234",
                "duration_hours": 2,
            })
            assert bg_valid.status_code == 200
            bg_data = bg_valid.json()
            bg_id = bg_data["break_glass_id"]
            assert bg_data["subject_username"] == "mario.rossi"

            # Verify privacy event recorded in DB (audit: no cleartext usernames)
            pe = db.query(models.PrivacyEventRecord).filter_by(event_type="break_glass").first()
            assert pe is not None
            assert pe.actor_role == "admin"
            assert pe.actor_pid is not None
            assert pe.target == "*:*"

            # 5. With active break-glass, questionnaire-results returns clear username
            q_res2 = client.get("/admin/questionnaire-results")
            assert q_res2.status_code == 200
            assert q_res2.json()[0]["username"] == "mario.rossi"

            # With active break-glass, logs returns clear username
            logs_res2 = client.get("/admin/logs")
            assert logs_res2.status_code == 200
            assert logs_res2.json()[0]["username"] == "mario.rossi"

            # 6. Revoke break-glass -> 200
            rev_res = client.post(f"/privacy/break-glass/{bg_id}/revoke")
            assert rev_res.status_code == 200

            # Verify revoke privacy event
            pe_rev = db.query(models.PrivacyEventRecord).filter_by(event_type="grant_revoked", purpose="break_glass").first()
            assert pe_rev is not None
            assert pe_rev.actor_role == "admin"
            assert pe_rev.actor_pid is not None
            assert pe_rev.target == "*:*"

            # 7. Post-revocation: views revert to pseudonymized view
            q_res3 = client.get("/admin/questionnaire-results")
            assert q_res3.status_code == 200
            assert q_res3.json()[0]["username"] != "mario.rossi"
