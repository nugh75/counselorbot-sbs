"""Seed append-only dei comportamenti specializzati della chat.

Le condizioni dichiarative decidono *quale comportamento* e' pertinente; gli
handler continuano a decidere se esistono dati o materiali utilizzabili.

Come per i prompt degli step, il seed non aggiorna mai una riga esistente.
"""
from __future__ import annotations

import hashlib
import json
import logging

from . import models

logger = logging.getLogger(__name__)

# Strumenti che ricevono il materiale certificato nella chat guidata.
SEEDED_INSTRUMENTS = ("QSA", "QSAr", "ZTPI", "QPCS", "QPCC", "QAP", "SAVICKAS")

# Idea usa il motore di skill ma non il materiale certificato: monta solo la
# propria skill, percio' sta qui e non in SEEDED_INSTRUMENTS.
ENGINE_INSTRUMENTS = SEEDED_INSTRUMENTS + ("IDEA",)

CERTIFIED_ADVICE_INSTRUCTIONS_EN = """## Student advice contract

- Use only the certified strategies supplied in the context block.
- Connect the advice to the student's request and profile without diagnostic labels.
- Propose one concrete, bounded and verifiable action; a second strategy may appear only as support.
- Briefly explain why it is relevant and invite the student to verify its usefulness.
- Never show internal identifiers or present the advice as a prescription.
- If no relevant certified strategy is available, do not force advice.
"""

PROFILE_WAYFINDER_INSTRUCTIONS_EN = """## Reflective profile clarification

- Start from the uncertainty in the student's question and answer it directly.
- Keep questionnaire evidence, construct meaning and possible lived interpretation distinct.
- A score describes a response or self-perception; it does not define the person and is not a diagnosis.
- When useful, relate at most two or three factors and explain the relation; do not list the whole profile.
- State a limitation or alternative interpretation when the evidence is insufficient.
- End with one concrete reflective question that lets the student test the reading against experience.
- Do not turn clarification into unrequested advice, reading guidance or comparison.
"""

READING_GUIDE_INSTRUCTIONS_EN = """## Relevant reading guidance

- Suggest at most two identifiable readings or resources directly relevant to the question and profile.
- Use only titles, authors and sources actually present in [KNOWLEDGE]; never invent references, DOI values or links.
- Explain in one sentence what each reading can help the student understand.
- Distinguish an introductory source from a deeper one when both are available.
- If [KNOWLEDGE] has no identifiable source, say so and offer a topic to search for instead of an invented title.
- Do not replace a reading request with practical advice.
"""

PROFILE_COMPARISON_INSTRUCTIONS_EN = """## Reflective profile comparison

- Compare only results listed under [COMPARABLE_PROFILES].
- If fewer than two profiles are available, ask which second result to use and do not simulate a comparison.
- Separate similarities, differences and possible relations; do not infer causality.
- Compare compatible constructs and explain when two scales measure different aspects.
- Identify one convergence and one tension supported by the data, then ask one reflective question.
- Do not automatically turn the comparison into an action plan.
"""

WEB_LOOKUP_INSTRUCTIONS_EN = """## Factual answer from public sources

- Answer only the factual question that was asked, using the extracts in [WEB_SOURCES].
- Name the source and its link, and state when it was consulted.
- Keep what the source says separate from anything you add.
- If the extracts do not cover the question, say so; never fill the gap from memory.
- These extracts are information, not recommendations: never present these works as suggested readings.
- Quote at most two sentences from a source.
"""


