"""Identità visiva, categorie di approccio e raccomandazione counselor.

Implementa Milestone 2 / Issue #61:
- Categorie di approccio multiple (base: filosofo, psicologo, docente, orientatore, tutor + specifiche)
- Frasi distintive (tagline_i18n) e illustrazioni (avatar_url)
- Seed e backfill intelligente all'avvio basato su personas e descrizioni
- Motore di ricerca e raccomandazione per approccio su query libera
"""
from __future__ import annotations

import logging
import re
from typing import Dict, List, Optional, Set, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import cast as sa_cast, String

from . import models, schemas
from .counselor_i18n import localized_description, localized_tagline
from .counselor_scope import restricted_instruments, suits
from .reasoning_profiles import supports_reasoning

logger = logging.getLogger(__name__)

# Categorie base stabilite da specifica
BASE_APPROACH_CATEGORIES = [
    "filosofo",
    "psicologo",
    "docente",
    "orientatore",
    "tutor",
]

# Configurazione canonica di default per i counselor noti
COUNSELOR_IDENTITY_DEFAULTS: Dict[str, dict] = {
    "marco": {
        "slug": "marco",
        "tagline_i18n": {
            "it": "Ti accompagna con domande calme e precise che aiutano a chiarire sfumature, idee e alternative.",
            "en": "Accompanies you with calm, precise questions to clarify nuances, ideas, and alternatives.",
            "es": "Te acompaña con preguntas que ayudan a aclarar ideas, significados y alternativas.",
        },
        "approach_categories": ["filosofo", "maieutico", "riflessivo", "orientatore"],
        "avatar_url": "/images/counselors/marco.svg",
    },
    "sara": {
        "slug": "sara",
        "tagline_i18n": {
            "it": "Uno spazio accogliente ed empatico per comprendere vissuti, motivazione ed emozioni nello studio.",
            "en": "A welcoming, empathetic space to explore study experiences, motivation, and emotions.",
            "es": "Un espacio acogedor y empático para comprender vivencias, motivación y emociones en el estudio.",
        },
        "approach_categories": ["psicologo", "empatico", "accogliente", "orientatore"],
        "avatar_url": "/images/counselors/sara.svg",
    },
    "luca": {
        "slug": "luca",
        "tagline_i18n": {
            "it": "Approccio pratico e diretto per trasformare la riflessione in azioni e abitudini concrete.",
            "en": "A practical and direct approach to turn reflection into concrete actions and habits.",
            "es": "Enfoque práctico y directo para transformar la reflexión en acciones y hábitos concretos.",
        },
        "approach_categories": ["tutor", "pragmatico", "diretto", "orientatore"],
        "avatar_url": "/images/counselors/luca.svg",
    },
    "elena": {
        "slug": "elena",
        "tagline_i18n": {
            "it": "Domande socratiche e pensiero analitico per farti scoprire schemi, connessioni e strategie.",
            "en": "Socratic questioning and analytical thinking to uncover patterns, connections, and strategies.",
            "es": "Preguntas socráticas y pensamiento analítico para descubrir patrones, conexiones y estrategias.",
        },
        "approach_categories": ["filosofo", "maieutico", "analitico", "docente"],
        "avatar_url": "/images/counselors/elena.svg",
    },
    "davide": {
        "slug": "davide",
        "tagline_i18n": {
            "it": "Spinta motivazionale e sfide progressive per credere nelle tue capacità e superare gli ostacoli.",
            "en": "Motivational boost and progressive challenges to build confidence and overcome obstacles.",
            "es": "Impulso motivacional y desafíos graduales para confiar en tus capacidades y superar obstáculos.",
        },
        "approach_categories": ["tutor", "motivazionale", "coach", "orientatore"],
        "avatar_url": "/images/counselors/davide.svg",
    },
    "giulia": {
        "slug": "giulia",
        "tagline_i18n": {
            "it": "Metodo, struttura e sintesi: organizzazione ordinata e piani passo dopo passo.",
            "en": "Method, structure, and clarity: orderly organization and step-by-step plans.",
            "es": "Método, estructura y claridad: organización ordenada y planes paso a paso.",
        },
        "approach_categories": ["docente", "metodico", "organizzativo", "tutor"],
        "avatar_url": "/images/counselors/giulia.svg",
    },
    "nadia": {
        "slug": "nadia",
        "tagline_i18n": {
            "it": "Guida equilibrata e chiara che collega i risultati a scelte e abitudini quotidiane.",
            "en": "Balanced and clear guidance connecting assessment results to daily choices and habits.",
            "es": "Orientación clara y equilibrada que conecta los resultados con opciones y hábitos cotidianos.",
        },
        "approach_categories": ["orientatore", "docente", "equilibrato"],
        "avatar_url": "/images/counselors/nadia.svg",
    },
    "nadia-qwen": {
        "slug": "nadia-qwen",
        "tagline_i18n": {
            "it": "Guida equilibrata e chiara che collega i risultati a scelte e abitudini quotidiane.",
            "en": "Balanced and clear guidance connecting assessment results to daily choices and habits.",
            "es": "Orientación clara y equilibrada que conecta los resultados con opciones y hábitos cotidianos.",
        },
        "approach_categories": ["orientatore", "docente", "equilibrato"],
        "avatar_url": "/images/counselors/nadia.svg",
    },
    "nora": {
        "slug": "nora",
        "tagline_i18n": {
            "it": "Risposte essenziali, bilanciate e focalizzate sui collegamenti chiave del tuo profilo.",
            "en": "Essential, balanced responses focused on key connections in your profile.",
            "es": "Respuestas esenciales, equilibradas y centradas en las conexiones clave de tu perfil.",
        },
        "approach_categories": ["orientatore", "docente", "sintetico"],
        "avatar_url": "/images/counselors/nora.svg",
    },
    "nora-qwen-nothink": {
        "slug": "nora-qwen-nothink",
        "tagline_i18n": {
            "it": "Risposte essenziali, bilanciate e focalizzate sui collegamenti chiave del tuo profilo.",
            "en": "Essential, balanced responses focused on key connections in your profile.",
            "es": "Respuestas esenciales, equilibradas y centradas en las conexiones clave de tu perfil.",
        },
        "approach_categories": ["orientatore", "docente", "sintetico"],
        "avatar_url": "/images/counselors/nora.svg",
    },
    "iride": {
        "slug": "iride",
        "tagline_i18n": {
            "it": "Collega le idee e offre una visione d'insieme chiara per orientare lo studio.",
            "en": "Connects ideas and provides a clear big-picture view to guide learning.",
            "es": "Conecta ideas y ofrece una visión de conjunto clara para orientar el estudio.",
        },
        "approach_categories": ["tutor", "sintetico", "orientatore"],
        "avatar_url": "/images/counselors/iride.svg",
    },
    "clio": {
        "slug": "clio",
        "tagline_i18n": {
            "it": "Spiega passo dopo passo concetti e dettagli con pazienza e accuratezza.",
            "en": "Explains concepts and details step by step with patience and accuracy.",
            "es": "Explica conceptos y detalles paso a paso con paciencia y precisión.",
        },
        "approach_categories": ["docente", "analitico", "tutor"],
        "avatar_url": "/images/counselors/clio.svg",
    },
    "bruno": {
        "slug": "bruno",
        "tagline_i18n": {
            "it": "Connette modelli teorici della ricerca e implicazioni pedagogiche pratiche per docenti.",
            "en": "Bridges educational research frameworks with practical pedagogical applications for teachers.",
            "es": "Conecta modelos teóricos de investigación e implicaciones pedagógicas prácticas para docentes.",
        },
        "approach_categories": ["docente", "ricercatore", "teorico-pratico"],
        "avatar_url": "/images/counselors/bruno.svg",
    },
    "minerva": {
        "slug": "minerva",
        "tagline_i18n": {
            "it": "Approfondimenti rigorosi basati sulla letteratura scientifica, dati ed evidenze educative.",
            "en": "Rigorous evidence-based insights grounded in educational research literature and data.",
            "es": "Análisis rigurosos basados en la literatura científica, datos y evidencias educativas.",
        },
        "approach_categories": ["ricercatore", "docente", "analitico"],
        "avatar_url": "/images/counselors/minerva.svg",
    },
    "giulio": {
        "slug": "giulio",
        "tagline_i18n": {
            "it": "Ascolto attento e tempo per riflettere con calma quando il percorso si fa complesso.",
            "en": "Attentive listening and time to reflect calmly when the learning journey becomes complex.",
            "es": "Escucha atenta y tiempo para reflexionar con calma cuando el camino se vuelve complejo.",
        },
        "approach_categories": ["psicologo", "orientatore"],
        "avatar_url": "/images/counselors/giulio.svg",
    },
    "bianca": {
        "slug": "bianca",
        "tagline_i18n": {
            "it": "Accorda obiettivi e metodo di studio con cura e pazienza, un piccolo ritocco alla volta.",
            "en": "Tunes study habits and goals with patience and care, one small adjustment at a time.",
            "es": "Afina tus metas y hábitos de estudio con paciencia y esmero, un pequeño ajuste a la vez.",
        },
        "approach_categories": ["psicologo"],
        "avatar_url": "/images/counselors/bianca.svg",
    },
    "erik": {
        "slug": "erik",
        "tagline_i18n": {
            "it": "Trova la misura giusta nello studio con parole essenziali, metodo concreto e lagom.",
            "en": "Finds the right balance in study with essential words, practical methods, and lagom.",
            "es": "Encuentra la medida justa en el estudio con palabras esenciales, método práctico y lagom.",
        },
        "approach_categories": ["tutor"],
        "avatar_url": "/images/counselors/erik.svg",
    },
    "carmen": {
        "slug": "carmen",
        "tagline_i18n": {
            "it": "Trasforma gli errori in opportunità con calore, ritmo e la bellezza del kintsugi.",
            "en": "Turns mistakes into opportunities with warmth, rhythm, and the beauty of kintsugi.",
            "es": "Transforma los errores en oportunidades con calidez, ritmo y la belleza del kintsugi.",
        },
        "approach_categories": ["psicologo", "docente"],
        "avatar_url": "/images/counselors/carmen.svg",
    },
    "otto": {
        "slug": "otto",
        "tagline_i18n": {
            "it": "Esplora come ogni ingranaggio del tuo studio si incastra con metodo, precisione e pazienza.",
            "en": "Explores how every gear of your learning fits together with method, precision, and patience.",
            "es": "Explora cómo cada engranaje de tu estudio encaja con método, precisión y paciencia.",
        },
        "approach_categories": ["docente", "metodico"],
        "avatar_url": "/images/counselors/otto.svg",
    },
    "teo": {
        "slug": "teo",
        "tagline_i18n": {
            "it": "Consigli tra pari senza paternalismi per gestire esami, scadenze e procrastinazione.",
            "en": "Peer-to-peer advice without lecturing to tackle exams, deadlines, and procrastination.",
            "es": "Consejos entre iguales sin lecciones morales para gestionar exámenes y procrastinación.",
        },
        "approach_categories": ["psicologo", "docente", "tutor", "metodico"],
        "avatar_url": "/images/counselors/teo.svg",
    },
    "sonia": {
        "slug": "sonia",
        "tagline_i18n": {
            "it": "Pratiche di respiro e consapevolezza per calmare l'ansia e studiare con presenza.",
            "en": "Mindfulness and breathing practices to calm anxiety and study with presence.",
            "es": "Prácticas de respiración y atención plena para calmar la ansiedad y estudiar con presencia.",
        },
        "approach_categories": ["psicologo", "docente", "tutor"],
        "avatar_url": "/images/counselors/sonia.svg",
    },
    "rocco": {
        "slug": "rocco",
        "tagline_i18n": {
            "it": "Ritmo, costanza e recupero: affronta lo studio come un vero allenamento a tappe.",
            "en": "Rhythm, consistency, and recovery: treat learning like true athletic training.",
            "es": "Ritmo, constancia y descanso: afronta el estudio como un entrenamiento por etapas.",
        },
        "approach_categories": ["tutor"],
        "avatar_url": "/images/counselors/rocco.svg",
    },
    "aidan": {
        "slug": "aidan",
        "tagline_i18n": {
            "it": "Spiega i risultati con storie memorabili, umorismo leggero e calore amichevole.",
            "en": "Explains results through memorable stories, gentle humour, and friendly encouragement.",
            "es": "Explica los resultados a través de historias memorables, humor ligero y cercanía.",
        },
        "approach_categories": ["psicologo", "docente", "tutor"],
        "avatar_url": "/images/counselors/aidan.svg",
    },
    "camille": {
        "slug": "camille",
        "tagline_i18n": {
            "it": "Chiarezza cartesiana e tocco leggero per distinguere l'essenziale dal superfluo.",
            "en": "Cartesian clarity and a light touch to separate the essential from the superfluous.",
            "es": "Claridad cartesiana y un toque ligero para separar lo esencial de lo superfluo.",
        },
        "approach_categories": ["orientatore"],
        "avatar_url": "/images/counselors/camille.svg",
    },
    "luz": {
        "slug": "luz",
        "tagline_i18n": {
            "it": "Domande socratiche e prospettiva aperta per farti ragionare con autonomia e curiosità.",
            "en": "Socratic questions and an open perspective to foster autonomous reflection and curiosity.",
            "es": "Preguntas socráticas y perspectiva abierta para razonar con autonomía y curiosidad.",
        },
        "approach_categories": ["psicologo", "docente", "orientatore"],
        "avatar_url": "/images/counselors/luz.svg",
    },
    "vera": {
        "slug": "vera",
        "tagline_i18n": {
            "it": "Esplora il profilo ZTPI e i tratti personali come possibilità e risorse, senza giudizio.",
            "en": "Explores the ZTPI profile and personal traits as resources and possibilities, without judgement.",
            "es": "Explora el perfil ZTPI y tus rasgos temporales como recursos y posibilidades, sin juicios.",
        },
        "approach_categories": ["psicologo", "orientatore"],
        "avatar_url": "/images/counselors/vera.svg",
    },
    "omar": {
        "slug": "omar",
        "tagline_i18n": {
            "it": "Unisce i profili di diversi questionari in una mappa integrata e coerente.",
            "en": "Connects multi-instrument assessment profiles into a single coherent roadmap.",
            "es": "Integra los perfiles de diferentes cuestionarios en un mapa global y coherente.",
        },
        "approach_categories": ["psicologo", "docente", "tutor", "orientatore"],
        "avatar_url": "/images/counselors/omar.svg",
    },
    "gemini": {
        "slug": "gemini",
        "tagline_i18n": {
            "it": "Orientamento avanzato e sinergia digitale per esplorare percorsi e scenari futuri.",
            "en": "Advanced orientation and digital synergy to explore future paths and scenarios.",
            "es": "Orientación avanzada y sinergia digital para explorar trayectorias y futuros posibles.",
        },
        "approach_categories": ["orientatore"],
        "avatar_url": "/images/counselors/gemini.svg",
    },
}

