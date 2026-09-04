"""Setaccio automatico sulle traduzioni di strategie e letture.

Non giudica la qualita' di una resa: segnala i punti in cui la traduzione ha
quasi certamente perso qualcosa, cosi' la revisione umana legge cento testi
invece di millecinquecento.

Cinque bandiere, tutte trovate sul campo durante la revisione delle strategie
di backfill:

  codice-perso   un codice fattore presente in italiano non compare nella
                 traduzione (K1 era sparito da tutte e cinque le lingue);
  non-tradotto   il testo e' identico all'italiano;
  lunghezza      il rapporto con la sorgente esce dall'intervallo atteso: di
                 solito significa una frase tagliata o una farcitura;
  ripetizione    una parola ripetuta a ridosso di se' stessa ("Oro av oro");
  calco          un idioma italiano reso alla lettera. La tabella copre solo
                 le trappole gia' viste: e' una rete, non un teorema.

    DATABASE_URL=postgresql://USER:PASS@127.0.0.1:5435/DB \
        python3 -m scripts.audit_translations
    DATABASE_URL=... python3 -m scripts.audit_translations --only readings
"""
from __future__ import annotations

import argparse
import re
import unicodedata

from backend import models
from backend.certified_translation import TOOL_TARGET_LANGS
from backend.database import SessionLocal

FACTOR_CODE = re.compile(r"\b(?:[CAST]\d{1,2}[a-zA-Z]?|AD\d|K\d)\b")
LENGTH_MIN, LENGTH_MAX = 0.55, 1.75
# Sotto questa soglia il rapporto di lunghezza non dice niente: un titolo di tre
# parole puo' legittimamente raddoppiare.
LENGTH_FLOOR_CHARS = 60

STRATEGY_FIELDS = ("name", "recommended_when", "description")
READING_FIELDS = ("why", "summary", "synopsis")

# {frammento italiano: {lingua: espressione che ne e' la resa letterale}}
CALQUES: dict[str, dict[str, str]] = {
    "all'aria": {
        "en": r"into the air",
        "es": r"volar el plan",
        "fr": r"voler le plan",
        "sv": r"i luften",
    },
    "sul campo": {
        "en": r"on the field",
        "es": r"en el campo",
        "de": r"im Feld",
        "sv": r"på fältet",
    },
    # "salta" qui significa crolla; quattro lingue su cinque avevano capito
    # l'opposto, cioe' risalta.
    "che salta": {
        "en": r"jumps out|stands out",
        "es": r"salta",
        "fr": r"saute aux yeux",
        "de": r"auffällt",
        "sv": r"sticker ut",
    },
    "ridire": {
        "en": r"think before",
        "es": r"piensa antes",
        "fr": r"réfléchir avant",
        "de": r"denken Sie nach",
        "sv": r"tänk efter",
    },
    "cercato da soli": {
        "en": r"attempted on your own",
        "es": r"intentado por tu cuenta",
        "fr": r"essayé par vous-même",
        "de": r"selbst versucht",
        "sv": r"själv har försökt",
    },
    "anno avanti": {
        "en": r"a year ago",
        "es": r"hace un año",
        "fr": r"il y a un an",
        "de": r"vor einem Jahr",
        "sv": r"ett år sedan",
    },
}


def _norm(text: str) -> str:
    return unicodedata.normalize("NFKC", " ".join((text or "").split())).strip()


# Pronomi e articoli si ripetono per costruzione: il "Sie" di cortesia tedesco
# ne mette due per frase. Contarli seppelliva le ripetizioni vere.
FUNCTION_WORDS = {
    "sie", "die", "der", "das", "und", "den", "dem", "ein", "eine",
    "vous", "les", "des", "que", "qui", "une", "est", "pour", "dans",
    "the", "and", "you", "for", "with", "que", "los", "las", "una",
    "att", "och", "som", "det", "den", "för", "till",
}


def _repeated_word(text: str) -> str:
    words = [
        w for w in re.findall(r"\w+", (text or "").lower(), flags=re.UNICODE)
        if w not in FUNCTION_WORDS
    ]
    for first, second in zip(words, words[1:]):
        if first == second and len(first) > 2:
            return first
    # "Oro av oro": stessa parola due volte in un titolo cortissimo.
    if len(words) <= 4:
        for word in set(words):
            if len(word) > 2 and words.count(word) > 1:
                return word
    return ""


def _flags(source: str, target: str, lang: str) -> list[str]:
    found: list[str] = []
    source, target = _norm(source), _norm(target)
    if not source or not target:
        return found
    if source.casefold() == target.casefold():
        found.append("non-tradotto")
    missing = {code for code in FACTOR_CODE.findall(source)} - set(FACTOR_CODE.findall(target))
    if missing:
        found.append(f"codice-perso:{','.join(sorted(missing))}")
    if len(source) >= LENGTH_FLOOR_CHARS:
        ratio = len(target) / len(source)
        if not LENGTH_MIN <= ratio <= LENGTH_MAX:
            found.append(f"lunghezza:{ratio:.2f}")
    repeated = _repeated_word(target)
    if repeated:
        found.append(f"ripetizione:{repeated}")
    for trigger, by_lang in CALQUES.items():
        pattern = by_lang.get(lang)
        if pattern and trigger in source.casefold() and re.search(pattern, target, re.IGNORECASE):
            found.append(f"calco:{trigger}")
    return found


def _audit(rows, fields: tuple[str, ...], label: str) -> int:
    hits = 0
    for row in rows:
        for field in fields:
            texts = getattr(row, f"{field}_i18n", None) or {}
            source = texts.get("it") or getattr(row, f"{field}_it", "") or ""
            if not _norm(source):
                continue
            for lang in TOOL_TARGET_LANGS:
                target = texts.get(lang) or ""
                flags = _flags(source, target, lang)
                if not flags:
                    continue
                hits += 1
                print(f"[{label}] {row.slug} {field}.{lang}  {' '.join(flags)}")
                print(f"    it: {_norm(source)[:160]}")
                print(f"    {lang}: {_norm(target)[:160]}")
    return hits


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--only", choices=("strategies", "readings"), help="limita a un catalogo"
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        total = 0
        if args.only != "readings":
            rows = (
                db.query(models.CertifiedStrategy)
                .filter(models.CertifiedStrategy.status == "certified")
                .order_by(models.CertifiedStrategy.sort_order)
                .all()
            )
            total += _audit(rows, STRATEGY_FIELDS, "strategia")
        if args.only != "strategies":
            rows = (
                db.query(models.CertifiedReading)
                .filter(models.CertifiedReading.status == "certified")
                .order_by(models.CertifiedReading.sort_order)
                .all()
            )
            total += _audit(rows, READING_FIELDS, "lettura")
        print(f"\n{total} segnalazioni")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