CONCEPT_DIAGRAM_INSTRUCTIONS_EN = """## Concept diagram

- Draw only when the answer holds parts in relation: a process, a loop that
  feeds itself, linked concepts, a whole split into parts. Never to summarise
  prose, and never two turns in a row.
- Always draw when the student asks for a scheme, a map or a diagram.
- The diagram supports the explanation: keep answering in words too.
- Emit one fenced block marked `diagram` holding a single JSON object:

```diagram
{"type":"cycle","title":"Circolo dell'evitamento",
 "nodes":[{"id":"a","label":"Compito difficile","icon":"target"},
          {"id":"b","label":"Ansia","icon":"heart","accent":true},
          {"id":"c","label":"Rimando","icon":"clock"}],
 "edges":[{"from":"a","to":"b","label":"innesca"},
          {"from":"b","to":"c"},
          {"from":"c","to":"a","kind":"feedback"}]}
```

- `type`: `flow`, `cycle`, `relation` or `hierarchy`.
- 2-8 nodes, at most 12 edges; node label <= 80 chars, edge label <= 40,
  title <= 80.
- `accent: true` on at most one node: the point the student can act on.
- Give each node a fitting `icon` when possible, chosen only from this closed
  list: `book`, `brain`, `check`, `clock`, `compass`, `heart`, `idea`,
  `question`, `shield`, `target`. Omit it if none is honest; never invent a
  name. The icon clarifies the label but never replaces it.
- `kind` on an edge names the relation; leave it out for a plain step forward:
  - `drives` (default): A produces B, the next step or the consequence.
  - `strengthens`: A supports or reinforces B.
  - `weakens`: A hinders, brakes or disturbs B.
  - `feedback`: B returns on A and closes the loop.
  - `link`: they belong together, no direction, no cause.
  Pick the one that is true: each kind is drawn with its own stroke, so a wrong
  kind tells the student something false.
- Labels in the student's language, in the student's own words; never scores,
  factor codes or identifiers.
- Data only: no colours, no thickness, no coordinates, no rendering syntax.
"""


IDEA_FOCUS_INSTRUCTIONS_EN = """## The map of the idea

The map is the point of this session, not decoration: it is what the person
takes away. It is ONE map that grows with the conversation, never redrawn from
scratch, so send a patch and let the server merge it.

- Emit one fenced block marked `idea` after every turn that adds something.
  Send nothing when the turn added nothing; an empty patch is not a patch.
- Never mention the block, the JSON or the map's internals to the person. Speak
  about the map in words: "I have added what you just said about time".

```idea
{"add_nodes":[{"id":"t1","label":"Non so se ho tempo","role":"constraint"}],
 "add_edges":[{"from":"t1","to":"idea","kind":"weakens"}],
 "update":[{"id":"idea","label":"Fare la tesi sulla dispersione"}]}
```

- The FIRST patch of a session must stand on its own: at least two nodes and one
  edge, one node with `"role":"idea"` and `"accent":true`. Add `"title"` once,
  the idea in a few words.
- `id` is stable for the whole session: never rename an id, never reuse one for
  something else. Re-adding an existing id updates that node.
- `role` says what work the node does in the reasoning, from this closed list:
  - `idea`: the idea itself, one sentence. Exactly one, and it carries the accent.
  - `assumption`: something taken for granted and not yet checked.
  - `evidence`: a fact, a datum, an experience the idea rests on.
  - `alternative`: another way to read the same thing.
  - `implication`: what would follow if the idea held.
  - `open-question`: what is not known yet and decides something.
  - `constraint`: a real limit — time, money, rules, other people.
  - `step`: a concrete next action.
  A node without a role is allowed but says less; prefer to give one.
- `kind` on an edge: `drives` (default, A produces B), `strengthens` (A supports
  B), `weakens` (A hinders B), `feedback` (B returns on A), `link` (they belong
  together, no direction). Pick the true one: each is drawn differently.
- `update` changes only the fields it names. Use it when the person sharpens
  something they already said, instead of adding a near-duplicate node.
- `remove` ONLY when the person says that something is wrong or no longer
  theirs. Never to tidy the map, never because you would draw it differently.
- Labels in the person's own words and language, at most 80 characters. The map
  holds their idea, not your summary of it.
- At most 24 nodes: when the map is full, sharpen what is there instead of
  adding more.
"""


