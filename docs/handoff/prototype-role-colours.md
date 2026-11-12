# Handoff: prototype role colours (#831, map #828)

## Stato
Throwaway branch `prototype/role-colours` (never merged, no PR). Dev server on 127.0.0.1:3190 (first compile is slow: network disk).

## Fatto
- Route `frontend/src/app/prototipo-colori-831/` with 3 variants (`?variant=A|B|C`): A page background, B header band, C cards/badges. Floating bar (arrows, keyboard, light/dark toggle).
- Script `scripts/dev-role-colours.sh` (port 3190, mock data, no backend).
- Tokens + WCAG ratios computed (see comment on #831).

## Verifiche
- Contrast ratios computed with a WCAG script (light + dark).
- tsc/eslint: slow on this volume, see session report.

## Prossimi passi
Owner (HITL) picks the variant on #831. Do not close #831 from here.

## Blocchi e rischi
- `frontend/node_modules` is a symlink to the main checkout's (untracked).
- Muted text (slate-500) is 3.4:1 on every tint: use slate-600+ for informational text on tints.
