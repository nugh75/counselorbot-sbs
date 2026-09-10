"""Administrator-owned experiments; worker access never grants production writes."""
from __future__ import annotations

import hashlib
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .. import auth, database, models
from ..prompt_lab import storage, snapshots, approval
from ..prompt_lab.contracts import (ExperimentCreate, CasesUpdate as Cases, RunRequest as Start,
                                    validate_case_set, build_manifest, manifest_hash)

router = APIRouter(prefix='/admin/prompt-experiments', tags=['prompt-experiments'])
ADMIN = Depends(auth.get_current_active_admin)
ACTIVE = ('queued', 'running')


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Decision(Strict):
    action: Literal['accept', 'reject']
    candidate_id: str | None = None
    expected_hash: str = Field(min_length=64, max_length=64)
    note: str = Field(min_length=1, max_length=2000)


class Restore(Strict):
    expected_hash: str = Field(min_length=64, max_length=64)
    note: str = Field(min_length=1, max_length=2000)


def lab_db():
    try:
        with storage.session_factory()() as db:
            yield db
    except (storage.LabUnavailable, SQLAlchemyError, OSError):
        raise HTTPException(503, 'Laboratorio non disponibile. Verificare i servizi dedicati.')


def row_or_404(lab, experiment_id, lock=False):
    query = lab.query(storage.LabExperiment).filter_by(id=experiment_id)
    row = (query.with_for_update() if lock else query).first()
    if row is None:
        raise HTTPException(404, 'Esperimento non trovato.')
    return row


def username(identity):
    return (identity.get('username') if isinstance(identity, dict) else getattr(identity, 'username', None)) or 'admin'


def current_run(lab, experiment_id):
    return lab.query(storage.LabRun).filter_by(experiment_id=experiment_id).order_by(storage.LabRun.created_at.desc(), storage.LabRun.id.desc()).first()


def active(lab, experiment_id):
    return lab.query(storage.LabRun).filter(storage.LabRun.experiment_id == experiment_id, storage.LabRun.state.in_(ACTIVE)).first()


def decision_receipt(db, experiment_id):
    return db.query(models.PromptExperimentDecision).filter_by(experiment_id=experiment_id).order_by((models.PromptExperimentDecision.action == 'restore').desc(), models.PromptExperimentDecision.created_at.desc()).first()


def blockers(row, run):
    result = snapshots.coverage_blockers(row.snapshot, row.payload)
    if row.purpose != 'improvement':
        result.append('La sola verifica non produce modifiche attivabili.')
    if run is None or run.kind != 'evaluate' or run.state != 'completed':
        result.append('Le prove non sono complete.')
    if (row.summary or {}).get('eligibility') != 'eligible':
        result.append('Il candidato non ha superato la valutazione.')
    return result


def detail(lab, db, row, result_run_id=None):
    output = storage.serializer(row)
    runs = lab.query(storage.LabRun).filter_by(experiment_id=row.id).order_by(storage.LabRun.created_at.desc()).all()
    run = current_run(lab, row.id)
    receipt = decision_receipt(db, row.id)
    result_run = next((r for r in runs if r.id == result_run_id), None) if result_run_id else run
    if result_run_id and result_run is None:
        raise HTTPException(404, 'Esecuzione non trovata.')
    output['runs'] = [storage.serializer(r) for r in runs]
    output['results'] = [storage.serializer(r) for r in lab.query(storage.LabResult).filter_by(run_id=result_run.id).order_by(storage.LabResult.case_id, storage.LabResult.preset_id, storage.LabResult.variant_id, storage.LabResult.repetition)] if result_run else []
    output['manifest_hash'] = (run.manifest or {}).get('manifest_hash') if run else manifest_hash(row.payload, row.snapshot, row.cases)
    output['decision'] = storage.serializer(receipt) if receipt else None
    output['approval_blockers'] = blockers(row, run)
    selected = (row.summary or {}).get('selected_candidate_id')
    candidate = next((c for c in row.candidates if c['id'] == selected), None)
    if candidate and run:
        candidate_hash = hashlib.sha256(candidate['text'].encode()).hexdigest()
        evidence = lab.query(storage.LabResult).filter_by(run_id=run.id, variant_id=selected).all()
        if not evidence or any((r.envelope or {}).get('candidate_hash') != candidate_hash for r in evidence):
            output['approval_blockers'].append('Il testo proposto non coincide con le prove registrate.')
    if snapshots.digest(snapshots.static_data(db)) != row.snapshot['source_hash']:
        output['approval_blockers'].append('La configurazione è cambiata dopo lo snapshot: occorre un nuovo esperimento.')
    if receipt:
        output['state'] = {'accept': 'activated', 'reject': 'rejected', 'restore': 'reverted'}[receipt.action]
    return output


