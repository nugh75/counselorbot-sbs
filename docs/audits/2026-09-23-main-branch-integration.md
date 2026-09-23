# Verifica dei rami per l'integrazione in main — 23 settembre 2026

## Esito dell'inventario

Dopo `git fetch --all --tags`, esaminati **100 riferimenti** locali/remoti,
con **49 commit di punta distinti**. I **50 rami su GitHub** sono stati
confrontati anche con `git ls-remote --heads origin`: corrispondono ai riferimenti scaricati.

Baseline `main` e `origin/main`: `fa4277c`.
Versione applicativa verificata: `505f6701505454a06aa9add582b74319ef569118`.
Tutti i riferimenti dell'inventario sono antenati di questa versione: nessun
ramo divergente e nessun conflitto da risolvere. Per trasferire tutte le modifiche
in `main` basta un fast-forward, senza squash o riscritture.

I soli rami ancora da includere nella baseline erano, ciascuno sia locale sia remoto:

| Ramo | Punta | Commit oltre main |
| --- | --- | ---: |
| `feature/card-columns` | `4a6cb7b` | 13 |
| `fix/background-autosave` | `fb2b5b7` | 14 |
| `feature/personal-pqbl` | `505f670` | 15 |

Sono rami annidati: **15 commit applicativi complessivi**, non 42.
Comprendono mazzi e colonne, illustrazioni, Flashcard, salvataggi silenziosi,
pQBL nell'Area personale e Riprendi in fondo alla home.

