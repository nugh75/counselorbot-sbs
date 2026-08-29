"""Seed append-only dei comportamenti specializzati della chat.

Le condizioni dichiarative decidono *quale comportamento* e' pertinente; gli
handler continuano a decidere se esistono dati o materiali utilizzabili.

Come per i prompt degli step, il seed non aggiorna mai una riga esistente.
"""
from __future__ import annotations

import json
import logging

from . import models

logger = logging.getLogger(__name__)

# Strumenti che ricevono il materiale certificato nella chat guidata.
SEEDED_INSTRUMENTS = ("QSA", "QSAr", "ZTPI", "QPCS", "QPCC", "QAP", "SAVICKAS")

CERTIFIED_ADVICE_INSTRUCTIONS_IT = """## Contratto per i consigli allo studente

- Usa esclusivamente le strategie certificate fornite nel blocco di contesto.
- Collega il consiglio alla richiesta e al profilo senza etichette diagnostiche.
- Proponi una sola azione concreta, circoscritta e verificabile; una seconda strategia puo' comparire soltanto come supporto.
- Spiega brevemente perche' l'azione e' pertinente e invita lo studente a verificarne l'utilita'.
- Non mostrare identificatori interni e non presentare il consiglio come prescrizione.
- Se non e' disponibile una strategia certificata pertinente, non forzare un consiglio.
"""

CERTIFIED_ADVICE_INSTRUCTIONS_EN = """## Student advice contract

- Use only the certified strategies supplied in the context block.
- Connect the advice to the student's request and profile without diagnostic labels.
- Propose one concrete, bounded and verifiable action; a second strategy may appear only as support.
- Briefly explain why it is relevant and invite the student to verify its usefulness.
- Never show internal identifiers or present the advice as a prescription.
- If no relevant certified strategy is available, do not force advice.
"""

PROFILE_WAYFINDER_INSTRUCTIONS_IT = """## Chiarificazione riflessiva del profilo

- Parti dalla domanda che sta creando incertezza e rispondi direttamente.
- Distingui sempre: dato del questionario, significato del costrutto e possibile interpretazione nella vita dello studente.
- Ricorda che il punteggio descrive una risposta o autopercezione, non definisce la persona e non e' una diagnosi.
- Se utile, collega al massimo due o tre fattori spiegando la relazione; non produrre un elenco dell'intero profilo.
- Esplicita un limite o un'interpretazione alternativa quando i dati non bastano.
- Chiudi con una sola domanda riflessiva concreta che aiuti lo studente a verificare la lettura nella propria esperienza.
- Non trasformare la chiarificazione in un consiglio pratico, una lettura o un confronto non richiesti.
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

READING_GUIDE_INSTRUCTIONS_IT = """## Guida a letture pertinenti

- Suggerisci al massimo due letture o risorse identificabili e direttamente pertinenti alla domanda e al profilo.
- Usa esclusivamente titoli, autori e fonti realmente presenti in [KNOWLEDGE]; non inventare riferimenti, DOI o link.
- Per ogni lettura spiega in una frase che cosa puo' aiutare a comprendere.
- Distingui una fonte introduttiva da un approfondimento, quando entrambe sono disponibili.
- Se [KNOWLEDGE] non contiene una risorsa identificabile, dichiaralo e proponi di cercare un tema, non un titolo inventato.
- Non sostituire la richiesta di lettura con un consiglio operativo.
"""

READING_GUIDE_INSTRUCTIONS_EN = """## Relevant reading guidance

- Suggest at most two identifiable readings or resources directly relevant to the question and profile.
- Use only titles, authors and sources actually present in [KNOWLEDGE]; never invent references, DOI values or links.
- Explain in one sentence what each reading can help the student understand.
- Distinguish an introductory source from a deeper one when both are available.
- If [KNOWLEDGE] has no identifiable source, say so and offer a topic to search for instead of an invented title.
- Do not replace a reading request with practical advice.
"""

PROFILE_COMPARISON_INSTRUCTIONS_IT = """## Confronto riflessivo dei profili

- Confronta soltanto i risultati elencati in [COMPARABLE_PROFILES].
- Se sono disponibili meno di due profili, chiedi quale secondo risultato usare e non simulare il confronto.
- Separa somiglianze, differenze e possibili relazioni; non dedurre causalita'.
- Confronta costrutti compatibili e spiega quando due scale misurano aspetti diversi.
- Evidenzia una convergenza e una tensione realmente sostenute dai dati, poi formula una sola domanda riflessiva.
- Non trasformare automaticamente il confronto in un piano d'azione.
"""

PROFILE_COMPARISON_INSTRUCTIONS_EN = """## Reflective profile comparison

