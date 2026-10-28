"""Consiglio orientativo: contesto e bozza assistita per il documento dei docenti.

La bozza non inventa nulla: costruisce il materiale dalla stessa base di dati che
il docente già vede (sintesi dei questionari, piani, assegnazioni, obiettivi
condivisi con la classe, taccuino), sempre tramite il gateway privacy. Il testo
generato resta una proposta: entra nel documento solo se la docenza lo salva.
"""
from sqlalchemy.orm import Session

from .ai_service import AIService
from .class_council import council_overview
from .student_context import latest_learner_profile

# Niente documenti word-of-mouth: il contesto entra compatto e tagliato dal fondo.
MAX_CONTEXT_CHARS = 9000
MAX_DRAFT_TOKENS = 900

DRAFT_SYSTEM_PROMPT = (
    "Il consiglio di classe di una scuola secondaria sta compilando il consiglio "
    "orientativo di uno studente: il documento formale che valuta attitudini e impegni "
    "ai fini della prosecuzione degli studi. Riassumi SOLO ciò che dice il materiale "
    "fornito: nessun dato inventato, nessun punteggio non presente, nessun riferimento "
    "alla famiglia. Tono professionale e costruttivo, punti di forza prima delle aree di "
    "crescita, senza intestazioni ripetute. Rispondi in italiano con testo pronto da "
    "revisionare: 3-5 sezioni brevi su (1) andamento generale e metodo di studio, "
    "(2) punti di forza osservati, (3) aree su cui lavorare con suggerimenti pratici, "
    "(4) orientamento consigliato per il prossimo anno, (5) eventuali azioni di "
    "recupero da attivare subito. Massimo 350 parole, nessun HTML."
)


def _notes(db: Session, username: str) -> str:
    profile = latest_learner_profile(db, username)
    if not (profile and isinstance(profile.data, dict)):
        return ""
    value = " - ".join(
        f"{key}: {item}" for key, item in profile.data.items() if str(item or "").strip()
    )
    return value[:1200]


def _section(header: str, lines: list[str], empty: str) -> str:
    return header + "\n" + "\n".join(lines) if lines else header + "\n- " + empty


def _student_material(db: Session, group, username: str) -> str:
    """Il materiale per UNO studente, già filtrato dal gateway dentro AIService."""
    overview = council_overview(db, group)
    student = next((s for s in overview["students"] if s["username"] == username), None)
    if student is None:
        return ""
    sections = [
        _section("[RISULTATI QUESTIONARI]", [
            f"- {r['questionnaire_type']} ({r['submitted_at'] or 'senza data'}): "
            f"{r['summary'] or ('punteggi ' + str(r['scores']) if r['scores'] else 'nessun dato')}"
            for r in student["results"]
        ], "nessun risultato"),
        _section("[PIANI OPERATIVI]", [
            f"- {p['title']}: {p['done']}/{p['total']} passi svolti" for p in student["plans"]
        ], "nessun piano"),
        _section("[ASSEGNAZIONI]", [
            f"- {a['title']}: consegna {'presente' if a['submission'] else 'assente'}"
            + (f", feedback docente: {a['feedback']}" if (a['feedback'] or '').strip() else "")
            for a in student["assignments"]
        ], "nessuna assegnazione"),
        _section("[OBIETTIVI CONDIVISI CON LA CLASSE]", [
            f"- {g['title']} ({g['status']}, criteri: {g['criteria'] or '—'})" for g in student["goals"]
        ], "nessun obiettivo"),
    ]
    notes = _notes(db, username)
    if notes:
        sections.insert(0, f"[TACCUINO DELLO STUDENTE]\n- {notes}")
    material = "\n\n".join(sections)
    return material[:MAX_CONTEXT_CHARS]


def draft_prompt(group_name: str, display_name: str, material: str) -> str:
    return (
        f"Classe: {group_name}\nStudente: {display_name}\n\n"
        "MATERIALE RACCOLTO (usalo come unica fonte):\n\n"
        f"{material}\n\n"
        "Scrivi la bozza del consiglio orientativo secondo il sistema."
    ).strip()


def generate_draft(db: Session, group, username: str, display_name: str,
                   teacher_username: str) -> str | None:
    """Bozza assistita dal provider attivo; None se il modello non risponde."""
    material = _student_material(db, group, username)
    if not material:
        return None
    ai = AIService(db, username=teacher_username or None)
    prompt = draft_prompt(group.name, display_name, material)
    try:
        answer = ai.get_response(prompt, DRAFT_SYSTEM_PROMPT, "generic", max_tokens=MAX_DRAFT_TOKENS)
    except Exception:
        return None
    return (answer or "").strip() or None
