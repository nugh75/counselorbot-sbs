# Handoff — feature/class-goal-targets-903 (#903)

## Stato
In corso: backend fatto e verde, frontend (picker pre-chat) in lavorazione.

## Fatto
- Snapshot congelato: `target_students` ({group_id, username}) e `target_practice_notebook_ids` accanto a `group_ids` (`backend/schemas.py`).
- `verified_goal_targets` (`backend/teacher_context.py`): membro reale di classe attiva propria/condivisa; taccuino di prova attivo del docente. `freeze_session` salva solo i destinatari verificati (dopo ogni turno) e solo per OBIETTIVO_DOCENZA.

## Decisioni
- Verifica per turno = al salvataggio automatico dello snapshot (scritto dopo ogni turno), la fonte che #904 copierà nel catalogo. `ChatRequest` non cambia: nessun cambio al prompt (map #900 "Not doing"); le classi entrano come oggi con `group_ids`.

## Verifiche
- `pytest backend/tests/test_docenza_goal_targets.py backend/tests/test_docenza_group_context.py`: 12 passed (Postgres effimero `cb903-postgres`).

## Prossimi passi
- Picker pre-chat al posto di `method-select` per OBIETTIVO_DOCENZA; niente opzione "prova" nella chat docenza; docs + guidance.

## Blocchi e rischi
- Nessuno.
