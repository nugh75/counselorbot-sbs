"""Aggiorna bio e persona dei counselor esistenti (idempotente).

Eseguito DENTRO il container backend, stesso pattern di create_counselors.py:

    docker cp scripts/update_counselors_personality.py scripts/counselor_personality_batch.json counselorbot_backend:/tmp/
    docker exec counselorbot_backend sh -c "cd /app && python /tmp/update_counselors_personality.py /tmp/counselor_personality_batch.json"

Per ogni voce del batch con slug esistente:
  - aggiorna description e/o persona (solo i campi presenti nel payload);
  - se la description e' cambiata, rigenera description_i18n (best-effort via
    Ollama: se non risponde, restano le traduzioni precedenti e si puo'
    rilanciare con POST /admin/counselors/{id}/translate);
  - is_active false disattiva senza toccare i testi.
Idempotente: rilanciabile senza effetti collaterali. Slug non trovato = errore.
"""
import json
import sys

from backend import models, database
from backend.counselor_i18n import translate_counselor_sync


def main(path: str) -> None:
    with open(path, encoding="utf-8") as f:
        batch = json.load(f)

    db = database.SessionLocal()
    updated, translated, deactivated = [], [], []
    missing = []
    try:
        for payload in batch:
            slug = (payload.get("slug") or "").strip()
            if not slug:
                print(f"skip payload senza slug: {payload}")
                continue
            counselor = db.query(models.Counselor).filter(models.Counselor.slug == slug).first()
            if counselor is None:
                missing.append(slug)
                continue

            desc_changed = False
            if payload.get("description") is not None:
                desc_changed = counselor.description != payload["description"]
                counselor.description = payload["description"]
            if payload.get("persona") is not None:
                counselor.persona = payload["persona"]
            if payload.get("is_active") is not None:
                if counselor.is_active and not payload["is_active"]:
                    deactivated.append(slug)
                counselor.is_active = payload["is_active"]

            db.commit()
            updated.append(slug)
            if desc_changed:
                translated.append((counselor.id, slug))
    finally:
        db.close()

    if translated:
        db = database.SessionLocal()
        try:
            for cid, slug in translated:
                print(f"translate {slug} (id={cid})...")
                translate_counselor_sync(db, cid, force=True)
        finally:
            db.close()

    print(f"updated: {updated}")
    print(f"description ritradotte: {[s for _, s in translated]}")
    print(f"disattivati: {deactivated}")
    print(f"slug non trovati: {missing}")
    if missing or not updated:
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1])
