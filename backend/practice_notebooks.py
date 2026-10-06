"""Taccuini studente di prova del docente, in una forma leggibile da un prompt.

Il docente crea studenti immaginari (`TeacherPracticeNotebook`) e ne sceglie
uno dalle Opzioni della chat per allenarsi a condurla. Due regole:

- la scelta vale solo se il server riconosce a ogni turno il ruolo docente
  (docenti, ricercatori, admin: lo stesso guard di `get_current_plan_manager`)
  e il taccuino e' del richiedente e non archiviato;
- il modello deve sapere che e' una simulazione: `simulation_notice` produce
  il blocco `[SIMULATION]`, separato dal profilo perche' i livelli di contesto
  che riducono `[PROFILE]` non lo taglino.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from . import auth, models
from .student_context import LEARNER_PROFILE_LABELS

# Tetto del blocco taccuino di prova nel prompt, come il taccuino reale.
MAX_PRACTICE_NOTEBOOK_CHARS = 1200

SIMULATION_NOTICES = {
    "it": (
        "SIMULAZIONE — ALLENAMENTO DEL DOCENTE. Chi scrive in questa conversazione è un docente "
        "che interpreta uno studente immaginario per allenarsi a guidare il percorso prima delle "
        "sessioni reali. Il taccuino in [PROFILE] descrive uno studente simulato, non una persona "
        "reale. Conduci la conversazione esattamente come faresti con uno studente vero: stesso "
        "percorso, stesso tono, stesse regole, e trattalo come lo studente descritto nel taccuino. "
        "Non chiedere né inventare dati personali reali e non presentare nulla come valutazione di "
        "una persona reale. Se il docente esce dal personaggio e chiede un riscontro sulla "
        "conduzione, rispondi brevemente come a un collega, poi riprendi la simulazione."
    ),
    "en": (
        "SIMULATION — TEACHER PRACTICE. The person writing in this conversation is a teacher "
        "role-playing an imaginary student to practise guiding this path before real sessions. "
        "The notebook in [PROFILE] describes a simulated student, not a real person. Run the "
        "conversation exactly as you would with a real student: same path, same tone, same rules, "
        "and treat them as the student described in the notebook. Do not ask for or invent real "
        "personal data and do not present anything as an assessment of a real person. If the "
        "teacher steps out of the role and asks for feedback on how the conversation is being "
        "guided, answer briefly as you would to a colleague, then resume the simulation."
    ),
    "es": (
        "SIMULACIÓN — PRÁCTICA DEL DOCENTE. Quien escribe en esta conversación es un docente que "
        "interpreta a un estudiante imaginario para practicar cómo guiar el recorrido antes de las "
        "sesiones reales. El cuaderno en [PROFILE] describe a un estudiante simulado, no a una "
        "persona real. Conduce la conversación exactamente como lo harías con un estudiante real: "
        "mismo recorrido, mismo tono, mismas reglas, y trátalo como el estudiante descrito en el "
        "cuaderno. No pidas ni inventes datos personales reales y no presentes nada como una "
        "evaluación de una persona real. Si el docente sale del personaje y pide una devolución "
        "sobre la conducción, responde brevemente como a un colega y luego retoma la simulación."
    ),
    "fr": (
        "SIMULATION — ENTRAÎNEMENT DE L’ENSEIGNANT. La personne qui écrit dans cette conversation "
        "est un enseignant qui joue un étudiant imaginaire pour s’entraîner à guider le parcours "
        "avant les séances réelles. Le carnet dans [PROFILE] décrit un étudiant simulé, pas une "
        "personne réelle. Mène la conversation exactement comme avec un véritable étudiant : même "
        "parcours, même ton, mêmes règles, et traite-le comme l’étudiant décrit dans le carnet. Ne "
        "demande ni n’invente de données personnelles réelles et ne présente rien comme "
        "l’évaluation d’une personne réelle. Si l’enseignant sort du rôle et demande un retour sur "
        "la conduite de l’échange, réponds brièvement comme à un collègue, puis reprends la simulation."
    ),
    "de": (
        "SIMULATION — ÜBUNG DER LEHRKRAFT. Die Person, die in diesem Gespräch schreibt, ist eine "
        "Lehrkraft, die einen erfundenen Lernenden spielt, um vor echten Sitzungen die "
        "Gesprächsführung zu üben. Das Notizbuch in [PROFILE] beschreibt einen simulierten "
        "Lernenden, keine reale Person. Führe das Gespräch genau so wie mit einem echten "
        "Lernenden: gleicher Ablauf, gleicher Ton, gleiche Regeln, und behandle ihn als den im "
        "Notizbuch beschriebenen Lernenden. Frage keine echten personenbezogenen Daten ab, erfinde "
        "keine und stelle nichts als Bewertung einer realen Person dar. Wenn die Lehrkraft aus der "
        "Rolle tritt und eine Rückmeldung zur Gesprächsführung wünscht, antworte kurz wie einer "
        "Kollegin oder einem Kollegen und setze dann die Simulation fort."
    ),
    "sv": (
        "SIMULERING — LÄRARENS ÖVNING. Den som skriver i det här samtalet är en lärare som spelar "
        "en påhittad elev för att öva på att leda samtalet före riktiga sessioner. "
        "Anteckningsboken i [PROFILE] beskriver en simulerad elev, inte en verklig person. Led "
        "samtalet precis som med en riktig elev: samma väg, samma ton, samma regler, och behandla "
        "personen som eleven i anteckningsboken. Be inte om och hitta inte på verkliga "
        "personuppgifter, och framställ inget som en bedömning av en verklig person. Om läraren "
        "kliver ur rollen och ber om återkoppling på samtalsledningen, svara kort som till en "
        "kollega och återuppta sedan simuleringen."
    ),
}


def simulation_notice(language: str | None) -> str:
    """Avviso di simulazione nella lingua dell'interfaccia (italiano di riserva)."""
    code = str(language or "").strip().lower()[:2]
    return SIMULATION_NOTICES.get(code, SIMULATION_NOTICES["it"])


