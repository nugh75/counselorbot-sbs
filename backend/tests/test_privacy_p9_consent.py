"""P9 contract, HTTP and grant regression tests on both supported databases."""
import importlib
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import inspect

from backend import auth, database, models
from backend.privacy import authz, consent, events
from backend.privacy.errors import AuditUnavailable, ConsentMissingError, PolicyBlocked, PurposeDisabled
from backend.privacy.types import Principal, PrivacyContext, PrivacyRole, ResourceRef
from backend.routes import privacy, survey
from backend.tests.artifact_database import artifact_session

MIGRATION = importlib.import_module("backend.migrations.20261025_privacy_consent")
STUDENT = Principal("student.private", PrivacyRole.STUDENT, "local", "local")
TEACHER = Principal("prof.teacher", PrivacyRole.TEACHER, "local", "local")
BASE_TIME = datetime.now(timezone.utc) - timedelta(days=10)


def document(db, kind="consent_research", version="1.0.0", *, new=False, day=0, locale="it"):
    return consent.publish_document(
        db, kind=kind, version=version, locale=locale, body_ref=f"drafts/{kind}/{locale}/{version}.md",
        content=b"[DA VALIDARE] synthetic document", requires_new_consent=new,
        published_at=BASE_TIME + timedelta(days=day),
    )


def purpose(db, key="research", kind="consent_research", *, active=True, basis="consent", required=True):
    row = models.PrivacyPurpose(key=key, document_kind=kind, description_i18n={"it": "[DA VALIDARE]"},
                                active=active, legal_basis=basis, requires_consent=required)
    db.add(row)
    db.flush()
    return row


def context(key="research"):
    return PrivacyContext(STUDENT, STUDENT.username, key, "", "it")


def granted(db, key="research", target=""):
    return consent.has_consent(db, authz.safe_subject_pid(db, STUDENT.username), key, target)


def sharing(db):
    purpose(db, "teacher_sharing", "consent_sharing")
    doc = document(db, "consent_sharing")
    group = models.StudentGroup(code="P9-CLASS", name="Synthetic class", owner_username=TEACHER.username)
    db.add(group)
    db.flush()
    db.add(models.GroupMembership(group_id=group.id, username=STUDENT.username, joined_via="web"))
    db.flush()
    authz.sync_grants_for_membership(db, group.id, STUDENT.username)
    db.commit()
    return doc, group


def choose_share(db, doc, group, choice="given"):
    return consent.record_choice(db, STUDENT, "teacher_sharing", choice, document_id=doc.id,
                                 teacher_username=TEACHER.username, group_id=group.id)


def notebook_access(db, group, teacher=TEACHER):
    return authz.authorize_data_access(teacher, "read_clear", ResourceRef(
        "notebook", STUDENT.username, owner_group=str(group.id)), "teaching", db=db).allowed


def client_for(db):
    app = FastAPI()
    app.include_router(privacy.router)
    app.include_router(survey.router)
    identity = {"username": STUDENT.username, "authenticated": True, "groups": ["studenti"]}
    app.dependency_overrides[auth.get_identity] = lambda: identity
    app.dependency_overrides[auth.get_identity_view_as] = lambda: identity
    app.dependency_overrides[database.get_db] = lambda: db
    app.dependency_overrides[survey.get_db] = lambda: db
    return TestClient(app)


def test_migration_idempotent_and_preserves_controller_configuration():
    with artifact_session() as db:
        db.connection().exec_driver_sql("ALTER TABLE privacy_events DROP COLUMN document_locale")
        db.commit()
        MIGRATION.migrate(db.get_bind())
        assert "document_locale" in {c["name"] for c in inspect(db.get_bind()).get_columns("privacy_events")}
        assert {"privacy_documents", "privacy_purposes"} <= set(inspect(db.get_bind()).get_table_names())
        rows = db.query(models.PrivacyPurpose).all()
        assert len(rows) == len(MIGRATION.PURPOSES)
        assert all(not p.active and p.legal_basis == "undefined" for p in rows)
        assert db.query(models.PrivacyDocument).count() == 0
        row = db.get(models.PrivacyPurpose, "research")
        row.active, row.legal_basis = True, "public_task"
        db.commit()
        MIGRATION.migrate(db.get_bind())
        db.expire_all()
        assert db.get(models.PrivacyPurpose, "research").legal_basis == "public_task"


