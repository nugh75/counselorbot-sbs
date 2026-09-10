"""Only the authenticated application process may approve or restore live prompts."""
import uuid

from sqlalchemy import text

from .. import models, prompt_revisions
from .snapshots import digest, static_data


def lock_sources(db):
    # These locks also serialize ordinary ORM admin writes, without changing each route.
    if db.bind.dialect.name == 'postgresql':
        db.execute(text('LOCK TABLE configs, guided_steps, counselors, model_presets, factors, prompt_experiment_decisions IN SHARE ROW EXCLUSIVE MODE'))
    db.expire_all()


def decide(db, experiment, *, action, candidate_id, manifest_hash, note, author, blockers):
    lock_sources(db)
    key = experiment.id + ':decision'
    old = db.query(models.PromptExperimentDecision).filter_by(decision_key=key).first()
    if old:
        if old.action != action or old.candidate_id != candidate_id or old.manifest_hash != manifest_hash:
            raise ValueError('Una decisione diversa è già stata registrata.')
        return old
    if action not in ('accept', 'reject'):
        raise ValueError('Decisione non valida.')
    snapshot = experiment.snapshot
    before = snapshot['baseline']
    after = before
    revision_id = None
    if action == 'accept':
        if experiment.purpose != 'improvement' or blockers:
            raise ValueError('La proposta non è attivabile: ' + '; '.join(blockers))
        if digest(static_data(db)) != snapshot['source_hash']:
            raise ValueError('Prompt o configurazione modificati: occorrono nuove prove.')
        candidate = next((c for c in experiment.candidates if c['id'] == candidate_id), None)
        if candidate is None or candidate_id != (experiment.summary or {}).get('selected_candidate_id'):
            raise ValueError('Il candidato non è quello verificato.')
        row = db.query(models.GuidedStep).filter_by(id=experiment.target_key).with_for_update().one()
        if row.prompt != before or candidate['text'] == before:
            raise ValueError('La baseline è cambiata oppure la modifica è vuota.')
        prompt_revisions.record(db, 'guided_step', row.id, before, 'admin', author=author, note='Baseline esperimento ' + experiment.id)
        db.flush()
        after = candidate['text']
        row.prompt = after
        prompt_revisions.record(db, 'guided_step', row.id, after, 'admin', author=author, note='Esperimento approvato ' + experiment.id)
        db.flush()
        revision_id = prompt_revisions.latest(db, 'guided_step', row.id).id
    receipt = models.PromptExperimentDecision(
        id=str(uuid.uuid4()), decision_key=key, experiment_id=experiment.id, action=action,
        target_key=experiment.target_key, candidate_id=candidate_id, manifest_hash=manifest_hash,
        source_hash=snapshot['source_hash'], before_value=before, after_value=after,
        revision_id=revision_id, author=author, note=note)
    db.add(receipt)
    db.commit()
    db.refresh(receipt)
    return receipt


def restore(db, experiment_id, *, manifest_hash, note, author):
    lock_sources(db)
    old = db.query(models.PromptExperimentDecision).filter_by(decision_key=experiment_id + ':restore').first()
    if old:
        if old.manifest_hash != manifest_hash:
            raise ValueError('Il riferimento alla revisione non coincide.')
        return old
    accepted = db.query(models.PromptExperimentDecision).filter_by(decision_key=experiment_id + ':decision', action='accept').first()
    if not accepted or accepted.manifest_hash != manifest_hash:
        raise ValueError('Nessuna attivazione corrispondente.')
    row = db.query(models.GuidedStep).filter_by(id=accepted.target_key).with_for_update().first()
    current = prompt_revisions.latest(db, 'guided_step', accepted.target_key)
    if row is None or row.prompt != accepted.after_value or current is None or current.id != accepted.revision_id:
        raise ValueError('Il prompt è stato modificato dopo l’attivazione: ripristino bloccato.')
    row.prompt = accepted.before_value
    prompt_revisions.record(db, 'guided_step', row.id, row.prompt, 'admin', author=author, note='Ripristino esperimento ' + experiment_id)
    db.flush()
    receipt = models.PromptExperimentDecision(
        id=str(uuid.uuid4()), decision_key=experiment_id + ':restore', experiment_id=experiment_id,
        action='restore', target_key=row.id, manifest_hash=manifest_hash, source_hash=accepted.source_hash,
        before_value=accepted.after_value, after_value=accepted.before_value,
        revision_id=prompt_revisions.latest(db, 'guided_step', row.id).id, author=author, note=note)
    db.add(receipt)
    db.commit()
    db.refresh(receipt)
    return receipt
