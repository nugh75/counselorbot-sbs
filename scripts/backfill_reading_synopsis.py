"""Riempie le sinossi mancanti del catalogo letture dalle fonti pubbliche.

Scrive bozze: `synopsis_source.approved_by` resta nullo finche' un admin non
rivede la voce dal pannello. Non tocca lo stato di certificazione e non
sovrascrive una sinossi gia' presente, a meno di `--overwrite`.

    python scripts/backfill_reading_synopsis.py --lang it --dry-run
    python scripts/backfill_reading_synopsis.py --lang it --lang en --limit 5
"""
import argparse
import os
import sys
import time

from dotenv import load_dotenv

load_dotenv()

if not os.getenv("DATABASE_URL"):
    user = os.getenv("POSTGRES_USER", "counselorbot_user")
    pwd = os.getenv("POSTGRES_PASSWORD", "")
    host = os.getenv("POSTGRES_HOST", "localhost")
    port = os.getenv("POSTGRES_HOST_PORT", "5435")
    db = os.getenv("POSTGRES_DB", "counselorbot")
    os.environ["DATABASE_URL"] = f"postgresql://{user}:{pwd}@{host}:{port}/{db}"

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import models, web_lookup  # noqa: E402
from backend.database import SessionLocal  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lang", action="append", dest="langs", default=None,
                        help="lingua della sinossi (ripetibile); default: it")
    parser.add_argument("--slug", action="append", dest="slugs", default=None,
                        help="limita a uno o piu' slug")
    parser.add_argument("--limit", type=int, default=0, help="numero massimo di voci da trattare")
    parser.add_argument("--overwrite", action="store_true", help="riscrive anche le sinossi gia' presenti")
    parser.add_argument("--dry-run", action="store_true", help="mostra cosa farebbe, senza scrivere")
    parser.add_argument("--sleep", type=float, default=1.0, help="pausa fra due chiamate di rete")
    args = parser.parse_args()

    langs = args.langs or ["it"]
    db = SessionLocal()
    written = skipped = missing = 0
    try:
        query = db.query(models.CertifiedReading).order_by(models.CertifiedReading.sort_order.asc())
        if args.slugs:
            query = query.filter(models.CertifiedReading.slug.in_(args.slugs))
        rows = query.all()
        touched = 0
        for row in rows:
            if args.limit and touched >= args.limit:
                break
            current = dict(row.synopsis_i18n or {})
            # Una voce e' coperta quando ha un testo in una qualsiasi lingua:
            # la fonte decide in quale, e il render ricade sull'inglese.
            covered = any((text or "").strip() for text in current.values())
            wanted = [] if covered and not args.overwrite else list(langs)
            if not wanted:
                skipped += 1
                continue
            touched += 1
            found_any = False
            for lang in wanted:
                result = web_lookup.synopsis_for({
                    "title": row.title, "original_title": row.original_title,
                    "kind": row.kind, "creators": row.creators or [],
                }, lang=lang)
                time.sleep(max(0.0, args.sleep))
                if result is None:
                    print(f"  [{lang}] {row.slug}: nessuna fonte")
                    continue
                found_any = True
                # Il testo va sotto la lingua in cui la fonte ha risposto: i
                # cataloghi bibliografici rispondono in inglese anche a una
                # richiesta italiana, e archiviarlo come italiano sarebbe falso.
                stored_lang = result.language or lang
                current[stored_lang] = result.text
                print(f"  [{lang}->{stored_lang}] {row.slug}: {result.source} — {result.url}")
                if not args.dry_run:
                    row.synopsis_i18n = current
                    row.synopsis_source = {
                        "source": result.source, "url": result.url,
                        "retrieved_at": result.retrieved_at, "license": result.license,
                        "approved_by": None,
                    }
            if found_any:
                written += 1
            else:
                missing += 1
        if not args.dry_run:
            db.commit()
    finally:
        db.close()

    mode = "simulate" if args.dry_run else "scritte"
    print(f"\nVoci {mode}: {written} — senza fonte: {missing} — gia' complete: {skipped}")
    print("Le sinossi sono bozze: vanno riviste dal pannello prima di certificare.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
