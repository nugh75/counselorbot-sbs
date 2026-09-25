"""Student-owned visual work. No model calls, prompts or questionnaire scores."""
import hashlib
from datetime import date
from typing import Annotated, Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from . import models, pii

ACTION = 'visual_workspace'
PERSONAL_ACTION = 'personal_timeline_workspace'
Identifier = Annotated[str, Field(min_length=1, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Item(StrictModel):
    id: str = Field(min_length=1, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    source: str = Field(default='', max_length=300)


class DatedItem(Item):
    date_mode: Literal['point', 'period'] | None = None
    start_date: str | None = Field(default=None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    end_date: str | None = Field(default=None, pattern=r'^\d{4}-\d{2}-\d{2}$')

    def check_dates(self):
        for value in (self.start_date, self.end_date):
            if value:
                date.fromisoformat(value)
        if self.date_mode == 'point' and (not self.start_date or self.end_date):
            raise ValueError('A single event requires only a start date')
        if self.date_mode == 'period' and not (self.start_date or self.end_date):
            raise ValueError('A period requires a start or end date')
        if self.date_mode is None and (self.start_date or self.end_date):
            raise ValueError('Choose an event or a period')
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError('End date precedes start date')


class Action(DatedItem):
    kind: Literal['activity', 'book', 'article', 'film', 'check'] = 'activity'
    title: str = Field(min_length=1, max_length=160)
    detail: str = Field(default='', max_length=1000)
    stage: Literal['todo', 'doing', 'done'] = 'todo'
    reflection: str = Field(default='', max_length=1000)  # per un controllo: «Cosa osservo»
    progress: Literal['on_track', 'slow', 'stuck'] | None = None
    adjustment: str = Field(default='', max_length=1000)  # per un controllo: «Cosa cambio»

    @model_validator(mode='after')
    def valid_dates(self):
        self.check_dates()
        if self.kind != 'check' and (self.progress or self.adjustment):
            raise ValueError('Progress belongs to checks only')
        if self.kind == 'check' and self.stage == 'done' and not self.progress:
            raise ValueError('A completed check needs its progress')
        return self


class EventReview(StrictModel):
    """Rilettura di una tappa passata (ex scheda evento e biografia del libretto)."""
    role: Literal['protagonist', 'observer', 'alongside'] | None = None
    worked: list[Annotated[str, Field(max_length=300)]] = Field(default_factory=list, max_length=10)
    did_not_work: list[Annotated[str, Field(max_length=300)]] = Field(default_factory=list, max_length=10)
    reading: str = Field(default='', max_length=1500)
    discovery: str = Field(default='', max_length=1000)
    keywords: str = Field(default='', max_length=200)
    try_next: str = Field(default='', max_length=1000)
    how_when: str = Field(default='', max_length=1000)


class Card(Item):
    text: str = Field(min_length=1, max_length=600)
    bucket: str = Field(default='unsorted', max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    image: str | None = Field(default=None, max_length=120)
    deck_id: str | None = Field(default=None, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')


class CardColumn(StrictModel):
    # A column reusing a preset id keeps its localized label; a custom id needs
    # the student's own text.
    id: str = Field(min_length=1, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    label: str = Field(default='', max_length=100)


class CardDeck(StrictModel):
    id: Identifier
    title: str = Field(min_length=1, max_length=100)
    card_columns: list[CardColumn] = Field(default_factory=list, max_length=8)


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


class PortfolioLink(StrictModel):
    id: int = Field(gt=0)
    title: str = Field(default='', max_length=200)


class TimelineEvent(DatedItem):
    planned: str = Field(default='', max_length=1000)
    institution_event: str | None = Field(default=None, max_length=160)
    institution_available: bool = True
    institution_date: Literal['start', 'deadline'] = 'start'
    personal_links: list[Literal['notebook', 'booklet', 'orientation']] = Field(default_factory=list, max_length=3)
    # 'booklet' is accepted only as legacy data: migration A7 removes it and the
    # UI no longer offers it.
    title: str = Field(min_length=1, max_length=160)
    period: str = Field(min_length=1, max_length=100)
    tense: Literal['past', 'future'] = 'past'
    symbol: Literal['milestone', 'study', 'work', 'change'] = 'milestone'
    reflection: str = Field(default='', max_length=1000)
    review: EventReview | None = None
    action_ids: list[Identifier] = Field(default_factory=list, max_length=30)
    portfolio: list[PortfolioLink] = Field(default_factory=list, max_length=20)

    @model_validator(mode='after')
    def unique_links(self):
        self.check_dates()
        if self.date_mode and not self.institution_event:
            self.period = self.start_date if self.date_mode == 'point' else f'{self.start_date or "…"} → {self.end_date or "…"}'
        if len(set(self.action_ids)) != len(self.action_ids) or len({p.id for p in self.portfolio}) != len(self.portfolio):
            raise ValueError('Duplicate links')
        if self.review is not None and self.tense != 'past':
            raise ValueError('Only past milestones carry a review')
        return self


class Timeline(StrictModel):
    title: str = Field(default='', max_length=160)
    events: list[TimelineEvent] = Field(default_factory=list, max_length=30)

    @model_validator(mode='after')
    def unique_events(self):
        if len({e.id for e in self.events}) != len(self.events):
            raise ValueError('Duplicate events')
        if self.events and not self.title:
            raise ValueError('Timeline title is required')
        return self


class Workspace(StrictModel):
    actions: list[Action] = Field(default_factory=list, max_length=30)
    cards: list[Card] = Field(default_factory=list, max_length=30)
    card_columns: list[CardColumn] = Field(default_factory=list, max_length=8)
    card_decks: list[CardDeck] = Field(default_factory=list, max_length=20)
    active_deck_id: str | None = Field(default=None, max_length=64, pattern=r'^[a-zA-Z0-9_-]+$')
    comparison: Comparison = Field(default_factory=Comparison)
    timeline: Timeline = Field(default_factory=Timeline)

    @model_validator(mode='after')
    def unique_items(self):
        for items in (self.actions, self.cards):
            if len({item.id for item in items}) != len(items):
                raise ValueError('Duplicate identifiers')
        if len({column.id for column in self.card_columns}) != len(self.card_columns):
            raise ValueError('Duplicate card columns')
        if len({deck.id for deck in self.card_decks}) != len(self.card_decks):
            raise ValueError('Duplicate card decks')
        # Validate deck-level columns
        deck_columns_map = {}
        for deck in self.card_decks:
            if len({column.id for column in deck.card_columns}) != len(deck.card_columns):
                raise ValueError('Duplicate card columns in deck')
            for column in deck.card_columns:
                if not column.label and column.id not in CARD_COLUMN_LABELS['en']:
                    raise ValueError('Custom card columns need a label')
            if deck.card_columns:
                deck_columns_map[deck.id] = deck.card_columns

        # Empty card_columns means the default set (localized preset labels).
        # Custom columns must carry the student's own label.
        for column in self.card_columns:
            if not column.label and column.id not in CARD_COLUMN_LABELS['en']:
                raise ValueError('Custom card columns need a label')
        default_columns = self.card_columns or DEFAULT_CARD_COLUMNS
        for card in self.cards:
            deck_cols = deck_columns_map.get(card.deck_id) if card.deck_id else None
            valid_cols = deck_cols if deck_cols is not None else default_columns
            if card.bucket not in {column.id for column in valid_cols}:
                raise ValueError('Unknown card column')
        if self.card_decks:
            deck_ids = {d.id for d in self.card_decks}
            if self.active_deck_id is not None and self.active_deck_id not in deck_ids:
                raise ValueError('Unknown active deck')
            for card in self.cards:
                if card.deck_id is not None and card.deck_id not in deck_ids:
                    raise ValueError('Unknown card deck')
        return self


class SaveWorkspace(StrictModel):
    revision: int = Field(ge=0)
    workspace: Workspace


class PersonalTimeline(Timeline):
    # Extraction must preserve all events, even across many session workspaces.
    events: list[TimelineEvent] = Field(default_factory=list)

    @model_validator(mode='after')
    def chronological_events(self):
        self.events.sort(key=lambda e: e.start_date or e.end_date or (e.period[:10] if e.institution_event else '9999-99-99'))
        return self


class PersonalWorkspace(Workspace):
    actions: list[Action] = Field(default_factory=list)
    timeline: PersonalTimeline = Field(default_factory=PersonalTimeline)


class SavePersonalWorkspace(SaveWorkspace):
    workspace: PersonalWorkspace


def workspace_model(session_id):
    return PersonalWorkspace if session_id is None else Workspace


def load_workspace(db: Session, session_id: str, username: str) -> dict:
    row = db.query(models.Log).filter(
        models.Log.action == (PERSONAL_ACTION if session_id is None else ACTION), models.Log.session_id == session_id,
        models.Log.username == username,
    ).order_by(models.Log.id.desc()).first()
    workspace = workspace_model(session_id).model_validate(row.details['workspace'] if row else {}).model_dump()
    resolve_portfolio(db, username, workspace)
    if session_id is None:
        from .personal_timeline import resolve_institution_events
        resolve_institution_events(db, username, workspace)
    return {'revision': row.id if row else 0, 'workspace': workspace}


def resolve_portfolio(db: Session, username: str, workspace: dict):
    links = [p for e in workspace['timeline']['events'] for p in e['portfolio']]
    if not links:
        return
    titles = dict(db.query(models.PortfolioItem.id, models.PortfolioItem.title).filter(
        models.PortfolioItem.username == username, models.PortfolioItem.id.in_([p['id'] for p in links])).all())
    for link in links:
        link['title'] = pii.redact(titles.get(link['id'], ''))[:200]


def redact_workspace_text(value):
    # IDs and references are structural: treating a hash as a phone number breaks links.
    if isinstance(value, list):
        for item in value:
            redact_workspace_text(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            if key in {'title', 'detail', 'reflection', 'planned', 'source', 'text', 'label', 'note', 'reason', 'period'} and isinstance(item, str):
                value[key] = pii.redact(item)
            elif isinstance(item, (dict, list)):
                redact_workspace_text(item)


def save_workspace(db: Session, session_id: str, username: str, update: SaveWorkspace, *, commit: bool = True) -> dict:
    # Serialize writes even for narrative sessions without a questionnaire row.
    # The version check prevents one browser tab overwriting another tab's work.
    if db.get_bind().dialect.name == 'postgresql':
        key = int.from_bytes(hashlib.sha256(f'{username}:{session_id}'.encode()).digest()[:8], 'big', signed=True)
        db.execute(text('SELECT pg_advisory_xact_lock(:key)'), {'key': key})
    current = load_workspace(db, session_id, username)
    if update.revision != current['revision']:
        raise HTTPException(409, 'The workspace was updated elsewhere')
    previous = {e['id']: e for e in current['workspace']['timeline']['events']}
    action_ids = {a.id for a in update.workspace.actions}
    owned = {row[0] for row in db.query(models.PortfolioItem.id).filter(
        models.PortfolioItem.username == username).all()} if update.workspace.timeline.events else set()
    for event in update.workspace.timeline.events:
        old = previous.get(event.id, {})
        if set(event.action_ids) - action_ids - set(old.get('action_ids', [])):
            raise HTTPException(422, 'Unknown action')
        if {p.id for p in event.portfolio} - owned - {p['id'] for p in old.get('portfolio', [])}:
            raise HTTPException(422, 'Portfolio work is unavailable')
    if session_id is None:
        if any(e.tense == 'future' and not e.institution_event for e in update.workspace.timeline.events):
            raise HTTPException(422, 'Future milestones belong to goals or activities')
        from .personal_timeline import validate_institution_links
        validate_institution_links(db, username, update.workspace, previous)
    clean = update.workspace.model_dump()
    redact_workspace_text(clean)
    clean = workspace_model(session_id).model_validate(clean).model_dump()
    resolve_portfolio(db, username, clean)
    row = models.Log(action=PERSONAL_ACTION if session_id is None else ACTION, session_id=session_id, username=username, details={'workspace': clean})
    db.add(row)
    db.commit() if commit else db.flush()
    return {'revision': row.id, 'workspace': clean}


# Preset card columns: the default set and the alternative layouts the student
# can pick. Labels are localized in CARD_COLUMN_LABELS; student-defined columns
# carry their own text in Workspace.card_columns.
CARD_SET_COLUMNS = {
    'sort': ['unsorted', 'yes', 'explore', 'no'],
    'kanban': ['card_todo', 'card_doing', 'card_done'],
    'explore': ['to_explore', 'explored', 'reflecting'],
}
DEFAULT_CARD_COLUMNS = [CardColumn(id=value) for value in CARD_SET_COLUMNS['sort']]

# Shared by the standalone export and the final session PDF.
LABELS = {
    'it': ['Tools', 'Piano personale', 'Da provare', 'In corso', 'Provata', 'Riflessione', 'Carte', 'Da ordinare', 'Mi rappresenta', 'Da approfondire', 'Non mi rappresenta', 'Confronto', 'Scelta', 'Motivazione', 'Fonte'],
    'en': ['Tools', 'Personal plan', 'To try', 'In progress', 'Tried', 'Reflection', 'Cards', 'Unsorted', 'Fits me', 'Explore further', 'Does not fit me', 'Comparison', 'Choice', 'Reason', 'Source'],
    'es': ['Tools', 'Plan personal', 'Por probar', 'En curso', 'Probada', 'Reflexión', 'Tarjetas', 'Sin ordenar', 'Me representa', 'Por explorar', 'No me representa', 'Comparación', 'Elección', 'Motivo', 'Fuente'],
    'fr': ['Tools', 'Plan personnel', 'À essayer', 'En cours', 'Essayée', 'Réflexion', 'Cartes', 'À classer', 'Me correspond', 'À approfondir', 'Ne me correspond pas', 'Comparaison', 'Choix', 'Motif', 'Source'],
    'de': ['Tools', 'Persönlicher Plan', 'Ausprobieren', 'In Arbeit', 'Ausprobiert', 'Reflexion', 'Karten', 'Unsortiert', 'Passt zu mir', 'Weiter erkunden', 'Passt nicht zu mir', 'Vergleich', 'Wahl', 'Begründung', 'Quelle'],
    'sv': ['Tools', 'Personlig plan', 'Att prova', 'Pågår', 'Provad', 'Reflektion', 'Kort', 'Osorterat', 'Stämmer för mig', 'Utforska vidare', 'Stämmer inte för mig', 'Jämförelse', 'Val', 'Motivering', 'Källa'],
}

# Card column labels for the preset ids (mirrors frontend i18n-visual-tools).
CARD_COLUMN_LABELS = {
    'it': {'unsorted': 'Da ordinare', 'yes': 'Mi rappresenta', 'explore': 'Da approfondire', 'no': 'Non mi rappresenta',
        'card_todo': 'Da fare', 'card_doing': 'In corso', 'card_done': 'Fatto',
        'fronte': 'Fronte', 'retro': 'Retro',
        'pro': 'Vantaggi', 'con': 'Svantaggi', 'question': 'Domanda', 'answer': 'Risposta',
        'to_explore': 'Da esplorare', 'explored': 'Esplorato', 'reflecting': 'In riflessione'},
    'en': {'unsorted': 'Unsorted', 'yes': 'Fits me', 'explore': 'Explore further', 'no': 'Does not fit me',
        'card_todo': 'To do', 'card_doing': 'In progress', 'card_done': 'Done',
        'fronte': 'Front', 'retro': 'Back',
        'pro': 'Pros', 'con': 'Cons', 'question': 'Question', 'answer': 'Answer',
        'to_explore': 'To explore', 'explored': 'Explored', 'reflecting': 'Reflecting'},
    'es': {'unsorted': 'Sin ordenar', 'yes': 'Me representa', 'explore': 'Por explorar', 'no': 'No me representa',
        'card_todo': 'Por hacer', 'card_doing': 'En curso', 'card_done': 'Hecho',
        'fronte': 'Anverso', 'retro': 'Reverso',
        'pro': 'Ventajas', 'con': 'Inconvenientes', 'question': 'Pregunta', 'answer': 'Respuesta',
        'to_explore': 'Por explorar', 'explored': 'Explorada', 'reflecting': 'En reflexión'},
    'fr': {'unsorted': 'À classer', 'yes': 'Me correspond', 'explore': 'À approfondir', 'no': 'Ne me correspond pas',
        'card_todo': 'À faire', 'card_doing': 'En cours', 'card_done': 'Fait',
        'fronte': 'Recto', 'retro': 'Verso',
        'pro': 'Avantages', 'con': 'Inconvénients', 'question': 'Question', 'answer': 'Réponse',
        'to_explore': 'À explorer', 'explored': 'Explorée', 'reflecting': 'En réflexion'},
    'de': {'unsorted': 'Unsortiert', 'yes': 'Passt zu mir', 'explore': 'Weiter erkunden', 'no': 'Passt nicht zu mir',
        'card_todo': 'Zu erledigen', 'card_doing': 'In Arbeit', 'card_done': 'Erledigt',
        'fronte': 'Vorderseite', 'retro': 'Rückseite',
        'pro': 'Vorteile', 'con': 'Nachteile', 'question': 'Frage', 'answer': 'Antwort',
        'to_explore': 'Zu erkunden', 'explored': 'Erkundet', 'reflecting': 'In Reflexion'},
    'sv': {'unsorted': 'Osorterat', 'yes': 'Stämmer för mig', 'explore': 'Utforska vidare', 'no': 'Stämmer inte för mig',
        'card_todo': 'Att göra', 'card_doing': 'Pågår', 'card_done': 'Klar',
        'fronte': 'Framsida', 'retro': 'Baksida',
        'pro': 'Fördelar', 'con': 'Nackdelar', 'question': 'Fråga', 'answer': 'Svar',
        'to_explore': 'Att utforska', 'explored': 'Utforskad', 'reflecting': 'I reflektion'},
}


def workspace_sections(workspace: dict, language: str) -> list[tuple[str, list[str]]]:
    w = PersonalWorkspace.model_validate(workspace)
    labels = LABELS.get((language or 'en')[:2], LABELS['en'])
    sections = []
    if w.actions:
        sections.append((labels[1], [
            '\n'.join(filter(None, [f'{a.title} - {labels[2 + ["todo", "doing", "done"].index(a.stage)]}',
                a.detail, f'{labels[5]}: {a.reflection}' if a.reflection else '', f'{labels[14]}: {a.source}' if a.source else '']))
            for a in w.actions]))
    if w.cards:
        card_labels = CARD_COLUMN_LABELS.get((language or 'en')[:2], CARD_COLUMN_LABELS['en'])
        column_labels = {column.id: column.label for column in w.card_columns}
        for deck in w.card_decks:
            for column in deck.card_columns:
                if column.id not in column_labels or column.label:
                    column_labels[column.id] = column.label
        sections.append((labels[6], [f'{column_labels.get(c.bucket) or card_labels.get(c.bucket, c.bucket)}: {c.text}'
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
    if w.timeline.events:
        from .timeline import timeline_sections
        sections.extend(timeline_sections(w, language))
    # The PDF renderer uses core-font Latin-1. Keep punctuation readable instead
    # of replacing typographic apostrophes and timeline separators with '?'.
    punctuation = str.maketrans({'—': '-', '–': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...', '→': '->'})
    return [(heading.translate(punctuation), [entry.translate(punctuation) for entry in entries])
            for heading, entries in sections]
