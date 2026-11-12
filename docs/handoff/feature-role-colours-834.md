# Handoff feature/role-colours-834

## Stato
Implementazione completa, in attesa di PR/CI.

## Fatto
- Token `--role-teacher-*` (crema), `--role-test-*` (celestino), `--role-student-*` (= brand) in `globals.css`, chiaro + `.dark`, con `-muted` per il testo secondario.
- Primitiva `components/ui/RoleBadge.tsx` (icona + testo).
- Applicata a: card Palestra (teacher), taccuini di prova e elenco classe (test).
- `docs/design.md` §2.8, `docs-counselorbot/funzionalita-counselorbot.md`.

## Verifiche
- `node --test src/lib/role-colours.test.ts`: 2/2 ok (contrasti >= 4.5).
- tsc: solo errori TS2307 preesistenti (immagini guida, ambiente); nessuno nei file toccati.
- eslint sui file toccati.

## Prossimi passi
PR su main, `make guidance-check`, checks CI.

## Blocchi e rischi
Non verificato visivamente in browser. `node_modules` nel worktree e' un symlink (non committato).
