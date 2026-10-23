"""Percorsi essenziali: fasi virtuali fuori dalla tabella `guided_steps`.

Tre fasi brevi e sintesi per QSA e Obiettivi. Ogni fase avanza sul segnale
[[AVANZA_STEP]], quando il risultato è raggiunto e la scelta di approfondimento
è risolta, oppure la persona sceglie di proseguire. I chiarimenti non consumano
un passaggio. validate_path impedisce combinazioni strumento/fase inventate.
"""
from fastapi import HTTPException

QSA_PHASES = ("qsa-essential-focus", "qsa-essential-experience", "qsa-essential-action", "qsa-essential-summary")
OBBSTUDIO_PHASES = ("obbstudio-essential-focus", "obbstudio-essential-smart", "obbstudio-essential-plan", "obbstudio-essential-summary")
OBBDOCENZA_PHASES = ("obbdocenza-essential-focus", "obbdocenza-essential-smart", "obbdocenza-essential-plan", "obbdocenza-essential-summary")

# alias storico: i moduli che importano PHASES parlano del percorso QSA
PHASES = QSA_PHASES

# Le fasi hanno un prefisso per strumento: l'ultima di ogni percorso è la sintesi.
SUMMARY_PHASES = {phases[-1] for phases in (QSA_PHASES, OBBSTUDIO_PHASES, OBBDOCENZA_PHASES)}

_ESSENTIAL_PATHS = {
    "QSA": QSA_PHASES,
    "OBIETTIVO_STUDIO": OBBSTUDIO_PHASES,
    "OBIETTIVO_DOCENZA": OBBDOCENZA_PHASES,
}

# Solo il QSA essenziale prevede l'approfondimento volontario dopo la sintesi.
_FOLLOWUP_PHASES = {"QSA": "qsa-essential-followup"}


def validate_path(questionnaire_type: str | None, path: str | None, phase: str | None) -> bool:
    essential = path == "essential"
    if essential:
        phases = _ESSENTIAL_PATHS.get((questionnaire_type or "").upper())
        followup = _FOLLOWUP_PHASES.get((questionnaire_type or "").upper())
        if not phases or (phase not in (*phases, followup) if followup else phase not in phases):
            raise HTTPException(422, "The essential path is available only for a supported instrument with a valid essential phase")
    elif is_essential_phase(phase):
        raise HTTPException(422, "An essential phase requires the essential path")
    return essential


def is_essential_phase(phase: str | None) -> bool:
    return (phase or "").startswith(("qsa-essential-", "obbstudio-essential-", "obbdocenza-essential-"))


def is_essential_summary(phase: str | None) -> bool:
    return (phase or "") in SUMMARY_PHASES


def summary_instrument(phase: str | None) -> str | None:
    """Instrument whose essential path closes on `phase`, if it is a summary."""
    return next((code for code, phases in _ESSENTIAL_PATHS.items() if phases[-1] == phase), None)


_QSA_TASKS = {
    QSA_PHASES[0]: (
        "Briefly read the available QSA profile and explain the in-scope factors and scores, respecting each factor's direction; never assume every high or low score is a difficulty. Keep the reading descriptive. The next experience stage can take up a personal focus if the person wishes.",
        "Answer requested clarifications about factors and scores without opening personal exploration. Once the reading is complete and any requested clarification or depth choice is resolved, or the person chooses to continue, briefly name the experience step next and put only [[AVANZA_STEP]] on the last line. No personal focus, answer or comprehension question is required to close this stage.",
    ),
    QSA_PHASES[1]: (
        "If the person has already volunteered a priority, acknowledge it without repeating the score analysis and ask ONE short question about a concrete situation related to it. Otherwise invite them to choose one aspect to explore, with no score-based personal priority imposed; wait before asking for a concrete situation. They may skip this choice or continue.",
        "Work with the person's concrete situation, without collecting micro-details. Answer clarifications and honour chosen depth. When the example is sufficient and any depth choice is resolved, or the person chooses to continue, briefly return what emerged, name the first-action step next and put only [[AVANZA_STEP]] on the last line. Otherwise ask ONE relevant question.",
    ),
    QSA_PHASES[2]: (
        "Use the person's example to propose ONE small feasible action connected to the priority, only when permitted and supported by a supplied certified candidate. Give a brief tentative rationale, without inventing habits, motivation or causes. Ask whether to keep or adapt the action. If no candidate fits, leave the action open without inventing it.",
        "Integrate the person's acceptance, adaptation or rejection of the action. Do not treat a proposed action as adopted. Once the choice is clear and any depth choice is resolved, or they choose to continue, return their choice, name the summary next and put only [[AVANZA_STEP]] on the last line. Otherwise stay on this one action with ONE question.",
    ),
    QSA_PHASES[3]: "Conclude now: summarize the chosen priority, an evidenced resource, the concrete situation and the action as confirmed or modified by the person. Distinguish a proposal from an agreed action; honour rejection and points left open. State that only the selected topic was explored, not the full profile. Do not ask another question and do not emit [[AVANZA_STEP]]. Further discussion is optional and initiated by the person.",
}

