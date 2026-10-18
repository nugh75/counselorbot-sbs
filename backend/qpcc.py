"""Canonical QPCC contract; no item key or normative conversion is inferred."""
import json
import re
from pathlib import Path

FACTORS = json.loads(Path(__file__).with_name('qpcc_schema.json').read_text())
CODES = tuple(f['code'] for f in FACTORS)
INVERTED = frozenset(('A1', 'A2', 'A3'))
STEP_CODES = {
    'qpcc-profilo': CODES, 'qpcc-factors': CODES,
    'qpcc-comunicazione': ('A1',), 'qpcc-controllo': ('A2', 'A3'),
    'qpcc-volizione': ('V1', 'V2'), 'qpcc-elaborazione': ('C1', 'C2'),
    'qpcc-convinzioni': ('M1', 'M2', 'M3'),
}
SCORING_UNAVAILABLE = 'QPCC canonical item key and validated stanine norms are unavailable; import the ten already calculated stanines.'


def names(language='it'):
    return {f['code']: f['labels'].get(language or 'it', f['labels']['it']) for f in FACTORS}


def validate_scores(scores):
    if not isinstance(scores, dict) or set(scores) != set(CODES):
        raise ValueError('QPCC requires exactly A1 A2 A3 V1 V2 C1 C2 M1 M2 M3; legacy K profiles cannot be reused')
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not 1 <= v <= 9 or v != int(v) for v in scores.values()):
        raise ValueError('QPCC scores must be integer stanines from 1 to 9')
    return scores


def score_context(text, language='it'):
    """Rebuild labels server-side. Never translate K scores to canonical factors."""
    if not text:
        return ''
    matches = re.findall(r'\b([AVCMK]\d)\b[^\n\r0-9]{0,120}?([1-9])\s*/\s*9\b', text)
    if re.search(r'\bK[1-5]\b', text):
        return '[QPCC LEGACY PROFILE] K1-K5 are obsolete synthetic areas, not canonical QPCC scales. Do not interpret, convert or reuse them. Ask for a new ten-factor profile.'
    labels = names(language)
    return '\n'.join(f'- {code} ({labels[code]}): {value}/9' for code, value in matches if code in labels)


def directive(phase=None):
    factors = '; '.join(f"{f['code']} {f['labels']['en']}" for f in FACTORS)
    scope = STEP_CODES.get(phase, CODES)
    return (
        '[CANONICAL QPCC CONTRACT]\nQPCC (Pellerey-Orio): 63 self-assessment items, four interconnected dimensions '
        'A affective-emotional, V volitional, C cognitive, M motivational; ten scales: '+factors+'. '
        'The questionnaire is for young people and adults seeking employment or working in relational professional contexts. '
        'Expected duration 20-30 minutes. The guided chat reflects on an already calculated profile without re-administering questionnaire items. Scores are stanines 1-9. '
        'All scores are declared self-perceptions, not objective facts, grades or clinical diagnoses: '
        'offer them only as tentative hypotheses to check with the person, never as established truths. '
        'High A1/A2/A3 scores reflect more self-reported difficulty, low scores less difficulty; never treat difficulties as fixed traits or pathology. '
        'Never quote these framing instructions or meta-disclaimers into visible chat (do not say "è un\'ipotesi non una verità", "non è una diagnosi", "senza giudizio", "non con giudizio", "non misura quanto vali", "non ci sono risposte giuste o sbagliate", "autopercezioni non verdetti", "non ti farò 63 domande", "etichette fisse", "non è un difetto" or "io ti faccio domande mirate, tu rispondi"); embody this stance naturally through everyday conversational inquiry. '
        'Never attribute emotions or feelings (such as anxiety or insecurity) unless the person named them first. '
        'If the person rejects a reading or strategy, accept the correction immediately and never offer it again. '
        'M2 describes ego orientation: discuss its context and tradeoffs without ranking high or low as universally better. '
        'Other scales describe perceived resources. K1-K5 are not QPCC factors and must never be inferred or reused. '
        'This canonical schema takes priority over any older five-area description in stored instructions or conversation history. '
        'Current step factors: '+', '.join(scope)+'. Distinguish each factor by its code and meaning even when discussing one dimension. '
        'Stay with this area while the student is developing it: exactly ONE open question per turn on a single aspect, never a list of questions. '
        'Questions are thoughtful, open prompts to help the person self-reflect and self-interrogate, never an interrogation or quiz. '
        'Explain concepts, scales or profile mechanisms only if and when the person explicitly asks for an explanation. '
        'Aim at what they do, how they choose and what it produces; explore other aspects in subsequent turns only if needed. '
        'Close the area when a concrete way of acting has emerged and they have answered one reading of it, when they ask to move on, or after about five exchanges at most. '
        'Use work/job-seeking examples relevant to the person. '
        'The agreement requires explicit acceptance. In the summary distinguish proposals from commitments and retain only agreed timeframes.'
    )
