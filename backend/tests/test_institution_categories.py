"""Institution category commands on isolated PostgreSQL with real API guards."""
import unittest
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI
from fastapi.testclient import TestClient
from backend import auth, database, models
from backend.routes import institution_categories
from backend.tests import test_institution_teachers as membership


class CategoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        membership.InstitutionTeacherTests.setUpClass.__func__(cls)
        for model in (models.InstitutionCategoryCollection, models.InstitutionOrientationCategory):
            model.__table__.create(cls.engine, checkfirst=True)

    setUp = membership.InstitutionTeacherTests.setUp
    tearDown = membership.InstitutionTeacherTests.tearDown
    teacher = membership.InstitutionTeacherTests.teacher
    grant = membership.InstitutionTeacherTests.grant

    def start(self):
        self.grant()
        self.teacher()
        self.client.app.include_router(institution_categories.router)
        self.url = f'/teacher/institutions/{self.schools[0].id}/orientation-categories'

    def command(self, action, revision, **fields):
        return self.client.post(self.url, json={"action": action, "revision": revision, **fields})

    def create(self, name="Metodo di studio", revision=0):
        result = self.command("create", revision, name=name, description="Descrizione condivisa")
        self.assertEqual(result.status_code, 200, result.text)
        return result.json()

    def test_empty_read_does_not_create_collection(self):
        self.start()
        self.assertEqual(self.client.get(self.url).json(), {"revision": 0, "categories": []})
        self.assertIsNone(self.db.get(models.InstitutionCategoryCollection, self.schools[0].id))

    def test_create_edit_archive_restore_keeps_identity(self):
        self.start()
        first = self.create()
        category = first['categories'][0]['id']
        result = self.command('edit', 1, category_id=category, name='Le nostre risorse', description='Riflessione')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['categories'][0]['name'], 'Le nostre risorse')
        self.assertEqual(result.json()['categories'][0]['updated_by'], 'teacher-test')
        self.assertTrue(result.json()['categories'][0]['updated_at'])
        self.assertEqual(self.command('archive', 2, category_id=category).status_code, 200)
        self.assertEqual(self.command('edit', 3, category_id=category, name='Altro').status_code, 409)
        restored = self.command('restore', 3, category_id=category).json()
        self.assertEqual(restored['revision'], 4)
        self.assertEqual(restored['categories'][0]['id'], category)
        self.assertTrue(restored['categories'][0]['is_active'])

    def test_duplicates_include_archived_and_ignore_case_and_outer_spaces(self):
        self.start()
        category = self.create()['categories'][0]['id']
        duplicate = self.command('create', 1, name=' METODO DI STUDIO ')
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(duplicate.json()['detail']['code'], 'duplicate')
        self.command('archive', 1, category_id=category)
        self.assertEqual(self.command('create', 2, name='metodo di studio').status_code, 409)
        self.assertEqual(self.client.get(self.url).json()['revision'], 2)

    def test_stale_revision_does_not_overwrite_another_teacher(self):
        self.start()
        category = self.create()['categories'][0]['id']
        result = self.command('edit', 0, category_id=category, name='Modifica obsoleta')
        self.assertEqual(result.status_code, 409)
        self.assertEqual(result.json()['detail']['code'], 'conflict')
        self.assertEqual(self.client.get(self.url).json()['categories'][0]['name'], 'Metodo di studio')

    def test_order_boundaries_and_restore_to_end(self):
        self.start()
        a = self.create('A')['categories'][0]['id']
        second = self.create('B', 1)
        b = second['categories'][1]['id']
        moved = self.command('move_up', 2, category_id=b).json()
        self.assertEqual([row['id'] for row in moved['categories']], [b, a])
        self.assertEqual(self.command('move_up', 3, category_id=b).status_code, 409)
        self.assertEqual(self.command('archive', 3, category_id=b).status_code, 200)
        result = self.command('restore', 4, category_id=b).json()
        self.assertEqual([row['id'] for row in result['categories']], [a, b])
        self.assertEqual([row['position'] for row in result['categories']], [0, 1])

    def test_another_institution_cannot_supply_a_category_id(self):
        self.start()
        category = self.create()['categories'][0]['id']
        self.db.add(models.InstitutionTeacher(institution_id=self.schools[1].id, username='teacher-test', is_active=True, created_by='admin', updated_by='admin'))
        self.db.commit()
        self.url = f'/teacher/institutions/{self.schools[1].id}/orientation-categories'
        self.assertEqual(self.command('archive', 0, category_id=category).status_code, 404)
        self.assertEqual(self.client.get(self.url).json(), {'revision': 0, 'categories': []})

    def test_second_associated_teacher_shares_the_same_categories(self):
        self.start()
        self.create()
        self.db.add(models.InstitutionTeacher(institution_id=self.schools[0].id, username='second-teacher', is_active=True, created_by='admin', updated_by='admin'))
        self.db.commit()
        self.teacher('second-teacher')
        self.assertEqual(self.client.get(self.url).json()['revision'], 1)
        self.create('Altra categoria', 1)
        self.teacher()
        self.assertEqual(len(self.client.get(self.url).json()['categories']), 2)

    def test_revocation_after_page_load_blocks_next_write(self):
        self.start()
        self.create()
        row = self.db.query(models.InstitutionTeacher).filter_by(institution_id=self.schools[0].id).one()
        row.is_active = False
        self.db.commit()
        self.assertEqual(self.command('create', 1, name='Nuova').status_code, 403)
        self.assertEqual(self.client.get(self.url).status_code, 403)

    def test_inactive_institution_and_wrong_roles_cannot_read_or_write(self):
        self.start()
        for groups in (['studenti'], ['researchers'], ['admins']):
            self.teacher(groups=groups)
            self.assertEqual(self.client.get(self.url).status_code, 403)
            self.assertEqual(self.command('create', 0, name='Nuova').status_code, 403)
        self.teacher('outsider')
        self.assertEqual(self.client.get(self.url).status_code, 403)
        self.teacher()
        self.schools[0].is_active = False
        self.db.commit()
        self.assertEqual(self.command('create', 0, name='Nuova').status_code, 403)

    def test_invalid_commands_do_not_change_revision(self):
        self.start()
        for data in ({'action': 'create', 'name': ' '}, {'action': 'edit'}, {'action': 'drop'}, {'action': 'create', 'name': 'x'*121}, {'action': 'create', 'name': 'A', 'description': 'x'*2001}):
            self.assertEqual(self.client.post(self.url, json={'revision': 0, **data}).status_code, 422)
        self.assertEqual(self.client.get(self.url).json()['revision'], 0)

    def test_concurrent_first_and_existing_writes_have_one_winner(self):
        self.start()
        identity = dict(self.identity)
        app = FastAPI()
        app.include_router(institution_categories.router)
        app.dependency_overrides[auth.get_current_user] = lambda: identity
        def db_session():
            with self.Session() as db:
                yield db
        app.dependency_overrides[database.get_db] = db_session
        def create(name):
            with TestClient(app) as client:
                return client.post(self.url, json={'revision': revision, 'action': 'create', 'name': name}).status_code
        for revision in (0, 1):
            with ThreadPoolExecutor(max_workers=2) as workers:
                statuses = list(workers.map(create, [f'A-{revision}', f'B-{revision}']))
            self.assertEqual(sorted(statuses), [200, 409])
            self.db.expire_all()
            self.assertEqual(self.client.get(self.url).json()['revision'], revision + 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