SKILL_INSTRUCTIONS_I18N = {
    "certified-advice": {"en": CERTIFIED_ADVICE_INSTRUCTIONS_EN},
    "profile-wayfinder": {"en": PROFILE_WAYFINDER_INSTRUCTIONS_EN},
    "reading-guide": {"en": READING_GUIDE_INSTRUCTIONS_EN},
    "profile-comparison": {"en": PROFILE_COMPARISON_INSTRUCTIONS_EN},
    "web-lookup": {"en": WEB_LOOKUP_INSTRUCTIONS_EN},
    "concept-diagram": {"en": CONCEPT_DIAGRAM_INSTRUCTIONS_EN},
    "idea-focus": {"en": IDEA_FOCUS_INSTRUCTIONS_EN},
}

CERTIFIED_ADVICE_POLICY_MARKER = "skills_certified_advice_policy_v1"
SPECIALIZED_SKILLS_POLICY_MARKER = "skills_specialized_behaviors_v1"
READING_AND_TRANSLATIONS_POLICY_MARKER = "skills_reading_sources_and_i18n_v1"
ENGLISH_SKILL_INSTRUCTIONS_POLICY_MARKER = "skills_english_instructions_v1"
DIAGRAM_EDGE_KINDS_POLICY_MARKER = "skills_diagram_edge_kinds_v1"
DIAGRAM_ICONS_POLICY_MARKER = "skills_diagram_icons_v1"
IDEA_FOCUS_POLICY_MARKER = "skills_idea_focus_v1"
# Contratto del diagramma prima dei tipi di arco: serve a riconoscere le
# installazioni ancora sul testo di serie, che sono le uniche da aggiornare.
CONCEPT_DIAGRAM_INSTRUCTIONS_EN_V1_MD5 = "8a3890a53e860a50876501193da698bf"
# Contratto standard immediatamente precedente alle icone e ai limiti piu'
# tolleranti. Serve a non sovrascrivere le personalizzazioni dell'admin.
CONCEPT_DIAGRAM_INSTRUCTIONS_EN_V2_MD5 = "a3271155da66f68747a0114872c5fabf"

SKILL_CONFIG_DEFAULTS = (
    (
        "skills_engine_enabled",
        "true",
        "Motore di skill attivo (true/false). Spento: la chat usa il percorso strategie storico.",
    ),
    (
        "skills_engine_instruments",
        json.dumps(list(ENGINE_INSTRUMENTS)),
        "Lista JSON degli strumenti su cui il motore di skill e' attivo.",
    ),
    ("skills_router_threshold", "3", "Numero di skill opzionali candidate oltre il quale interviene il router LLM."),
    ("skills_router_model", "", "Modello usato dal router delle skill; vuoto = modello attivo."),
    ("skills_router_timeout_s", "6", "Timeout in secondi della chiamata di routing delle skill."),
    ("skills_total_max_chars", "3000", "Tetto complessivo in caratteri dei blocchi prodotti dalle skill."),
    (
        "web_lookup_enabled",
        "true",
        "Se true, la skill web-lookup consulta dal vivo le fonti pubbliche whitelisted "
        "(Wikipedia, Treccani, Open Library, Google Books, OpenAlex) quando lo studente fa una "
        "domanda puntuale su un'opera, una persona o un termine, invece di rispondere a memoria. "
        "Spenta: la chat resta offline e usa solo il catalogo certificato.",
    ),
)

