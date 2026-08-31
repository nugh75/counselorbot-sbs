#!/usr/bin/env python3
"""Traduce item, fattori e nome degli strumenti verso le lingue mancanti.

La sorgente e' l'inglese: gli originali italiani stanno sul sito esterno, in-app
la versione autorevole e' quella inglese.

Le lingue prodotte arrivano a `translated` e si fermano li'. `reviewed`, `pilot`
e `validated` restano gesti umani, previsti dal protocollo di validazione: fino
ad allora lo strumento in quella lingua non e' somministrabile, e l'app lo dice.

    docker exec counselorbot_backend python -m scripts.translate_instruments \\
        --instruments QSAr --targets fr,de,es
    docker exec counselorbot_backend python -m scripts.translate_instruments --all --targets fr,de,es
"""
from __future__ import annotations

import argparse
import logging
import sys

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--instruments", help="codici separati da virgola (es. QSA,QSAr)")
    parser.add_argument("--all", action="store_true", help="tutti gli strumenti del catalogo")
    parser.add_argument("--targets", default="fr,de,es", help="lingue di destinazione")
    parser.add_argument("--source", default="en", help="lingua di partenza (default: en)")
    parser.add_argument("--limit", type=int, default=None, help="quanti item al massimo per strumento")
    parser.add_argument("--force", action="store_true", help="ritraduce anche le lingue gia' presenti")
    args = parser.parse_args()

    from backend import database, models
    from backend.instrument_translation import ollama_translator, translate_instrument

    targets = [t.strip() for t in args.targets.split(",") if t.strip()]
    if not targets:
        print("nessuna lingua di destinazione", file=sys.stderr)
        return 2

    db = database.SessionLocal()
    try:
        if args.all:
            codes = [row.code for row in db.query(models.Instrument).order_by(models.Instrument.code).all()]
        elif args.instruments:
            codes = [c.strip() for c in args.instruments.split(",") if c.strip()]
        else:
            print("serve --instruments oppure --all", file=sys.stderr)
            return 2

        translate, model = ollama_translator(db)
        print(f"modello: {model} · sorgente: {args.source} · destinazioni: {','.join(targets)}")
        for code in codes:
            done = translate_instrument(
                db, code, targets=targets, translate=translate, model_label=model,
                source=args.source, force=args.force, limit=args.limit,
            )
            print(f"{code}: {done} item tradotti")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
