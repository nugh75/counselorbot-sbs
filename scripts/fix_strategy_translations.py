"""Correzioni editoriali alle traduzioni automatiche delle strategie di backfill.

`translate_strategies` ha prodotto testi complessivamente buoni, con un gruppo di
errori ricorrenti che la revisione ha trovato e che questo file riporta per
esteso, lingua per lingua:

  - inversione temporale ("da un anno avanti" reso come "un anno fa");
  - idiomi tradotti alla lettera ("mandare all'aria", "sul campo", "saltare" nel
    senso di crollare, che in quattro lingue era diventato "risaltare");
  - perdita di senso su verbi precisi ("ridire" -> "pensare", "cercato" ->
    "tentato", "preparare il primo passo" -> "fare il primo passo");
  - un codice fattore (K1) sparito dal testo tradotto;
  - concordanze sbagliate in svedese.

Ogni voce sostituisce il testo intero del campo, non una sottostringa: una
correzione parziale lascerebbe la frase in uno stato intermedio se il testo
generato cambiasse.

L'immagine del backend non contiene `scripts/`: si esegue dall'host, con
`DATABASE_URL` puntato alla porta pubblicata da Postgres (5435).

    DATABASE_URL=postgresql://USER:PASS@127.0.0.1:5435/DB \
        python3 -m scripts.fix_strategy_translations --dry-run
    DATABASE_URL=... python3 -m scripts.fix_strategy_translations --apply
"""
from __future__ import annotations

import argparse

from backend import models
from backend.database import SessionLocal