- Compare only results listed under [COMPARABLE_PROFILES].
- If fewer than two profiles are available, ask which second result to use and do not simulate a comparison.
- Separate similarities, differences and possible relations; do not infer causality.
- Compare compatible constructs and explain when two scales measure different aspects.
- Identify one convergence and one tension supported by the data, then ask one reflective question.
- Do not automatically turn the comparison into an action plan.
"""


CERTIFIED_ADVICE_INSTRUCTIONS_ES = """## Contrato para los consejos al estudiante

- Utiliza únicamente las estrategias certificadas incluidas en el bloque de contexto.
- Vincula el consejo a la petición y al perfil del estudiante, sin etiquetas diagnósticas.
- Propón una sola acción concreta, delimitada y verificable; una segunda estrategia solo puede aparecer como apoyo.
- Explica brevemente por qué es pertinente e invita al estudiante a comprobar su utilidad.
- No muestres nunca identificadores internos ni presentes el consejo como una prescripción.
- Si no hay ninguna estrategia certificada pertinente, no fuerces un consejo.
"""

CERTIFIED_ADVICE_INSTRUCTIONS_FR = """## Contrat pour les conseils à l'élève

- Utilise uniquement les stratégies certifiées fournies dans le bloc de contexte.
- Relie le conseil à la demande et au profil de l'élève, sans étiquette diagnostique.
- Propose une seule action concrète, délimitée et vérifiable ; une deuxième stratégie ne peut apparaître qu'en appui.
- Explique brièvement pourquoi elle est pertinente et invite l'élève à en vérifier l'utilité.
- N'affiche jamais d'identifiants internes et ne présente pas le conseil comme une prescription.
- Si aucune stratégie certifiée pertinente n'est disponible, ne force pas un conseil.
"""

CERTIFIED_ADVICE_INSTRUCTIONS_DE = """## Vertrag für Ratschläge an die Lernenden

- Verwende ausschließlich die zertifizierten Strategien aus dem Kontextblock.
- Verknüpfe den Rat mit der Frage und dem Profil, ohne diagnostische Etiketten.
- Schlage genau eine konkrete, eingegrenzte und überprüfbare Handlung vor; eine zweite Strategie darf nur unterstützend erscheinen.
- Erkläre kurz, warum sie relevant ist, und lade dazu ein, ihren Nutzen selbst zu prüfen.
- Zeige nie interne Kennungen und stelle den Rat nicht als Vorschrift dar.
- Wenn keine passende zertifizierte Strategie vorliegt, erzwinge keinen Ratschlag.
"""

CERTIFIED_ADVICE_INSTRUCTIONS_SV = """## Kontrakt för råd till studenten

- Använd enbart de certifierade strategierna i kontextblocket.
- Koppla rådet till frågan och profilen, utan diagnostiska etiketter.
- Föreslå en enda konkret, avgränsad och kontrollerbar handling; en andra strategi får bara finnas med som stöd.
- Förklara kort varför den är relevant och bjud in studenten att pröva dess nytta.
- Visa aldrig interna identifierare och presentera inte rådet som en föreskrift.
- Om ingen relevant certifierad strategi finns, tvinga inte fram ett råd.
"""

PROFILE_WAYFINDER_INSTRUCTIONS_ES = """## Clarificación reflexiva del perfil

- Parte de la duda que expresa el estudiante y respóndela directamente.
- Mantén separados el dato del cuestionario, el significado del constructo y su posible interpretación en la vida del estudiante.
- Una puntuación describe una respuesta o autopercepción: no define a la persona ni es un diagnóstico.
- Cuando sea útil, relaciona como máximo dos o tres factores y explica la relación; no enumeres todo el perfil.
- Señala un límite o una interpretación alternativa cuando los datos no bastan.
- Termina con una sola pregunta reflexiva concreta que permita contrastar la lectura con la propia experiencia.
- No conviertas la clarificación en un consejo práctico, una lectura o una comparación no solicitados.
"""

PROFILE_WAYFINDER_INSTRUCTIONS_FR = """## Clarification réflexive du profil

- Pars de l'incertitude exprimée par l'élève et réponds-y directement.
- Distingue toujours la donnée du questionnaire, le sens du construit et son interprétation possible dans la vie de l'élève.
- Un score décrit une réponse ou une auto-perception : il ne définit pas la personne et n'est pas un diagnostic.
- Si c'est utile, relie au maximum deux ou trois facteurs en expliquant le lien ; ne liste pas tout le profil.
- Indique une limite ou une interprétation alternative lorsque les données ne suffisent pas.
- Termine par une seule question réflexive concrète permettant de confronter la lecture à l'expérience.
- Ne transforme pas la clarification en conseil pratique, en lecture ou en comparaison non demandés.
"""

PROFILE_WAYFINDER_INSTRUCTIONS_DE = """## Reflexive Klärung des Profils

