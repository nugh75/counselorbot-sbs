# s11-builder — builder dei piani operativi

## Stato
Tutti e tre i task sono `fatto` nel diario Counselorbot:
- 2014148c — passi autonomi, commit `014a72d4`.
- eb537b45 — forum in pagina, commit `e5603d11`.
- c8a79b2b — incontri in pagina, commit `ab83a87e`.

Branch: `feature/piano-builder-interno`. PR unica: [#595](https://github.com/nugh75/counselorbot-sbs/pull/595),
da revisionare e unire dal proprietario. Allineato con `origin/main` (`e793de23`):
conservate le correzioni di baseline/auth e la sostituzione con archiviazione
delle somministrazioni. Un secondo commit di integrazione è stato necessario
perché main è avanzato durante la pubblicazione della PR.

## Fatto
- Passi autonomi anche nei piani storici strict; ordine solo visivo, nessun
  abbinamento chat/incontro. Nuove analisi con scelta della compilazione;
  fonti storiche conservate senza vincolare ordine/rimozione dei passi.
- Creazione e modifica titolo/testo delle discussioni in modale, con i form,
  endpoint e permessi del forum esistenti. Bozza del piano preservata.
- Gestore incontri riusato in modale: gruppo, colloqui individuali, fasce,
  prenotazioni e presenze; accesso diretto da ogni passo. Metadati aggiornati
  senza perdere o sporcare la bozza del piano, revisioni e ricaricamento con conferma.
- Protezione delle bozze anche per una fascia appena digitata e chiusura rapida;
  focus nella modale, ripristino del focus e blocco della chiusura durante invii.
- Etichette nelle sei lingue; API/dependenze/variabili di configurazione nuove assenti.

## Verifiche
- Dopo l'allineamento: **142 test SQLite verdi**, 4 casi di migrazione/concorrenza
  esclusi da questa esecuzione SQLite; ratchet senza nuove eccezioni.
- PostgreSQL: suite modelli/inserimento risultati (51 verdi), regressioni sulle
  fonti dei risultati, quattro casi forum e nuovo caso incontri verdi. Dopo
  l’ultimo merge: sei regressioni su sostituzione/archiviazione e fonti verdi.
- **99 test Node verdi**, incluse compatibilità auth/runtime del main aggiornato.
- UI: quattro scenari risorse (forum desktop IT/mobile SV, incontri gruppo IT e
  individuale SV) più suite aggiunta/sostituzione passi, tutti verdi dopo il merge.
- Typecheck, lint mirato, `check-i18n.mjs` verdi: **3535 chiavi, sei lingue**.
- Docker ricostruito sul codice allineato: `counselorbot-s11-backend:builder` e
  `counselorbot-s11-frontend:builder`. Import backend senza rete OK; frontend
  avviato in container isolato, HTTP 200 sul builder e log di avvio corretti.
- Runner Next 3176, PostgreSQL temporaneo 18676 e smoke frontend 3177 **fermi**.
  Nessun deploy o riavvio dei servizi di produzione.
- **Chiusura CI (25 ottobre, dopo il merge di main 0.1.1)**: quattro casi che
  asserivano ancora il blocco sequenziale sono stati riscritti sul contratto dei
  passi autonomi (`test_legacy_strict_*`). La baseline SQLite è stata riallineata:
  due voci rinominate, 28 casi che ora passano rimossi (14 in
  `test_inapp_administration.py`, 14 in `test_plan_questionnaire_chats.py`).
  I quattro casi riscritti sono verdi su PostgreSQL. `make guidance-check`,
  `--check --base origin/main`, `make version-check`, unittest dello script
  guidance, typecheck, ESLint mirato, `check-i18n.mjs` e i **697 test Node** di
  `src/lib` sono verdi; le due suite browser del builder passano sul runner 3176.
  CI del branch: `documentation`, `portability`, `startup (sqlite)` e
  `tests (sqlite)` verdi; `tests (postgres)` verde tranne il flake già noto di
  `test_sse_heartbeat.py::test_sync_disconnect_returns_promptly_and_closes_after_the_pending_next`
  (escluso di proposito dalla baseline, come documenta il commento del file).

Runner riproducibile: `scripts/dev-piano-builder-tests.sh`; comandi, tunnel e
limiti in `docs/operations/live-dev-environment.md`. Contratto del builder in
`docs/operations/independent-plan-steps.md`. Cache e dipendenze di verifica
sono temporanee; nessun file .env o dato di produzione modificato.

## Prossimi passi
Revisione e merge della PR unica dal proprietario; eventuale deploy separato.
Nessuna migrazione dati o nuova variabile richiesta.

## Blocchi
Nessun blocco per la PR. Limite preesistente e già censito nella baseline:
le scritture forum usano `statement_timestamp` e non funzionano nelle suite
SQLite storiche; le operazioni forum sono verificate su PostgreSQL. Non è
stato ampliato questo filone a una correzione della portabilità del forum.

Le chiusure del diario sono registrate. Il CLI segnala il canale mobile
non configurato (`NTFY_TOPIC` assente); nessun agente è stato lanciato.
