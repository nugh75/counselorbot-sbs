"""Opt-in browser fixture: real APIs in an isolated, rolled-back PostgreSQL schema."""
import asyncio
from fastapi import FastAPI, Request
import uvicorn
from backend import auth, database, models
from backend.routes import assignments, assignment_work, goals, groups, portfolio, visual_tools, certified_strategies, certified_readings
from backend.tests.artifact_database import artifact_session


def main():
    with artifact_session() as db:
        school = models.StudentGroup(name='Classe 3B', code='GR-CLASS', owner_username='teacher')
        adults = models.StudentGroup(name='Gruppo adulti', code='GR-ADULTS', owner_username='teacher')
        empty_classes = [models.StudentGroup(name=f'Classe vuota {width}', code=f'GR-EMPTY-{width}',
                                             owner_username='teacher') for width in [1440, 390]]
        db.add_all([school, adults, *empty_classes]); db.flush()
        for group, usernames in [(school, ['alice', 'bob']), (adults, ['alice', 'eve'])]:
            for username in usernames:
                db.add(models.GroupMembership(group_id=group.id, username=username))
        db.add_all([
            models.GoalCatalogEntry(author_username='teacher', group_id=school.id, status='published',
                                    data=dict(title='Pianificare lo studio', description='Definisci un piccolo passo', language='it')),
            models.CertifiedStrategy(slug='browser-review', name_it='Ripasso distribuito', description_it='Ripassa in tre giornate', status='certified'),
            models.CertifiedReading(slug='browser-film', title='Film per riflettere', kind='film', status='certified',
                                    why_i18n={'it': 'Confronta le scelte dei protagonisti'}, where_to_find='Biblioteca'),
        ]); db.commit()
        app = FastAPI()
        for module in [assignments, assignment_work, goals, groups, portfolio, visual_tools, certified_strategies, certified_readings]:
            app.include_router(module.router)
        def identity(request: Request):
            username = request.headers.get('x-test-user', 'alice')
            return dict(username=username, name='Docente di prova' if username == 'teacher' else username,
                        authenticated=True, is_admin=False, groups=['docenti'] if username == 'teacher' else ['studenti'])
        app.dependency_overrides[auth.get_identity] = identity
        app.dependency_overrides[database.get_db] = lambda: db
        lock = asyncio.Lock()
        @app.middleware('http')
        async def serial_fixture(request, call_next):
            # The rolled-back fixture shares one connection across browser requests.
            async with lock:
                return await call_next(request)
        uvicorn.run(app, host='127.0.0.1', port=18099, log_level='warning')


if __name__ == '__main__':
    main()