@pytest.mark.parametrize("active,basis", [(True, "undefined"), (False, "consent")])
def test_disabled_purpose_never_enables_acceptance_but_allows_refusal(active, basis):
    with artifact_session() as db:
        purpose(db, active=active, basis=basis)
        doc = document(db)
        with pytest.raises(PurposeDisabled):
            consent.record_choice(db, STUDENT, "research", "given", document_id=doc.id)
        with pytest.raises(PurposeDisabled):
            consent.require_purpose(db, context())
        consent.record_choice(db, STUDENT, "research", "refused", document_id=doc.id)
        db.commit()
        assert not granted(db)


def test_refusal_does_not_disable_independent_purpose_or_student_access():
    with artifact_session() as db:
        purpose(db)
        purpose(db, "guided_chat", "notice_ai", basis="public_task", required=False)
        doc = document(db)
        consent.record_choice(db, STUDENT, "research", "refused", document_id=doc.id)
        db.commit()
        with pytest.raises(ConsentMissingError):
            consent.require_purpose(db, context())
        consent.require_purpose(db, context("guided_chat"))
        assert authz.authorize_data_access(STUDENT, "read_clear", ResourceRef("notebook", STUDENT.username),
                                           "orientation", db=db).allowed


def test_notice_is_separate_from_consent_and_not_latest_choice():
    with artifact_session() as db:
        purpose(db)
        doc = document(db)
        consent.record_notice(db, STUDENT, doc.id)
        assert not granted(db)
        consent.record_choice(db, STUDENT, "research", "given", document_id=doc.id)
        consent.record_notice(db, STUDENT, doc.id)
        db.commit()
        assert granted(db)
        consent.require_purpose(db, context())


def test_document_versions_only_require_reconsent_at_material_barriers():
    with artifact_session() as db:
        purpose(db)
        first = document(db)
        consent.record_choice(db, STUDENT, "research", "given", document_id=first.id)
        minor = document(db, version="1.0.1", day=1)
        assert granted(db)
        consent.record_notice(db, STUDENT, minor.id)
        assert granted(db)
        with pytest.raises(PolicyBlocked):
            consent.record_choice(db, STUDENT, "research", "given", document_id=first.id)
        document(db, version="2.0.0", day=2, new=True)
        assert not granted(db)
        latest = document(db, version="2.0.1", day=3)
        assert not granted(db)  # minor version cannot bypass the intermediate barrier
        consent.record_notice(db, STUDENT, latest.id)
        assert not granted(db)
        consent.record_choice(db, STUDENT, "research", "given", document_id=latest.id)
        db.commit()
        assert granted(db)


def test_locale_and_future_documents_are_isolated():
    with artifact_session() as db:
        purpose(db)
        doc = document(db)
        consent.record_choice(db, STUDENT, "research", "given", document_id=doc.id)
        document(db, version="2.0.0", day=2, new=True, locale="en")
        future = document(db, version="3.0.0", day=20, new=True)
        assert granted(db)
        assert [d.id for d in consent.current_documents(db, "it")] == [doc.id]
        with pytest.raises(PolicyBlocked):
            consent.record_notice(db, STUDENT, future.id)
        with pytest.raises(PolicyBlocked):
            document(db)  # append-only publication


def test_wrong_document_kind_and_non_consent_purpose_rejected():
    with artifact_session() as db:
        p = purpose(db, basis="public_task", required=False)
        wrong = document(db, "notice_ai")
        right = document(db)
        with pytest.raises(PolicyBlocked):
            consent.record_choice(db, STUDENT, "research", "given", document_id=wrong.id)
        with pytest.raises(PolicyBlocked):
            consent.record_choice(db, STUDENT, "research", "given", document_id=right.id)
        p.legal_basis = "consent"
        consent.record_choice(db, STUDENT, "research", "given", document_id=right.id)
        assert granted(db)


def test_choice_expiration_and_immediate_withdrawal_even_if_disabled():
    with artifact_session() as db:
        p = purpose(db)
        doc = document(db)
        deadline = datetime.now(timezone.utc) + timedelta(hours=1)
        consent.record_choice(db, STUDENT, "research", "given", document_id=doc.id, valid_until=deadline)
        assert granted(db)
        with patch.object(consent, "now", return_value=deadline + timedelta(seconds=1)):
            assert not granted(db)
        p.active, p.legal_basis = False, "undefined"
        consent.record_choice(db, STUDENT, "research", "withdrawn")
        db.commit()
        assert not granted(db)


