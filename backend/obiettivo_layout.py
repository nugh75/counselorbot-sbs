"""Percorso completo degli Obiettivi: un passaggio iniziale e cinque fasi d'azione.

Le fasi dicono che cosa si fa (non il metodo) e sono scritte per chi le legge:
in Studio in prima persona, in Docenza parlando dei destinatari. Bloom, SMART e
sfida sono diventati controlli interni di «Rendiamo l'obiettivo preciso».

Gli id restano quelli di prima, cosi' sessioni, snapshot e log continuano a
riferirsi alle stesse righe. Sulle installazioni esistenti:
- patto, SMART e sfida non sono piu' nei default; le righe restano nel DB e
  vengono solo tenute fuori dal percorso se il loro testo e' di fabbrica (la
  stessa regola di «Allinea prompt di fabbrica»); un passo personalizzato resta;
- le etichette di fabbrica precedenti si leggono con quelle nuove; una
  etichetta scritta dall'amministratore resta com'e'.
"""
from __future__ import annotations

from typing import Dict

PREFIXES = {"OBIETTIVO_STUDIO": "obbstudio", "OBIETTIVO_DOCENZA": "obbdocenza"}
LANGS = ("it", "en", "es", "fr", "de", "sv")

# Passi del percorso precedente assorbiti: il patto nella presentazione, SMART
# e sfida in «Rendiamo l'obiettivo preciso».
RETIRED_SUFFIXES = ("patto", "smart", "sfida")
RETIRED_STEP_IDS = frozenset(f"{prefix}-{suffix}" for prefix in PREFIXES.values() for suffix in RETIRED_SUFFIXES)

_SHARED = {
    "intro": ("0. Presentazione e accordo", "0. Introduction and agreement", "0. Presentación y acuerdo",
              "0. Présentation et accord", "0. Vorstellung und Vereinbarung", "0. Presentation och överenskommelse"),
    "livello": ("2. Rendiamo l'obiettivo preciso", "2. Making the objective precise", "2. Precisamos el objetivo",
                "2. Préciser l’objectif", "2. Das Ziel präzisieren", "2. Vi gör målet precist"),
    "final": ("5. L'obiettivo finale", "5. The final objective", "5. El objetivo final",
              "5. L’objectif final", "5. Das fertige Ziel", "5. Det färdiga målet"),
}
_BY_INSTRUMENT = {
    "obbstudio": {
        "partenza": ("1. Cosa voglio imparare", "1. What I want to learn", "1. Qué quiero aprender",
                     "1. Ce que je veux apprendre", "1. Was ich lernen will", "1. Vad jag vill lära mig"),
        "piano": ("3. Come ci arrivo", "3. How I will get there", "3. Cómo llegaré",
                  "3. Comment j’y arriverai", "3. Wie ich es erreiche", "3. Hur jag når dit"),
        "verifica": ("4. Come capirò di avercela fatta", "4. How I will know I made it", "4. Cómo sabré que lo logré",
                     "4. Comment je saurai que j’ai réussi", "4. Woran ich merke, dass ich es geschafft habe",
                     "4. Hur jag vet att jag har lyckats"),
    },
    "obbdocenza": {
        "partenza": ("1. Cosa vuoi che imparino", "1. What you want them to learn", "1. Qué quieres que aprendan",
                     "1. Ce que vous voulez qu’ils apprennent", "1. Was sie lernen sollen",
                     "1. Vad du vill att de ska lära sig"),
        "piano": ("3. Come ci arriveranno", "3. How they will get there", "3. Cómo llegarán",
                  "3. Comment ils y arriveront", "3. Wie sie es erreichen", "3. Hur de når dit"),
        "verifica": ("4. Come verificherai che ci sono riusciti", "4. How you will check that they made it",
                     "4. Cómo comprobarás que lo lograron", "4. Comment vous vérifierez qu’ils ont réussi",
                     "4. Wie du prüfst, ob sie es geschafft haben", "4. Hur du ser att de har lyckats"),
    },
}

# Etichette di fabbrica del percorso a undici fasi, uguali per i due strumenti.
_PREVIOUS = {
    "intro": ("0. Presentazione", "0. Introduction", "0. Presentación", "0. Présentation", "0. Vorstellung",
              "0. Presentation"),
    "partenza": ("1. Da dove parto", "1. Where I start from", "1. Desde donde parto", "1. D’où je pars",
                 "1. Wo ich ansetze", "1. Var jag börjar"),
    "livello": ("2. Il livello (Bloom)", "2. The level (Bloom)", "2. El nivel (Bloom)", "2. Le niveau (Bloom)",
                "2. Die Stufe (Bloom)", "2. Nivån (Bloom)"),
    "piano": ("5. Come ci arrivo", "5. How I get there", "5. Cómo llego", "5. Comment j’y arrive",
              "5. Wie ich es erreiche", "5. Hur jag når dit"),
    "verifica": ("6. Come saprò di esserci riuscito", "6. How I will know I made it", "6. Cómo sabré que lo logré",
                 "6. Comment je saurai que c’est atteint", "6. Woran ich den Erfolg erkenne",
                 "6. Hur jag vet att jag lyckats"),
    "final": ("7. Sintesi dell'obiettivo", "7. Summary of the objective", "7. Síntesis del objetivo",
              "7. Synthèse de l’objectif", "7. Zusammenfassung des Ziels", "7. Sammanfattning av målet"),
}


def step_labels(prefix: str) -> Dict[str, Dict[str, str]]:
    """{suffisso: {lingua: etichetta}} delle fasi attuali per uno strumento."""
    rows = {**_SHARED, **_BY_INSTRUMENT[prefix]}
    return {suffix: dict(zip(LANGS, labels)) for suffix, labels in rows.items()}


# {step_id: {etichetta di fabbrica precedente: etichetta attuale nella stessa lingua}}
RENAMED_LABELS: Dict[str, Dict[str, str]] = {
    f"{prefix}-{suffix}": {
        old: new for old, new in zip(previous, (_SHARED.get(suffix) or _BY_INSTRUMENT[prefix][suffix]))
    }
    for prefix in PREFIXES.values()
    for suffix, previous in _PREVIOUS.items()
}


def current_label(step_id: str, label: str) -> str:
    """L'etichetta da mostrare: quella nuova se `label` e' una vecchia di fabbrica."""
    return RENAMED_LABELS.get(step_id, {}).get(label, label)


def is_retired_factory_step(db, step) -> bool:
    if step.id not in RETIRED_STEP_IDS:
        return False
    from .prompt_factory_alignment import factory_owned
    return factory_owned(db, "guided_step", step.id, step.prompt or "", cached=True)


def active_guided_steps(db, steps):
    """Gli step del percorso, senza i passi Obiettivo ritirati e ancora di fabbrica."""
    return [step for step in steps if not is_retired_factory_step(db, step)]