# Lessico semantico per categorie e stili di counseling
SEMANTIC_INTENTS: Dict[str, List[str]] = {
    "filosofo": [
        "filosofo", "filosofia", "filosofico", "socrate", "socratico", "maieutica", "maieutico",
        "riflettere", "riflessione", "riflessivo", "pensare", "pensiero", "ragionare", "ragionamento",
        "domande", "domanda", "significato", "significati", "senso", "critico", "approfondire",
        "sfumature", "profondo", "prospettiva", "prospettive",
        "philosopher", "philosophical", "socratic", "reflective", "reflection", "reasoning", "questions",
    ],
    "psicologo": [
        "psicologo", "psicologia", "psicologico", "emotivo", "emozioni", "emozione", "empatico",
        "empatia", "accogliente", "accoglienza", "ascoltare", "ascolto", "vissuti", "vissuto",
        "ansia", "stress", "calma", "rassicurante", "paura", "sentimenti", "supporto", "comprensione",
        "psychologist", "empathetic", "welcoming", "emotions", "feelings", "listening", "supportive",
    ],
    "tutor": [
        "tutor", "tutoraggio", "pragmatico", "pragmatismo", "pratico", "pratica", "diretto",
        "dritto al punto", "azione", "azioni", "concreto", "concretezza", "operativo", "fare",
        "abitudini", "sfida", "sfide", "motivazionale", "motivazione", "coach", "coaching",
        "practical", "action", "hands-on", "concrete", "direct", "motivational", "habits",
    ],
    "docente": [
        "docente", "insegnante", "prof", "professore", "spiegare", "spiegazione", "lezione",
        "metodico", "metodo", "strutturato", "struttura", "organizzato", "organizzazione",
        "passo dopo passo", "step by step", "schemi", "sintesi", "chiarire concetti", "studio",
        "didattica", "pedagogia", "ricerca", "scientifico", "evidenze", "teoria",
        "teacher", "methodical", "structured", "step by step", "systematic", "explain", "study method",
    ],
    "orientatore": [
        "orientatore", "orientamento", "orientare", "scelta", "scelte", "futuro", "strada",
        "percorso", "bilancio", "competenze", "profilo", "quadro", "scoprire", "vocazione",
        "decisione", "decidere", "bussola", "opportunità",
        "counselor", "orientation", "guidance", "path", "future", "career", "choice",
    ],
    "maieutico": [
        "maieutico", "maieutica", "domande", "socrate", "socratico", "far emergere",
        "chiarire con domande", "autonomia di pensiero",
    ],
    "pragmatico": [
        "pragmatico", "pragmatismo", "pratico", "fatti", "concreto", "diretto", "senza giri di parole", "azione",
    ],
    "empatico": [
        "empatico", "empatia", "comprensivo", "sensibile", "vicino", "accogliente", "ascolto", "caldo",
    ],
    "analitico": [
        "analitico", "analisi", "dettagli", "dettagliato", "scomposizione", "precisione", "rigoroso",
    ],
    "motivazionale": [
        "motivazionale", "motivazione", "spinta", "energia", "carica", "sfida", "credere", "potenziale", "entusiasmo",
    ],
    "metodico": [
        "metodico", "metodo", "organizzato", "ordine", "struttura", "piani", "passo dopo passo", "sequenza",
    ],
}


