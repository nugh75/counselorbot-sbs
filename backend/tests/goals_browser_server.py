"""Opt-in browser fixture, isolated in a rolled-back counselorbot_test schema.
Run only as a module; no production app import, models, credentials or AI calls.
"""
import os
import asyncio
from fastapi import FastAPI, Request
import uvicorn
from backend import auth, database, models
from backend.goals import seed_goals
from backend.routes.goals import router
from backend.routes.visual_tools import router as visual_router
from backend.tests.artifact_database import artifact_session


def main():
    with artifact_session() as db:
        group = models.StudentGroup(name='Gruppo di prova', code='GR-GOALBROWSER', owner_username='teacher-browser', is_active=True)
        db.add(group); db.flush()
        for username in ['student-browser', 'student-mobile', 'student-en', 'student-es', 'student-fr', 'student-de', 'student-sv', 'student-network', 'student-timeline']:
            db.add(models.GroupMembership(group_id=group.id, username=username))
            db.add(models.PortfolioItem(username=username, title='Il mio elaborato'))
            db.add(models.StudentBooklet(username=username, questionnaire_type='QSA', data={'title': 'La mia riflessione'}))
        db.commit(); seed_goals(db)
        app = FastAPI(); app.include_router(router); app.include_router(visual_router)
        # One shared session backs every request: serialize them, or concurrent
        # page loads race on the same transaction (duplicate keys, PendingRollback).
        lock = asyncio.Lock()
        @app.middleware('http')
        async def serialize(request, call_next):
            async with lock:
                return await call_next(request)
        def identity(request: Request):
            username = request.headers.get('x-test-user', 'student-browser')
            return dict(username=username, is_admin=username == 'admin-browser', authenticated=True,
                        groups=['docenti'] if username == 'teacher-browser' else ['studenti'])
        app.dependency_overrides[database.get_db] = lambda: db
        app.dependency_overrides[auth.get_current_user] = identity
        @app.get('/fixture/groups')
        def groups():
            return [dict(id=group.id, name=group.name, code=group.code, is_active=True, members_count=7, shares_count=0)]
        uvicorn.run(app, host=os.getenv('GOALS_TEST_HOST', '0.0.0.0'), port=int(os.getenv('GOALS_TEST_PORT', '8096')), log_level='warning')


if __name__ == '__main__':
    main()
