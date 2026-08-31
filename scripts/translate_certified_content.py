#!/usr/bin/env python3
"""Traduce strategie e letture certificate dall'italiano nelle altre cinque lingue.

La traduzione la fa Ollama (modello configurabile), le voci nascono `translated`
nel registro `content_language_versions`: la certificazione resta un gesto
dell'admin, non un effetto dello script.

Idempotente: una seconda esecuzione non richiama il modello per le lingue gia'
presenti, e non retrocede una lingua che una persona ha gia' certificato.

    docker exec counselorbot_backend python -m scripts.translate_certified_content --what all
    docker exec counselorbot_backend python -m scripts.translate_certified_content --what strategies --limit 5
    OLLAMA_BASE_URL=http://192.168.129.14:11434 COUNSELOR_TRANSLATE_MODEL=qwen3.8:latest \\
        docker exec counselorbot_backend python -m scripts.translate_certified_content --what all
"""
from __future__ import annotations

import argparse
import logging
import sys

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--what", choices=("strategies", "readings", "all"), default="all")
    parser.add_argument("--limit", type=int, default=None, help="quante righe al massimo")
    parser.add_argument("--force", action="store_true", help="ritraduce anche le lingue gia' presenti")
    args = parser.parse_args()

    from backend import database
    from backend.certified_translation import (
        ollama_translator,
        translate_readings,
        translate_strategies,
    )

    db = database.SessionLocal()
    try:
        translate, model = ollama_translator(db)
        print(f"modello: {model}")
        if args.what in ("strategies", "all"):
            done = translate_strategies(
                db, translate=translate, model_label=model, force=args.force, limit=args.limit
            )
            print(f"strategie tradotte: {done}")
        if args.what in ("readings", "all"):
            done = translate_readings(
                db, translate=translate, model_label=model, force=args.force, limit=args.limit
            )
            print(f"letture tradotte: {done}")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