def test_notebook_grant_coexists_with_institutional_and_revokes_immediately():
    with artifact_session() as db:
        doc, group = sharing(db)
        assert not notebook_access(db, group)
        event = choose_share(db, doc, group)
        db.commit()
        assert notebook_access(db, group)
        grant = db.query(models.TeacherStudentGrant).filter_by(basis="consent").one()
        assert grant.categories == ["notebook"] and grant.consent_event_id == event.id
        choose_share(db, doc, group, "withdrawn")
        db.commit()
        assert not notebook_access(db, group)
        assert db.query(models.TeacherStudentGrant).filter_by(basis="institutional_assignment").one().revoked_at is None
        assert authz.authorize_data_access(TEACHER, "read_clear", ResourceRef(
            "result", STUDENT.username, owner_group=str(group.id)), "teaching", db=db).allowed
        authz.sync_grants_for_membership(db, group.id, STUDENT.username)
        authz.sync_grants_for_share(db, group.id, TEACHER.username)
        assert not notebook_access(db, group)  # membership sync cannot resurrect consent


def test_notebook_barrier_applies_to_existing_grant_on_every_read():
    with artifact_session() as db:
        doc, group = sharing(db)
        choose_share(db, doc, group)
        db.commit()
        assert notebook_access(db, group)
        latest = document(db, "consent_sharing", "2.0.0", new=True, day=1)
        assert not notebook_access(db, group)
        choose_share(db, latest, group)
        db.commit()
        assert notebook_access(db, group)


def test_notebook_sharing_is_scoped_to_authorized_teacher_and_group():
    with artifact_session() as db:
        doc, group = sharing(db)
        outsider = Principal("prof.other", PrivacyRole.TEACHER, "local", "local")
        with pytest.raises(consent.AccessDenied):
            consent.record_choice(db, STUDENT, "teacher_sharing", "given", document_id=doc.id,
                                  teacher_username=outsider.username, group_id=group.id)
        choose_share(db, doc, group)
        db.commit()
        assert not notebook_access(db, group, outsider)
        # A co-teacher's independent consent is not revoked with the owner's.
        db.add(models.GroupShare(group_id=group.id, shared_with_username=outsider.username,
                                 granted_by_username=TEACHER.username))
        db.flush()
        consent.record_choice(db, STUDENT, "teacher_sharing", "given", document_id=doc.id,
                              teacher_username=outsider.username, group_id=group.id)
        choose_share(db, doc, group, "refused")
        db.commit()
        assert not notebook_access(db, group)
        assert notebook_access(db, group, outsider)
        authz.revoke_grants_for_membership(db, group.id, STUDENT.username, STUDENT.username)
        db.flush()
        assert not notebook_access(db, group, outsider)


def test_audit_failure_denies_new_consent_without_creating_grant(monkeypatch):
    with artifact_session() as db:
        doc, group = sharing(db)
        monkeypatch.setattr(events, "record_privacy_event", lambda *a, **kw: (_ for _ in ()).throw(AuditUnavailable()))
        with client_for(db) as client:
            response = client.post("/privacy/choices/teacher_sharing", json={
                "document_id": doc.id, "granted": True, "teacher_username": TEACHER.username, "group_id": group.id})
            assert response.status_code == 503
        assert not notebook_access(db, group)
        assert db.query(models.TeacherStudentGrant).filter_by(basis="consent").count() == 0


def test_atomic_rollback_covers_event_and_grant():
    with artifact_session() as db:
        doc, group = sharing(db)
        choose_share(db, doc, group)
        db.rollback()
        assert not notebook_access(db, group)
        assert db.query(models.PrivacyEventRecord).count() == 0


def test_api_current_documents_choices_withdrawal_and_no_client_text():
    with artifact_session() as db:
        purpose(db)
        doc = document(db)
        db.commit()
        with client_for(db) as client:
            assert client.get("/privacy/documents").json()["validation_status"] == "[DA VALIDARE]"
            assert client.get("/privacy/documents?locale=en").json()["documents"] == []
            assert client.get("/privacy/purposes").json()["purposes"][0]["key"] == "research"
            assert client.post("/privacy/notices", json={"document_id": doc.id}).status_code == 200
            assert client.post("/privacy/choices/research", json={"document_id": doc.id, "granted": "true"}).status_code == 422
            assert client.post("/privacy/choices/research", json={
                "document_id": doc.id, "granted": True, "notes": "sensitive free text"}).status_code == 422
            assert client.post("/privacy/choices/research", json={"document_id": doc.id, "granted": True}).status_code == 200
            assert client.get("/privacy/choices").json()["choices"][0]["granted"] is True
            assert client.post("/privacy/choices/research/revoke", json={}).status_code == 200
            assert client.get("/privacy/choices").json()["choices"][0]["granted"] is False
        for event in db.query(models.PrivacyEventRecord).all():
            assert event.subject_pid != STUDENT.username
            assert "sensitive" not in str(event.__dict__)
            assert all(type(n) is int for n in (event.categories_count or {}).values())


