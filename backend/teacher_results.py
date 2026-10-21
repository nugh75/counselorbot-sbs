"""Read-only compilation detail, after class/plan authorization by the route."""
from . import models


def result_detail(db, result, lang):
    from .routes.survey import _summary_inputs, canonical_summary

    inputs = _summary_inputs(db, result, lang)
    summary, status = canonical_summary(db, **inputs)
    reading = db.query(models.ResultReading).filter_by(
        username=result.username, session_id=result.session_id,
        questionnaire_type=result.questionnaire_type,
    ).first()
    return dict(
        id=result.id, username=result.username, session_id=result.session_id,
        questionnaire_type=result.questionnaire_type, scores=result.scores,
        submitted_at=result.submitted_at,
        summary=summary, summary_status=status, conversation=inputs['messages'],
        reading=None if reading is None else dict(
            strengths=reading.strengths or [], growth_areas=reading.growth_areas or [],
            note=reading.note, updated_at=reading.updated_at,
        ),
    )
