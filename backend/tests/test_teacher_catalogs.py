"""Real HTTP authorization and publication, with an isolated in-memory database."""
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend import auth, database, models
from backend.certified_reading_service import certified_reading_memory
from backend.certified_strategy_service import certified_strategy_memory
from backend.content_version_service import get_version
from backend.routes import admin, certified_readings, certified_strategies


@pytest.fixture
def setup():
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    tables = [models.Instrument.__table__, models.Factor.__table__, models.CertifiedStrategy.__table__,
              models.CertifiedReading.__table__, models.ContentLanguageVersion.__table__]
    database.Base.metadata.create_all(engine, tables=tables)
    sessions = sessionmaker(bind=engine)
    identity = dict(username='teacher.test', groups=['docenti'], authenticated=True,
                    is_admin=False, is_researcher=False)

    def get_db():
        with sessions() as db:
            yield db

    app = FastAPI()
    app.include_router(admin.router)
    app.include_router(certified_readings.router)
    app.include_router(certified_strategies.router)
    app.dependency_overrides[database.get_db] = get_db
    # Keep the actual authentication and role dependencies in the request path.
    app.dependency_overrides[auth.get_identity] = lambda: dict(identity)
    with TestClient(app) as client, sessions() as db:
        yield client, db, identity
    engine.dispose()


def reading_payload(status='certified'):
    return dict(slug='teacher-film', kind='film', title='Film del docente',
                themes=['metodo-di-studio'], why_i18n={'it': 'Per riflettere sul metodo di studio.'},
                summary_i18n={'it': 'Una storia di apprendimento.'}, status=status, is_active=True)


def strategy_payload(status='certified'):
    return dict(slug='teacher-strategy', name_i18n={'it': 'Ripasso distribuito'},
                description_i18n={'it': 'Ripassa in più giornate.'},
                recommended_when_i18n={'it': 'Quando prepari una verifica.'},
                questionnaire_types=['QSA'], factor_codes=['C1'], status=status, is_active=True)


@pytest.mark.parametrize('kind,payload', [('readings', reading_payload), ('strategies', strategy_payload)])
@pytest.mark.parametrize('initial_status', ['draft', 'certified'])
def test_teacher_publishes_without_admin_and_content_reaches_recommendations(setup, kind, payload, initial_status):
    client, db, _ = setup
    response = client.post(f'/admin/certified-{kind}', json=payload(initial_status))
    assert response.status_code == 200, response.text
    row = response.json()
    content_type = 'certified_reading' if kind == 'readings' else 'certified_strategy'
    if initial_status == 'draft':
        assert get_version(db, content_type, row['slug'], 'it').status != 'certified'
        response = client.put(f'/admin/certified-{kind}/{row["id"]}', json={'status': 'certified'})
        assert response.status_code == 200, response.text
    db.expire_all()
    version = get_version(db, content_type, row['slug'], 'it')
    assert version.status == 'certified'
    assert version.approved_by == 'teacher.test'
    if kind == 'readings':
        results = certified_reading_memory.retrieve(db, themes={'metodo-di-studio'}, language='it')
    else:
        results = certified_strategy_memory.retrieve(db, questionnaire_type='QSA', query='C1', language='it')
    assert [result['id'] for result in results] == [row['slug']]
    assert client.get(f'/admin/certified-{kind}').json()[0]['id'] == row['id']
    assert client.delete(f'/admin/certified-{kind}/{row["id"]}').status_code == 200


def test_teacher_can_read_taxonomies_but_cannot_edit_psychometric_instruments(setup):
    client, db, _ = setup
    db.add(models.Instrument(code='QSA', name_it='QSA'))
    db.add(models.Factor(instrument_code='QSA', code='C1', label_it='Elaborazione', sort_order=0))
    db.commit()
    assert client.get('/admin/instruments').json()[0]['code'] == 'QSA'
    assert client.get('/admin/instruments/QSA/factors').json()[0]['code'] == 'C1'
    assert client.get('/admin/reading-themes').status_code == 200
    assert client.put('/admin/instruments/QSA', json={'name_it': 'Changed'}).status_code == 403
    assert client.get('/admin/config').status_code == 403
    db.expire_all()
    assert db.query(models.Instrument).first().name_it == 'QSA'


