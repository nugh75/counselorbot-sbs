"""Le conversazioni essenziali hanno tre turni della persona; lo strumento non cambia.

Il percorso essenziale QSA è nato per primo; i due percorsi Obiettivo di
apprendimento riutilizzano lo stesso meccanismo (fasi virtuali fuori dalla tabella
`guided_steps`, il client avanza dopo ogni risposta). Il registro tiene le fasi
e le istruzioni per strumento; `validate_path` resta il portone: una
combinazione strumento/fase non valida è un 422, mai un percorso improvvisato.
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


_QSA_TASKS = {
    QSA_PHASES[0]: "Briefly read the available QSA profile, identify one resource and suggest at most two possible priorities with a reason. Ask the person to choose one or name another. Respect each factor's direction; never assume every high or low score is a difficulty. If scores do not justify priorities, offer a neutral choice without inventing results.",
    QSA_PHASES[1]: "Acknowledge the priority the person has just chosen (including a different priority). Do not repeat the score analysis. End with exactly ONE short interrogative sentence asking for a concrete situation related to the chosen priority. Do not add example questions, alternative questions, or a list of things to report. Stop the visible answer immediately after that question.",
    QSA_PHASES[2]: "Use the person's example to propose ONE small feasible action connected to the chosen priority. Give a brief tentative rationale, without inferring habits, motivation or causal mechanisms that the person has not reported. End with ONE short question asking whether to keep or adapt the action; no parenthetical list of alternatives or further requests. Do not prescribe a goal or claim the action is already adopted.",
    QSA_PHASES[3]: "Conclude now: summarize the chosen priority, an evidenced resource, the concrete situation and the action as confirmed or modified by the person. Distinguish a proposal from an agreed action. State that only the selected topic was explored, not the full profile. Do not ask another question. Further discussion is optional and initiated by the person.",
}

_OBBSTUDIO_TASKS = {
    OBBSTUDIO_PHASES[0]: "Help the person choose the AREA of their learning objective and the right level (Bloom's taxonomy, in plain words: remember, understand, apply, analyse, evaluate, create), grounded in what they said or in the notebook context you have. The verb attached to the level must pass the visibility test: if you cannot see or hear someone doing it ('know', 'understand', 'appreciate'), it is not a performance. End with exactly ONE short question asking them to confirm area and level, or to adjust them. Do not write the objective for them.",
    OBBSTUDIO_PHASES[1]: "Run ONE quick SMART check on the objective: name the letter or letters that still fail (specific, measurable, achievable, relevant, time-bound) and ask ONE question to fix the most important one. Do not list all five letters. End with that one question.",
    OBBSTUDIO_PHASES[2]: "Help the person name the FIRST small steps and ONE if-then plan (if [obstacle or situation], then I [action]), plus ONE concrete proof of success and when to check it. Ask at most two short questions. Do not build the plan for them; proposals are options they can turn down.",
    OBBSTUDIO_PHASES[3]: "Conclude now: restate the objective ONE last time in its complete, well-written form (Mager): who ('I') + one observable verb at the agreed Bloom level, never a bare mental state + what + condition ('given X', 'in the exam', 'during the group work') + criterion ('in at least 8 cases out of 10', 'within 20 minutes'), using the proof they chose as the criterion; keep an element implicit only if it is truly obvious. Then give back the first steps, the if-then plan and the proof with its date, in the person's words. Distinguish proposals from commitments. Say that the objective can be saved in their personal goals and reviewed there. Do not ask another question.",
}

_OBBDOCENZA_TASKS = {
    OBBDOCENZA_PHASES[0]: "Help the teacher choose the AREA and the right Bloom level for the class's learning objective (in plain words: remember, understand, apply, analyse, evaluate, create), grounded in what they said about the class or the curriculum. The verb attached to the level must pass the visibility test: if you cannot see or hear a student doing it ('know', 'understand', 'appreciate'), it is not a performance. End with exactly ONE short question asking them to confirm area and level, or to adjust them. Do not write the objective for them.",
    OBBDOCENZA_PHASES[1]: "Run ONE quick SMART check on the didactic objective: name the letter or letters that still fail (specific, measurable, achievable, relevant, time-bound) and ask ONE question to fix the most important one. Do not list all five letters. End with that one question.",
    OBBDOCENZA_PHASES[2]: "Help the teacher name ONE or TWO class activities aligned with the verb and level of the objective, and ONE assessment that asks the same kind of performance (constructive alignment). Ask at most two short questions. Do not design for them; proposals are options they can turn down.",
    OBBDOCENZA_PHASES[3]: "Conclude now: restate the didactic objective ONE last time in its complete, well-written form (Mager, ABCD): audience (which students of the named class, in the teacher's words) + one observable verb at the agreed Bloom level, never a bare mental state + what + lesson condition ('using the lab tool', 'in 45 minutes', 'working in pairs') + criterion tied to the assessment they planned ('correctly solving 8 of the 10 exercises', 'matching the rubric at level 3'). Then give back the aligned activities and assessment and the proof with its date, in the teacher's words. Distinguish proposals from commitments. Say that the objective can be saved among their own goals, published in their goal catalog for the groups they manage, or assigned to a group or a participant: all three are explicit choices. Do not ask another question.",
}


def directive(phase: str) -> str:
    if phase == "qsa-essential-followup":
        return "\n\n[QSA ESSENTIAL FOLLOW-UP] The essential path is complete. Answer only this voluntary follow-up about the explored topic; do not restart the path or add mandatory questions. Keep unexamined factors distinct from the explored topic."
    task = _phase_task(phase)
    if task is None:
        return ""
    path_name = "QSA" if phase in QSA_PHASES else ("learning objective" if phase in OBBSTUDIO_PHASES else "didactic objective")
    return (
        ("\n\n[QSA ESSENTIAL PATH - CURRENT TURN]\n" if phase in QSA_PHASES else "\n\n[ESSENTIAL PATH - CURRENT TURN]\n") +
        f"This is the essential {path_name} conversation, not the complete guided path. "
        "The application controls progression: the application moves to the next step after each completed reply. "
        "Do not add an introduction, agreement turn, questionnaire, reflection battery or mandatory follow-up. "
        "Do not emit [[AVANZA_STEP]]. Never answer on behalf of the person. "
        "Current-turn instructions override generic requests to cover every aspect or ask further questions. " + task
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
