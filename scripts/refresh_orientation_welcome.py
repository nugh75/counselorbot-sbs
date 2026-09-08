"""Riallinea il benvenuto della Bussola nelle sessioni gia' aperte.

Il benvenuto viene scritto in `messages[0]` alla creazione della sessione: se il
testo cambia, le sessioni gia' esistenti restano indietro e due studenti leggono
due messaggi diversi. Questo script riporta tutte le sessioni al testo corrente,
conservando l'introduzione del counselor quando c'e'. E' idempotente: rilanciarlo
dopo ogni modifica di WELCOME.

Uso:
    DATABASE_URL=... python3 scripts/refresh_orientation_welcome.py [--apply]
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text  # noqa: E402

from backend.routes.orientation import WELCOME  # noqa: E402

# Prima frase del benvenuto: e' rimasta invariata attraverso le revisioni del
# testo, quindi segna dove finisce l'introduzione del counselor e dove comincia
# la parte da sostituire.
OPENING = {
    "it": "Sono la Bussola di CounselorBot.",
    "en": "I am the CounselorBot Compass.",
    "es": "Soy la Brújula de CounselorBot.",
    "fr": "Je suis la Boussole de CounselorBot.",
    "de": "Ich bin der CounselorBot-Kompass.",
    "sv": "Jag är CounselorBots kompass.",
}


def main() -> int:
    apply = "--apply" in sys.argv
    engine = create_engine(os.environ["DATABASE_URL"])
    updated = skipped = current = 0
    with engine.begin() as conn:
        rows = conn.execute(
            text("select session_id, language, messages from orientation_sessions order by created_at")
        ).fetchall()
        for session_id, language, messages in rows:
            messages = list(messages or [])
            if not messages:
                continue
            first = dict(messages[0] or {})
            content = str(first.get("content") or "")
            opening = OPENING.get(language)
            if not opening or opening not in content:
                skipped += 1
                print(f"saltata   {session_id[:8]} {language}: benvenuto non riconosciuto")
                continue
            prefix = content[: content.index(opening)]
            fresh = prefix + WELCOME[language]
            if fresh == content:
                current += 1
                continue
            updated += 1
            print(f"aggiorna  {session_id[:8]} {language}")
            if apply:
                first["content"] = fresh
                messages[0] = first
                conn.execute(
                    text("update orientation_sessions set messages = :messages where session_id = :sid"),
                    {"messages": __import__("json").dumps(messages), "sid": session_id},
                )
    verb = "aggiornate" if apply else "da aggiornare"
    print(f"\n{verb}={updated} gia_allineate={current} saltate={skipped} totali={len(rows)}")
    if not apply:
        print("prova a vuoto: rilancia con --apply per scrivere")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
