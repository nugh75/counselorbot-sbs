# Handoff: prototype test-student picker (#833, map #828)

## Stato
Done. Throwaway branch `prototype/test-student-picker` (never merged, no PR). Dev server may still run on 127.0.0.1:3191.

## Fatto
- Route `frontend/src/app/prototipo-studente-prova-833/page.tsx`, `?variant=A|B|C`, floating bar (arrows, keys, light/dark toggle), mock data only.
- A: same screen as the scored method-choice (select + "new" + method cards + Continue).
- B: notebook cards (own account, test students, dashed "new" card) then Start.
- C: one search/create bar; typing filters, last row creates; skip = own account.
- Each variant renders the state after every choice (badge, [SIMULATION]/[PROFILE] note, JSON).
- Script `scripts/dev-prototype-test-student-picker.sh` (port 3191, `--webpack`: Turbopack rejects the node_modules symlink).

## Verifiche
- tsc: no errors on the prototype. HTTP 200 on variants B, C (A first-compile timeout, then served). Not visually checked in a browser.

## Prossimi passi
- Owner picks a variant on #833 (HITL); then a builder spec.

## Blocchi e rischi
- Tokens `--role-test-*` do not exist on main yet: the prototype inlines the #831 values.
- Run: `bash scripts/dev-prototype-test-student-picker.sh`; stop: `pkill -f "next dev --hostname 127.0.0.1 --port 3191"`.
