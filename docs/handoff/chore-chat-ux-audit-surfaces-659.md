# Handoff — audit UX delle chat restanti (#659)

## Stato
Documentale completo, in PR. Milestone #39. Branch `chore/chat-ux-audit-surfaces-659`
da `origin/main` 904798af. Nessun codice applicativo toccato.

## Fatto
- `docs/audits/2026-10-29-chat-ux-remaining-surfaces.md`: audit di sandbox admin,
  OpenCode, taccuini di prova, chat dei piani operativi, con differenze (file e
  righe di main) e raccomandazioni ordinate.
- `docs-counselorbot/funzionalita-counselorbot.md`: paragrafo «Audit delle altre
  chat (#659)» dopo il paragrafo Markdown.
- Esito: sandbox, chat dei piani e dei taccuini = chat guidata (standard).
  Divergono `OpenCodeExperience` (guscio, Markdown, composer, attesa, audio,
  impostazioni) e le trascrizioni di sola lettura `PracticeChats` (testo grezzo)
  e `PlanActivityReview` (bolle proprie).

## Verifiche
- Affermazioni verificate leggendo i file di main. Nessun test di browser,
  nessun dev server avviato, nessun processo da fermare.
- `make guidance-refresh` + `make guidance-check`: allineati.

## Prossimi passi
- OpenCode: da eliminare (decisione del proprietario), issue separata.
- Allineamento: `PracticeChats` con `ChatMarkdown` → `PlanActivityReview`.

## Blocchi e rischi
- Rimozione OpenCode ampia (frontend, backend, desktop, docker, test): mappare prima.

## Sovrapposizioni per il merge
- `docs-counselorbot/funzionalita-counselorbot.md`: stessa sezione toccata da
  #656/#658/#661; tenere tutti i paragrafi.
- `docs/operations/platform-guidance-state.json`: non scegliere a mano,
  rigenerare con `make guidance-refresh` dopo il merge.