def infer_counselor_identity(counselor: models.Counselor) -> Tuple[dict, List[str], Optional[str]]:
    """Deduce tagline, categorie e avatar per counselor senza metadati espliciti."""
    text_corpus = f"{counselor.name or ''} {counselor.description or ''} {counselor.persona or ''}".lower()

    categories: List[str] = []

    # Rilevamento categorie base
    if any(k in text_corpus for k in ["filosof", "maieut", "socratic", "socrate", "riflessi", "significat"]):
        categories.append("filosofo")
    if any(k in text_corpus for k in ["psicol", "emozion", "empati", "accogl", "ascolt", "vissut", "ansia"]):
        categories.append("psicologo")
    if any(k in text_corpus for k in ["docent", "insegn", "spieg", "pedagog", "ricerc", "metod", "lezione"]):
        categories.append("docente")
    if any(k in text_corpus for k in ["pragmat", "dirett", "azion", "concret", "sfid", "motiva", "tutor"]):
        categories.append("tutor")
    if any(k in text_corpus for k in ["orientat", "scelt", "futur", "percors", "profil", "quadro"]):
        categories.append("orientatore")

    # Rilevamento sottocategorie specifiche
    if "maieut" in text_corpus or "socratic" in text_corpus:
        categories.append("maieutico")
    if "pragmat" in text_corpus or "dirett" in text_corpus:
        categories.append("pragmatico")
    if "empati" in text_corpus or "accogl" in text_corpus:
        categories.append("empatico")
    if "analit" in text_corpus or "dettagl" in text_corpus:
        categories.append("analitico")
    if "motiva" in text_corpus or "sfid" in text_corpus:
        categories.append("motivazionale")
    if "metod" in text_corpus or "struttur" in text_corpus:
        categories.append("metodico")

    # Garanzia: almeno una categoria base presente
    if not categories:
        categories = ["orientatore"]
    else:
        # Ordina rimuovendo duplicati mantenendo ordine
        seen: Set[str] = set()
        deduped: List[str] = []
        for cat in categories:
            if cat not in seen:
                seen.add(cat)
                deduped.append(cat)
        categories = deduped

    # Tagline di fallback
    tagline_it = counselor.description or f"Accompagnamento con stile personalizzato e supporto mirato con {counselor.name}."
    tagline_i18n = {"it": tagline_it}

    # Avatar di fallback
    avatar_url = counselor.avatar if (counselor.avatar and ("/" in counselor.avatar or "." in counselor.avatar)) else f"/images/counselors/{counselor.slug.lower()}.svg"

    return tagline_i18n, categories, avatar_url