# {slug: {campo: {lingua: testo corretto}}}
FIXES: dict[str, dict[str, dict[str, str]]] = {
    "qpcs-emotion-worry-window": {
        "name": {"sv": "Orosfönstret"},
    },
    "qpcs-communication-listen-back": {
        # "Ridire" e' restituire la posizione dell'altro, non "pensare".
        "name": {
            "en": "Say it back before answering",
            "es": "Repetir con tus palabras antes de responder",
            "fr": "Reformuler avant de répondre",
            "de": "Wiedergeben, bevor man antwortet",
            "sv": "Återge innan du svarar",
        },
    },
    "qpcs-communication-three-sentence-summary": {
        # "frasi" sono periodi interi, non locuzioni.
        "name": {
            "en": "Three sentences to make yourself understood",
            "sv": "Tre meningar för att bli förstådd",
        },
    },
    "qpcs-confidence-evidence-log": {
        "name": {"de": "Protokoll der Kompetenznachweise"},
    },
    "qpcc-time-block-protection": {
        # Il punto e' difendere il blocco, non fissarlo.
        "name": {
            "en": "Protect a block of time",
            "es": "Proteger un bloque de tiempo",
            "fr": "Protéger un bloc de temps",
            "de": "Einen Zeitblock schützen",
            "sv": "Skydda ett tidsblock",
        },
    },
    "qpcc-start-ritual": {
        "name": {
            "en": "Short start ritual",
            "de": "Kurzes Startritual",
        },
    },
    "qpcc-decision-worst-case-plan": {
        # Si prepara il primo passo, non lo si compie.
        "name": {
            "en": "Name the worst and prepare the first step",
            "es": "Nombrar lo peor y preparar el primer paso",
            "fr": "Nommer le pire et préparer le premier pas",
            "de": "Das Schlimmste benennen und den ersten Schritt vorbereiten",
            "sv": "Namnge det värsta och förbereda det första steget",
        },
    },
    "qpcc-responsibility-share-and-check": {
        # "peso" e' il carico da portare, non una misura in chili.
        "name": {
            "en": "Share the load and set the review",
            "es": "Repartir la carga y fijar la revisión",
            "fr": "Partager la charge et fixer le point de suivi",
            "de": "Die Last teilen und die Überprüfung festlegen",
            "sv": "Dela bördan och bestäm avstämningen",
        },
    },
    "qpcc-mastery-model-peer": {
        # "chi ci e' passato" ha attraversato la difficolta', non e' passato di li'.
        "name": {
            "en": "Look at someone who has been through it",
            "es": "Fijarse en quien ya ha pasado por eso",
            "fr": "Regarder quelqu'un qui est déjà passé par là",
            "de": "Auf jemanden schauen, der das schon durchgemacht hat",
            "sv": "Titta på någon som redan gått igenom det",
        },
    },
    "qap-future-letter-to-self": {
        # La lettera arriva dal futuro: tutte e cinque le lingue l'avevano
        # spedita dal passato.
        "name": {
            "en": "Letter from a year ahead",
            "es": "Carta desde dentro de un año",
            "fr": "Lettre écrite dans un an",
            "de": "Brief aus einem Jahr in der Zukunft",
            "sv": "Brev från ett år framåt",
        },
    },
    "qap-curiosity-try-small": {
        "name": {"sv": "Litet test före det stora valet"},
    },
    "qap-confidence-obstacle-inventory": {
        "name": {"sv": "Inventering av övervunna hinder"},
    },
    "ztpi-past-positive-rituals": {
        "name": {"sv": "Hålla banden och ritualerna vid liv"},
    },
    "ztpi-past-positive-narrative-thread": {
        # "storia" e' il percorso di chi parla, non la Storia.
        "name": {"en": "The thread that holds your story together"},
    },
    "ztpi-fatalism-evidence-of-effect": {
        "name": {
            "en": "Look for evidence that something made a difference",
            "es": "Buscar pruebas de que algo cambió las cosas",
        },
    },
    "qpcc-speaking-question-first": {
        # Il codice K1 era sparito da tutte e cinque le traduzioni.
        "recommended_when": {
            "en": "When K1 (public speaking) is an area for growth.",
            "es": "Cuando K1 (hablar en público) es un área de crecimiento.",
            "fr": "Quand K1 (parler en public) est un domaine de croissance.",
            "de": "Wenn K1 (öffentliches Sprechen) ein Wachstumsbereich ist.",
            "sv": "När K1 (att tala inför andra) är ett utvecklingsområde.",
        },
    },
    "qpcc-compare-and-contrast": {
        # "salta" e' crolla. Quattro lingue su cinque avevano capito "risalta",
        # che rovescia il senso della frase.
        "description": {
            "en": (
                "Take two concepts that tend to be confused and write where they coincide, "
                "where they separate, and what example distinguishes them: a distinction held "
                "only vaguely in mind is the first thing to fall apart in a test."
            ),
            "es": (
                "Toma dos conceptos que tienden a confundirse y escribe dónde coinciden, dónde "
                "se separan y qué ejemplo los distingue: la distinción mantenida vagamente en "
                "mente es lo primero que se derrumba en un examen."
            ),
            "fr": (
                "Prenez deux notions qui ont tendance à se confondre et écrivez où elles "
                "coïncident, où elles se séparent et quel exemple les distingue : une "
                "distinction gardée vaguement en tête est la première chose qui s'effondre "
                "lors d'un contrôle."
            ),
            "de": (
                "Nehmen Sie zwei Konzepte, die dazu neigen, sich zu vermischen, und schreiben "
                "Sie auf, wo sie zusammenfallen, wo sie sich trennen und welches Beispiel sie "
                "unterscheidet: Eine nur vage im Kopf behaltene Unterscheidung ist das Erste, "
                "was bei einer Prüfung zusammenbricht."
            ),
            "sv": (
                "Ta två begrepp som tenderar att förväxlas och skriv var de sammanfaller, var "
                "de skiljer sig åt och vilket exempel som skiljer dem åt: en distinktion som "
                "bara hålls vagt i minnet är det första som faller sönder på ett prov."
            ),
        },
    },
    "ztpi-hedonism-impulse-pause": {
        # "mandare all'aria" non e' far volare. Il tedesco era gia' corretto.
        "description": {
            "en": (
                "When the immediate desire arrives that would derail the plan, give yourself "
                "ten minutes before deciding and use them to see what it costs: the impulse "
                "often cannot withstand the pause, and when it can, the choice is still more "
                "conscious."
            ),
            "es": (
                "Cuando llega el deseo inmediato que echaría por tierra el plan, date diez "
                "minutos antes de decidir y úsalos para ver lo que cuesta: el impulso a menudo "
                "no soporta la pausa, y cuando lo hace, la elección es más consciente."
            ),
            "fr": (
                "Lorsque survient le désir immédiat qui ferait tomber le plan à l'eau, "
                "donnez-vous dix minutes avant de décider et utilisez-les pour voir ce que "
                "cela coûte : l'impulsion ne supporte souvent pas la pause, et lorsqu'elle la "
                "supporte, le choix est tout de même plus conscient."
            ),
            "sv": (
                "När det omedelbara begäret kommer som skulle spoliera planen, ge dig själv "
                "tio minuter innan du bestämmer dig och använd dem för att se vad det kostar: "
                "impulsen klarar ofta inte pausen, och när den klarar den är valet ändå mer "
                "medvetet."
            ),
        },
    },
    "ztpi-fatalism-one-week-experiment": {
        # "sul campo" e' nella pratica. Francese e svedese erano gia' corretti.
        "description": {
            "en": (
                "Choose one behavior to change and observe its effect for seven days, noting "
                "one line each day: the short experiment tests in practice whether nothing "
                "really depends on you, instead of discussing it in the abstract."
            ),
            "es": (
                "Elige un comportamiento para cambiar y observa su efecto durante siete días, "
                "anotando una línea cada día: el breve experimento comprueba en la práctica si "
                "realmente nada depende de ti, en lugar de discutirlo en abstracto."
            ),
            "de": (
                "Wählen Sie ein Verhalten aus, das Sie ändern möchten, und beobachten Sie "
                "dessen Wirkung über sieben Tage, indem Sie jeden Tag eine Zeile notieren: Das "
                "kurze Experiment prüft in der Praxis, ob wirklich nichts von Ihnen abhängt, "
                "anstatt es abstrakt zu diskutieren."
            ),
        },
    },
    "qpcc-transfer-to-new-case": {
        # L'esempio va cercato, non tentato: e' il gesto che rende la prova valida.
        "description": {
            "en": (
                "Immediately after understanding a rule or procedure, apply it to an example "
                "not covered in class and found on your own: this is where you discover if you "
                "have truly understood it or if you have merely recognized a case already seen."
            ),
            "es": (
                "Inmediatamente después de comprender una regla o un procedimiento, aplícalo a "
                "un ejemplo no tratado en clase y que hayas buscado por tu cuenta: es el punto "
                "en el que descubres si lo has entendido de verdad o si solo has reconocido un "
                "caso ya visto."
            ),
            "fr": (
                "Immédiatement après avoir compris une règle ou une procédure, appliquez-la à "
                "un exemple non traité en cours et que vous avez cherché par vous-même : c'est "
                "le point où vous découvrez si vous l'avez vraiment compris ou si vous n'avez "
                "fait que reconnaître un cas déjà vu."
            ),
            "de": (
                "Unmittelbar nachdem Sie eine Regel oder ein Verfahren verstanden haben, wenden "
                "Sie es auf ein Beispiel an, das nicht im Unterricht behandelt wurde und das "
                "Sie selbst gesucht haben: Hier finden Sie heraus, ob Sie es wirklich "
                "verstanden haben oder ob Sie nur einen bereits gesehenen Fall erkannt haben."
            ),
            "sv": (
                "Omedelbart efter att ha förstått en regel eller en procedur, tillämpa den på "
                "ett exempel som inte behandlats i lektionen och som du själv har letat upp: "
                "det är här du upptäcker om du verkligen har förstått det eller om du bara har "
                "känt igen ett redan sett fall."
            ),
        },
    },
}


def main() -> int:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="elenca senza scrivere")
    group.add_argument("--apply", action="store_true", help="applica le modifiche")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        changed = 0
        for slug, fields in FIXES.items():
            row = (
                db.query(models.CertifiedStrategy)
                .filter(models.CertifiedStrategy.slug == slug)
                .one_or_none()
            )
            if row is None:
                print(f"ASSENTE {slug}")
                continue
            for field, by_lang in fields.items():
                current = dict(getattr(row, f"{field}_i18n", None) or {})
                for lang, text in by_lang.items():
                    if current.get(lang) == text:
                        continue
                    print(f"{slug} {field}.{lang}")
                    print(f"  - {current.get(lang)}")
                    print(f"  + {text}")
                    current[lang] = text
                    changed += 1
                if args.apply:
                    setattr(row, f"{field}_i18n", current)
                    db.add(row)
        if args.apply:
            db.commit()
        print(f"\n{changed} testi {'corretti' if args.apply else 'da correggere'}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