# Obiettivo: tre fasi brevi e una sintesi. Una fase non dura una risposta fissa:
# si chiude quando il suo risultato c'e' (accettato o corretto dalla persona) o
# quando la persona sceglie di proseguire, e il modello lo segnala con il
# marcatore gia' usato dal percorso completo. Ogni fase ha un'apertura (nessuna
# risposta da valutare) e un turno di risposta.
_CLOSE = (
    "Close the stage only when {done}, or when the person asks to move on (then name the points "
    "still open): restate {what} in one sentence, ask no new question, and put only [[AVANZA_STEP]] "
    "on the last line. Otherwise keep working on this stage and end with ONE question."
)
_NO_MARKER = " Do not emit [[AVANZA_STEP]] in this opening: the person has not answered yet."


def _focus_tasks(learner: str, outcome: str, grounding: str) -> tuple[str, str]:
    work = (
        f"If several results or learnings appear, name them briefly, propose one as the priority {learner} "
        "with a short reason drawn from what was said, keep the others aside and ask which one to take now. "
        "If the focus is single, offer ONE editable draft of the objective in one sentence and ask ONE question "
        "about the element that would change it most. If a well-defined objective is already there, recognise it "
        "and restate it."
    )
    entry = (
        "Stage 1 of 3 (focus and first draft), opening. If nothing yet says what the person has in mind, ask in "
        f"ONE short question what {outcome}, offering at most two possibilities grounded in {grounding}, never "
        "invented. If an intention is already available, work on it. " + work + _NO_MARKER
    )
    reply = (
        "Stage 1 of 3: focus and first draft. " + work + " " + _CLOSE.format(
            done="the person has chosen ONE focus and accepted or corrected a draft", what="the draft")
    )
    return entry, reply


_DEFINE_ENTRY = (
    "Stage 2 of 3 (complete the objective), opening. Check the agreed draft against what a usable objective "
    "needs: {audience}, an observable result of the learner, a circumscribed content, a plausible proof with a "
    "proportionate condition or criterion. If something essential is missing, name it and ask ONE question about "
    "the most important gap; do not list every SMART letter or Bloom level. If nothing essential is missing, say "
    "in one sentence that the objective is already well defined, restate it, and put only [[AVANZA_STEP]] on the "
    "last line."
)
_DEFINE_REPLY = (
    "Stage 2 of 3: complete the objective. Integrate the answer into the draft and restate it; if the objective "
    "is too broad, propose a narrower first result for the person to confirm. If an essential element is still "
    "missing, ask ONE question about it. "
)

_OBBSTUDIO_FOCUS = _focus_tasks(
    "for now", "they would like to learn or be able to do", "their notebook or class context")
_OBBDOCENZA_FOCUS = _focus_tasks(
    "for this class or group", "they would like their students to learn or be able to do",
    "the teacher's notebook or the class context supplied")

_OBBSTUDIO_TASKS = {
    OBBSTUDIO_PHASES[0]: _OBBSTUDIO_FOCUS,
    OBBSTUDIO_PHASES[1]: (
        _DEFINE_ENTRY.format(audience="the person as the learner"),
        _DEFINE_REPLY + _CLOSE.format(
            done="the objective is defined enough and the person accepted or corrected it", what="the objective"),
    ),
    OBBSTUDIO_PHASES[2]: (
        "Stage 3 of 3 (plan and proof), opening. Keep the objective fixed. Ask ONE question to start the plan: the "
        "first small step, or where and when they will work on it, reusing what they already said. Toward the end "
        "of the stage there should be the first small steps, ONE if-then plan (if [situation or obstacle], then I "
        "[action]) and ONE concrete proof of success." + _NO_MARKER,
        "Stage 3 of 3: plan and proof. Help the person name the first small steps, ONE if-then plan (if [situation "
        "or obstacle], then I [action]) and ONE concrete proof of success, with a check date only if they give one. "
        "Do not build the plan for them; proposals are options they can turn down. Do not write the summary. "
        + _CLOSE.format(done="steps, if-then plan and proof are agreed", what="the plan"),
    ),
    OBBSTUDIO_PHASES[3]: "Conclude now: restate the objective ONE last time in its complete, well-written form (Mager): who ('I') + one observable verb at the agreed Bloom level, never a bare mental state + what + condition ('given X', 'in the exam', 'during the group work') + criterion ('in at least 8 cases out of 10', 'within 20 minutes'), using the proof they chose as the criterion; keep an element implicit only if it is truly obvious, and never invent a figure or a date. Then give back the first steps, the if-then plan and the proof with its date if they chose one, in the person's words. Other outcomes appear only as kept aside, if the person named them; points left open stay open. Distinguish proposals from commitments. Say that the objective can be saved in their personal goals and reviewed there. Do not ask another question and do not emit [[AVANZA_STEP]].",
}