SKILL_SEEDS = [
    {
        "slug": "approved-strategies",
        "name": "Strategie approvate (knowledge base)",
        "description": (
            "Interventi generici approvati editorialmente, utili quando lo studente "
            "chiede cosa fare in concreto e il tema non e' coperto dal catalogo certificato."
        ),
        "instructions_i18n": {},
        "conditions": {},
        "handler": "approved_strategies",
        "handler_params": {},
        "routing": "optional",
        "slot": "knowledge",
        "max_chars": 1000,
        "sort_order": 40,
        "is_active": False,
        "bind": False,
    },
    {
        "slug": "certified-advice",
        "name": "Strategie certificate (catalogo)",
        "description": (
            "Strategie di apprendimento certificate dall'admin, collegate ai fattori "
            "del profilo: da usare quando lo studente lavora su un'area di crescita."
        ),
        "instructions_i18n": SKILL_INSTRUCTIONS_I18N["certified-advice"],
        "conditions": {"intents": ["advice", "guided"]},
        "handler": "certified_strategies",
        "handler_params": {"limit": 2},
        "routing": "primary",
        "slot": "directive_tail",
        "max_chars": 2800,
        "sort_order": 50,
        "is_active": True,
        "bind": True,
    },
    {
        "slug": "profile-wayfinder",
        "name": "Chiarificazione riflessiva del profilo",
        "description": "Chiarisce significato, confini e relazioni dei risultati quando lo studente esprime dubbio o confusione.",
        "instructions_i18n": SKILL_INSTRUCTIONS_I18N["profile-wayfinder"],
        "conditions": {"intents": ["clarify"]},
        "handler": None,
        "handler_params": {},
        "routing": "primary",
        "slot": "directive_tail",
        "max_chars": 1600,
        "sort_order": 10,
        "is_active": True,
        "bind": True,
    },
    {
        "slug": "reading-guide",
        "name": "Guida a letture pertinenti",
        "description": "Suggerisce letture verificabili quando lo studente chiede fonti o approfondimenti.",
        "instructions_i18n": SKILL_INSTRUCTIONS_I18N["reading-guide"],
        "conditions": {"intents": ["reading"]},
        # L'handler consegna la whitelist delle fonti realmente recuperate: il
        # divieto di inventare riferimenti diventa cosi' un filtro, non solo una
        # direttiva al modello.
        "handler": "reading_sources",
        "handler_params": {"limit": 6},
        "routing": "primary",
        "slot": "directive_tail",
        "max_chars": 2200,
        "sort_order": 20,
        "is_active": True,
        "bind": True,
    },
    {
        "slug": "profile-comparison",
        "name": "Confronto riflessivo dei profili",
        "description": "Confronta risultati strutturati dello stesso studente senza inventare dati o causalita'.",
        "instructions_i18n": SKILL_INSTRUCTIONS_I18N["profile-comparison"],
        "conditions": {"intents": ["compare"]},
        "handler": "profile_comparison",
        "handler_params": {},
        "routing": "primary",
        "slot": "directive_tail",
        "max_chars": 2600,
        "sort_order": 30,
        "is_active": True,
        "bind": True,
    },
    {
        "slug": "web-lookup",
        "name": "Consultazione di fonti pubbliche",
        "description": (
            "Recupera un estratto da Wikipedia, Treccani, Open Library, Google Books o "
            "OpenAlex quando lo studente chiede un dato puntuale su un'opera o un termine. "
            "Porta informazione, non raccomandazioni."
        ),
        "instructions_i18n": SKILL_INSTRUCTIONS_I18N["web-lookup"],
        "conditions": {"intents": ["factual"]},
        "handler": "web_lookup_sources",
        "handler_params": {"limit": 1},
        "routing": "primary",
        "slot": "directive_tail",
        "max_chars": 1800,
        "sort_order": 60,
        "is_active": True,
        "bind": True,
    },
    {
        "slug": "concept-diagram",
        "name": "Diagramma concettuale",
        "description": (
            "Disegna un diagramma quando la risposta contiene un processo, un ciclo, "
            "una gerarchia o concetti in relazione, o quando lo studente chiede uno schema."
        ),
        "instructions_i18n": SKILL_INSTRUCTIONS_I18N["concept-diagram"],
        "conditions": {},
        "handler": None,
        "handler_params": {},
        "routing": "optional",
        "slot": "directive_tail",
        "max_chars": 2400,
        "sort_order": 35,
        "is_active": True,
        "bind": True,
    },
    {
        "slug": "idea-focus",
        "name": "Mappa dell'idea",
        "description": (
            "Fa crescere la mappa unica della sessione Idea: a ogni turno il modello "
            "manda una patch, il server la fonde con la mappa corrente."
        ),
        "instructions_i18n": SKILL_INSTRUCTIONS_I18N["idea-focus"],
        "conditions": {},
        "handler": None,
        "handler_params": {},
        "routing": "always",
        "slot": "directive_tail",
        "max_chars": 3000,
        "sort_order": 40,
        "is_active": True,
        "bind": True,
        "bind_instruments": ("IDEA",),
    },
]