@router.get('/options')
def options(_=ADMIN, db: Session = Depends(database.get_db)):
    enabled = False
    try:
        with storage.session_factory()() as lab:
            lab.execute(text('SELECT 1'))
            lab.query(storage.LabExperiment.id).first()
        enabled = True
    except (storage.LabUnavailable, SQLAlchemyError, OSError):
        pass
    return {'enabled': enabled, 'reason': None if enabled else 'Laboratorio non configurato o non disponibile.',
            'presets': [snapshots.values(p, snapshots.PRESET_FIELDS) for p in db.query(models.ModelPreset).filter_by(provider='ollama', is_active=True).order_by(models.ModelPreset.name)],
            'targets': [snapshots.values(s, ('id', 'label', 'label_i18n', 'sort_order', 'prompt', 'system_prompt_mode', 'questionnaire_type')) for s in db.query(models.GuidedStep).filter_by(questionnaire_type='QSA').order_by(models.GuidedStep.sort_order) if not s.system_prompt_mode.endswith('summary')],
            'languages': list(snapshots.LANGUAGES)}


@router.get('')
def list_experiments(_=ADMIN, lab: Session = Depends(lab_db), db: Session = Depends(database.get_db)):
    rows = lab.query(storage.LabExperiment).order_by(storage.LabExperiment.created_at.desc()).limit(100).all()
    decisions = {r.experiment_id: r.action for r in db.query(models.PromptExperimentDecision).filter(
        models.PromptExperimentDecision.experiment_id.in_([row.id for row in rows])).order_by(models.PromptExperimentDecision.created_at)}
    output = []
    for row in rows:
        item = storage.serializer(row)
        if row.id in decisions:
            item['state'] = {'accept': 'activated', 'reject': 'rejected', 'restore': 'reverted'}[decisions[row.id]]
        output.append(item)
    return output


@router.post('')
def create_experiment(payload: ExperimentCreate, identity=ADMIN, db: Session = Depends(database.get_db), lab: Session = Depends(lab_db)):
    data = payload.model_dump()
    if len(set(data['tested_preset_ids'])) != len(data['tested_preset_ids']) or len(set(data['languages'])) != len(data['languages']):
        raise HTTPException(422, 'Modelli o lingue duplicati.')
    if payload.purpose == 'improvement' and payload.proposer_preset_id is None:
        raise HTTPException(422, 'Seleziona il modello che propone le modifiche.')
    try:
        snapshot = snapshots.freeze_models(snapshots.build_snapshot(db, data))
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    row = storage.LabExperiment(title=payload.title, purpose=payload.purpose, target_key=payload.target_key,
                                created_by=username(identity), payload=data, snapshot=snapshot, cases=[], candidates=[], state='draft')
    lab.add(row)
    lab.commit()
    return detail(lab, db, row)


@router.get('/{experiment_id}')
def get_experiment(experiment_id: str, result_run_id: str | None = None, _=ADMIN, db: Session = Depends(database.get_db), lab: Session = Depends(lab_db)):
    return detail(lab, db, row_or_404(lab, experiment_id), result_run_id)


def mutable(lab, db, row):
    if active(lab, row.id) or decision_receipt(db, row.id):
        raise HTTPException(409, 'Esperimento in esecuzione o già deciso.')


def enqueue(lab, row, kind):
    frozen = build_manifest(payload=row.payload, snapshot=row.snapshot, cases=row.cases)
    run = storage.LabRun(experiment_id=row.id, kind=kind, state='queued', manifest=frozen)
    row.state = 'queued'
    row.error = None
    row.summary = None
    row.candidates = []
    lab.add(run)
    lab.commit()
    return storage.serializer(run)