def seed_and_backfill_counselor_identities(db: Session) -> int:
    """Popola tagline_i18n, approach_categories e avatar_url per tutti i counselor esistenti.

    Idempotente: non sovrascrive configurazioni personalizzate già presenti.
    """
    counselors = db.query(models.Counselor).all()
    updated_count = 0

    for counselor in counselors:
        key = (counselor.slug or "").lower().strip()
        default = COUNSELOR_IDENTITY_DEFAULTS.get(key)
        changed = False

        # 1. Tagline i18n
        if not counselor.tagline_i18n:
            if default and default.get("tagline_i18n"):
                counselor.tagline_i18n = dict(default["tagline_i18n"])
                changed = True
            else:
                inferred_tagline, _, _ = infer_counselor_identity(counselor)
                counselor.tagline_i18n = inferred_tagline
                changed = True

        # 2. Approach categories
        if not counselor.approach_categories:
            if default and default.get("approach_categories"):
                counselor.approach_categories = list(default["approach_categories"])
                changed = True
            else:
                _, inferred_cats, _ = infer_counselor_identity(counselor)
                counselor.approach_categories = inferred_cats
                changed = True

        # 3. Avatar URL
        if not counselor.avatar_url:
            if default and default.get("avatar_url"):
                counselor.avatar_url = default["avatar_url"]
                changed = True
            elif counselor.avatar and ("/" in counselor.avatar or "." in counselor.avatar):
                counselor.avatar_url = counselor.avatar
                changed = True
            else:
                counselor.avatar_url = f"/images/counselors/{key}.svg"
                changed = True

        if changed:
            updated_count += 1

    if updated_count > 0:
        db.commit()
        logger.info("Backfilled visual identity and approach categories for %d counselors", updated_count)

    return updated_count


