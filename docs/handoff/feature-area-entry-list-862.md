# Handoff feature/area-entry-list-862

## Stato
Completo, PR da aprire/aperta (vedi gh pr list).

## Fatto
- `components/ui/EntryList.tsx` (EntrySection + EntryLink); usato da PersonalAreaHome e TeacherAreaHome (gruppi + taccuino).
- Nota in funzionalita-counselorbot.md.

## Verifiche
- tsc e eslint puliti (node_modules del checkout principale).
- Test Playwright (teacher-area-home, personal-area-home) NON eseguiti: richiedono dev server.

## Prossimi passi
Revisione e merge da parte dell'utente.

## Blocchi e rischi
Unica differenza: break-words anche sulle voci personali, titolo `flex` anche nelle voci docente (nessun badge, resa identica).
