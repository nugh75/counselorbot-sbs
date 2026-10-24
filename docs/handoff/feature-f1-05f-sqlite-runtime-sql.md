# Handoff — F1-05f SQL runtime SQLite/Postgres
Agenti: s39-f105f-sol, s42-f105f-opus · Branch: feature/f1-05f-sqlite-runtime-sql
Task diario: 002aa71d-d456-40b9-9926-f4450cf68c83 · PR: #543
Aggiornato: 2026-10-24

## Stato
Completato — guidance aggiornata, test mirati SQLite verdi, PR aperta.

## Fatto
- d2096d46: test UTC preserva esplicitamente le quattro colonne naive LocalSession.
- ac023da6: ripristinati add_column_if_missing e import DateTime rimossi dalla base.
- 41f06686: dialect_insert su 4 moduli; costi ISO SQLite; indici booking condizionali; forum mark_read.
- File preesistente non tracciato .metadata_never_index da conservare.

## Verifiche
- Ripristino: test_db_compat + local_auth SQLite, 22 pass.
- Suite mirata SQLite: 12 pass; UTC/local_auth 26 pass, 1 skip.
- Suite applicativa SQLite: 109 pass, 5 casi noti fallenti; ratchet pulito dopo rimozione di 38 eccezioni.
- Focus esteso: 40 pass, 1 skip, solo gate class_council noto fallente.
- Dual-db checks SQLite: 14 pass; lint F, guidance/version/SQL-check verdi.

## Prossimi passi
- Merge della PR da parte del proprietario; CI dual-db conferma Postgres.

## Blocchi e rischi
- Gate import db_compat aggiornato; gate class_council preesistente fuori task.
- Diario: regressioni import a5990c28, UTC test 38b1866b, gate metadata be2bb169 registrati localmente.
- Diario: gate import db_compat b162f60d registrato; tutti i bug osservati registrati localmente.
