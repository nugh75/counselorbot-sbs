"""The optional QSA conversation has three student turns; the questionnaire is unchanged."""
from fastapi import HTTPException

PHASES = ("qsa-essential-focus", "qsa-essential-experience", "qsa-essential-action", "qsa-essential-summary")


def validate_path(questionnaire_type: str | None, path: str | None, phase: str | None) -> bool:
    essential = path == "essential"
    if essential and (questionnaire_type != "QSA" or phase not in (*PHASES, "qsa-essential-followup")):
        raise HTTPException(422, "The essential path is available only for QSA with a valid essential phase")
    if not essential and (phase or "").startswith("qsa-essential-"):
        raise HTTPException(422, "An essential phase requires the essential QSA path")
    return essential


def directive(phase: str) -> str:
    if phase == "qsa-essential-followup":
        return "\n\n[QSA ESSENTIAL FOLLOW-UP] The essential path is complete. Answer only this voluntary follow-up about the explored topic; do not restart the path or add mandatory questions. Keep unexamined factors distinct from the explored topic."
    task = {
        PHASES[0]: "Briefly read the available QSA profile, identify one resource and suggest at most two possible priorities with a reason. Ask the person to choose one or name another. Respect each factor's direction; never assume every high or low score is a difficulty. If scores do not justify priorities, offer a neutral choice without inventing results.",
        PHASES[1]: "Acknowledge the priority the person has just chosen (including a different priority). Do not repeat the score analysis. End with exactly ONE short interrogative sentence asking for a concrete situation related to the chosen priority. Do not add example questions, alternative questions, or a list of things to report. Stop the visible answer immediately after that question.",
        PHASES[2]: "Use the person's example to propose ONE small feasible action connected to the chosen priority. Give a brief tentative rationale, without inferring habits, motivation or causal mechanisms that the person has not reported. End with ONE short question asking whether to keep or adapt the action; no parenthetical list of alternatives or further requests. Do not prescribe a goal or claim the action is already adopted.",
        PHASES[3]: "Conclude now: summarize the chosen priority, an evidenced resource, the concrete situation and the action as confirmed or modified by the person. Distinguish a proposal from an agreed action. State that only the selected topic was explored, not the full profile. Do not ask another question. Further discussion is optional and initiated by the person.",
    }[phase]
    return (
        "\n\n[QSA ESSENTIAL PATH - CURRENT TURN]\n"
        "This is the essential QSA conversation, not the complete factor-by-factor interview. "
        "The application controls progression: focus, example, action, summary. "
        "Do not add an introduction, agreement turn, questionnaire, reflection battery or mandatory follow-up. "
        "Do not emit [[AVANZA_STEP]]. Never answer on behalf of the person. "
        "Current-turn instructions override generic requests to cover all factors or ask further questions. " + task
    )
