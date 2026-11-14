# Handoff fix/qsa-path-load-retry-889 (issue #889)

## Stato
Fix portato a mano su main; in verifica (tsc/eslint), poi commit e PR.

## Fatto
- GuidedChatInterface: stato pathLoadFailed/pathLoadAttempt, errore con Riprova per QSA completo, nessun turno AI dopo il fallimento.
- Chiave i18n pathLoadError in sei lingue (i18n-chat-layout.ts).
- Test frontend/tests/qsa-prompting-regression.test.mjs, doc docs/operations/qsa-prompting-regression.md (ridotto, senza script dev), riga CONTEXT.md, funzionalita.

## Verifiche
- tsc: solo errori TS2307 su immagini (ambiente, next-env mancante), nessuno sui file toccati (da confermare).
- eslint e test browser: in corso.

## Prossimi passi
Commit atomici, push, PR con milestone "Prompt health (Nov 2026)", guidance-check, gh pr checks.

## Blocchi e rischi
node_modules è un symlink (ignorato da git) al checkout principale; volume lento.
