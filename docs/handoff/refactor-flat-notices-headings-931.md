# Handoff: refactor/flat-notices-headings-931

## Stato
Implementazione completa, PR da aprire (issue #931, mappa #920).

## Fatto
- 25 avvisi scritti a mano convertiti in `Callout` (student, teacher, admin).
- B6: tolto `outline-none` dai campi admin elencati dall'audit e dalla ricerca del Profilo.
- B7: titoli ForumView `text-lg font-semibold text-ink`; PracticeNotebooks h2 `text-lg`.
- B5: aiuti e descrizioni di PracticeNotebooks/Chats/Repertoire a `text-sm`.
- Test di guardia `frontend/src/lib/flat-notices-headings.test.ts`; doc funzionalita aggiornato.

## Verifiche
- `tsc --noEmit`: nessun errore nuovo (restano immagini guida mancanti e un import .ts nei test, già su main).
- eslint sui file toccati: 0 errori.
- `node --test src/lib/*.test.ts`: 834 pass, 1 fail già presente (`teacher-try-tools.test.ts`, regex su `OBIETTIVO_DOCENZA`, non toccato).
- Nessun controllo visivo: niente dev server né Docker (richiesta del task).

## Prossimi passi
Merge dall'app; deploy a fine gruppo #920.

## Blocchi e rischi
- `Callout` non accetta `role`: gli avvisi success/warning/info convertiti perdono `role="status"`.
- Restano avvisi scritti a mano dove portano azioni o campi (vedi PR).