def is_plan_manager(identity: dict | None) -> bool:
    """Docenti, ricercatori e admin: lo stesso guard di get_current_plan_manager."""
    return bool(identity) and (
        bool(identity.get("is_admin"))
        or bool(identity.get("is_researcher"))
        or auth.is_teacher(identity.get("groups"))
    )


def owned_practice_notebook(db: Session, username: str, notebook_id) -> models.TeacherPracticeNotebook | None:
    """Taccuino di prova attivo del docente, o None (altrui, archiviato, assente)."""
    if not username or notebook_id in (None, ""):
        return None
    try:
        notebook_id = int(notebook_id)
    except (TypeError, ValueError):
        return None
    return (
        db.query(models.TeacherPracticeNotebook)
        .filter(
            models.TeacherPracticeNotebook.id == notebook_id,
            models.TeacherPracticeNotebook.owner_username == username,
            models.TeacherPracticeNotebook.archived_at.is_(None),
        )
        .first()
    )


def requested_practice_notebook(db: Session, identity: dict | None, notebook_context, notebook_id) -> models.TeacherPracticeNotebook | None:
    """Il taccuino di prova da usare in questo turno, se la richiesta e' valida.

    Ruolo riverificato a ogni chiamata: chi non e' piu' docente torna al suo
    default senza che il client debba saperlo."""
    if notebook_context != "practice" or not is_plan_manager(identity):
        return None
    return owned_practice_notebook(db, str((identity or {}).get("username") or ""), notebook_id)


def practice_instruments_context(db: Session, notebook: models.TeacherPracticeNotebook | None) -> str:
    """Strumenti gia' "compilati" dallo studente simulato: tipo e data, mai i punteggi.

    Serve alla Bussola, che per uno studente vero legge le sue compilazioni."""
    if notebook is None:
        return ""
    rows = (
        db.query(models.TeacherPracticeResult.questionnaire_type, models.TeacherPracticeResult.created_at)
        .filter(models.TeacherPracticeResult.notebook_id == notebook.id)
        .order_by(models.TeacherPracticeResult.created_at.desc())
        .all()
    )
    seen: dict[str, str] = {}
    for qtype, created_at in rows:
        if qtype not in seen:
            seen[qtype] = created_at.date().isoformat() if created_at else ""
    if not seen:
        return ""
    lines = ["### Instruments already completed (by the simulated student)"]
    lines += [f"- {qtype}" + (f" ({day})" if day else "") for qtype, day in seen.items()]
    lines.append(
        "Recommending one of these opens its guided chat on results that already exist, "
        "so the student does not fill it in again. You never see the scores and never interpret them."
    )
    return "\n".join(lines)


def practice_notebook_context(notebook: models.TeacherPracticeNotebook | None) -> str:
    """Blocco [PROFILE] dello studente simulato: stessi campi del taccuino reale."""
    if notebook is None:
        return ""
    data = notebook.data if isinstance(notebook.data, dict) else {}
    lines = [
        f"## Taccuino studente di prova (simulato): «{notebook.title}»",
        "Auto-descrizione di uno studente immaginario scritta dal docente per la simulazione: "
        "usala come useresti il taccuino di uno studente vero.",
    ]
    for key, label in LEARNER_PROFILE_LABELS.items():
        value = str(data.get(key) or "").strip()
        if value:
            lines.append(f"- {label}: {value}")
    return "\n".join(lines)[:MAX_PRACTICE_NOTEBOOK_CHARS]
