# fix/intro-platform-capabilities-1017 (#1017)

## Stato
Fix e test verdi; commit e PR in corso.

## Fatto
- Causa: `backend/chat_logic.py` saltava il blocco `[PLATFORM CAPABILITIES]`
  se il prompt conteneva già quella stringa; i prompt intro la citano
  ("answer from the [PLATFORM CAPABILITIES] block"), quindi il catalogo
  non arrivava mai. Ora il controllo cerca solo l'intestazione a inizio riga.
- Rimosse le due righe #1017 da `backend/tests/postgres_known_failures.txt`
  (la riga QPCC resta: è di un'altra issue).
- Guida funzionalità aggiornata (una frase).

## Verifiche
- `make guidance-check`: ok.
- `test_smoke.py` intero su Postgres 15 locale: 204 pass, 1 fail preesistente
  (`test_an_older_stage_of_the_map_can_be_drawn_again`, 422, fallisce anche
  senza la modifica; registrato nel Diario come bug sospetto).
- `test_path_contents.py`, `test_prompt_source_locations.py`: 19 pass.
- Asserzione SAVICKAS obsoleta aggiornata al testo attuale (f07008ed).
- Container `cb-1017-pg` rimosso.

## Prossimi passi
- Commit, merge origin/main, PR.

## Blocchi e rischi
- Nessuno.