def seed_skill_configs(db) -> bool:
    """Inserisce i valori operativi mancanti senza sovrascrivere l'admin."""
    changed = False
    for key, default, description in SKILL_CONFIG_DEFAULTS:
        if db.query(models.Config).filter(models.Config.key == key).first() is None:
            db.add(models.Config(key=key, value=default, description=description))
            changed = True
    if changed:
        db.commit()
    return changed


def apply_certified_advice_policy(db) -> bool:
    """Migra una sola volta l'installazione alla fonte certificata unica."""
    marker = db.query(models.Config).filter(
        models.Config.key == CERTIFIED_ADVICE_POLICY_MARKER
    ).first()
    if marker is not None:
        return False

    seed_skill_configs(db)
    seed_skills(db)

    config_values = {
        "skills_engine_enabled": "true",
        "skills_engine_instruments": json.dumps(list(SEEDED_INSTRUMENTS)),
    }
    for key, value in config_values.items():
        row = db.query(models.Config).filter(models.Config.key == key).one()
        row.value = value

    approved = db.query(models.Skill).filter(
        models.Skill.slug == "approved-strategies"
    ).one()
    approved.is_active = False
    for binding in db.query(models.GuidedStepSkill).filter(
        models.GuidedStepSkill.skill_id == approved.id
    ).all():
        binding.enabled = False

    certified = db.query(models.Skill).filter(
        models.Skill.slug == "certified-advice"
    ).one()
    certified.is_active = True
    certified.status = "published"
    certified.max_chars = max(int(certified.max_chars or 0), 2800)
    certified.instructions_i18n = {"en": CERTIFIED_ADVICE_INSTRUCTIONS_EN}
    for questionnaire_type in SEEDED_INSTRUMENTS:
        binding = db.query(models.GuidedStepSkill).filter(
            models.GuidedStepSkill.questionnaire_type == questionnaire_type,
            models.GuidedStepSkill.step_id == "*",
            models.GuidedStepSkill.skill_id == certified.id,
        ).first()
        if binding is None:
            db.add(models.GuidedStepSkill(
                questionnaire_type=questionnaire_type,
                step_id="*",
                skill_id=certified.id,
                sort_order=certified.sort_order,
                enabled=True,
            ))
        else:
            binding.enabled = True

    db.add(models.Config(
        key=CERTIFIED_ADVICE_POLICY_MARKER,
        value="applied",
        description="Migrazione una tantum: certified-advice unica fonte di consigli.",
    ))
    db.commit()
    return True


def apply_specialized_skills_policy(db) -> bool:
    """Allinea una sola volta le skill live al contratto comportamentale."""
    marker = db.query(models.Config).filter(
        models.Config.key == SPECIALIZED_SKILLS_POLICY_MARKER
    ).first()
    if marker is not None:
        return False

    seed_skills(db)
    seeds = {seed["slug"]: seed for seed in SKILL_SEEDS}
    for slug in ("certified-advice", "profile-wayfinder", "reading-guide", "profile-comparison"):
        seed = seeds[slug]
        skill = db.query(models.Skill).filter(models.Skill.slug == slug).one()
        skill.description = seed["description"]
        skill.instructions_i18n = seed["instructions_i18n"]
        skill.conditions = seed["conditions"]
        skill.handler = seed["handler"]
        skill.handler_params = seed["handler_params"]
        skill.routing = seed["routing"]
        skill.slot = seed["slot"]
        skill.max_chars = seed["max_chars"]
        skill.sort_order = seed["sort_order"]
        skill.is_active = True
        skill.status = "published"
        for questionnaire_type in seed.get("bind_instruments", SEEDED_INSTRUMENTS):
            binding = db.query(models.GuidedStepSkill).filter(
                models.GuidedStepSkill.questionnaire_type == questionnaire_type,
                models.GuidedStepSkill.step_id == "*",
                models.GuidedStepSkill.skill_id == skill.id,
            ).one()
            binding.enabled = True
            binding.sort_order = seed["sort_order"]

    db.add(models.Config(
        key=SPECIALIZED_SKILLS_POLICY_MARKER,
        value="applied",
        description="Migrazione una tantum: comportamenti primari specializzati della chat.",
    ))
    db.commit()
    return True


