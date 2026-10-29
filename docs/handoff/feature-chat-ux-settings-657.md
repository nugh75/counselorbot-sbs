# Handoff — impostazioni della risposta nello stesso posto (#657)

## Stato
In consegna — milestone #39, slice impostazioni. Branch
`feature/chat-ux-settings-657` da `origin/main` f21446c9. Task Diario 54a864ac.

## Fatto
- Pattern scelto: popover «Opzioni della conversazione» (già standard della
  guidata). Nuovo `components/ui/ChatResponseSettings.tsx`: righe Formato
  (compatto, discorsivo/per punti), Lunghezza, Analisi (con avviso «obbligatorio»),
  icone ed etichette della guidata; `children` fra lunghezza e analisi (quaderno
  del docente); `locale` per la lingua della sessione guidata.
- Chat guidata: righe sostituite dal componente, comportamento invariato.
- Bussola: formato compatto nel popover (prima `<select>`), gruppi `divide-y`
  impostazioni | audio. Solo formato: l’API Bussola accetta solo `response_format`.
- Assistente: formato e lunghezza tolti dalla riga del composer e portati nel
  popover (nessun backend per reasoning: nessuna riga Analisi).
- Nessun backend, nessuna chiave i18n nuova.

## Verifiche
- Nuovo `tests/chat-settings.test.mjs` (Bussola/Assistente, 390 e 1440): 4/4
  due giri di fila (un giro precedente con timeout a freddo sul primo test).
- `chat-shell` 4/4, `chat-markdown` 2/2, `assistant-audio` 4/4.
- `chat-preferences` 8/11: aggiornati i test 7 e 8 al popover con «Per punti».
  Baseline (falliscono prima del codice toccato): 3 e 4 cercano il formato
  «tabella» tolto da 9c5230fb; 7 non trova «Inizia un nuovo orientamento».
- `teacher-practice-notebooks` 21/25: 1, 2, 4, 5 scadono su `goto networkidle`
  col server dev (prima del composer), non legati alla slice.
- `tsc` 0, ESLint file toccati 0, `i18n:check` solo i 12 di baseline.
- Dev :3173 con `scripts/dev-chat-shell-tests.sh`, fermato a fine sessione.

## Prossimi passi
- #658, #661 e le altre della milestone (fuori slice).

## Sovrapposizioni per il merge
Con PR #670 (#656, composer):
- `frontend/src/app/assistente/page.tsx` (conflitto atteso): #656 mette già
  formato+lunghezza nel popover con righe proprie; tenere la forma di #656 per
  la riga (ChatSuggestions, opzioni | campo | microfono | Invia) e, nel popover,
  sostituire le righe formato/lunghezza con `<ChatResponseSettings format length />`.
  Togliere import orfani (`AlignLeft`, `Rows3`, selettori).
- `frontend/src/app/bussola/page.tsx`, `GuidedChatInterface.tsx`: #656 tocca i
  suggerimenti, qui solo il popover; fusione probabilmente automatica.
- `docs-counselorbot/funzionalita-counselorbot.md`: tenere entrambi i paragrafi.
- `docs/operations/platform-guidance-state.json`: dopo il merge
  `make guidance-refresh` + `make guidance-check`.

## Blocchi e rischi
- Nessuno. `frontend/node_modules` è un link al worktree #653 (non tracciato).
