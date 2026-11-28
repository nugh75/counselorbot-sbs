# Handoff: piano di intervento CounselorBot

Data: 2026-11-28 | Baseline: `origin/main` (post-PR `#1050`)

Questo file riassume lo stato corrente. I vecchi handoff per branch, che
prima si accumulavano qui, restano nella storia Git e in `docs/handoff/*.md`.
Il Timoniere tiene il proprio stato vivo in `docs/handoff/timoniere.md`.

## Obiettivo
Completare il piano in `docs/progetto/piano-interventi.md`: chiudere i residui
di Wave 1 e avviare Wave 2 (nuovo strumento «Prepariamoci al futuro»).

## Fatto
- [x] Milestone #22 (`#773` ESLint) e #45 (`#776`–`#779` Salute dei prompt).
- [x] `#911` test browser obsoleti: chiusa in 4 lotti (PR #1045, #1046, #1048,
  #1049, #1050). Durante lo sweep sono stati corretti 7 bug reali (header sorgente
  AI, RoleBadge, dettagli counselor, errore anagrafica classe, Mappa dei prompt
  a 390px, sessioni di ripresa, mappa IDEA da telefono).
- [x] PR #1047: migrazione `student_groups.image_url` eseguita prima delle
  letture ORM all'avvio.
- Deploy: backend e frontend ricostruiti dopo #1047, #1049 e #1050 (health 200).

## In corso
- [ ] F31: link «Assegnazioni di questa classe» nella pagina della classe
  (bug 4186bb6f; scelta del proprietario: link, non elenco inline).
- [ ] `#83` navbar: rigenerare gli screenshot della guida; poi la prova con uno
  screen reader reale, che fa il proprietario.

## Prossimi passi
- Wave 2 (`#1028`–`#1032`): «Prepariamoci al futuro» è un nuovo strumento per
  studente e docente che sostituisce il Consiglio orientativo. Il docente lo usa
  per redigere il documento di orientamento. Non avviarlo prima che arrivino le
  specifiche del proprietario.
- Poi `#587`, `#588`, `#1027`; Wave 3 (`#57`–`#60`, `#208`–`#212`, `#505`).

## Note operative
- GitHub GraphQL a volte risponde 500: per PR e merge usare la REST API
  (`gh api repos/nugh75/counselorbot-sbs/pulls ...`, `PUT .../merge`).
- Test browser: un solo dev server `next dev --webpack` alla volta
  (`BACKEND_ORIGIN=http://127.0.0.1:9`); lotti sequenziali.
- Test Python: `PYTHONPATH=. python3 -m pytest` (Python 3.12), non `backend/.venv`.