def _normalize_text(text: str) -> str:
    """Normalizza testo rimuovendo punteggiatura e convertendo a minuscolo."""
    cleaned = re.sub(r"[^\w\s]", " ", text.lower(), flags=re.UNICODE)
    return " ".join(cleaned.split())


def _build_public_counselor(
    r: models.Counselor,
    lang: Optional[str],
    questionnaire_type: Optional[str],
    restricted: set,
    active_provider_val: Optional[str],
    active_model_val: Optional[str],
    preset_map: dict,
) -> schemas.CounselorPublic:
    pub = schemas.CounselorPublic.model_validate(r)
    pub.description = localized_description(r, lang)
    pub.tagline = localized_tagline(r, lang)
    pub.tagline_i18n = r.tagline_i18n
    pub.approach_categories = r.approach_categories or []
    pub.avatar_url = r.avatar_url or r.avatar
    pub.approach_summary = pub.tagline or (pub.description if pub.description else None)
    preset = preset_map.get(r.preset_id) if r.preset_id else None
    provider = preset.provider if preset else active_provider_val
    pub.model_origin = "local" if provider in {"ollama", "llamacpp"} else "external"
    pub.model = preset.model if preset else active_model_val
    pub.is_personal = bool(r.owner_username)
    pub.suitable = suits(r, questionnaire_type, restricted)
    pub.reasoning_capable = supports_reasoning(pub.model)
    return pub


