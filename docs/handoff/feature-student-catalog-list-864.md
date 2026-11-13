# Handoff — feature/student-catalog-list-864 (#864)

## Stato
Implementazione fatta, merge di origin/main (#877, #878) fatto, verifiche statiche verdi. PR aperta.

## Fatto
- `EntryLink`: `illustration` unica con l'Area docente (#865, dimensionata dal chiamante), più `status` (riga piccola con punto) e `reload` (anchor nativa).
- `InstrumentCatalog`: niente pillole né schede; Consigli e due sezioni
  (`base.category.assessment` / `guided`) come elenco piatto con `ToolIllustration`;
  stato «Compilato il…» / «In pausa dal…». Ancore `#tools-<categoria>` mantenute.
- «Da riprendere» (`PersonalAreaHome`) come `EntrySection` con `ResumeEntry` per l'eliminazione.
- `/strumenti/[id]`: intestazione piatta con illustrazione, avvio (`instrumentStartHref(id, true)`,
  etichetta «Analizza i risultati»/«Avvia il percorso») e «Compila sul sito».
- Test browser aggiornati (account-onboarding, design-usability, student-class-catalog);
  test unitario `catalog-paused-chat.test.ts` esteso.
- Doc: funzionalita-counselorbot.md, CONTEXT.md.

## Verifiche
- node --test catalog-paused-chat / event-instrument-parity / legacy-routes: 8/8 ok.
- tsc pulito (esclusi i moduli .png senza next-env.d.ts nel worktree); eslint: 0 errori, 1 warning preesistente.
- make guidance-check: ok.
- Playwright NON eseguito (nessun dev server avviato: volume lento).

## Prossimi passi
- Controllo visivo su dev server alla prima occasione.

## Blocchi e rischi
- Test browser modificati ma non eseguiti.
- La data «Compilato il…» non è ripetuta nella pagina dello strumento (servirebbe una fetch in più).