Il ramo `chore/verify-main-integration` aggiunge il presente resoconto e
`36a4678`, che corregge due aspettative dei test del Tavolo: selezione esatta
del pulsante della forma Bivio (distinto dall'illustrazione) e attesa della
risposta di salvataggio prima del reload, senza aspettare un messaggio eliminato.
Nessuna modifica ulteriore al codice applicativo.

## Verifiche

| Controllo | Risultato |
| --- | --- |
| `cd frontend && npm test` | 203 superati |
| Backend `pytest`: `test_flashcards.py`, `test_visual_tools.py` nel container | 23 superati; 57 warning di deprecazione |
| `docker exec counselorbot_backend python -m backend.tests.test_smoke` | 204 superati |
| Browser: `notebook-autosave`, `flashcards-autosave`, `personal-pqbl` | 13 superati |
| Browser: intera suite `tavolo.test.mjs` dopo l'aggiornamento | 33 superati |
| Browser: azioni raccomandazioni, retry e composer | 1 superato |
| Browser: introduzione a diverse larghezze/lingue e ordine returning home | 5 superati |
| `npm run i18n:check` | 2900 chiavi in 6 lingue |
| TypeScript applicativo, escludendo i test `.test.ts` | Superato |
| ESLint sul test Tavolo aggiornato e `git diff --check` | Superati |
| Build Docker backend/frontend e avvio dei due servizi | Superati |

I test browser usano Chromium contro il frontend locale di produzione,
con risposte API sintetiche; non costituiscono una verifica SSO pubblica.
I test backend usano il database dedicato ai test. Il typecheck standalone
che include i test conserva il limite preesistente degli import `.ts`;
il typecheck applicativo e quello della build Next risultano superati.
La prima esecuzione dei test introduzione puntava alla porta di sviluppo 3107,
non attiva: rieseguiti con `ACCOUNT_BASE_URL=http://127.0.0.1:3000`, tutti superati.

Log di sessione in `/tmp/counselorbot-main-{unit,smoke,browser,tavolo,recommendations,home,lint,build,final-build}.log`.

## Copie di lavoro e file non committati

Controllati anche tutti i worktree registrati. Conservati, con confronto SHA-256,
**20 file modificati preesistenti** negli altri worktree e `HANDOFF.md` non tracciato
nella copia principale. Non rappresentano commit rimasti fuori dall'integrazione:

- 14 file `graph.html` generati: differenze del percorso assoluto nel titolo della mappa.
- 6 file nella copia detached `counselorbot-local-before-main-20260914`:
  vecchi interventi su ritorno da cambiamenti/timeline/Tavolo, relative traduzioni
  e test. Il codice corrente incorpora la navigazione successiva
  (`de44144`, `db611ee`): PageHeader, workspace personale e PreviousPageButton.
  Reimportare i file del backup riporterebbe indietro queste implementazioni.
- `HANDOFF.md`: resoconto storico dell'introduzione (`7c670fd`), già in storia
  e in parte superato dalla successiva riorganizzazione approvata della home.

Nessun worktree, ramo, backup o file locale è stato eliminato.
Snapshot di verifica: `/tmp/counselorbot-branch-audit-before.json`,
`/tmp/counselorbot-worktrees-before.json` e `/tmp/counselorbot-handoff-before.sha256`.

## Inventario completo delle punte iniziali

Ogni riferimento qui elencato è contenuto nella versione applicativa verificata.
`heads/` identifica un ramo locale, `origin/` un ramo remoto.

| Commit | Riferimenti | Già nella baseline main |
| --- | --- | --- |
| `36982c4204a5` | `heads/docs/kth-addie-research-script`, `origin/docs/kth-addie-research-script` | Sì |
| `9d6c99ca899e` | `heads/docs/prompt-lab-approval-plan`, `origin/docs/prompt-lab-approval-plan` | Sì |
| `e682379e4e46` | `heads/docs/voice-reader-resource`, `origin/docs/voice-reader-resource` | Sì |
| `0aaad9316679` | `heads/feat/chat-audio-input`, `origin/feat/chat-audio-input` | Sì |
| `983f0d3936df` | `heads/feat/floating-voice-reader`, `origin/feat/floating-voice-reader` | Sì |
| `374159a45cac` | `heads/feat/rag-markdown-corpus`, `origin/feat/rag-markdown-corpus` | Sì |
| `e048713e4755` | `heads/feat/voice-conversation`, `origin/feat/voice-conversation` | Sì |
| `582b35ff217d` | `heads/feature/assignment-learning-workflow`, `origin/feature/assignment-learning-workflow` | Sì |
| `f938404b0b28` | `heads/feature/audio-transcription-quality`, `origin/feature/audio-transcription-quality` | Sì |
| `4a6cb7b8fe54` | `heads/feature/card-columns`, `origin/feature/card-columns` | No |
| `ee9b029ee910` | `heads/feature/chat-format-qsa-essential`, `origin/feature/chat-format-qsa-essential` | Sì |
| `7c670fde9753` | `heads/feature/double-click-selection-advance`, `origin/feature/double-click-selection-advance` | Sì |
| `15e6d91466ca` | `heads/feature/evento-significativo`, `origin/feature/evento-significativo` | Sì |
| `b2bf24a1f313` | `heads/feature/idea-branch-arrange`, `origin/feature/idea-branch-arrange` | Sì |
| `2f2db5096964` | `heads/feature/idea-layout`, `origin/feature/idea-layout` | Sì |
| `ce0bd0f92394` | `heads/feature/interview-paths`, `origin/feature/interview-paths` | Sì |
| `c06d705e9cb3` | `heads/feature/intro-activity-illustrations`, `origin/feature/intro-activity-illustrations` | Sì |
| `fca2ee519f76` | `heads/feature/intro-complete-guidance`, `origin/feature/intro-complete-guidance` | Sì |
| `28820f94a080` | `heads/feature/personal-goals`, `origin/feature/personal-goals` | Sì |
| `505f67015054` | `heads/feature/personal-pqbl`, `origin/feature/personal-pqbl` | No |
| `d8f20dda0280` | `heads/feature/personal-timeline-calendar`, `origin/feature/personal-timeline-calendar` | Sì |
| `04f58c265d3c` | `heads/feature/prompt-lab`, `origin/feature/prompt-lab` | Sì |
| `7afccaf4c0b0` | `heads/feature/synchronized-voice-reader`, `origin/feature/synchronized-voice-reader` | Sì |
| `6521ce192b99` | `heads/feature/tavolo`, `origin/feature/tavolo` | Sì |
| `7679f6bbc94b` | `heads/feature/teacher-catalog-assignments`, `origin/feature/teacher-catalog-assignments` | Sì |
| `4a1b7cf79e33` | `heads/feature/teacher-catalogs`, `origin/feature/teacher-catalogs` | Sì |
| `3e93b0996a81` | `heads/fix/account-onboarding`, `origin/fix/account-onboarding` | Sì |
| `91ba5cd06c05` | `heads/fix/auto-continue-response`, `origin/fix/auto-continue-response` | Sì |
| `fb2b5b782b50` | `heads/fix/background-autosave`, `origin/fix/background-autosave` | No |
| `2c9cc0ffb83a` | `heads/fix/bussola-response-language`, `origin/fix/bussola-response-language` | Sì |
| `96066867655a` | `heads/fix/compact-voice-conversation`, `heads/fix/idea-demoted-branches`, `origin/fix/compact-voice-conversation`, `origin/fix/idea-demoted-branches` | Sì |
| `ce5c03305202` | `heads/fix/compass-notebook-start`, `origin/fix/compass-notebook-start` | Sì |
| `0305ff54905b` | `heads/fix/counselor-voice-matching`, `origin/fix/counselor-voice-matching` | Sì |
| `39023609996c` | `heads/fix/empty-class-assignments`, `origin/fix/empty-class-assignments` | Sì |
| `1f417e1262cb` | `heads/fix/idea-empty-map`, `origin/fix/idea-empty-map` | Sì |
| `a7be7f8b7ea1` | `heads/fix/idea-map-controls`, `origin/fix/idea-map-controls` | Sì |
| `cd7c68b1e2a1` | `heads/fix/idea-map-outline`, `origin/fix/idea-map-outline` | Sì |
| `de74c2ed3627` | `heads/fix/interview-advance-on-request`, `origin/fix/interview-advance-on-request` | Sì |
| `84bd1c5d6f2d` | `heads/fix/notebook-autosave`, `origin/fix/notebook-autosave` | Sì |
| `6671ae910ffe` | `heads/fix/notebook-autosave-history`, `origin/fix/notebook-autosave-history` | Sì |
| `f9f1faf5c7ad` | `heads/fix/platform-guidance-alignment`, `origin/fix/platform-guidance-alignment` | Sì |
| `ec2268f1849d` | `heads/fix/prompt-lab-context-report`, `origin/fix/prompt-lab-context-report` | Sì |
| `3b1407d686fb` | `heads/fix/questionnaire-translations`, `origin/fix/questionnaire-translations` | Sì |
| `860aade94446` | `heads/fix/recommendation-tab-icons`, `origin/fix/recommendation-tab-icons` | Sì |
| `5113dc501952` | `heads/fix/tavolo-usability-feedback`, `heads/worktree/rapid-cloud-184e`, `origin/fix/tavolo-usability-feedback` | Sì |
| `52cc210edddc` | `heads/fix/teacher-group-membership-labels`, `origin/fix/teacher-group-membership-labels` | Sì |
| `cf6c45de25e3` | `heads/fix/voice-reader-workspace-latency`, `origin/fix/voice-reader-workspace-latency` | Sì |
| `fa4277cad7e4` | `heads/main`, `origin/main` | Sì |
| `07000413b453` | `origin/feature/tavolo-prompt-preset` | Sì |

## Controllo conclusivo di integrazione

Dopo il push si verifica nuovamente che ogni riferimento locale/remoto
(escluso il solo alias simbolico `origin/HEAD`) sia antenato di `main`,
che `main` e `origin/main` coincidano con la punta restituita da GitHub e
che il codice `backend/` e `frontend/src/` sia identico a `505f670`.
I file preesistenti negli altri worktree e `HANDOFF.md` vengono ricontrollati
con gli hash iniziali. Il risultato conclusivo viene riportato nel messaggio di consegna.
