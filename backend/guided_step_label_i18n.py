"""Multilingual guided-step labels.

The Italian label lives in `guided_steps.label` (base value); every other
language lives in the `guided_steps.label_i18n` JSON column ({lang: label}).
`/qsa/guided-ui-texts?lang=XX` resolves label_i18n[lang] with fallback to the
Italian base label.

Keys are the guided_steps primary keys (globally unique across questionnaires).
Seeding is idempotent and only fills languages that are still missing, so
admin-customised translations are never overwritten.
"""

from typing import Dict

SECONDARY_LANGS = ["en", "es", "fr", "de", "sv"]

STEP_LABEL_I18N: Dict[str, Dict[str, str]] = {
    # --- QSA ---
    "intro": {
        "en": "0. Introduction", "es": "0. Presentación", "fr": "0. Présentation",
        "de": "0. Vorstellung", "sv": "0. Presentation",
    },
    "cognitive": {
        "en": "1. Cognitive Factors", "es": "1. Factores Cognitivos", "fr": "1. Facteurs Cognitifs",
        "de": "1. Kognitive Faktoren", "sv": "1. Kognitiva faktorer",
    },
    "affective": {
        "en": "2. Affective Factors", "es": "2. Factores Afectivos", "fr": "2. Facteurs Affectifs",
        "de": "2. Affektive Faktoren", "sv": "2. Affektiva faktorer",
    },
    "sl-elaboration": {
        "en": "3. Elaboration and Organisation", "es": "3. Elaboración y Organización",
        "fr": "3. Élaboration et Organisation", "de": "3. Verarbeitung und Organisation",
        "sv": "3. Bearbetning och organisation",
    },
    "sl-selfcontrol": {
        "en": "4. Self-control", "es": "4. Autocontrol", "fr": "4. Autocontrôle",
        "de": "4. Selbstkontrolle", "sv": "4. Självkontroll",
    },
    "sl-motivation": {
        "en": "5. Motivation", "es": "5. Motivación", "fr": "5. Motivation",
        "de": "5. Motivation", "sv": "5. Motivation",
    },
    "sl-emotions": {
        "en": "6. Emotional Management", "es": "6. Gestión Emocional", "fr": "6. Gestion Émotionnelle",
        "de": "6. Emotionsregulation", "sv": "6. Känslohantering",
    },
    "sl-attribution": {
        "en": "7. Attributional Style", "es": "7. Estilo Atribucional", "fr": "7. Style d'Attribution",
        "de": "7. Attributionsstil", "sv": "7. Attributionsstil",
    },
    "sl-social": {
        "en": "8. Social Dimension", "es": "8. Dimensión Social", "fr": "8. Dimension Sociale",
        "de": "8. Soziale Dimension", "sv": "8. Social dimension",
    },
    # --- QSAr ---
    "qsar-intro": {
        "en": "0. Introduction", "es": "0. Presentación", "fr": "0. Présentation",
        "de": "0. Vorstellung", "sv": "0. Presentation",
    },
    "qsar-cognitive": {
        "en": "1. Cognitive Factors", "es": "1. Factores Cognitivos", "fr": "1. Facteurs Cognitifs",
        "de": "1. Kognitive Faktoren", "sv": "1. Kognitiva faktorer",
    },
    "qsar-affective": {
        "en": "2. Affective Factors", "es": "2. Factores Afectivos", "fr": "2. Facteurs Affectifs",
        "de": "2. Affektive Faktoren", "sv": "2. Affektiva faktorer",
    },
    "qsar-processing": {
        "en": "3. Elaboration and Organisation", "es": "3. Elaboración y Organización",
        "fr": "3. Élaboration et Organisation", "de": "3. Verarbeitung und Organisation",
        "sv": "3. Bearbetning och organisation",
    },
    "qsar-selfcontrol": {
        "en": "4. Self-regulation and Attention", "es": "4. Autorregulación y Atención",
        "fr": "4. Autorégulation et Attention", "de": "4. Selbstregulation und Aufmerksamkeit",
        "sv": "4. Självreglering och uppmärksamhet",
    },
    "qsar-motivation": {
        "en": "5. Motivation and Competence", "es": "5. Motivación y Competencia",
        "fr": "5. Motivation et Compétence", "de": "5. Motivation und Kompetenz",
        "sv": "5. Motivation och kompetens",
    },
    "qsar-emotions": {
        "en": "6. Emotional Management", "es": "6. Gestión Emocional", "fr": "6. Gestion Émotionnelle",
        "de": "6. Emotionsregulation", "sv": "6. Känslohantering",
    },
    "qsar-attributions": {
        "en": "7. Causal Attributions", "es": "7. Atribuciones Causales", "fr": "7. Attributions Causales",
        "de": "7. Kausalattributionen", "sv": "7. Kausala attributioner",
    },
    # --- ZTPI (the "T1 - " code prefixes are stripped for students by the endpoint sanitizer) ---
    "ztpi-intro": {
        "en": "0. Introduction", "es": "0. Presentación", "fr": "0. Présentation",
        "de": "0. Vorstellung", "sv": "0. Presentation",
    },
    "ztpi-t1": {
        "en": "1. T1 - Negative Past", "es": "1. T1 - Pasado Negativo", "fr": "1. T1 - Passé Négatif",
        "de": "1. T1 - Negative Vergangenheit", "sv": "1. T1 - Negativt förflutet",
    },
    "ztpi-t2": {
        "en": "2. T2 - Positive Past", "es": "2. T2 - Pasado Positivo", "fr": "2. T2 - Passé Positif",
        "de": "2. T2 - Positive Vergangenheit", "sv": "2. T2 - Positivt förflutet",
    },
    "ztpi-t3": {
        "en": "3. T3 - Hedonistic Present", "es": "3. T3 - Presente Hedonista",
        "fr": "3. T3 - Présent Hédoniste", "de": "3. T3 - Hedonistische Gegenwart",
        "sv": "3. T3 - Hedonistisk nutid",
    },
    "ztpi-t4": {
        "en": "4. T4 - Fatalistic Present", "es": "4. T4 - Presente Fatalista",
        "fr": "4. T4 - Présent Fataliste", "de": "4. T4 - Fatalistische Gegenwart",
        "sv": "4. T4 - Fatalistisk nutid",
    },
    "ztpi-t5": {
        "en": "5. T5 - Future", "es": "5. T5 - Futuro", "fr": "5. T5 - Futur",
        "de": "5. T5 - Zukunft", "sv": "5. T5 - Framtid",
    },
    "ztpi-btp": {
        "en": "6. Balanced Time Perspective", "es": "6. Perfil Temporal Equilibrado",
        "fr": "6. Profil Temporel Équilibré", "de": "6. Ausgewogene Zeitperspektive",
        "sv": "6. Balanserat tidsperspektiv",
    },
    # --- SAVICKAS ---
    "savickas-intro": {
        "en": "0. Introduction", "es": "0. Presentación", "fr": "0. Présentation",
        "de": "0. Vorstellung", "sv": "0. Presentation",
    },
    "savickas-patto": {
        "en": "0. Collaboration Agreement", "es": "0. Pacto de Colaboración",
        "fr": "0. Pacte de Collaboration", "de": "0. Kooperationsvereinbarung",
        "sv": "0. Samarbetsöverenskommelse",
    },
    "savickas-q1": {
        "en": "1. Role Models", "es": "1. Modelos de Rol", "fr": "1. Modèles de Rôle",
        "de": "1. Rollenvorbilder", "sv": "1. Förebilder",
    },
    "savickas-q2": {
        "en": "2. Favourite Media", "es": "2. Medios Favoritos", "fr": "2. Médias Préférés",
        "de": "2. Lieblingsmedien", "sv": "2. Favoritmedier",
    },
    "savickas-q3": {
        "en": "3. Favourite Story", "es": "3. Historia Favorita", "fr": "3. Histoire Préférée",
        "de": "3. Lieblingsgeschichte", "sv": "3. Favoritberättelse",
    },
    "savickas-q4": {
        "en": "4. Personal Motto", "es": "4. Lema Personal", "fr": "4. Devise Personnelle",
        "de": "4. Persönliches Motto", "sv": "4. Personligt motto",
    },
    "savickas-q5": {
        "en": "5. Early Recollections", "es": "5. Recuerdos Tempranos", "fr": "5. Souvenirs Précoces",
        "de": "5. Frühe Erinnerungen", "sv": "5. Tidiga minnen",
    },
    "savickas-final": {
        "en": "6. Narrative Synthesis and Action Plan", "es": "6. Síntesis Narrativa y Plan de Acción",
        "fr": "6. Synthèse Narrative et Plan d'Action", "de": "6. Narrative Synthese und Aktionsplan",
        "sv": "6. Narrativ syntes och handlingsplan",
    },
    # --- QPCS (detailed path) ---
    "qpcs-intro": {
        "en": "0. Collaboration Agreement", "es": "0. Pacto de Colaboración",
        "fr": "0. Pacte de Collaboration", "de": "0. Kooperationsvereinbarung",
        "sv": "0. Samarbetsöverenskommelse",
    },
    "qpcs-emozioni": {
        "en": "1. Managing Emotions", "es": "1. Gestión de las Emociones",
        "fr": "1. Gestion des Émotions", "de": "1. Umgang mit Emotionen",
        "sv": "1. Känslohantering",
    },
    "qpcs-comunicazione": {
        "en": "2. Communication Competence", "es": "2. Competencia Comunicativa",
        "fr": "2. Compétence Communicative", "de": "2. Kommunikative Kompetenz",
        "sv": "2. Kommunikativ kompetens",
    },
    "qpcs-volizione": {
        "en": "3. Will and Perseverance", "es": "3. Voluntad y Perseverancia",
        "fr": "3. Volonté et Persévérance", "de": "3. Wille und Ausdauer",
        "sv": "3. Vilja och uthållighet",
    },
    "qpcs-apprendimento": {
        "en": "4. Strategies and Collaboration", "es": "4. Estrategias y Colaboración",
        "fr": "4. Stratégies et Collaboration", "de": "4. Strategien und Zusammenarbeit",
        "sv": "4. Strategier och samarbete",
    },
    "qpcs-fiducia": {
        "en": "5. Confidence and Life Project", "es": "5. Confianza y Proyecto de Vida",
        "fr": "5. Confiance et Projet de Vie", "de": "5. Zuversicht und Lebensplan",
        "sv": "5. Tillit och livsprojekt",
    },
    "qpcs-sintesi": {
        "en": "6. Synthesis and Action Plan", "es": "6. Síntesis y Plan de Acción",
        "fr": "6. Synthèse et Plan d'Action", "de": "6. Synthese und Aktionsplan",
        "sv": "6. Syntes och handlingsplan",
    },
    # QPCS compact defaults (fresh installs only)
    "qpcs-welcome": {
        "en": "0. Introduction", "es": "0. Presentación", "fr": "0. Présentation",
        "de": "0. Vorstellung", "sv": "0. Presentation",
    },
    "qpcs-factors": {
        "en": "1. Competence Analysis", "es": "1. Análisis de las Competencias",
        "fr": "1. Analyse des Compétences", "de": "1. Kompetenzanalyse",
        "sv": "1. Kompetensanalys",
    },
    # --- QPCC (detailed path) ---
    "qpcc-intro": {
        "en": "0. Collaboration Agreement", "es": "0. Pacto de Colaboración",
        "fr": "0. Pacte de Collaboration", "de": "0. Kooperationsvereinbarung",
        "sv": "0. Samarbetsöverenskommelse",
    },
    "qpcc-comunicazione": {
        "en": "1. Public Speaking", "es": "1. Comunicación en Público",
        "fr": "1. Communication en Public", "de": "1. Sprechen vor Publikum",
        "sv": "1. Att tala inför publik",
    },
    "qpcc-controllo": {
        "en": "2. Anxiety, Control and Responsibility", "es": "2. Ansiedad, Control y Responsabilidad",
        "fr": "2. Anxiété, Contrôle et Responsabilité", "de": "2. Angst, Kontrolle und Verantwortung",
        "sv": "2. Oro, kontroll och ansvar",
    },
    "qpcc-volizione": {
        "en": "3. Volition and Self-regulation", "es": "3. Volición y Autorregulación",
        "fr": "3. Volition et Autorégulation", "de": "3. Volition und Selbstregulation",
        "sv": "3. Volition och självreglering",
    },
    "qpcc-elaborazione": {
        "en": "4. Elaboration Strategies", "es": "4. Estrategias de Elaboración",
        "fr": "4. Stratégies d'Élaboration", "de": "4. Verarbeitungsstrategien",
        "sv": "4. Bearbetningsstrategier",
    },
    "qpcc-convinzioni": {
        "en": "5. Beliefs about Oneself", "es": "5. Convicciones sobre Sí Mismo",
        "fr": "5. Convictions sur Soi", "de": "5. Überzeugungen über sich selbst",
        "sv": "5. Föreställningar om sig själv",
    },
    "qpcc-sintesi": {
        "en": "6. Synthesis and Action Plan", "es": "6. Síntesis y Plan de Acción",
        "fr": "6. Synthèse et Plan d'Action", "de": "6. Synthese und Aktionsplan",
        "sv": "6. Syntes och handlingsplan",
    },
    # QPCC compact defaults (fresh installs only)
    "qpcc-welcome": {
        "en": "0. Introduction", "es": "0. Presentación", "fr": "0. Présentation",
        "de": "0. Vorstellung", "sv": "0. Presentation",
    },
    "qpcc-factors": {
        "en": "1. Analysis of Competences and Beliefs", "es": "1. Análisis de Competencias y Convicciones",
        "fr": "1. Analyse des Compétences et Convictions", "de": "1. Analyse von Kompetenzen und Überzeugungen",
        "sv": "1. Analys av kompetenser och föreställningar",
    },
    # --- QAP (detailed path) ---
    "qap-intro": {
        "en": "0. Collaboration Agreement", "es": "0. Pacto de Colaboración",
        "fr": "0. Pacte de Collaboration", "de": "0. Kooperationsvereinbarung",
        "sv": "0. Samarbetsöverenskommelse",
    },
    "qap-preoccupazione": {
        "en": "1. Future Orientation", "es": "1. Orientación al Futuro",
        "fr": "1. Orientation vers l'Avenir", "de": "1. Zukunftsorientierung",
        "sv": "1. Framtidsorientering",
    },
    "qap-controllo": {
        "en": "2. Control and Autonomy", "es": "2. Control y Autonomía",
        "fr": "2. Contrôle et Autonomie", "de": "2. Kontrolle und Autonomie",
        "sv": "2. Kontroll och autonomi",
    },
    "qap-curiosita": {
        "en": "3. Curiosity and Exploration", "es": "3. Curiosidad y Exploración",
        "fr": "3. Curiosité et Exploration", "de": "3. Neugier und Erkundung",
        "sv": "3. Nyfikenhet och utforskande",
    },
    "qap-fiducia": {
        "en": "4. Confidence and Problem Solving", "es": "4. Confianza y Resolución de Problemas",
        "fr": "4. Confiance et Résolution de Problèmes", "de": "4. Zuversicht und Problemlösen",
        "sv": "4. Tillit och problemlösning",
    },
    "qap-sintesi": {
        "en": "5. Synthesis and Action Plan", "es": "5. Síntesis y Plan de Acción",
        "fr": "5. Synthèse et Plan d'Action", "de": "5. Synthese und Aktionsplan",
        "sv": "5. Syntes och handlingsplan",
    },
    # QAP compact defaults (fresh installs only)
    "qap-welcome": {
        "en": "0. Introduction", "es": "0. Presentación", "fr": "0. Présentation",
        "de": "0. Vorstellung", "sv": "0. Presentation",
    },
    "qap-factors": {
        "en": "1. Resource Analysis", "es": "1. Análisis de los Recursos",
        "fr": "1. Analyse des Ressources", "de": "1. Ressourcenanalyse",
        "sv": "1. Resursanalys",
    },
}


def resolve_step_label(step, lang: str) -> str:
    """Return the localized label for a GuidedStep, falling back to the Italian base."""
    if lang and lang != "it" and step.label_i18n:
        localized = step.label_i18n.get(lang)
        if localized:
            return localized
    return step.label


def seed_step_label_i18n(db, models) -> int:
    """Fill missing label_i18n translations for existing guided steps (idempotent)."""
    updated = 0
    for step in db.query(models.GuidedStep).all():
        translations = STEP_LABEL_I18N.get(step.id)
        if not translations:
            continue
        current = dict(step.label_i18n or {})
        missing = {lang: text for lang, text in translations.items() if lang not in current}
        if missing:
            current.update(missing)
            step.label_i18n = current
            updated += 1
    if updated:
        db.commit()
    return updated
