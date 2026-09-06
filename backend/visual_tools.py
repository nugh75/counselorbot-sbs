"""Student-owned visual work. No model calls, prompts or questionnaire scores."""
import hashlib
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from . import models, pii

ACTION = 'visual_workspace'


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Item(StrictModel):
    id: str = Field(min_length=1, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    source: str = Field(default='', max_length=300)


class Action(Item):
    title: str = Field(min_length=1, max_length=160)
    detail: str = Field(default='', max_length=1000)
    stage: Literal['todo', 'doing', 'done'] = 'todo'
    reflection: str = Field(default='', max_length=1000)


class Card(Item):
    text: str = Field(min_length=1, max_length=600)
    bucket: Literal['unsorted', 'yes', 'explore', 'no'] = 'unsorted'


class Option(Item):
    title: str = Field(min_length=1, max_length=160)


class Criterion(StrictModel):
    id: str = Field(min_length=1, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    label: str = Field(min_length=1, max_length=100)


class Cell(StrictModel):
    option_id: str = Field(max_length=64)
    criterion_id: str = Field(max_length=64)
    note: str = Field(max_length=500)


class Comparison(StrictModel):
    options: list[Option] = Field(default_factory=list, max_length=3)
    criteria: list[Criterion] = Field(default_factory=list, max_length=6)
    cells: list[Cell] = Field(default_factory=list, max_length=18)
    chosen: str | None = Field(default=None, max_length=64)
    reason: str = Field(default='', max_length=1000)

    @model_validator(mode='after')
    def valid_references(self):
        options = {item.id for item in self.options}
        criteria = {item.id for item in self.criteria}
        keys = {(cell.option_id, cell.criterion_id) for cell in self.cells}
        if len(options) != len(self.options) or len(criteria) != len(self.criteria) or len(keys) != len(self.cells):
            raise ValueError('Duplicate identifiers')
        if self.chosen is not None and self.chosen not in options:
            raise ValueError('Unknown chosen option')
        if any(cell.option_id not in options or cell.criterion_id not in criteria for cell in self.cells):
            raise ValueError('Unknown cell reference')
        return self


class Workspace(StrictModel):
    actions: list[Action] = Field(default_factory=list, max_length=30)
    cards: list[Card] = Field(default_factory=list, max_length=30)
    comparison: Comparison = Field(default_factory=Comparison)

    @model_validator(mode='after')
    def unique_items(self):
        for items in (self.actions, self.cards):
            if len({item.id for item in items}) != len(items):
                raise ValueError('Duplicate identifiers')
        return self


class SaveWorkspace(StrictModel):
    revision: int = Field(ge=0)
    workspace: Workspace


def load_workspace(db: Session, session_id: str, username: str) -> dict:
    row = db.query(models.Log).filter(
        models.Log.action == ACTION, models.Log.session_id == session_id,
        models.Log.username == username,
    ).order_by(models.Log.id.desc()).first()
    return {'revision': row.id if row else 0,
            'workspace': row.details['workspace'] if row else Workspace().model_dump()}


def save_workspace(db: Session, session_id: str, username: str, update: SaveWorkspace) -> dict:
    # Serialize writes even for narrative sessions without a questionnaire row.
    # The version check prevents one browser tab overwriting another tab's work.
    if db.get_bind().dialect.name == 'postgresql':
        key = int.from_bytes(hashlib.sha256(f'{username}:{session_id}'.encode()).digest()[:8], 'big', signed=True)
        db.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': key})
    current = load_workspace(db, session_id, username)
    if update.revision != current['revision']:
        raise HTTPException(409, 'The workspace was updated elsewhere')
    clean = Workspace.model_validate_json(pii.redact(update.workspace.model_dump_json())).model_dump()
    row = models.Log(action=ACTION, session_id=session_id, username=username, details={'workspace': clean})
    db.add(row)
    db.commit()
    return {'revision': row.id, 'workspace': clean}


# Shared by the standalone export and the final session PDF.
LABELS = {
    'it': ['Tools', 'Piano personale', 'Da provare', 'In corso', 'Provata', 'Riflessione', 'Carte', 'Da ordinare', 'Mi rappresenta', 'Da approfondire', 'Non mi rappresenta', 'Confronto', 'Scelta', 'Motivazione', 'Fonte'],
    'en': ['Tools', 'Personal plan', 'To try', 'In progress', 'Tried', 'Reflection', 'Cards', 'Unsorted', 'Fits me', 'Explore further', 'Does not fit me', 'Comparison', 'Choice', 'Reason', 'Source'],
    'es': ['Tools', 'Plan personal', 'Por probar', 'En curso', 'Probada', 'Reflexión', 'Tarjetas', 'Sin ordenar', 'Me representa', 'Por explorar', 'No me representa', 'Comparación', 'Elección', 'Motivo', 'Fuente'],
    'fr': ['Tools', 'Plan personnel', 'À essayer', 'En cours', 'Essayée', 'Réflexion', 'Cartes', 'À classer', 'Me correspond', 'À approfondir', 'Ne me correspond pas', 'Comparaison', 'Choix', 'Motif', 'Source'],
    'de': ['Tools', 'Persönlicher Plan', 'Ausprobieren', 'In Arbeit', 'Ausprobiert', 'Reflexion', 'Karten', 'Unsortiert', 'Passt zu mir', 'Weiter erkunden', 'Passt nicht zu mir', 'Vergleich', 'Wahl', 'Begründung', 'Quelle'],
    'sv': ['Tools', 'Personlig plan', 'Att prova', 'Pågår', 'Provad', 'Reflektion', 'Kort', 'Osorterat', 'Stämmer för mig', 'Utforska vidare', 'Stämmer inte för mig', 'Jämförelse', 'Val', 'Motivering', 'Källa'],
}


def workspace_sections(workspace: dict, language: str) -> list[tuple[str, list[str]]]:
    w = Workspace.model_validate(workspace)
    labels = LABELS.get((language or 'en')[:2], LABELS['en'])
    sections = []
    if w.actions:
        sections.append((labels[1], [
            '\n'.join(filter(None, [f'{a.title} - {labels[2 + ["todo", "doing", "done"].index(a.stage)]}',
                a.detail, f'{labels[5]}: {a.reflection}' if a.reflection else '', f'{labels[14]}: {a.source}' if a.source else '']))
            for a in w.actions]))
    if w.cards:
        sections.append((labels[6], [f'{labels[7 + ["unsorted", "yes", "explore", "no"].index(c.bucket)]}: {c.text}'
            + (f'\n{labels[14]}: {c.source}' if c.source else '') for c in w.cards]))
    if w.comparison.options:
        c = w.comparison
        notes = []
        for option in c.options:
            lines = [option.title]
            for criterion in c.criteria:
                note = next((cell.note for cell in c.cells if cell.option_id == option.id and cell.criterion_id == criterion.id), '')
                lines.append(f'{criterion.label}: {note or "-"}')
            if option.source:
                lines.append(f'{labels[14]}: {option.source}')
            notes.append('\n'.join(lines))
        if c.chosen:
            title = next(o.title for o in c.options if o.id == c.chosen)
            notes.append(f'{labels[12]}: {title}\n{labels[13]}: {c.reason}')
        elif c.reason:
            notes.append(f'{labels[13]}: {c.reason}')
        sections.append((labels[11], notes))
    return sections
