# Handoff: Audit Area personale — Lotti 1A, 1B, 2, 3A, 4, 5A completati; Risultati/Chat collassabili e Analisi Combinata autonoma
Data: 2026-09-26 | Stato: Lotti 1A, 1B, 2, 3A, 4 e 5A completati e mergiati su main (PR #11, PR #12, PR #13, PR #14)

## Objective
Area personale: miglioramento UX, percorsi, accessibilità, gestione errori, unificazione testate e interazioni.
Completati tutti i lotti previsti dal piano di modifica UX (1A, 1B, 2, 3A, 4, 5A), ad eccezione del lotto 5B (estensioni da concordare).
Riordino dei gruppi all'ingresso con «Conoscermi e riflettere» prima de «Il mio percorso», scorporo di «Analisi combinata dei profili» come strumento autonomo in «Conoscermi e riflettere» e collasso del blocco risultato compilazione congiunto alla chat in «Risultati e conversazioni».

## Follow-up della sessione 2026-09-26 — TUTTI CHIUSI
- [x] **Registro decisioni R1–R25 salvato**: `docs/handoff/2026-09-25-libretto-nella-triade-sdd-ledger.md`
      (nel repo); tutti gli artefatti SDD (brief, report, review, diff) in
      `~/counselorbot-backups/libretto-sdd-artifacts/` (fuori dal repo, 2.2 MB).
- [x] **`capture-guide.mjs` corretto e catture rigenerate in 6 lingue**. La causa reale non era la
      tappa futura (il mock era già al passato) ma il selettore obsoleto `#timeline-guide-event`
      (oggi `#timeline-milestone-<id>`) e il mock obiettivo senza i campi nuovi del modello
      (`parent_ids`, `method`, `origin`, `reviews`, `checks` → crash «goal.parent_ids is not iterable»).
      Mock evento messo in `tense: 'past'` per coerenza. 126 PNG aggiornati; `guide-images.ts` invariato.
- [x] **`test:timeline` 5/5** (prima 2/5). Causa: i titoli di prova con timestamp numerico
      («Sessione di studio 073050 1440» → run di 10 cifre) vengono **redatti come telefono** dalla
      redazione PII; dopo il salvataggio il titolo cambia e i selettori non trovano più la card.
      Fix: stamp base36 (stesso pattern di `personal-goals.test.mjs`, fix B6) + `waitFor` esplicito.
      Flaky per natura: falliva solo quando il timestamp passava il check di Luhn.
- [x] **`test:visual` 32 pass / 0 falliti / 2 skip opt-in** (baseline vecchia: 12/34).
      I test dialog-era di `/profilo/timeline` sono stati riscritti per la pagina unificata
      (commit `1541061`): Portfolio snapshot, 4 forme di data + diario, midnight timezone,
      legacy text, date istituzionali. Conteggio figure guida 18→19. Test «repeat step» aggiornato
      all'ordine di barra introdotto da `7eabda1` (Congela, [Precedente], Ripeti, [Avanza]).
- [x] **Pulizia**: worktree `/tmp/cb-mainbase` e `/tmp/cb-libretto` rimossi (dopo copia artefatti e
      rimozione del symlink `node_modules`), stash `c3-wip-baseline-check` (`5e51d30`) eliminato,
      processo `next dev` orfano del worktree terminato.
- [x] **Baseline `test:visual` della sessione precedente NON attendibile**: era girata su
      `/tmp/cb-mainbase` (main vecchio) con i test nuovi → fallimenti da disallineamento test/codice.

## Remaining (non bloccanti)
- **Lotto 5B (estensioni da decidere)**: consegna lavoro già svolto, anteprima invito, eventuale recupero bozze Tavolo.
- **Deploy produzione da eseguire**: ricostruire l'immagine Docker del frontend per riflettere in produzione i merge di PR #12, #13 e #14:
  `docker compose up -d --build frontend`
- **Promemoria Sudo (obbligatorio)**: per il rebuild del container frontend non occorre alcun comando sudo. Se in futuro occorreranno modifiche di rete o vhost Nginx, ricordare il comando manuale `sudo ./update_nginx.sh`.
- Errore lint preesistente `NewDeckDialog.tsx:36` (setState sincrono in effect) e 14 warning —
  già presenti prima di questo lavoro.
- Backend: 4 test diagrammi/icone, 2 OCR locali, smoke `test_an_older_stage_of_the_map_can_be_drawn_again`
  falliscono anche su main (ambiente locale, fuori piano).
- Prima di eliminare la tabella `student_booklets`: escludere workspace personali e marcatori per
  utente dalla pulizia log a 90 giorni (`_log_retention_loop`) — rischio preesistente.

## Completati il 2026-09-26 (audit Area personale)
- **Lotto 2 dell'audit Area personale applicato (2026-09-26)**: testata comune 0.3 su tutte le
  pagine dell'area (`/profilo/*` mega-pagina, azioni/carte/confronto, flashcard, pQBL). Piano
  aggiornato.
- **Lotto 3A residuo applicato (2026-09-26)**: creazione obiettivo con «Più dettagli ▾» (criteri,
  priorità, stato, condivisione ripiegati; titolo/motivazione/data in vista) e ponte
  «→ Collega a un obiettivo» dal Portfolio (inline, un obiettivo per volta, solo obiettivi attivi,
  endpoint `/user/goals/{id}/links` esistente, 409 → pannello riapribile con dati freschi).
  F12/F13/F16 così assorbiti; il lotto 3A si considera chiuso.
- **Lotto 1B applicato (2026-09-26)**: F03 — stati di caricamento/errore/vuoto distinti con
  Riprova su Taccuino, Compilazioni, Portfolio, Classi e Telegram (un 503 non mostra più
  «nessun dato» né fa sparire la card; crash preesistente di `CrossSynthesisCard` su risposta
  inattesa corretto); F04 — uscita dal gruppo con conferma inline che nomina il gruppo,
  conseguenze, busy ed errore locale; F25 — uploader pQBL allineato al backend (solo PDF,
  100 MB). Test: `tests/personal-error-states.test.mjs` 7/7.
- **Lotto 4 completato (2026-09-26) — Linea del tempo, Carte, Flashcard, Confronto, Azioni e Tavolo**:
  - Decisione `planned` = reintroduzione del campo «Cosa programmo» nell'editor della pagina unificata, visibile solo su tappe future o senza data (il contratto del campo è invariato; snapshot e PDF lo includono già). `TimelineTools.tsx` eliminato come dead code.
  - F21: scheda azione leggibile di default con modifica esplicita (`Modifica → campi → Chiudi`); stato di salvataggio nel footer; tavolo di sessione preservato.
  - F23: rinomina in linea (`ui/InlineRename.tsx`) al posto dei `window.prompt` nativi, nei mazzi/colonne di Carte e nei mazzi di Flashcard.
  - F24: Confronto progressivo (passo 1 Alternative sempre visibile, Criteri/Confronto/Scelta solo con almeno un'alternativa, etichette di passo 1–4 in sei lingue).
  - F26: Tavolo con lista salvati in cima e creazione/modello dopo; didascalia sul ruolo del modello AI; rinomina in linea.
- **Lotto 1A applicato (2026-09-26)**: F02/F06 — X del Portfolio con conferma di scarto; testi delle sotto-form di creazione (azione, carta, criterio, alternativa) agganciati alle guardie di uscita.
- **Lotto 5A completato (2026-09-26, PR #13) — Assegnazioni, Classi e Telegram (audit Area personale)**:
  - F27: lista assegnazioni gestibile con un solo dettaglio aperto alla volta per lo studente e vista docente sempre espansa; filtri client-side per gruppo, tipo, finalità (richiesta/proposta) e stato (da esplorare, pianificata, inviata, con riscontro); link diretto con hash `#assignment-N`.
  - F28: pianificazione spiegata (`planHelp`: crea attività e tappa personali, non invia nulla al docente).
  - F29: anteprima con destinatario esplicito (`Destinatario: {author_name}`) e nota di copia statica (`copyStays`).
  - F30: collegamenti contestuali Classi↔Assegnazioni (`/profilo/assegnazioni?group=...`) e messaggi docente consultabili nella pagina Classi (`MyGroupsCard` + `TeacherNotesCard`).
  - F31: Orientamento verificato dal pilota 0.3 (nessuna modifica necessaria).
  - F32: Telegram a 3 passi guidati con scadenza codice visibile (`expires_in_minutes`), verifica automatica al ritorno (`visibilitychange`), pulsante "Verifica il collegamento", stati distinti e rigenerazione codice.
  - F34 parziale: date localizzate con `toLocaleDateString(lang)` in assegnazioni, iscrizioni a gruppi e note docente.
  - Test browser: `frontend/tests/personal-5a.test.mjs` (4/4 pass), `frontend/tests/personal-error-states.test.mjs` (7/7 pass), `frontend/tests/assignments.test.mjs` compatibile, unit 233/233 pass, `tsc` ed `eslint` puliti.
- **Ordinamento gruppi Area personale (2026-09-26, PR #13)**: «Conoscermi e riflettere» precede ora «Il mio percorso» nella pagina d'ingresso di `/profilo` (`personalAreaGroups`).
- **Analisi combinata dei profili scorporata come strumento autonomo (2026-09-26, PR #12)**:
  - Creata rotta dedicata `/profilo/analisi-combinata` all'interno di «Conoscermi e riflettere», rimuovendo la lettura integrata dal fondo di `/profilo/compilazioni`.
  - Dotata di testata coerente, navigazione diretta e card informativa con immagini guida aggiornate in 6 lingue. Test browser dedicato: `frontend/tests/combined-analysis-page.test.mjs`.
- **Collasso unificato risultato della compilazione e chat (2026-09-26, PR #12 e PR #14)**:
  - In `/profilo/compilazioni`, il disclosure `#submission-result-content` racchiude l'intero pannello dei risultati tecnici (sintesi, grafici stanine, schede fattori) e l'intera conversazione con il counselor.
  - Risolto il difetto per cui la chat restava visibile dopo aver collassato i risultati.
  - Quando il risultato è collassato, la scheda «La mia lettura» è immediatamente visibile e accessibile sotto il comando di espansione. Test: `frontend/tests/submission-result-disclosure.test.mjs`.
- **Rimozione duplicazione lettore audio nella navbar**: rimosso il trigger inline ridondante dalla barra orizzontale in `Header.tsx` (il lettore vive unicamente all'interno del menu a tre punti, accessibile per tutti gli utenti e schermi). Aggiornati `VoiceReaderMenuEntry` e `VoiceReaderProvider` per gestire il focus accessibility (WCAG 2.1) al trigger del menu alla chiusura; test `frontend/tests/voice-reader.test.mjs` (16/16) e unit test (233/233) passanti.
- **Guida funzionalità riallineata**: `docs-counselorbot/funzionalita-counselorbot.md` aggiornata per tutti i lotti completati, nuovo ordinamento gruppi, scorporo di Analisi combinata, collasso unificato risultati+chat e posizionamento del lettore audio nel menu; `make guidance-refresh` e `make guidance-check` eseguiti.

## Resolutions
- Test backend sempre da worktree/checkout con `DATABASE_URL` sul DB test `localhost:5435` (vedi CLAUDE.md/CONTEXT.md).
- Test browser: fixture `python3 -m backend.tests.goals_browser_server` — avviarla con
  `GOALS_TEST_HOST=127.0.0.1 GOALS_TEST_PORT=18096` (la 8096 di default collide con altri progetti)
  e **riavviarla a ogni run** (lo schema persiste tra i run).
- Rollback dei testi DB: `python -m backend.prompt_updates rollback <plan>` nel container (piano non più su disco:
  ricostruibile dai `prompt_revisions`); backup completo: `~/counselorbot-backups/pre-libretto-triade-20260926-0850.dump`.

## Decision Log
Vedi `docs/handoff/2026-09-25-libretto-nella-triade-sdd-ledger.md` per il registro completo R1–R25.
Punti chiave: solo modelli Anthropic (R9, R12); rotte libretto → 410 con helper unico; tabella
`student_booklets` conservata read-only; migrazione idempotente con marcatori durevoli; DE/SV
«La mia lettura» = «Meine Deutung» / «Min tolkning»; etichetta `('booklet','Libretto')` mantenuta
nella traccia migrate (R23); PDF con marcatori metodo in parole per il font latin-1 (R19).