- Gehe von der Unsicherheit in der Frage aus und beantworte sie direkt.
- Halte Fragebogenwert, Bedeutung des Konstrukts und mögliche Deutung im Alltag klar auseinander.
- Ein Wert beschreibt eine Antwort oder Selbstwahrnehmung; er definiert die Person nicht und ist keine Diagnose.
- Verbinde bei Bedarf höchstens zwei oder drei Faktoren und erkläre den Zusammenhang; liste nicht das ganze Profil auf.
- Nenne eine Grenze oder eine alternative Deutung, wenn die Daten nicht ausreichen.
- Schließe mit genau einer konkreten Reflexionsfrage, die die Deutung an der eigenen Erfahrung prüfbar macht.
- Mache aus der Klärung keinen ungefragten Ratschlag, keine Leseempfehlung und keinen Vergleich.
"""

PROFILE_WAYFINDER_INSTRUCTIONS_SV = """## Reflekterande förtydligande av profilen

- Utgå från osäkerheten i studentens fråga och besvara den direkt.
- Håll isär enkätsvaret, begreppets innebörd och den möjliga tolkningen i studentens vardag.
- Ett värde beskriver ett svar eller en självuppfattning; det definierar inte personen och är ingen diagnos.
- Koppla vid behov ihop högst två eller tre faktorer och förklara sambandet; räkna inte upp hela profilen.
- Ange en begränsning eller en alternativ tolkning när underlaget inte räcker.
- Avsluta med en enda konkret reflekterande fråga som låter studenten pröva tolkningen mot sin erfarenhet.
- Gör inte förtydligandet till ett oombett råd, ett lästips eller en jämförelse.
"""

READING_GUIDE_INSTRUCTIONS_ES = """## Guía de lecturas pertinentes

- Sugiere como máximo dos lecturas o recursos identificables y directamente relacionados con la pregunta y el perfil.
- Utiliza solo títulos, autores y fuentes realmente presentes en [KNOWLEDGE]; no inventes referencias, DOI ni enlaces.
- Explica en una frase qué puede ayudar a comprender cada lectura.
- Distingue una fuente introductoria de una de profundización cuando ambas estén disponibles.
- Si [KNOWLEDGE] no contiene ninguna fuente identificable, dilo y propón un tema de búsqueda en lugar de un título inventado.
- No sustituyas la petición de lectura por un consejo práctico.
"""

READING_GUIDE_INSTRUCTIONS_FR = """## Orientation vers des lectures pertinentes

- Propose au maximum deux lectures ou ressources identifiables et directement liées à la question et au profil.
- N'utilise que des titres, auteurs et sources réellement présents dans [KNOWLEDGE] ; n'invente ni référence, ni DOI, ni lien.
- Explique en une phrase ce que chaque lecture aide à comprendre.
- Distingue une source introductive d'un approfondissement lorsque les deux sont disponibles.
- Si [KNOWLEDGE] ne contient aucune source identifiable, dis-le et propose un thème à chercher plutôt qu'un titre inventé.
- Ne remplace pas la demande de lecture par un conseil pratique.
"""

READING_GUIDE_INSTRUCTIONS_DE = """## Hinweise auf passende Lektüre

- Schlage höchstens zwei identifizierbare Lektüren oder Ressourcen vor, die direkt zur Frage und zum Profil passen.
- Verwende nur Titel, Autorinnen, Autoren und Quellen, die tatsächlich in [KNOWLEDGE] stehen; erfinde keine Referenzen, DOIs oder Links.
- Erkläre in einem Satz, wobei jede Lektüre helfen kann.
- Unterscheide eine einführende von einer vertiefenden Quelle, wenn beide vorhanden sind.
- Enthält [KNOWLEDGE] keine identifizierbare Quelle, sage das und schlage ein Suchthema statt eines erfundenen Titels vor.
- Ersetze die Frage nach Lektüre nicht durch einen praktischen Ratschlag.
"""

READING_GUIDE_INSTRUCTIONS_SV = """## Vägledning till relevant läsning

