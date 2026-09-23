"""Category assignments and student visibility on isolated PostgreSQL."""
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend import auth, database, models
from backend.routes import institution_categories, orientation_referrals
from backend.tests import test_institution_teachers as membership


class AssignmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        membership.InstitutionTeacherTests.setUpClass.__func__(cls)
        for model in (models.InstitutionCategoryCollection, models.InstitutionOrientationCategory,
                      models.OrientationReferral, models.OrientationEvent,
                      models.InstitutionReferralCategory, models.InstitutionEventCategory):
            model.__table__.create(cls.engine, checkfirst=True)

    teacher = membership.InstitutionTeacherTests.teacher
    grant = membership.InstitutionTeacherTests.grant

    def setUp(self):
        membership.InstitutionTeacherTests.setUp(self)
        self.owned = []
        self.grant()
        self.teacher()
        self.client.app.include_router(institution_categories.router)
        self.client.app.include_router(orientation_referrals.router)
        self.base = f'/teacher/institutions/{self.schools[0].id}'
        self.cat = self.client.post(self.base + '/orientation-categories', json={'revision': 0, 'action': 'create', 'name': 'Risorse'}).json()['categories'][0]['id']
        self.ref = self.content('referral')
        self.event = self.content('event')

    def tearDown(self):
        self.db.rollback()
        for row in self.owned:
            self.db.delete(row)
        self.db.commit()
        membership.InstitutionTeacherTests.tearDown(self)

    def content(self, kind, **values):
        common = dict(slug=uuid.uuid4().hex, institution_id=self.schools[0].id, status='certified', is_active=True, needs=['metodo-studio'], audience=['secondaria'])
        common.update(values)
        if kind == 'referral':
            row = models.OrientationReferral(role_label_i18n={'it': 'Sportello', 'en': 'Help desk'}, contact_channel={'email': 'office@example.test'}, **common)
        else:
            now = datetime.now(timezone.utc)
            row = models.OrientationEvent(title_i18n={'it': 'Laboratorio'}, starts_at=now + timedelta(days=1), ends_at=now + timedelta(days=2), **common)
        self.db.add(row)
        self.db.commit()
        self.owned.append(row)
        return row

    def snapshot(self):
        response = self.client.get(self.base + '/orientation-contents')
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def assign(self, row=None, ids=None, revision=None, **extra):
        row = row or self.ref
        kind = 'event' if isinstance(row, models.OrientationEvent) else 'referral'
        payload = {'revision': self.snapshot()['revision'] if revision is None else revision,
                   'category_ids': [self.cat] if ids is None else ids,
                   'content_updated_at': row.updated_at.isoformat(), **extra}
        return self.client.post(f'{self.base}/orientation-contents/{kind}/{row.id}/categories', json=payload)

    def directory(self, ids=None):
        ids = ids if ids is not None else [self.schools[0].id]
        with patch.object(orientation_referrals, 'institution_ids_for', return_value=ids), patch.object(orientation_referrals, 'institution_for', return_value=self.db.get(models.Institution, ids[0]) if ids else None), patch.object(orientation_referrals, 'resolve_audience_band', return_value='secondaria'):
            response = self.client.get('/orientation-directory?lang=it')
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_multiple_assignment_removal_and_public_labels(self):
        second = self.client.post(self.base + '/orientation-categories', json={'revision': 1, 'action': 'create', 'name': 'Esperienze'}).json()['categories'][1]['id']
        for row in (self.ref, self.event):
            self.assertEqual(self.assign(row, [self.cat, second]).status_code, 200)
        group = self.directory()['institution_groups'][0]
        self.assertEqual([x['name'] for x in group['categories']], ['Risorse', 'Esperienze'])
        self.assertEqual(group['events'][0]['category_ids'], [self.cat, second])
        self.assertEqual(self.assign(ids=[]).status_code, 200)
        self.assertEqual(self.directory()['institution_groups'][0]['referrals'][0]['category_ids'], [])
        link = self.db.query(models.InstitutionEventCategory).first()
        self.assertEqual(link.updated_by, 'teacher-test')
        self.assertTrue(link.updated_at)

    def test_archive_preserves_links_through_other_saves_and_restore(self):
        self.assign()
        self.client.post(self.base + '/orientation-categories', json={'revision': 2, 'action': 'archive', 'category_id': self.cat})
        self.assertEqual(self.directory()['institution_groups'][0]['categories'], [])
        self.assertEqual(self.assign(ids=[]).status_code, 200)
        self.assertEqual(self.db.query(models.InstitutionReferralCategory).filter_by(content_id=self.ref.id).count(), 1)
        self.assertEqual(self.assign().status_code, 409)
        self.client.post(self.base + '/orientation-categories', json={'revision': 4, 'action': 'restore', 'category_id': self.cat})
        self.assertEqual(self.directory()['institution_groups'][0]['referrals'][0]['category_ids'], [self.cat])

    def test_foreign_categories_and_contents_and_national_are_rejected(self):
        foreign = self.content('referral', institution_id=self.schools[1].id)
        national = self.content('referral', institution_id=None)
        for row in (foreign, national):
            self.assertEqual(self.assign(row).status_code, 404)
        category = models.InstitutionOrientationCategory(id=str(uuid.uuid4()), institution_id=self.schools[1].id, name='Altro', normalized_name='altro', position=0, is_active=True, updated_by='test')
        self.db.add(category); self.db.commit()
        self.assertEqual(self.assign(ids=[category.id]).status_code, 409)
        self.assertEqual(self.snapshot()['revision'], 1)

    def test_stale_revision_and_administrative_edit_keep_assignments(self):
        old_date = self.ref.updated_at.isoformat()
        self.assign()
        self.assertEqual(self.assign(ids=[], revision=1).status_code, 409)
        self.ref.person_name = 'Changed'; self.db.commit()
        self.assertEqual(self.assign(ids=[], content_updated_at=old_date).status_code, 409)
        self.assertEqual(self.snapshot()['revision'], 2)

    def test_revoked_and_wrong_roles_and_inactive_institution(self):
        for groups in (['studenti'], ['researchers'], ['admins']):
            self.teacher(groups=groups)
            self.assertEqual(self.assign(revision=1).status_code, 403)
            self.assertEqual(self.client.get(self.base + '/orientation-contents').status_code, 403)
        self.teacher('outsider')
        self.assertEqual(self.assign(revision=1).status_code, 403)
        self.teacher()
        grant = self.db.query(models.InstitutionTeacher).filter_by(institution_id=self.schools[0].id).one()
        grant.is_active = False; self.db.commit()
        self.assertEqual(self.assign(revision=1).status_code, 403)
        grant.is_active = True; self.schools[0].is_active = False; self.db.commit()
        self.assertEqual(self.assign(revision=1).status_code, 403)

    def test_drafts_inactive_and_expired_contents_not_assignable(self):
        draft = self.content('referral', status='draft')
        inactive = self.content('referral', is_active=False)
        self.event.ends_at = datetime.now(timezone.utc) - timedelta(days=1); self.db.commit()
        self.assertEqual(len(self.snapshot()['contents']), 1)
        for row in (draft, inactive, self.event):
            self.assertEqual(self.assign(row).status_code, 404)

    def test_moved_content_never_carries_another_institutions_labels(self):
        self.assign()
        self.ref.institution_id = self.schools[1].id; self.db.commit()
        self.assertEqual(self.assign().status_code, 404)
        groups = self.directory([school.id for school in self.schools])['institution_groups']
        self.assertEqual(groups[0]['referrals'], [])
        self.assertEqual(groups[1]['referrals'][0]['category_ids'], [])
        self.assertEqual(groups[1]['categories'], [])

    def test_only_visible_content_produces_student_filters_and_national_is_unlabelled(self):
        self.assign()
        self.ref.audience = ['adulti']; self.db.commit()
        national = self.content('referral', institution_id=None)
        directory = self.directory()
        self.assertEqual(directory['institution_groups'][0]['categories'], [])
        self.assertEqual(directory['institution_groups'][0]['referrals'], [])
        self.assertIn(national.slug, [item['id'] for item in directory['referrals']])
        self.assertEqual(self.directory([])['institution_groups'], [])

    def test_unknown_and_duplicate_ids_and_extra_fields_are_rejected(self):
        self.assertEqual(self.assign(ids=['nonexistent']).status_code, 409)
        self.assertEqual(self.assign(ids=[self.cat, self.cat]).status_code, 422)
        self.assertEqual(self.assign(status='certified').status_code, 422)
        self.assertEqual(self.snapshot()['revision'], 1)

    def test_renaming_and_homonymous_categories_remain_scoped(self):
        self.assign()
        self.client.post(self.base + '/orientation-categories', json={'revision': 2, 'action': 'edit', 'category_id': self.cat, 'name': 'Esperienze'})
        foreign = self.content('referral', institution_id=self.schools[1].id)
        category = models.InstitutionOrientationCategory(id=str(uuid.uuid4()), institution_id=self.schools[1].id, name='Esperienze', normalized_name='esperienze', position=0, is_active=True, updated_by='test')
        self.db.add(category); self.db.flush()
        self.db.add(models.InstitutionReferralCategory(category_id=category.id, content_id=foreign.id, updated_by='test')); self.db.commit()
        groups = self.directory([school.id for school in self.schools])['institution_groups']
        self.assertEqual([group['categories'][0]['name'] for group in groups], ['Esperienze', 'Esperienze'])
        self.assertEqual(groups[0]['referrals'][0]['category_ids'], [self.cat])
        self.assertEqual(groups[1]['referrals'][0]['category_ids'], [category.id])

    def test_concurrent_assignments_have_one_winner(self):
        app = FastAPI(); app.include_router(institution_categories.router)
        identity = dict(self.identity)
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        def db_session():
            with self.Session() as db:
                yield db
        app.dependency_overrides[database.get_db] = db_session
        url = f'{self.base}/orientation-contents/referral/{self.ref.id}/categories'
        stamp = self.ref.updated_at.isoformat()
        def save(ids):
            with TestClient(app) as client:
                return client.post(url, json={'revision': 1, 'category_ids': ids, 'content_updated_at': stamp}).status_code
        with ThreadPoolExecutor(max_workers=2) as workers:
            self.assertEqual(sorted(workers.map(save, [[self.cat], []])), [200, 409])


if __name__ == '__main__':
    unittest.main(verbosity=2)
