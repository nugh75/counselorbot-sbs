"""Crea i counselor del batch (idempotente) e genera le traduzioni descrizione.

Eseguito DENTRO il container backend (l'app usa import relativi e l'ambiente
del container ha OLLAMA_BASE_URL giusto per la traduzione via Ollama):

    docker cp scripts/create_counselors.py scripts/counselor_batch.json counselorbot_backend:/tmp/
    docker exec counselorbot_backend sh -c "cd /app && python /tmp/create_counselors.py /tmp/counselor_batch.json"

Idempotente: gli slug gia' presenti vengono saltati. La traduzione delle
descrizioni e' best-effort (counselor_i18n logga e ignora gli errori): se
Ollama non risponde, description_i18n resta vuota e la UI fa fallback
all'italiano; si puo' rilanciare con POST /admin/counselors/{id}/translate.
"""
import json
import sys

from backend import models, database
from backend.counselor_i18n import translate_counselor_sync


def main(path: str) -> None:
    with open(path, encoding="utf-8") as f:
        batch = json.load(f)

    db = database.SessionLocal()
    created, skipped = [], []
    try:
        for payload in batch:
            slug = (payload.get("slug") or "").strip()
            if not slug:
                print(f"skip payload senza slug: {payload}")
                continue
            if db.query(models.Counselor).filter(models.Counselor.slug == slug).first():
                skipped.append(slug)
                continue
            counselor = models.Counselor(
                slug=slug,
                name=(payload.get("name") or "").strip(),
                description=payload.get("description"),
                persona=payload.get("persona"),
                voice_mapping=payload.get("voice_mapping"),
                preset_id=payload.get("preset_id"),
                questionnaire_types=payload.get("questionnaire_types"),
                language=payload.get("language") or ["*"],
                sort_order=payload.get("sort_order") or 0,
                is_active=payload.get("is_active", True),
                show_in_assistant=payload.get("show_in_assistant") or False,
                assistant_audience=payload.get("assistant_audience"),
            )
            db.add(counselor)
            db.commit()
            db.refresh(counselor)
            created.append((counselor.id, slug))
    finally:
        db.close()

    if created:
        db = database.SessionLocal()
        try:
            for cid, slug in created:
                print(f"translate {slug} (id={cid})...")
                translate_counselor_sync(db, cid, force=True)
        finally:
            db.close()

    print(f"created: {[s for _, s in created]}")
    print(f"skipped (slug gia' presente): {skipped}")
    if not created and not skipped:
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1])