def _explain_recommendation(
    counselor: models.Counselor,
    matched_cats: List[str],
    match_reasons: List[str],
    lang: Optional[str] = "it",
) -> str:
    """Genera una motivazione sintetica e leggibile per la proposta."""
    name = counselor.name
    tagline = localized_tagline(counselor, lang) or counselor.description or ""

    if matched_cats:
        cats_str = ", ".join(matched_cats[:3])
        return (
            f"Consigliato {name} per il suo approccio orientato a {cats_str}: "
            f"{tagline.rstrip('.') if tagline else 'stile ideale per le tue preferenze'}."
        )

    if match_reasons:
        reasons_str = ", ".join(match_reasons[:3])
        return f"Consigliato {name} per affinità con {reasons_str}: {tagline}."

    return f"Consigliato {name}: {tagline}."


def recommend_counselor(
    db: Session,
    query: str,
    language: Optional[str] = None,
    questionnaire_type: Optional[str] = None,
    audience: Optional[str] = None,
    username: Optional[str] = None,
    allowed_ids: Optional[set[int]] = None,
) -> schemas.CounselorRecommendationResponse:
    """Calcola la corrispondenza tra la query libera e i counselor disponibili.

    Filtra per lingua/disponibilità/strumento/audience e restituisce il counselor
    consigliato con motivazione sintetica e alternative rilevanti.
    """
    normalized_q = _normalize_text(query or "")
    tokens = set(normalized_q.split())

    # Recupera i counselor visibili e attivi
    q_db = db.query(models.Counselor).filter(models.Counselor.is_active.is_(True))
    if username:
        q_db = q_db.filter(
            (models.Counselor.owner_username.is_(None)) | (models.Counselor.owner_username == username)
        )
    else:
        q_db = q_db.filter(models.Counselor.owner_username.is_(None))
    if allowed_ids is not None:
        q_db = q_db.filter(models.Counselor.id.in_(allowed_ids))

    if language:
        lang_text = sa_cast(models.Counselor.language, String)
        q_db = q_db.filter(lang_text.like('%"*"%') | lang_text.like(f'%"{language}"%'))

    if audience:
        q_db = q_db.filter(
            (models.Counselor.assistant_audience.is_(None)) | (models.Counselor.assistant_audience == audience)
        )

    candidates = q_db.order_by(models.Counselor.sort_order.asc(), models.Counselor.id.asc()).all()
    if not candidates:
        return schemas.CounselorRecommendationResponse(
            counselor=None,
            confidence=0.0,
            explanation="Nessun counselor attivo disponibile per i criteri specificati.",
            matched_categories=[],
            match_reasons=[],
            alternatives=[],
        )

    restricted = restricted_instruments(db)
    presets = {p.id: p for p in db.query(models.ModelPreset).all()}
    active_prov = (
        db.query(models.Config).filter(models.Config.key == "active_provider").first()
    )
    active_prov_val = (active_prov.value if active_prov else None) or "openai"
    active_mod = db.query(models.Config).filter(models.Config.key == "model_name").first()
    active_mod_val = (active_mod.value if active_mod else None) or "gpt-4o"

    scored_counselors: List[Tuple[float, models.Counselor, List[str], List[str]]] = []

    for c in candidates:
        score = 0.0
        matched_cats: List[str] = []
        match_reasons: List[str] = []

        categories = [cat.lower().strip() for cat in (c.approach_categories or [])]
        name_lower = (c.name or "").lower().strip()
        persona_lower = (c.persona or "").lower()
        tagline_it = (c.tagline_i18n or {}).get("it", "").lower() if isinstance(c.tagline_i18n, dict) else ""
        desc_lower = (c.description or "").lower()

        # 1. Match diretto sul nome del counselor
        if name_lower and name_lower in normalized_q:
            score += 15.0
            match_reasons.append(f"richiesta esplicita di {c.name}")

        # 2. Match diretto su categorie
        for cat in categories:
            if cat in tokens or cat in normalized_q:
                score += 8.0
                matched_cats.append(cat)
                match_reasons.append(f"categoria '{cat}'")

            # Match tramite parole chiave semantiche associate alla categoria
            synonyms = SEMANTIC_INTENTS.get(cat, [])
            for syn in synonyms:
                if syn in normalized_q:
                    # Match di frase o token
                    score += 3.5
                    if cat not in matched_cats:
                        matched_cats.append(cat)
                    match_reasons.append(f"stile {cat} ('{syn}')")

        # 3. Match su tagline
        tagline_tokens = set(_normalize_text(tagline_it).split())
        shared_tagline = tokens.intersection(tagline_tokens) - {"e", "di", "a", "da", "in", "con", "su", "per", "tra", "fra", "il", "lo", "la", "i", "gli", "le", "un", "una", "uno", "che", "ti"}
        if shared_tagline:
            score += len(shared_tagline) * 2.0
            for term in list(shared_tagline)[:2]:
                match_reasons.append(f"tratto distintivo: '{term}'")

        # 4. Match su persona / descrizione
        for token in tokens:
            if len(token) > 3:
                if token in persona_lower:
                    score += 1.0
                if token in desc_lower:
                    score += 1.0

        # 5. Idoneità strumento (preferenza a chi è adatto allo strumento specificato)
        if suits(c, questionnaire_type, restricted):
            score += 1.0

        # Rimuovi duplicati dalle motivazioni
        deduped_reasons = list(dict.fromkeys(match_reasons))
        scored_counselors.append((score, c, matched_cats, deduped_reasons))

    # Ordina per punteggio decrescente
    scored_counselors.sort(key=lambda item: item[0], reverse=True)

    top_score, top_counselor, top_matched_cats, top_reasons = scored_counselors[0]

    # Calcola confidenza (tra 0.1 e 1.0)
    if top_score > 0:
        confidence = round(min(1.0, 0.45 + (top_score / 25.0) * 0.55), 2)
    else:
        confidence = 0.25

    explanation = _explain_recommendation(top_counselor, top_matched_cats, top_reasons, lang=language or "it")

    top_public = _build_public_counselor(
        top_counselor, language, questionnaire_type, restricted, active_prov_val, active_mod_val, presets
    )

    alternatives: List[schemas.CounselorPublic] = []
    for sc, c, _, _ in scored_counselors[1:4]:
        alternatives.append(
            _build_public_counselor(
                c, language, questionnaire_type, restricted, active_prov_val, active_mod_val, presets
            )
        )

    return schemas.CounselorRecommendationResponse(
        counselor=top_public,
        confidence=confidence,
        explanation=explanation,
        matched_categories=top_matched_cats,
        match_reasons=top_reasons,
        alternatives=alternatives,
    )


