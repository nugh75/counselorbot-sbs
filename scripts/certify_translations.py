"""Certifica le traduzioni dei cataloghi certificati, lingua per lingua.

`translate_strategies` registra ogni lingua tradotta come `translated` e si ferma
li': la promozione a `certified` e' un atto editoriale che chiede una persona.
Questo script la applica in blocco quando quella persona ha dato l'ok.

Promuove solo le lingue gia' `translated`, cioe' quelle con il testo completo in
tutti i campi che hanno una sorgente italiana. Le lingue rimaste `draft` sono
incomplete e la scala di stato non ammette il salto: restano dove sono. Le
lingue gia' certificate non vengono toccate.

L'italiano non passa di qui: per le strategie lo certifica
`certify_seeded_strategy_drafts.py` insieme alla riga, per le letture era gia'
certificato.

L'immagine del backend non contiene `scripts/`: si esegue dall'host, con
`DATABASE_URL` puntato alla porta pubblicata da Postgres (5435).

    DATABASE_URL=postgresql://USER:PASS@127.0.0.1:5435/DB \
        python3 -m scripts.certify_translations --catalog strategies --dry-run
    DATABASE_URL=... python3 -m scripts.certify_translations --catalog readings --apply
"""
from __future__ import annotations

import argparse
from collections import Counter

from backend import models
from backend.certified_translation import TOOL_TARGET_LANGS
from backend.content_version_service import get_version, promote
from backend.database import SessionLocal

APPROVED_BY = "admin"

CATALOGS = {
    "strategies": (models.CertifiedStrategy, "certified_strategy"),
    "readings": (models.CertifiedReading, "certified_reading"),
}


def main() -> int:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="elenca senza scrivere")
    group.add_argument("--apply", action="store_true", help="applica le modifiche")
    parser.add_argument(
        "--catalog", choices=tuple(CATALOGS), default="strategies",
        help="quale catalogo promuovere",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        model, content_type = CATALOGS[args.catalog]
        rows = (
            db.query(model)
            .filter(model.status == "certified")
            .order_by(model.id)
            .all()
        )
        promoted = Counter()
        skipped = Counter()
        for row in rows:
            for lang in TOOL_TARGET_LANGS:
                version = get_version(db, content_type, row.slug, lang)
                status = version.status if version else "assente"
                if status != "translated":
                    skipped[status] += 1
                    continue
                promoted[lang] += 1
                if args.apply:
                    promote(db, version, "certified", approved_by=APPROVED_BY)
        total = sum(promoted.values())
        for lang in TOOL_TARGET_LANGS:
            print(f"{lang}: {promoted[lang]} da promuovere")
        for status, count in sorted(skipped.items()):
            print(f"non toccate ({status}): {count}")
        print(f"\n{total} versioni {'promosse' if args.apply else 'da promuovere'}"
              f" su {len(rows)} voci certificate ({args.catalog})")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
