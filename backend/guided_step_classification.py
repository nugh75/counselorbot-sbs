"""Repair the three factory introductions previously seeded with QSA ownership."""
from . import models


INTRO_OWNERS = {
    "qsar-intro": "QSAr",
    "ztpi-intro": "ZTPI",
    "savickas-intro": "SAVICKAS",
}


def repair_intro_classification(db):
    """Change only ownership of known misclassified IDs; preserve all content.

    The caller owns the transaction. Custom steps and other classifications are
    left alone, and repeating this repair performs no writes.
    """
    repaired = []
    rows = db.query(models.GuidedStep).filter(
        models.GuidedStep.id.in_(INTRO_OWNERS),
        models.GuidedStep.questionnaire_type == "QSA",
    ).all()
    for row in rows:
        row.questionnaire_type = INTRO_OWNERS[row.id]
        repaired.append(row.id)
    return repaired
