# Preparazione release v2.0.2

- Richiesta esplicita del proprietario: attendere i check e pubblicare la nuova release.
- Branch `chore/release-2.0.2`, creato da `origin/main` aggiornato e avanzato con
  fast-forward sui fix della PR #621; la PR di versione inizialmente ha quella PR come base.
- `VERSION` passa da 2.0.0 a 2.0.2: v2.0.1 esiste già su GitHub ma i suoi quattro
  installer riportano ancora 2.0.0. Le release precedenti non vengono modificate.
- Versioni propagate con `make version-sync`; nessuna dipendenza aggiornata.
- Gate: check PR #621, merge delle correzioni, check/merge della PR di versione,
  `workflow_dispatch` di `desktop-teacher.yml` sull'esatto `main` risultante.
- Pubblicazione: nuovo tag v2.0.2 sulla merge commit ufficiale, quattro installer,
  checksum verificati e manifest coerenti. Nessun asset di release precedente sovrascritto.
- Note preparate in `docs/releases/v2.0.2.md`; migrazione automatica SQLite e
  auto-aggiornamento firmato non disponibili.
- Nessun deploy o sudo. Build Docker di verifica isolate da produzione.
- Verifiche di preparazione: 7 test del sincronizzatore e `version-check`,
  `guidance-refresh/check`, diff pulito; immagini Docker backend e frontend
  ricostruite senza riavviare produzione, frontend con build TypeScript completa.
