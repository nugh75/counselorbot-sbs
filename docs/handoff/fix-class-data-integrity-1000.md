# Handoff — fix/class-data-integrity-1000 (#1000)

## Stato
Implementazione completa; PR in apertura verso main.

## Fatto
- Vincolo unico `group_memberships (group_id, username)`; `ensure_membership` con ON CONFLICT DO NOTHING.
- Migrazione idempotente `backend/migrations/20261116_class_data_integrity.py`: unisce i doppioni (tiene il più vecchio), FK CASCADE su `class_pairing_codes`/`local_students`, CHECK e indici unici parziali su `goal_catalog_targets`.
- `delete_group` cancella tutto il collegato (condivisioni, link consiglio, catalogo, assegnazioni, obiettivi condivisi a NULL, taccuini di prova, copertina); 409 invariato con piani.
- Testo di conferma eliminazione nelle sei lingue (anche nella finestra di dialogo).
- Doc: funzionalità, CONTEXT.md.

## Verifiche
- Backend: `test_class_data_integrity.py` 5/5; forum, inviti, p7 authz, obiettivi docenza, target catalogo, targeted goals, local pairing, test data exclusion: 111 passed.
- Frontend: tsc, eslint file toccati, i18n:check, test:ci (951 pass).
- `make guidance-check` ok.
- Nessun controllo visivo (niente dev server per vincolo RAM).

## Prossimi passi
- Deploy backend + frontend (migrazione all'avvio). Nessun passo sudo.

## Blocchi e rischi
- La migrazione cancella iscrizioni doppie e destinatari catalogo vuoti/doppi: fare backup DB prima del deploy.
- Un altro agente modifica `groups.py` (immagine/info): merge di origin/main prima della PR.