- Föreslå högst två identifierbara texter eller resurser som direkt hör till frågan och profilen.
- Använd bara titlar, författare och källor som verkligen finns i [KNOWLEDGE]; hitta aldrig på referenser, DOI eller länkar.
- Förklara i en mening vad varje läsning kan hjälpa studenten att förstå.
- Skilj en introducerande källa från en fördjupande när båda finns.
- Om [KNOWLEDGE] saknar identifierbar källa, säg det och föreslå ett ämne att söka på i stället för en påhittad titel.
- Ersätt inte en fråga om läsning med ett praktiskt råd.
"""

PROFILE_COMPARISON_INSTRUCTIONS_ES = """## Comparación reflexiva de los perfiles

- Compara únicamente los resultados enumerados en [COMPARABLE_PROFILES].
- Si hay menos de dos perfiles disponibles, pregunta qué segundo resultado usar y no simules la comparación.
- Separa semejanzas, diferencias y posibles relaciones; no deduzcas causalidad.
- Compara constructos compatibles y explica cuándo dos escalas miden aspectos distintos.
- Señala una convergencia y una tensión realmente sostenidas por los datos y formula después una sola pregunta reflexiva.
- No conviertas automáticamente la comparación en un plan de acción.
"""

PROFILE_COMPARISON_INSTRUCTIONS_FR = """## Comparaison réflexive des profils

- Ne compare que les résultats listés dans [COMPARABLE_PROFILES].
- Si moins de deux profils sont disponibles, demande quel second résultat utiliser et ne simule pas la comparaison.
- Sépare ressemblances, différences et relations possibles ; ne déduis pas de causalité.
- Compare des construits compatibles et explique quand deux échelles mesurent des aspects différents.
- Relève une convergence et une tension réellement soutenues par les données, puis pose une seule question réflexive.
- Ne transforme pas automatiquement la comparaison en plan d'action.
"""

PROFILE_COMPARISON_INSTRUCTIONS_DE = """## Reflexiver Vergleich der Profile

- Vergleiche ausschließlich die unter [COMPARABLE_PROFILES] aufgeführten Ergebnisse.
- Liegen weniger als zwei Profile vor, frage nach dem zweiten Ergebnis und simuliere keinen Vergleich.
- Trenne Ähnlichkeiten, Unterschiede und mögliche Zusammenhänge; leite keine Kausalität ab.
- Vergleiche nur vergleichbare Konstrukte und erkläre, wenn zwei Skalen Verschiedenes messen.
- Benenne eine Übereinstimmung und eine Spannung, die die Daten wirklich tragen, und stelle dann genau eine Reflexionsfrage.
- Mache aus dem Vergleich nicht automatisch einen Handlungsplan.
"""

PROFILE_COMPARISON_INSTRUCTIONS_SV = """## Reflekterande jämförelse av profiler

- Jämför enbart de resultat som listas under [COMPARABLE_PROFILES].
- Finns färre än två profiler, fråga vilket andra resultat som ska användas och simulera ingen jämförelse.
- Skilj på likheter, skillnader och möjliga samband; dra inga slutsatser om orsak och verkan.
- Jämför jämförbara begrepp och förklara när två skalor mäter olika saker.
- Lyft fram en samstämmighet och en spänning som data faktiskt bär, och ställ sedan en enda reflekterande fråga.
- Gör inte automatiskt jämförelsen till en handlingsplan.
"""


def _instructions(it: str, en: str, es: str, fr: str, de: str, sv: str) -> dict[str, str]:
    """Istruzioni per lingua. Ogni lingua ha un testo proprio: l'inglese non e'
    piu' un segnaposto per ES/FR/DE/SV."""
    return {"it": it, "en": en, "es": es, "fr": fr, "de": de, "sv": sv}


SKILL_INSTRUCTIONS_I18N = {
    "certified-advice": _instructions(
        CERTIFIED_ADVICE_INSTRUCTIONS_IT,
        CERTIFIED_ADVICE_INSTRUCTIONS_EN,
        CERTIFIED_ADVICE_INSTRUCTIONS_ES,
        CERTIFIED_ADVICE_INSTRUCTIONS_FR,
        CERTIFIED_ADVICE_INSTRUCTIONS_DE,
        CERTIFIED_ADVICE_INSTRUCTIONS_SV,
    ),
    "profile-wayfinder": _instructions(
        PROFILE_WAYFINDER_INSTRUCTIONS_IT,
        PROFILE_WAYFINDER_INSTRUCTIONS_EN,
        PROFILE_WAYFINDER_INSTRUCTIONS_ES,
        PROFILE_WAYFINDER_INSTRUCTIONS_FR,
        PROFILE_WAYFINDER_INSTRUCTIONS_DE,
        PROFILE_WAYFINDER_INSTRUCTIONS_SV,
    ),
    "reading-guide": _instructions(
        READING_GUIDE_INSTRUCTIONS_IT,
        READING_GUIDE_INSTRUCTIONS_EN,
        READING_GUIDE_INSTRUCTIONS_ES,
        READING_GUIDE_INSTRUCTIONS_FR,
        READING_GUIDE_INSTRUCTIONS_DE,
        READING_GUIDE_INSTRUCTIONS_SV,
    ),
    "profile-comparison": _instructions(
        PROFILE_COMPARISON_INSTRUCTIONS_IT,
        PROFILE_COMPARISON_INSTRUCTIONS_EN,
        PROFILE_COMPARISON_INSTRUCTIONS_ES,
        PROFILE_COMPARISON_INSTRUCTIONS_FR,
        PROFILE_COMPARISON_INSTRUCTIONS_DE,
        PROFILE_COMPARISON_INSTRUCTIONS_SV,
    ),
}

