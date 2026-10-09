"""Verification that Base.metadata.create_all succeeds on SQLite without dialect errors."""
import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from backend import models


def test_base_metadata_create_all_in_memory_sqlite():
    """Verify that all models including forum tables can be created on in-memory SQLite."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    models.Base.metadata.create_all(engine)

    inspector = inspect(engine)
    tables = inspector.get_table_names()
    assert "forum_topics" in tables
    assert "forum_posts" in tables
    assert "forum_moderation_log" in tables

    with Session(bind=engine) as session:
        group = models.StudentGroup(code="TEST-SQLITE", name="Test Group", owner_username="owner")
        session.add(group)
        session.flush()

        topic = models.ForumTopic(
            group_id=group.id,
            title="Valid title",
            body="Valid body",
            author_username="student1",
            author_display_name="Student One",
        )
        session.add(topic)
        session.commit()

        # Empty title violates length(title) BETWEEN 1 AND 160
        invalid_topic = models.ForumTopic(
            group_id=group.id,
            title="",
            body="Valid body",
            author_username="student1",
            author_display_name="Student One",
        )
        session.add(invalid_topic)
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

    engine.dispose()
