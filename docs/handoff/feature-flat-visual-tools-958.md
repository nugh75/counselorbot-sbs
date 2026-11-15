# Handoff feature/flat-visual-tools-958

## Stato
Issue #958 implementata, PR da aprire (base main).

## Fatto
- VisualTools, PersonalTimeline, TimelineCalendar, ExperienceReview, FlashcardsPage piatti: filetti al posto di riquadri/ombre, Input/Select/Textarea, StatusBadge, Dialog per i due modali, ButtonLink.
- Guardia `frontend/tests/flat-visual-tools.test.mjs`; sezione in `docs-counselorbot/funzionalita-counselorbot.md`.

## Verifiche
- `tsc --noEmit`: solo errori preesistenti sui PNG di `public/guide` (assenti nel worktree).
- node --test flat-visual-tools: verde. eslint sui file toccati: vedi PR.
- Nessun controllo visivo (niente dev server, per istruzione).

## Prossimi passi
Merge dell'utente; deploy solo su via libera.

## Blocchi e rischi
`node_modules` è un symlink al checkout principale (ignorato da git).