CERTIFIED_ADVICE_POLICY_MARKER = "skills_certified_advice_policy_v1"
SPECIALIZED_SKILLS_POLICY_MARKER = "skills_specialized_behaviors_v1"
READING_AND_TRANSLATIONS_POLICY_MARKER = "skills_reading_sources_and_i18n_v1"

SKILL_CONFIG_DEFAULTS = (
    (
        "skills_engine_enabled",
        "true",
        "Motore di skill attivo (true/false). Spento: la chat usa il percorso strategie storico.",
    ),
    (
        "skills_engine_instruments",
        json.dumps(list(SEEDED_INSTRUMENTS)),
        "Lista JSON degli strumenti su cui il motore di skill e' attivo.",
    ),
    ("skills_router_threshold", "3", "Numero di skill opzionali candidate oltre il quale interviene il router LLM."),
    ("skills_router_model", "", "Modello usato dal router delle skill; vuoto = modello attivo."),
    ("skills_router_timeout_s", "6", "Timeout in secondi della chiamata di routing delle skill."),
    ("skills_total_max_chars", "3000", "Tetto complessivo in caratteri dei blocchi prodotti dalle skill."),
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
    instructions = dict(certified.instructions_i18n or {})
    instructions["it"] = CERTIFIED_ADVICE_INSTRUCTIONS_IT
    certified.instructions_i18n = instructions
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
        for questionnaire_type in SEEDED_INSTRUMENTS:
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
    """Allinea una sola volta le installazioni gia' migrate: traduzioni reali per
    ES/FR/DE/SV e validazione strutturale delle letture.

    Non sovrascrive le personalizzazioni admin: una lingua viene riscritta solo
    se manca o se contiene ancora il segnaposto inglese del seed precedente, e
    l'handler delle letture viene impostato solo se la skill non ne ha uno."""
    marker = db.query(models.Config).filter(
        models.Config.key == READING_AND_TRANSLATIONS_POLICY_MARKER
    ).first()
    if marker is not None:
        return False

    seed_skills(db)
    placeholders = {
        "certified-advice": CERTIFIED_ADVICE_INSTRUCTIONS_EN,
        "profile-wayfinder": PROFILE_WAYFINDER_INSTRUCTIONS_EN,
        "reading-guide": READING_GUIDE_INSTRUCTIONS_EN,
        "profile-comparison": PROFILE_COMPARISON_INSTRUCTIONS_EN,
    }
    for slug, english in placeholders.items():
        skill = db.query(models.Skill).filter(models.Skill.slug == slug).first()
        if skill is None:
            continue
        instructions = dict(skill.instructions_i18n or {})
        for language in ("es", "fr", "de", "sv"):
            current = (instructions.get(language) or "").strip()
            if current and current != english.strip():
                continue  # testo curato dall'admin: non si tocca
            instructions[language] = SKILL_INSTRUCTIONS_I18N[slug][language]
        skill.instructions_i18n = instructions

    reading = db.query(models.Skill).filter(models.Skill.slug == "reading-guide").first()
    if reading is not None and not (reading.handler or "").strip():
        reading.handler = "reading_sources"
        reading.handler_params = {"limit": 6}
        reading.max_chars = max(int(reading.max_chars or 0), 2200)

    db.add(models.Config(
        key=READING_AND_TRANSLATIONS_POLICY_MARKER,
        value="applied",
        description="Migrazione una tantum: traduzioni reali delle skill e whitelist delle fonti di lettura.",
    ))
    db.commit()
    return True


def seed_skills(db) -> bool:
    """Crea le skill mancanti e i loro agganci wildcard. Idempotente."""
    changed = False
    for seed in SKILL_SEEDS:
        skill = db.query(models.Skill).filter(models.Skill.slug == seed["slug"]).first()
        if skill is None:
            model_values = {
                key: value for key, value in seed.items()
                if key not in {"bind", "is_active"}
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
