#!/usr/bin/env python3
"""Riempie con Ollama le quattro lingue che mancano negli esempi dei generi.

Italiano e inglese sono scritti a mano e non si toccano: sono la sorgente. Le
altre quattro si generano una volta e restano nel JSON, versionate come il
resto della grammatica.

    docker exec counselorbot_backend python -m scripts.translate_tavolo_presets --dry-run
    docker exec counselorbot_backend python -m scripts.translate_tavolo_presets
"""
import argparse
import json
from pathlib import Path

TARGETS = ("es", "fr", "de", "sv")
SOURCE = "it"
CATALOG = Path(__file__).resolve().parent.parent / "backend" / "tavolo_presets.json"


def _fields(entry: dict):
    """Ogni dizionario di lingua dentro un genere: titolo, label, prompt."""
    yield entry["example"]["title"]
    for node in entry["example"]["nodes"]:
        yield node["label"]
    for edge in entry["example"]["edges"]:
        if isinstance(edge.get("label"), dict):
            yield edge["label"]
    yield entry["prompts"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="rifa' anche le lingue gia' presenti")
    args = parser.parse_args()

    from backend import database
    from backend.instrument_translation import ollama_translator

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    db = next(database.get_db())
    try:
        translate, model = ollama_translator(db)
        print(f"modello: {model}")
        for entry in catalog:
            for field in _fields(entry):
                wanted = [lang for lang in TARGETS if args.force or not field.get(lang)]
                if not wanted:
                    continue
                if isinstance(field.get(SOURCE), list):
                    # I prompt d'esempio sono due per lingua: si traducono uno per uno.
                    # Una lingua a cui manca anche un solo prompt non si scrive: come
                    # nel ramo scalare qui sotto, meglio lasciare il buco che spacciare
                    # l'italiano per una traduzione, perche' _word() lo noterebbe solo
                    # se la chiave mancasse del tutto.
                    produced = {lang: [] for lang in wanted}
                    complete = set(wanted)
                    for text in field[SOURCE]:
                        done = translate(text, SOURCE, wanted)
                        for lang in wanted:
                            value = done.get(lang)
                            if value:
                                produced[lang].append(value)
                            else:
                                complete.discard(lang)
                    field.update({lang: produced[lang] for lang in complete})
                    print(f"  {entry['id']}: prompt -> {','.join(sorted(complete))}")
                else:
                    done = translate(field[SOURCE], SOURCE, wanted)
                    field.update({lang: done[lang] for lang in wanted if done.get(lang)})
                    print(f"  {entry['id']}: {field[SOURCE][:40]} -> {','.join(wanted)}")
    finally:
        db.close()

    if args.dry_run:
        print("dry-run: niente scritto")
        return 0
    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"scritto {CATALOG}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