_OBBDOCENZA_TASKS = {
    OBBDOCENZA_PHASES[0]: _OBBDOCENZA_FOCUS,
    OBBDOCENZA_PHASES[1]: (
        _DEFINE_ENTRY.format(audience="which students of the class"),
        _DEFINE_REPLY + "'Doing a lesson on X' is the teacher's activity: help state what the students will be "
        "able to do. " + _CLOSE.format(
            done="the objective is defined enough and the teacher accepted or corrected it", what="the objective"),
    ),
    OBBDOCENZA_PHASES[2]: (
        "Stage 3 of 3 (aligned activities and assessment), opening. Keep the objective fixed and start from its "
        "proof (backward design): ask ONE question about the assessment, or about the one class activity that "
        "would let students practise exactly that performance, reusing what the teacher already said." + _NO_MARKER,
        "Stage 3 of 3: aligned activities and assessment. Help the teacher name ONE or TWO class activities "
        "aligned with the verb and level of the objective and ONE assessment that asks the same kind of "
        "performance (constructive alignment). Do not design for them; proposals are options they can turn down. "
        "Do not write the summary. " + _CLOSE.format(
            done="activities and assessment are agreed and aligned", what="the activities and the assessment"),
    ),
    OBBDOCENZA_PHASES[3]: "Conclude now: restate the didactic objective ONE last time in its complete, well-written form (Mager, ABCD): audience (which students of the named class, in the teacher's words) + one observable verb at the agreed Bloom level, never a bare mental state + what + lesson condition ('using the lab tool', 'in 45 minutes', 'working in pairs') + criterion tied to the assessment they planned ('correctly solving 8 of the 10 exercises', 'matching the rubric at level 3'); never invent a figure or a date. Then give back the aligned activities and assessment and the proof with its date if one was chosen, in the teacher's words. Other outcomes appear only as kept aside, if the teacher named them; points left open stay open. Distinguish proposals from commitments. Say that the objective can be saved among their own goals, published in their goal catalog for the groups they manage, or assigned to a group or a participant: all three are explicit choices. Do not ask another question and do not emit [[AVANZA_STEP]].",
}

def advances_on_signal(phase: str | None) -> bool:
    """Ogni percorso essenziale lascia aperta la fase fino al segnale di chiusura."""
    return any(phase in phases for phases in _ESSENTIAL_PATHS.values())


def directive(phase: str, entry: bool = False) -> str:
    if phase == "qsa-essential-followup":
        return "\n\n[QSA ESSENTIAL FOLLOW-UP] The essential path is complete. Answer only this voluntary follow-up about the explored topic; do not restart the path or add mandatory questions. Keep unexamined factors distinct from the explored topic."
    task = _phase_task(phase)
    if task is None:
        return ""
    if advances_on_signal(phase):
        if isinstance(task, tuple):
            task = task[0] if entry else task[1]
            if entry and phase in QSA_PHASES:
                task += _NO_MARKER
        path_name = "QSA" if phase in QSA_PHASES else ("learning objective" if phase in OBBSTUDIO_PHASES else "didactic objective")
        return (
            ("\n\n[QSA ESSENTIAL PATH - CURRENT TURN]\n" if phase in QSA_PHASES else "\n\n[ESSENTIAL PATH - CURRENT TURN]\n") +
            f"This is the essential {path_name} conversation, not the complete guided path: three short stages "
            "and a summary. A stage lasts as many replies as it needs and no more: the application moves on only "
            "when you close the current stage with [[AVANZA_STEP]] on the last line, or when the person chooses to. "
            "Follow [GUIDED CHOICE]: never close while awaiting a depth choice or exploring the chosen topic. "
            "Never explain the marker. Do not add an introduction, agreement turn, questionnaire or reflection "
            "battery. Never answer on behalf of the person. Current-turn instructions override generic requests to "
            "cover every aspect or ask further questions. " + task
        )
def _phase_task(phase: str):
    for phases, tasks in (
        (QSA_PHASES, _QSA_TASKS),
        (OBBSTUDIO_PHASES, _OBBSTUDIO_TASKS),
        (OBBDOCENZA_PHASES, _OBBDOCENZA_TASKS),
    ):
        if phase in phases:
            return tasks[phase]
    return None


def navigation_context(phase: str) -> str:
    """Position of virtual stages; never describe the complete path here."""
    labels = {
        "QSA": ("Read the profile", "Focus and a concrete example", "A first action", "Summary"),
        "OBIETTIVO_STUDIO": ("Focus and first draft", "Complete the objective", "Plan and proof", "Summary"),
        "OBIETTIVO_DOCENZA": ("Focus and first draft", "Complete the objective", "Activities and assessment", "Summary"),
    }
    for qtype, phases in _ESSENTIAL_PATHS.items():
        if phase in phases:
            index = phases.index(phase)
            next_label = labels[qtype][index + 1] if index + 1 < len(phases) else "End of the path; optional follow-up only"
            return f"Current guided step: {labels[qtype][index]}. Next guided step: {next_label}. Translate these meanings into the response language."
    return "The essential path is complete; this is a voluntary follow-up, with no required next step."