def apply_reading_and_translations_policy(db) -> bool:
    """Preserve the historical migration marker and enable verified readings.

    Instruction-language normalization now belongs to the dedicated
    English-only policy that runs immediately after this migration.
    """
    marker = db.query(models.Config).filter(
        models.Config.key == READING_AND_TRANSLATIONS_POLICY_MARKER
    ).first()
    if marker is not None:
        return False

    seed_skills(db)
    reading = db.query(models.Skill).filter(models.Skill.slug == "reading-guide").first()
    if reading is not None and not (reading.handler or "").strip():
        reading.handler = "reading_sources"
        reading.handler_params = {"limit": 6}
        reading.max_chars = max(int(reading.max_chars or 0), 2200)

    db.add(models.Config(
        key=READING_AND_TRANSLATIONS_POLICY_MARKER,
        value="applied",
        description="Historical migration: verified reading-source handler enabled.",
    ))
    db.commit()
    return True


def apply_english_skill_instructions_policy(db) -> bool:
    """Canonicalize every stored skill instruction to English only.

    Built-in skills receive their canonical English contract. Custom skills
    retain an existing English contract; non-English-only instructions are
    removed because translating behavioral directives implicitly is unsafe.
    """
    marker = db.query(models.Config).filter(
        models.Config.key == ENGLISH_SKILL_INSTRUCTIONS_POLICY_MARKER
    ).first()
    if marker is not None:
        return False

    seed_skills(db)
    for skill in db.query(models.Skill).all():
        canonical = SKILL_INSTRUCTIONS_I18N.get(skill.slug)
        if canonical is not None:
            skill.instructions_i18n = dict(canonical)
            continue
        current = skill.instructions_i18n if isinstance(skill.instructions_i18n, dict) else {}
        english = current.get("en")
        skill.instructions_i18n = {"en": english} if isinstance(english, str) and english.strip() else {}

    db.add(models.Config(
        key=ENGLISH_SKILL_INSTRUCTIONS_POLICY_MARKER,
        value="applied",
        description="One-time migration: skill instructions are stored in English only.",
    ))
    db.commit()
    return True


def apply_diagram_edge_kinds_policy(db) -> bool:
    """Insegna i tipi di arco al contratto del diagramma, una sola volta.

    Tocca solo le installazioni ferme al testo di serie: se l'admin ha riscritto
    le istruzioni, il suo testo resta e la migrazione si limita a segnarsi come
    fatta.
    """
    marker = db.query(models.Config).filter(
        models.Config.key == DIAGRAM_EDGE_KINDS_POLICY_MARKER
    ).first()
    if marker is not None:
        return False

    seed_skills(db)
    skill = db.query(models.Skill).filter(models.Skill.slug == "concept-diagram").first()
    updated = False
    if skill is not None:
        current = (skill.instructions_i18n or {}).get("en", "")
        if hashlib.md5(current.encode("utf-8")).hexdigest() == CONCEPT_DIAGRAM_INSTRUCTIONS_EN_V1_MD5:
            skill.instructions_i18n = {"en": CONCEPT_DIAGRAM_INSTRUCTIONS_EN}
            skill.max_chars = 1800
            updated = True
        else:
            logger.info("concept-diagram personalizzata dall'admin: contratto lasciato com'e'")

    db.add(models.Config(
        key=DIAGRAM_EDGE_KINDS_POLICY_MARKER,
        value="applied",
        description="Migrazione una tantum: tipi di arco nel contratto del diagramma.",
    ))
    db.commit()
    return updated


