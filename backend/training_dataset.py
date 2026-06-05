"""Utilities for supervised training examples reviewed by admins.

The records created here are synthetic QSA counseling examples, not raw
psychometric validation responses. They are exported only after human approval.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from . import models
from .chat_logic import _QSA_FACTOR_NAMES, _QSA_INVERTED_CODES
from .prompt_config import DEFAULT_GUIDED_STEPS


APPROVED_EXPORT_STATUSES = {"approved", "edited"}
VALID_REVIEW_STATUSES = {"pending", "approved", "rejected", "edited"}

QSA_PHASE_LABELS = {
    step["id"]: step["label"]
    for step in DEFAULT_GUIDED_STEPS
}
QSA_PHASE_LABELS.update({
    "questions": "Domande e Approfondimenti",
    "conclusion": "Conclusione",
})

QSA_PHASE_FACTORS = {
    "cognitive": ["C1", "C2", "C3", "C4", "C5", "C6", "C7"],
    "affective": ["A1", "A2", "A3", "A4", "A5", "A6", "A7"],
    "sl-elaboration": ["C1", "C5", "C7"],
    "sl-selfcontrol": ["C2", "C3", "C6"],
    "sl-motivation": ["A2", "A5", "A6"],
    "sl-emotions": ["A1", "A7"],
    "sl-attribution": ["A3", "A4"],
    "sl-social": ["C4"],
    "questions": ["C1", "C2", "C3", "C6", "A1", "A2", "A5", "A6"],
    "conclusion": ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "A1", "A2", "A3", "A4", "A5", "A6", "A7"],
}

LOCALE_TEXT = {
    "it": {
        "profile": "PROFILO QSA DELLO STUDENTE",
        "question": "Come posso lavorare su questa parte del mio profilo senza sentirmi giudicato?",
        "conclusion_question": "Quali sono i prossimi passi piu' utili da seguire nelle prossime settimane?",
        "resource": "risorsa",
        "growth": "area di crescita",
        "balanced": "area intermedia",
        "answer_intro": "In questa fase guarderei soprattutto i fattori collegati allo step corrente.",
        "answer_plan": "Un passo pratico e' scegliere una sola abitudine osservabile per una settimana, poi verificare cosa cambia.",
        "answer_close": "La lettura non e' un giudizio: serve a trasformare il profilo in azioni piccole e realistiche.",
    },
    "en": {
        "profile": "STUDENT QSA PROFILE",
        "question": "How can I work on this part of my profile without feeling judged?",
        "conclusion_question": "What are the most useful next steps for the coming weeks?",
        "resource": "resource",
        "growth": "growth area",
        "balanced": "intermediate area",
        "answer_intro": "In this phase I would focus mainly on the factors linked to the current step.",
        "answer_plan": "A practical step is to choose one observable habit for one week, then check what changes.",
        "answer_close": "This reading is not a judgement: it turns the profile into small, realistic actions.",
    },
    "es": {
        "profile": "PERFIL QSA DEL ESTUDIANTE",
        "question": "Como puedo trabajar esta parte de mi perfil sin sentirme juzgado?",
        "conclusion_question": "Cuales son los proximos pasos mas utiles para las proximas semanas?",
        "resource": "recurso",
        "growth": "area de mejora",
        "balanced": "area intermedia",
        "answer_intro": "En esta fase miraria sobre todo los factores vinculados al paso actual.",
        "answer_plan": "Un paso practico es elegir un solo habito observable durante una semana y luego revisar que cambia.",
        "answer_close": "La lectura no es un juicio: sirve para transformar el perfil en acciones pequenas y realistas.",
    },
    "fr": {
        "profile": "PROFIL QSA DE L'ETUDIANT",
        "question": "Comment travailler cette partie de mon profil sans me sentir juge?",
        "conclusion_question": "Quelles sont les prochaines etapes les plus utiles pour les semaines a venir?",
        "resource": "ressource",
        "growth": "axe de progression",
        "balanced": "zone intermediaire",
        "answer_intro": "Dans cette phase, je regarderais surtout les facteurs lies a l'etape actuelle.",
        "answer_plan": "Un pas pratique consiste a choisir une seule habitude observable pendant une semaine, puis a verifier ce qui change.",
        "answer_close": "Cette lecture n'est pas un jugement: elle transforme le profil en actions petites et realistes.",
    },
    "de": {
        "profile": "QSA-PROFIL DES STUDIERENDEN",
        "question": "Wie kann ich an diesem Teil meines Profils arbeiten, ohne mich bewertet zu fuehlen?",
        "conclusion_question": "Welche naechsten Schritte sind in den kommenden Wochen am hilfreichsten?",
        "resource": "Ressource",
        "growth": "Entwicklungsbereich",
        "balanced": "mittlerer Bereich",
        "answer_intro": "In dieser Phase wuerde ich vor allem auf die Faktoren des aktuellen Schritts schauen.",
        "answer_plan": "Ein praktischer Schritt ist, eine beobachtbare Gewohnheit fuer eine Woche auszuwaehlen und dann die Veraenderung zu pruefen.",
        "answer_close": "Diese Einordnung ist kein Urteil: Sie uebersetzt das Profil in kleine, realistische Handlungen.",
    },
    "sv": {
        "profile": "STUDENTENS QSA-PROFIL",
        "question": "Hur kan jag arbeta med den har delen av min profil utan att kanna mig bedomd?",
        "conclusion_question": "Vilka nasta steg ar mest anvandbara de kommande veckorna?",
        "resource": "resurs",
        "growth": "utvecklingsomrade",
        "balanced": "mellanomrade",
        "answer_intro": "I den har fasen skulle jag framfor allt titta pa faktorerna som hor till det aktuella steget.",
        "answer_plan": "Ett praktiskt steg ar att valja en observerbar vana under en vecka och sedan se vad som forandras.",
        "answer_close": "Lasningen ar inte en bedomning: den gor profilen till sma och realistiska handlingar.",
    },
}


def _locale(locale: str) -> str:
    return locale if locale in LOCALE_TEXT else "it"


def _qsa_scores(seed: int) -> dict[str, int]:
    codes = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "A1", "A2", "A3", "A4", "A5", "A6", "A7"]
    return {
        code: ((seed + idx * 3) % 9) + 1
        for idx, code in enumerate(codes)
    }


def _interpret(code: str, value: int, locale: str) -> str:
    text = LOCALE_TEXT[_locale(locale)]
    inverted = code in _QSA_INVERTED_CODES
    if inverted:
        if value <= 3:
            return text["resource"]
        if value >= 7:
            return text["growth"]
        return text["balanced"]
    if value >= 7:
        return text["resource"]
    if value <= 3:
        return text["growth"]
    return text["balanced"]


def build_scores_context(scores: dict[str, int], locale: str) -> str:
    loc = _locale(locale)
    names = _QSA_FACTOR_NAMES.get(loc, _QSA_FACTOR_NAMES["it"])
    lines = [LOCALE_TEXT[loc]["profile"] + ":"]
    for code in sorted(scores):
        lines.append(f"- {code} ({names.get(code, code)}): {scores[code]}/9")
    return "\n".join(lines)


def _assistant_answer(phase: str, scores: dict[str, int], locale: str) -> str:
    loc = _locale(locale)
    text = LOCALE_TEXT[loc]
    names = _QSA_FACTOR_NAMES.get(loc, _QSA_FACTOR_NAMES["it"])
    factor_codes = QSA_PHASE_FACTORS.get(phase, QSA_PHASE_FACTORS["questions"])[:4]
    bullets = []
    for code in factor_codes:
        value = scores[code]
        bullets.append(
            f"- {code} ({names.get(code, code)}): {value}/9, {_interpret(code, value, loc)}."
        )
    return "\n".join([
        text["answer_intro"],
        "",
        *bullets,
        "",
        text["answer_plan"],
        text["answer_close"],
    ])


def _student_message(phase: str, locale: str) -> str:
    loc = _locale(locale)
    if phase == "conclusion":
        return LOCALE_TEXT[loc]["conclusion_question"]
    return LOCALE_TEXT[loc]["question"]


def _auto_score(phase: str, answer: str) -> dict:
    expected = QSA_PHASE_FACTORS.get(phase, [])
    mentions = sum(1 for code in expected if code in answer)
    return {
        "phase_respect": 1.0 if mentions else 0.7,
        "mentions_expected_factors": mentions,
        "expected_factor_count": len(expected),
        "uses_proprietary_items": False,
        "requires_human_review": True,
    }


def training_query(
    db: Session,
    instrument_code: Optional[str] = None,
    locale: Optional[str] = None,
    phase: Optional[str] = None,
    status: Optional[str] = None,
):
    query = db.query(models.TrainingExample)
    if instrument_code:
        query = query.filter(models.TrainingExample.instrument_code == instrument_code)
    if locale:
        query = query.filter(models.TrainingExample.locale == locale)
    if phase:
        query = query.filter(models.TrainingExample.phase == phase)
    if status:
        query = query.filter(models.TrainingExample.status == status)
    return query


def training_summary(
    db: Session,
    instrument_code: Optional[str] = None,
    locale: Optional[str] = None,
    phase: Optional[str] = None,
    status: Optional[str] = None,
) -> dict:
    rows = training_query(db, instrument_code, locale, phase, status).all()
    by_status: dict[str, int] = {}
    by_locale: dict[str, int] = {}
    by_phase: dict[str, int] = {}
    for row in rows:
        by_status[row.status] = by_status.get(row.status, 0) + 1
        by_locale[row.locale] = by_locale.get(row.locale, 0) + 1
        by_phase[row.phase] = by_phase.get(row.phase, 0) + 1
    return {
        "total": len(rows),
        "by_status": by_status,
        "by_locale": by_locale,
        "by_phase": by_phase,
    }


def generate_qsa_examples(db: Session, locale: str, phase: str, count: int) -> list[models.TrainingExample]:
    loc = _locale(locale)
    phase = phase if phase in QSA_PHASE_LABELS else "questions"
    existing = training_query(db, "QSA", loc, phase).count()
    created: list[models.TrainingExample] = []
    for offset in range(count):
        scores = _qsa_scores(existing + offset + 1)
        scores_context = build_scores_context(scores, loc)
        student_message = _student_message(phase, loc)
        assistant_answer = _assistant_answer(phase, scores, loc)
        row = models.TrainingExample(
            instrument_code="QSA",
            locale=loc,
            phase=phase,
            step_label=QSA_PHASE_LABELS[phase],
            scores=scores,
            scores_context=scores_context,
            student_message=student_message,
            assistant_answer=assistant_answer,
            status="pending",
            review_notes="",
            auto_score=_auto_score(phase, assistant_answer),
            source="synthetic-template-v1",
        )
        db.add(row)
        created.append(row)
    db.commit()
    for row in created:
        db.refresh(row)
    return created


def build_training_jsonl(rows: Iterable[models.TrainingExample]) -> str:
    output = []
    for row in rows:
        system = (
            "You are CounselorBot, a QSA counseling assistant. Respect the current "
            "guided phase, use the student's language, do not invent proprietary item "
            "texts, and turn the profile into practical study guidance."
        )
        user = (
            f"INSTRUMENT: {row.instrument_code}\n"
            f"LANGUAGE: {row.locale}\n"
            f"PHASE: {row.phase}\n"
            f"STEP: {row.step_label or row.phase}\n\n"
            f"{row.scores_context}\n\n"
            f"STUDENT QUESTION:\n{row.student_message}"
        )
        record = {
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
                {"role": "assistant", "content": row.assistant_answer},
            ],
            "metadata": {
                "id": row.id,
                "instrument_code": row.instrument_code,
                "locale": row.locale,
                "phase": row.phase,
                "status": row.status,
                "source": row.source,
                "exported_at": datetime.utcnow().isoformat() + "Z",
            },
        }
        output.append(json.dumps(record, ensure_ascii=False))
    return "\n".join(output) + ("\n" if output else "")
