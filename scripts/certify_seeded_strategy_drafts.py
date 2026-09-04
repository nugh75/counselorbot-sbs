"""Certifica le bozze di strategia introdotte dal seme di backfill.

Due gradini, entrambi necessari perche' una strategia raggiunga uno studente:
  1. `certified_strategies.status` -> "certified" (il filtro della query di recupero);
  2. la versione italiana in `content_language_versions` -> "certified" (il filtro
     di `served_locale`: senza, il recupero trova la riga e la scarta con i testi
     vuoti).

Agisce solo sugli slug dichiarati bozza nel seme: una bozza creata a mano da un
admin non viene toccata.

L'immagine del backend non contiene `scripts/`: si esegue dall'host, con
`DATABASE_URL` puntato alla porta pubblicata da Postgres (5435).

    DATABASE_URL=postgresql://USER:PASS@127.0.0.1:5435/DB \
        python3 -m scripts.certify_seeded_strategy_drafts --dry-run
    DATABASE_URL=... python3 -m scripts.certify_seeded_strategy_drafts --apply
"""
from __future__ import annotations

import argparse

from backend import models
from backend.certified_strategy_seed import DEFAULT_CERTIFIED_STRATEGIES
from backend.content_version_service import get_version, promote
from backend.database import SessionLocal

APPROVED_BY = "admin"


def main() -> int:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="elenca senza scrivere")
    group.add_argument("--apply", action="store_true", help="applica le modifiche")
    args = parser.parse_args()

    seeded_drafts = {
        spec["slug"] for spec in DEFAULT_CERTIFIED_STRATEGIES
        if spec.get("status") == "draft"
    }
    db = SessionLocal()
    try:
        rows = (
            db.query(models.CertifiedStrategy)
            .filter(
                models.CertifiedStrategy.slug.in_(seeded_drafts),
                models.CertifiedStrategy.status == "draft",
            )
            .order_by(models.CertifiedStrategy.sort_order.asc())
            .all()
        )
        promoted = 0
        for row in rows:
            version = get_version(db, "certified_strategy", row.slug, "it")
            current = version.status if version else "assente"
            print(f"{row.slug}: riga draft -> certified; it {current} -> certified")
            if not args.apply:
                continue
            row.status = "certified"
            db.add(row)
            if version is not None and version.status != "certified":
                promote(db, version, "certified", approved_by=APPROVED_BY)
            promoted += 1
        if args.apply:
            db.commit()
            print(f"\n{promoted} strategie certificate")
        else:
            print(f"\n{len(rows)} strategie da certificare (nessuna scrittura)")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
