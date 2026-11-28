# Handoff — RIASEC Interest Profiler (#588)

## Stato
Implementazione completa sul branch `feature/riasec-588`; PR da aprire. Nessun merge.

## Fatto
- `backend/riasec.py`: 60 item ufficiali inglesi (IPSF v1), traduzioni it/en/es/fr/de/sv,
  crediti O*NET Tools Developer License, scala 0–4, somma per area (0–40), codice a 3
  lettere con pari meriti nell’ordine R‑I‑A‑S‑E‑C. Tedesco dalla Short Form tedesca
  (CC BY 4.0, Roemer/Lewis/Rounds 2023); it/es/fr/sv «traduzione CounselorBot da validare».
- Catalogo DB-driven + seed idempotente (`INSTRUMENT_CATALOG_DEFAULTS["RIASEC"]`,
  `_seed_instruments_catalog` ora semina anche `name_i18n`, `label_i18n`, `text_i18n`,
  `response_labels`, `description_i18n`).
- Scoring deterministico in `scoring_service.compute_profile`: blocco `riasec`
  (dimensioni + top 3) e `holland_code` solo con `include_holland_code=True`.
  `mapped_result_scores` salva i totali grezzi 0–40; `valid_scores` li accetta.
- Runner esistente: `/?start=RIASEC` reindirizza a `/somministrazione/RIASEC`;
  risultato studente = esagono + «piste da esplorare» senza codice.
- Vista docente: `teacher_results.result_detail` espone `riasec.holland_code` e le
  dimensioni; `StudentResultItem` mostra il codice. Crediti su `/strumenti/RIASEC`,
  nella guida (`docs-counselorbot/funzionalita-counselorbot.md`) e nel modulo.
- Test: `backend/tests/test_riasec.py` (seed idempotente, 60 item, 6 lingue, somma,
  pari meriti, stabilità, codice non esposto allo studente, salvataggio grezzo).

## Verifiche
- `pytest test_riasec.py`: 7 passed. Suite correlate (dynamic instruments, teacher
  result detail, institute credentials, privacy P9, content versions): 107 passed.
- Frontend: `npm ci`, eslint sui file toccati (0 errori; 1 warning preesistente),
  `next typegen` + `tsc --noEmit` ok, `npm test` 921/921, `npm run i18n:check` ok.
- `python3 scripts/check-platform-guidance.py --base origin/main` da eseguire al commit.
- Postgres di test: container effimero `s8-588-pg` (porta 55488), non produzione.

## Prossimi passi
- Aprire la PR (non bozza), aggiungerla al project board, chiedere revisione DeepSeek.
- Decidere con il proprietario: chat guidata RIASEC (qui volutamente assente) e
  integrazione nello step «Mi riconosco?» di «Prepariamoci al futuro» (#1030).
- Validare psicometricamente le traduzioni it/es/fr/sv; verificare la resa del
  tedesco nella UI.
- Valutare un ramo RIASEC nella vista amministrativa `QuestionnaireResultsViewer`
  (oggi i totali 0–40 non sono normalizzati come i 1–9 degli altri strumenti).

## Blocchi e rischi
- Nessun blocco. Rischio: il codice Holland salvato deriva dai totali grezzi; un
  futuro cambio della scala di risposta richiede una migrazione dei risultati.
- Licenza: mantenere i crediti O*NET e non parafrasare gli item inglesi.