def test_teacher_language_permissions_stay_within_catalogs(setup):
    client, db, _ = setup
    payload = strategy_payload('draft')
    payload['description_i18n']['fr'] = 'Révisez sur plusieurs jours.'
    payload['name_i18n']['fr'] = 'Révision espacée'
    payload['recommended_when_i18n']['fr'] = 'Avant un examen.'
    row = client.post('/admin/certified-strategies', json=payload).json()
    db.add(models.ContentLanguageVersion(content_type='instrument', content_key='QSA', locale='it', status='pilot'))
    db.add(models.ContentLanguageVersion(content_type='assistant_question', content_key='question', locale='it', status='translated'))
    db.commit()
    assert set(client.get('/admin/content-versions/ladders').json()) == {'certified_strategy', 'certified_reading'}
    listed = client.get('/admin/content-versions').json()
    assert {v['content_type'] for v in listed} == {'certified_strategy'}
    assert client.get('/admin/content-versions?content_type=instrument').json() == []
    for typ, key, target in [('instrument', 'QSA', 'validated'), ('assistant_question', 'question', 'certified')]:
        version = get_version(db, typ, key, 'it')
        assert client.post(f'/admin/content-versions/{version.id}/promote', json={'target_status': target}).status_code == 403
    assert client.put(f'/admin/certified-strategies/{row["id"]}', json={'status': 'certified'}).status_code == 200
    db.expire_all()
    french = get_version(db, 'certified_strategy', row['slug'], 'fr')
    assert french.status == 'translated', 'publishing the source does not approve translations automatically'
    assert client.post(f'/admin/content-versions/{french.id}/promote', json={'target_status': 'certified'}).status_code == 200
    db.expire_all()
    assert french.status == 'certified' and french.approved_by == 'teacher.test'


@pytest.mark.parametrize('authenticated,expected', [(True, 403), (False, 401)])
def test_students_and_anonymous_cannot_use_catalog_editor_apis(setup, authenticated, expected):
    client, _, identity = setup
    identity.update(groups=['studenti'], authenticated=authenticated)
    for kind, payload in [('readings', reading_payload()), ('strategies', strategy_payload())]:
        assert client.get(f'/admin/certified-{kind}').status_code == expected
        assert client.post(f'/admin/certified-{kind}', json=payload).status_code == expected
        assert client.put(f'/admin/certified-{kind}/1', json={'status': 'certified'}).status_code == expected
        assert client.delete(f'/admin/certified-{kind}/1').status_code == expected
    for path in ('/admin/instruments', '/admin/instruments/QSA/factors', '/admin/reading-themes', '/admin/content-versions', '/admin/content-versions/ladders'):
        assert client.get(path).status_code == expected
    for path in ('/admin/certified-readings/1/verify', '/admin/certified-readings/1/synopsis-draft', '/admin/certified-strategies/1/translate'):
        assert client.post(path).status_code == expected
    assert client.post('/admin/content-versions/1/promote', json={'target_status': 'certified'}).status_code == expected


@pytest.mark.parametrize('role', ['admin', 'researcher'])
def test_existing_editors_keep_access_to_other_content_versions(setup, role):
    client, db, identity = setup
    identity.update(groups=[], is_admin=role == 'admin', is_researcher=role == 'researcher')
    db.add(models.ContentLanguageVersion(content_type='instrument', content_key='QSA', locale='it', status='pilot'))
    db.commit()
    assert 'instrument' in client.get('/admin/content-versions/ladders').json()
    row = client.get('/admin/content-versions?content_type=instrument').json()[0]
    assert client.post(f'/admin/content-versions/{row["id"]}/promote', json={'target_status': 'validated'}).status_code == 200


def test_reading_publication_still_requires_educational_context(setup):
    client, _, _ = setup
    payload = reading_payload()
    payload['themes'] = []
    response = client.post('/admin/certified-readings', json=payload)
    assert response.status_code == 400
    assert client.get('/admin/certified-readings').json() == []


def test_teacher_can_use_catalog_helpers(setup, monkeypatch):
    client, _, _ = setup
    reading = client.post('/admin/certified-readings', json=reading_payload()).json()
    # Films are verified manually; this path never calls an external service.
    response = client.post(f'/admin/certified-readings/{reading["id"]}/verify')
    assert response.status_code == 200, response.text
    assert response.json()['verification']['source'] == 'manual'
    strategy = client.post('/admin/certified-strategies', json=strategy_payload()).json()
    monkeypatch.setattr(certified_strategies, 'translate_strategies', lambda *args, **kwargs: ['fr'])
    assert client.post(f'/admin/certified-strategies/{strategy["id"]}/translate').status_code == 200
