"""Approval/restore on real PostgreSQL, in the existing isolated test schema."""
import os
from types import SimpleNamespace

import pytest

from backend import models
from backend.prompt_lab import approval, snapshots
from backend.tests.artifact_database import artifact_session

pytestmark = pytest.mark.skipif(not os.getenv('DATABASE_URL'), reason='requires PostgreSQL test database')


def test_receipt_and_revision_are_atomic_and_restore_preserves_later_edits():
    with artifact_session() as db:
        step = models.GuidedStep(id='lab-pg-test', label='Test', sort_order=1, questionnaire_type='QSA', system_prompt_mode='qsa-intro', prompt='Prima.')
        db.add(step)
        db.commit()
        exp = SimpleNamespace(id='lab-test-approval', purpose='improvement', target_key=step.id,
            snapshot={'baseline':'Prima.', 'source_hash':snapshots.digest(snapshots.static_data(db))},
            candidates=[{'id':'candidate-1','text':'Dopo.'}], summary={'selected_candidate_id':'candidate-1'})
        receipt = approval.decide(db, exp, action='accept', candidate_id='candidate-1', manifest_hash='a'*64, note='Technical fixture', author='test', blockers=[])
        assert db.get(models.GuidedStep,step.id).prompt == 'Dopo.'
        assert db.query(models.PromptExperimentDecision).count() == 1
        again = approval.decide(db, exp, action='accept', candidate_id='candidate-1', manifest_hash='a'*64, note='retry', author='test', blockers=[])
        assert again.id == receipt.id
        restored = approval.restore(db, exp.id, manifest_hash='a'*64, note='Technical restore', author='test')
        assert restored.action == 'restore'
        assert db.get(models.GuidedStep,step.id).prompt == 'Prima.'
        assert db.query(models.PromptRevision).count() == 3
        assert db.query(models.PromptExperimentDecision).count() == 2