def test_anonymous_writes_rejected_and_history_is_self_only():
    with artifact_session() as db:
        purpose(db)
        doc = document(db)
        consent.record_choice(db, STUDENT, "research", "given", document_id=doc.id)
        db.commit()
        with client_for(db) as client:
            client.app.dependency_overrides[auth.get_identity] = lambda: {"username": "other.student", "authenticated": True}
            assert client.get("/privacy/choices").json() == {"choices": [], "history": []}
            client.app.dependency_overrides.pop(auth.get_identity)
            assert client.post("/privacy/notices", json={"document_id": doc.id}).status_code == 401


def test_legacy_feedback_event_contains_no_payload_and_does_not_authorize_p9():
    with artifact_session() as db:
        with client_for(db) as client:
            response = client.post("/survey", json={"feedback_aperto": "Private medical text", "eta": "30"})
            assert response.status_code == 200
        event = db.query(models.PrivacyEventRecord).one()
        assert event.event_type == "consent_given" and event.purpose == "survey_feedback"
        assert event.document_version is None and event.target == "legacy_client"
        assert "Private medical text" not in str(event.__dict__)
        assert not consent.has_consent(db, event.subject_pid, "survey_feedback")


@pytest.mark.parametrize("choice", [True, False, "injected free text", None])
def test_legacy_administration_records_only_boolean_choices(choice, monkeypatch):
    with artifact_session() as db:
        monkeypatch.setattr(survey.scoring_service, "compute_profile", lambda *a: {"instrument": "QSA"})
        monkeypatch.setattr(survey.scoring_service, "mapped_stanine_scores", lambda *a: {})
        with client_for(db) as client:
            response = client.post("/instruments/QSA/score", json={
                "session_id": "p9-session", "locale": "it", "answers": {}, "save": True,
                "save_validation": True, "response_metadata": {"consent": choice, "notes": "Private free text"},
            })
            assert response.status_code == 200
        records = db.query(models.PrivacyEventRecord).all()
        assert len(records) == int(type(choice) is bool)
        if records:
            assert records[0].event_type == ("consent_given" if choice else "consent_refused")
            assert records[0].document_kind is None
            assert "Private free text" not in str(records[0].__dict__)


def test_p6_default_resolver_uses_p9_policy(monkeypatch):
    with artifact_session() as db:
        purpose(db)
        doc = document(db)
        consent.record_choice(db, STUDENT, "research", "given", document_id=doc.id)
        db.commit()
        from contextlib import nullcontext
        monkeypatch.setattr(database, "SessionLocal", lambda: nullcontext(db))
        policy, accepted = consent.resolve_context_policy(context())
        assert policy.legal_basis.value == "consent" and accepted


def test_revocation_commit_failure_rolls_back_choice_and_grant():
    from sqlalchemy.exc import SQLAlchemyError
    with artifact_session() as db:
        doc, group = sharing(db)
        choose_share(db, doc, group)
        db.commit()
        group_id = group.id
        with client_for(db) as client, patch.object(db, "commit", side_effect=SQLAlchemyError("synthetic failure")):
            response = client.post("/privacy/choices/teacher_sharing/revoke", json={
                "teacher_username": TEACHER.username, "group_id": group_id})
            assert response.status_code == 503
        assert notebook_access(db, group)
        assert db.query(models.PrivacyEventRecord).filter_by(event_type="consent_withdrawn").count() == 0


def test_privacy_choices_use_original_identity_even_with_view_as(monkeypatch):
    with artifact_session() as db:
        purpose(db)
        doc = document(db)
        db.commit()
        with client_for(db) as client:
            monkeypatch.setattr(auth, "_apply_view_as", lambda *a: {"username": "impersonated.student", "authenticated": True})
            response = client.post("/privacy/choices/research", json={"document_id": doc.id, "granted": True},
                                   headers={"X-View-As": "student"})
            assert response.status_code == 200
        event = db.query(models.PrivacyEventRecord).one()
        assert event.subject_pid == authz.safe_subject_pid(db, STUDENT.username)


def test_consent_only_grant_does_not_prevent_independent_membership_backfill():
    with artifact_session() as db:
        purpose(db, "teacher_sharing", "consent_sharing")
        doc = document(db, "consent_sharing")
        group = models.StudentGroup(code="P9-LEGACY", name="Legacy", owner_username=TEACHER.username)
        db.add(group)
        db.flush()
        db.add(models.GroupMembership(group_id=group.id, username=STUDENT.username, joined_via="web"))
        db.commit()
        choose_share(db, doc, group)
        db.commit()
        assert authz.authorize_data_access(TEACHER, "read_clear", ResourceRef(
            "result", STUDENT.username, owner_group=str(group.id)), "teaching", db=db).allowed
