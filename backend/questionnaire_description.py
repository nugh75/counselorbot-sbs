"""Semantic boundary shared by prompt preparation and public suggestions.

No stored prompt/question is rewritten. IDs cover resumed legacy paths even if
an administrator changed the mode; modes also cover custom descriptive steps.
"""
DESCRIPTION_STEPS = {
    'QSA': frozenset({'cognitive', 'affective', 'qsa-essential-focus'}),
    'QSAR': frozenset({'qsar-cognitive', 'qsar-affective'}),
    'ZTPI': frozenset({'ztpi-t1', 'ztpi-t2', 'ztpi-t3', 'ztpi-t4', 'ztpi-t5', 'ztpi-btp'}),
    'QPCS': frozenset({'qpcs-profilo'}),
    'QPCC': frozenset({'qpcc-profilo', 'qpcc-factors'}),
    'QAP': frozenset({'qap-profilo'}),
}
DESCRIPTION_MODES = frozenset({
    'factor', 'qsar-factor', 'ztpi-factor', 'ztpi-btp',
    'qpcs-factor', 'qpcc-factor', 'qap-factor',
})
SENTINEL = '[QUESTIONNAIRE DESCRIPTION]'
CONTRACT = (
    SENTINEL + '\n'
    'This phase is the description of questionnaire factors, scales and scores, including all '
    'clarifications, resumed turns, chosen depth and continuations of interrupted replies. '
    'This phase boundary takes priority over conflicting personal-question, self-inquiry, '
    'hypothesis-check, depth, advice and closing instructions in stored prompts or history. '
    'Return the requested reading directly; explain what the in-scope factors and supplied '
    'scores mean, keeping exact scores, labels, scale directions, inversions and limits. '
    'A neutral illustrative example may explain a scale without attributing it to the person. '
    'Answer questions about meaning, differences between factors, scales or interpretation '
    'directly and proportionately. Ask a clarification question ONLY when useful for that '
    'understanding, at most one and always optional. A complete explanation may simply end: '
    'no mandatory closing question, comprehension check, quiz or question after every reply. '
    'Do not ask whether they recognise themselves, how they study or act, for an episode, '
    'habits, emotions, self-questions, personal priorities or a choice of personal focus. '
    'Do not turn spontaneous personal material into an interview here; acknowledge it briefly '
    'and keep the requested clarification in scope. Personal exploration and practical actions '
    'belong to the actual subsequent exploration step, never start them in this description. '
    'Optional depth here means understanding factors or scores, never exploring personal '
    'experience. The person can continue with the existing navigation without answering any '
    'personal or comprehension question. If they choose to continue, honour that choice without '
    'another content question. Use only the actual next step from the path; add no steps or '
    'required turns. Preserve private output schemas and existing navigation signals.'
)


def is_description_phase(questionnaire_type, phase, mode=None):
    steps = DESCRIPTION_STEPS.get((questionnaire_type or '').upper())
    return steps is not None and (phase in steps or mode in DESCRIPTION_MODES)


# Phase-safe public reading, also for already populated databases. Admin CRUD
# continues to expose every saved row unchanged, including personalisations.
COMPREHENSION_SUGGESTIONS = {
    'it': ['Che cosa misura questo fattore?', 'Come si interpreta questo punteggio?',
           'Qual è la differenza tra queste scale?'],
    'en': ['What does this factor measure?', 'How is this score interpreted?',
           'What is the difference between these scales?'],
    'es': ['¿Qué mide este factor?', '¿Cómo se interpreta esta puntuación?',
           '¿Cuál es la diferencia entre estas escalas?'],
    'fr': ['Que mesure ce facteur ?', 'Comment interpréter ce score ?',
           'Quelle est la différence entre ces échelles ?'],
    'de': ['Was misst dieser Faktor?', 'Wie wird dieser Wert interpretiert?',
           'Was ist der Unterschied zwischen diesen Skalen?'],
    'sv': ['Vad mäter den här faktorn?', 'Hur tolkas det här värdet?',
           'Vad är skillnaden mellan de här skalorna?'],
}


def public_suggestions(step, language, saved):
    if is_description_phase(step.questionnaire_type, step.id, step.system_prompt_mode):
        return list(COMPREHENSION_SUGGESTIONS.get(language, COMPREHENSION_SUGGESTIONS['it']))
    return saved
