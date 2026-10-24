# Handoff vivo — feature/privacy-p8-subject-pid-maps

Agente `s57-p8-opus`, task `2f863b9b-8966-442f-a411-d5bce55965cc`, issue #562.

## Stato
Implementazione completa, PR aperta su `main`; in attesa di CI (Postgres + SQLite) e merge.

## Fatto
- `backend/privacy/subject.py`: `subject_pid` base32 minuscolo 26 caratteri, `is_subject_pid`, `blind_index`.
- `backend/privacy/map_store.py`: `SqlAlchemyMapStore` su `privacy_pseudonym_maps` (DEK `mapping`, AAD per riga e interessato).
- `pseudonymization.py`: `ScopeMap.subject_pid`, `subject_pid_of` nel motore; scope di un altro interessato ⇒ `PolicyBlocked`.
- Doc: `docs/privacy/p8-subject-mappe.md`, README privacy, P4/P5, 02 §4.1, funzionalità.

## Verifiche
- `TEST_DB=sqlite` Py 3.11.9: P8 23 pass; con P5/P4/core 264 pass, 2 skip; db_compat/schema/UTC 15 pass, 1 skip.
- `make guidance-check` verde. Postgres locale non eseguito (Docker spento): copre la CI `backend-db.yml`.

## Prossimi passi
- P6 collega `SqlAlchemyMapStore` al gateway con una sessione per richiesta e `subject_pid_of=store.ring.subject_pid`.
- Eventi `privacy_events` / `record_privacy_event` (riga P8 di 03-piano-blocchi) in un blocco successivo.

## Blocchi e rischi
- Due processi sullo stesso scope nello stesso istante: il secondo fallisce chiuso (`PrivacyError`) e il turno va ripetuto.