@router.post('/{experiment_id}/prepare')
def prepare(experiment_id: str, _=ADMIN, db: Session = Depends(database.get_db), lab: Session = Depends(lab_db)):
    row = row_or_404(lab, experiment_id, True)
    mutable(lab, db, row)
    if lab.query(storage.LabRun).filter_by(experiment_id=row.id, kind='evaluate').first():
        raise HTTPException(409, 'Le prove precedenti sono congelate: crea un nuovo esperimento.')
    return enqueue(lab, row, 'prepare')


@router.put('/{experiment_id}/cases')
def save_cases(experiment_id: str, payload: Cases, _=ADMIN, db: Session = Depends(database.get_db), lab: Session = Depends(lab_db)):
    row = row_or_404(lab, experiment_id, True)
    mutable(lab, db, row)
    if lab.query(storage.LabRun).filter_by(experiment_id=row.id, kind='evaluate').first():
        raise HTTPException(409, 'Casi già utilizzati: crea un nuovo esperimento.')
    cases = [c.model_dump() for c in payload.cases]
    seen, groups = set(), {}
    for case in cases:
        if case['id'] in seen or case['language'] not in row.payload['languages']:
            raise HTTPException(422, 'Caso duplicato o lingua non selezionata.')
        seen.add(case['id'])
        previous = groups.setdefault(case['group_id'], case['split'])
        if previous != case['split']:
            raise HTTPException(422, 'Lo stesso gruppo non può appartenere a insiemi diversi.')
    row.cases = cases
    row.state = 'ready'
    lab.commit()
    return detail(lab, db, row)


@router.post('/{experiment_id}/run')
def run(experiment_id: str, payload: Start, _=ADMIN, db: Session = Depends(database.get_db), lab: Session = Depends(lab_db)):
    row = row_or_404(lab, experiment_id, True)
    mutable(lab, db, row)
    if not payload.cases_reviewed or not row.cases:
        raise HTTPException(422, 'Rivedi e conferma i casi prima di avviare le prove.')
    if snapshots.digest(snapshots.static_data(db)) != row.snapshot['source_hash']:
        raise HTTPException(409, 'La configurazione è cambiata: crea un nuovo esperimento.')
    try:
        validate_case_set(row.cases, languages=row.payload['languages'], purpose=row.purpose)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    if lab.query(storage.LabRun).filter_by(experiment_id=row.id, kind='evaluate').first() and row.purpose == 'improvement':
        raise HTTPException(409, 'La verifica finale è già stata consultata: crea un nuovo esperimento con casi indipendenti.')
    return enqueue(lab, row, 'evaluate')


@router.post('/{experiment_id}/cancel')
def cancel(experiment_id: str, _=ADMIN, lab: Session = Depends(lab_db)):
    row = row_or_404(lab, experiment_id, True)
    job = active(lab, row.id)
    if job:
        job.cancel_requested = True
        if job.state == 'queued':
            job.state = 'cancelled'
            row.state = 'cancelled'
        lab.commit()
    return {'cancel_requested': bool(job)}


@router.post('/{experiment_id}/decision')
def decide(experiment_id: str, payload: Decision, identity=ADMIN, db: Session = Depends(database.get_db), lab: Session = Depends(lab_db)):
    row = row_or_404(lab, experiment_id, True)
    if active(lab, row.id):
        raise HTTPException(409, 'Attendi la fine delle prove.')
    report = detail(lab, db, row)
    if payload.expected_hash != report['manifest_hash']:
        raise HTTPException(409, 'Il rapporto è cambiato: ricarica la pagina.')
    try:
        receipt = approval.decide(db, row, action=payload.action, candidate_id=payload.candidate_id,
                                  manifest_hash=payload.expected_hash, note=payload.note, author=username(identity),
                                  blockers=report['approval_blockers'])
    except ValueError as exc:
        db.rollback()
        raise HTTPException(409, str(exc))
    return storage.serializer(receipt)


@router.post('/{experiment_id}/restore')
def restore(experiment_id: str, payload: Restore, identity=ADMIN, db: Session = Depends(database.get_db)):
    try:
        receipt = approval.restore(db, experiment_id, manifest_hash=payload.expected_hash, note=payload.note, author=username(identity))
    except ValueError as exc:
        db.rollback()
        raise HTTPException(409, str(exc))
    return storage.serializer(receipt)