def apply_diagram_icons_policy(db) -> bool:
    """Aggiunge icone e limiti robusti al contratto standard, una sola volta."""
    marker = db.query(models.Config).filter(
        models.Config.key == DIAGRAM_ICONS_POLICY_MARKER
    ).first()
    if marker is not None:
        return False

    seed_skills(db)
    skill = db.query(models.Skill).filter(models.Skill.slug == "concept-diagram").first()
    updated = False
    if skill is not None:
        current = (skill.instructions_i18n or {}).get("en", "")
        current_hash = hashlib.md5(current.encode("utf-8")).hexdigest()
        if current_hash == CONCEPT_DIAGRAM_INSTRUCTIONS_EN_V2_MD5:
            skill.instructions_i18n = {"en": CONCEPT_DIAGRAM_INSTRUCTIONS_EN}
            skill.max_chars = 2400
            updated = True
        elif current != CONCEPT_DIAGRAM_INSTRUCTIONS_EN:
            logger.info("concept-diagram personalizzata dall'admin: icone non imposte")

    db.add(models.Config(
        key=DIAGRAM_ICONS_POLICY_MARKER,
        value="applied",
        description="Migrazione una tantum: icone SVG e limiti robusti nei diagrammi.",
    ))
    db.commit()
    return updated


def apply_idea_focus_policy(db) -> bool:
    """Aggiunge IDEA agli strumenti serviti dal motore, una sola volta.

    Il valore di `skills_engine_instruments` e' gia' scritto negli impianti
    esistenti, percio' il seed non lo tocca: qui si accoda soltanto lo
    strumento nuovo, senza rimuovere le scelte dell'admin sugli altri.
    """
    marker = db.query(models.Config).filter(
        models.Config.key == IDEA_FOCUS_POLICY_MARKER
    ).first()
    if marker is not None:
        return False

    seed_skills(db)
    row = db.query(models.Config).filter(
        models.Config.key == "skills_engine_instruments"
    ).first()
    updated = False
    if row is not None:
        try:
            current = json.loads(row.value or "[]")
        except (TypeError, ValueError):
            current = []
        if isinstance(current, list) and "IDEA" not in current:
            row.value = json.dumps(current + ["IDEA"])
            updated = True

    db.add(models.Config(
        key=IDEA_FOCUS_POLICY_MARKER,
        value="applied",
        description="Migrazione una tantum: strumento Idea servito dal motore di skill.",
    ))
    db.commit()
    return updated


def seed_skills(db) -> bool:
    """Crea le skill mancanti e i loro agganci wildcard. Idempotente."""
    changed = False
    for seed in SKILL_SEEDS:
        skill = db.query(models.Skill).filter(models.Skill.slug == seed["slug"]).first()
        if skill is None:
            model_values = {
                key: value for key, value in seed.items()
                if key not in {"bind", "bind_instruments", "is_active"}
            }
            skill = models.Skill(
                status="published",
                is_active=bool(seed.get("is_active", True)),
                **model_values,
            )
            db.add(skill)
            db.commit()
            db.refresh(skill)
            changed = True
            logger.info("Seed skill creata: %s", seed["slug"])

        if not seed.get("bind", True):
            continue

        for questionnaire_type in SEEDED_INSTRUMENTS:
            exists = (
                db.query(models.GuidedStepSkill)
                .filter(
                    models.GuidedStepSkill.questionnaire_type == questionnaire_type,
                    models.GuidedStepSkill.step_id == "*",
                    models.GuidedStepSkill.skill_id == skill.id,
                )
                .first()
            )
            if exists is None:
                db.add(models.GuidedStepSkill(
                    questionnaire_type=questionnaire_type,
                    step_id="*",
                    skill_id=skill.id,
                    sort_order=seed["sort_order"],
                    enabled=True,
                ))
                changed = True
        db.commit()
    return changed
