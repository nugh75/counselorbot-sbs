"""Resolve diagram symbols from stable factor identities and exact dictionary terms."""
import json
from pathlib import Path
import re
import unicodedata

from .diagram_icon_catalog import ICON_CATALOG

FACTOR_SYMBOLS = json.loads(Path(__file__).with_name('diagram_factor_symbols.json').read_text())
FACTORS = {entry['id']: entry for entry in FACTOR_SYMBOLS}
INSTRUMENTS = {key.split(':')[0] for key in FACTORS}


def normalize(text: str) -> str:
    text = unicodedata.normalize('NFKD', text.casefold())
    return ' '.join(re.sub(r'[^\w]+', ' ', ''.join(c for c in text if not unicodedata.combining(c))).split())


FACTOR_TERMS = {
    key: {normalize(label) for label in [*entry['labels'].values(), *entry['aliases']]}
    for key, entry in FACTORS.items()
}
SYMBOL_TERMS: dict[str, set[str]] = {}
for entry in ICON_CATALOG:
    for term in [entry['meaning'], entry['label_it'], *entry.get('aliases', [])]:
        SYMBOL_TERMS.setdefault(normalize(term), set()).add(entry['id'])

_CODES = re.compile(r'\b(?:AD[1-4]|[CA][1-7]R?|T[1-5]|[SK][1-5])\b', re.I)
# Only level qualifiers around a complete factor name, never arbitrary keyword matches.
_LEVELS = {'alto', 'alta', 'alti', 'alte', 'basso', 'bassa', 'bassi', 'basse', 'medio', 'media',
           'adeguata', 'adeguato', 'scarsa', 'scarso', 'elevata', 'elevato', 'low', 'high', 'average',
           'bajo', 'baja', 'bajos', 'bajas', 'faible', 'eleve', 'elevee', 'niedrig', 'hoch', 'lag', 'hog'}


def _factor_term(label: str) -> str:
    label = _CODES.sub('', label)
    label = re.sub(r'\b\d+(?:[.,]\d+)?\s*/\s*\d+\b', '', label)
    words = normalize(label).split()
    while words and words[0] in _LEVELS:
        words.pop(0)
    while words and words[-1] in _LEVELS:
        words.pop()
    return ' '.join(words)


def factor_id(value) -> str | None:
    key = value.strip().upper() if isinstance(value, str) else ''
    return key if key in FACTORS else None


def resolve_symbol(label: str, factor: str | None = None,
                   questionnaire_type: str | None = None) -> tuple[str | None, str | None, bool]:
    """Return factor, symbol and whether the factor dictionary makes it canonical."""
    key = factor_id(factor)
    if key:
        return key, FACTORS[key]['icon'], True
    instrument = (questionnaire_type or '').upper()
    candidates = [key for key in FACTORS if not instrument or key.startswith(instrument + ':')]
    codes = {code.upper() for code in _CODES.findall(label)}
    term = _factor_term(label)
    if len(codes) > 1:
        return None, None, False
    matches = [key for key in candidates
               if (not codes or key.split(':')[1] in codes)
               and (term in FACTOR_TERMS[key] or (codes and not term and instrument))]
    icons = {FACTORS[key]['icon'] for key in matches}
    if len(icons) == 1:
        return matches[0] if len(matches) == 1 else None, icons.pop(), True
    # A factor code that conflicts with the name must not become a generic match.
    if codes:
        return None, None, False
    icons = SYMBOL_TERMS.get(normalize(label), set())
    return None, next(iter(icons)) if len(icons) == 1 else None, False


def factor_selection_prompt(questionnaire_type: str | None) -> str:
    instrument = (questionnaire_type or '').upper()
    entries = [entry for key, entry in FACTORS.items() if key.startswith(instrument + ':')]
    if not entries:
        return ''
    return (' Factor dictionary for this session (identity, not level or achievement): '
            + '; '.join(f"{entry['id']}={entry['labels']['en']} -> {entry['icon']}" for entry in entries)
            + '. For a node representing a factor, copy its ID into factor; the server supplies its symbol.')
