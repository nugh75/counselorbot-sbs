# Handoff feature/test-student-unscored-837 (#837)

## Stato
Implementato e verificato con test mirati; PR da aprire/aperta su main.

## Fatto
- Docente + strumento senza punteggi (SAVICKAS, EVENTO_*, OBIETTIVO_*, IDEA): `prepareInstrument` passa da `method-select` (non in ripresa).
- `InputMethodSelector`: in modalità senza punteggi selettore «Studente simulato» con «Nuovo studente di prova…» (solo nome, `POST /teacher/practice-notebooks`), schede «Inizia come «nome»» (celestino + RoleBadge test) e «Inizia con i miei dati» (crema), Continua.
- «Con i miei dati» riporta il contesto a `default`; con lo studente di prova i turni portano `practice_notebook_id` e nessun `QuestionnaireResult` sul docente (helper #835).
- i18n 6 lingue; doc funzionalità, ops `teacher-practice-notebooks.md`, CONTEXT.

## Verifiche
- `tests/teacher-practice-notebooks.test.mjs` (pattern «strumento senza punteggi|avvio in prova|nella chat guidata il docente»): 5/5 ok su next dev --webpack 127.0.0.1:3147.
- tsc (solo errori noti .png per next-env.d.ts mancante nel worktree), eslint file toccati, i18n:check, make guidance-check.
- Screenshot 390 px chiaro/scuro: contrasto leggibile.

## Prossimi passi
- Review e merge dell'owner.

## Blocchi e rischi
- Nessun cambio backend: nessuna suite Postgres eseguita.
- Il passo del FlowStepper resta «Inserisci» anche per gli strumenti senza punteggi.