def ensure_counselor_schema(connection) -> None:
    """Garantisce la presenza delle colonne tagline_i18n, approach_categories, avatar_url (idempotente)."""
    from sqlalchemy import text
    try:
        connection.execute(text("ALTER TABLE counselors ADD COLUMN IF NOT EXISTS tagline_i18n JSON"))
        connection.execute(text("ALTER TABLE counselors ADD COLUMN IF NOT EXISTS approach_categories JSON DEFAULT '[]'::json"))
        connection.execute(text("ALTER TABLE counselors ADD COLUMN IF NOT EXISTS avatar_url VARCHAR"))
    except Exception:
        for col in [
            "ADD COLUMN tagline_i18n JSON",
            "ADD COLUMN approach_categories JSON DEFAULT '[]'",
            "ADD COLUMN avatar_url VARCHAR",
        ]:
            try:
                connection.execute(text(f"ALTER TABLE counselors {col}"))
            except Exception:
                pass


def get_all_approach_categories(db: Session) -> List[str]:
    """Restituisce l'elenco ordinato di tutte le categorie censite nel sistema."""
    cats_set: Set[str] = set(BASE_APPROACH_CATEGORIES)
    rows = db.query(models.Counselor.approach_categories).filter(models.Counselor.is_active.is_(True)).all()
    for (row_cats,) in rows:
        if isinstance(row_cats, list):
            for c in row_cats:
                if isinstance(c, str) and c.strip():
                    cats_set.add(c.lower().strip())
    # Ordine: categorie base note prima, poi eventuali estensioni in ordine alfabetico
    base_part = [c for c in BASE_APPROACH_CATEGORIES if c in cats_set]
    extra_part = sorted([c for c in cats_set if c not in BASE_APPROACH_CATEGORIES])
    return base_part + extra_part

