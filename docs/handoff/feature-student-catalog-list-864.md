# Handoff — feature/student-catalog-list-864 (#864)

## Stato
Implementazione fatta; verifiche statiche in corso. PR da aprire.

## Fatto
- `EntryLink`: prop opzionali `illustration`, `status` (riga piccola con punto), `reload` (anchor nativa).
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
- tsc, eslint: vedi PR.
- Playwright NON eseguito (nessun dev server avviato: volume lento).

## Prossimi passi
- Controllo visivo su dev server alla prima occasione.

## Blocchi e rischi
- Test browser modificati ma non eseguiti.
- La data «Compilato il…» non è ripetuta nella pagina dello strumento (servirebbe una fetch in più).
