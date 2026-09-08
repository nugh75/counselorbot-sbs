"""Isolated real API for the opt-in TIMELINE_LIVE browser test.

Run with DATABASE_URL configured and stop with Ctrl-C to roll back the test schema.
The fixed identity and loopback listener are for this test process only.
"""
from fastapi import FastAPI
import uvicorn

from backend import auth, database, models
from backend.routes.portfolio import router as portfolio_router
from backend.routes.visual_tools import router
from backend.tests.artifact_database import artifact_session


def main():
    with artifact_session() as db:
        db.add(models.QuestionnaireResult(session_id='fixture', username='fixture', questionnaire_type='QSA'))
        db.add(models.PortfolioItem(username='fixture', title='Slide del progetto',
                                    description='Un lavoro di prova', images=[]))
        db.commit()
        app = FastAPI()
        app.include_router(router)
        app.include_router(portfolio_router)
        app.dependency_overrides[database.get_db] = lambda: db
        identity = lambda: {'username': 'fixture', 'is_admin': False}
        app.dependency_overrides[auth.get_identity_view_as] = identity
        app.dependency_overrides[auth.get_current_user] = identity
        uvicorn.run(app, host='127.0.0.1', port=8189, log_level='warning')


if __name__ == '__main__':
    main()
