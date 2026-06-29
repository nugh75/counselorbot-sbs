# Handoff — Persona counselor in inglese + placeholder nome, e harness `make` per i prompt

Data: 2026-06-29 · Branch: `feature/counselor-persona-english-placeholder`

## Contesto

Regola di progetto: **istruzioni e system prompt in inglese**; l'LLM risponde nella
lingua dell'utente (`[LANGUAGE]` a runtime). Le `persona` dei counselor erano in
italiano ("Sei Sara, ...") con il **nome scritto a mano** dentro il testo, e gli
intro di sezione dichiaravano una **seconda identità** generica ("You are the
CounselorBot counsellor") non coerente col nome della persona.

Due filoni di lavoro in questa sessione:
1. Persona in inglese + nome reso parametrico via placeholder `{{counselor_name}}`.
2. Harness `make` per testare l'envelope (system prompt + messaggio) scegliendo
   questionario e passo, con log completo dell'envelope.

## 1. Persona EN + placeholder `{{counselor_name}}`

- **Sostituzione runtime**: `build_context_envelope` ([backend/chat_logic.py](../backend/chat_logic.py))
  ha il nuovo param `counselor_name`; dopo l'assemblaggio sostituisce `{{counselor_name}}`
  con il nome del counselor (fallback `the counsellor` se nessun counselor). Un solo
  replace copre sia la persona sia gli intro di sezione.
- **Wiring nome**: `_resolve_counselor` in [backend/routes/chat.py](../backend/routes/chat.py)
  ritorna anche `counselor.name`; passato a `build_context_envelope` (2 call-site).
  Stesso passaggio in [backend/prompt_audit.py](../backend/prompt_audit.py).
- **Intro di sezione (gruppo competenze strategiche)**: in
  [backend/prompt_config.py](../backend/prompt_config.py) le 5 costanti intro (QSA,
  QSAr, QPCS, QPCC, QAP) usano `You are {{counselor_name}}.` al posto di
  `You are the CounselorBot counsellor.`. **ZTPI e Savickas restano invariati** (fuori scope).
- **Migrazione idempotente** in [backend/main.py](../backend/main.py)
  (`_migrate_counselor_personas_and_intros`): traduce in inglese le 8 persona (per slug,
  con `{{counselor_name}}`) **solo se** iniziano ancora con "Sei "; aggiorna i 5 Config
  intro **solo se** contengono ancora la vecchia identity. Non distruttiva.
- **Test**: [backend/tests/test_smoke.py](../backend/tests/test_smoke.py) — aggiornato
  `test_resolve_counselor_helper` (tupla a 6) + nuovo
  `test_build_context_envelope_counselor_name_placeholder` (sostituzione + fallback).

Verifica: smoke 89/0; envelope live di Nadia mostra `You are Nadia, ...` (persona) e
`You are Nadia.` (intro), nessun `{{counselor_name}}` residuo né "Sei "; il modello
risponde "Sono Nadia".

## 2. Harness `make` per i prompt

- [Makefile](../Makefile) + [scripts/prompt_test.py](../scripts/prompt_test.py).
- Esegue il path reale `run_prompt_audit_live` dentro il container backend, scelta di
  questionario + passo, e (con full-prompt-logging) salva l'envelope nei `logs`.
- Istruzioni d'uso: vedi [docs/make-prompt-testing.md](make-prompt-testing.md) e la
  sezione "Testing dei prompt (make)" del [README](../README.md).

## Stato / verifiche

- `docker compose build backend && docker compose up -d backend` eseguiti.
- Smoke: **89 passed, 0 failed**.
- DB migrato: 8 persona EN con `{{counselor_name}}`; 5 intro gruppo con placeholder;
  ZTPI/Savickas con la vecchia identity.
- Full-prompt-logging già attivo (`log_full_prompt=true`); envelope in
  `logs.details.envelope.{system_prompt_final,full_message,history}`.

## Punti aperti / prossimi passi

- **Reasoning leak**: la risposta live di qwen3.5:9b può contenere frammenti `<think>`/
  `</think>` nel `bot_response` (apertura `<think>` mancante → `split_thinking` non taglia).
  Problema modello/sanitizzazione, non dell'harness. Da valutare a parte.
- **Gating per-step dell'envelope** (analisi iniziale): a step `intro` l'envelope porta
  ancora `[FACTOR LABELS]`+`[INTERPRETATION TABLE]`+`[CERTIFIED ADVICE]` e un `[KNOWLEDGE]`
  rumoroso (PDF illeggibili, punteggi di altri studenti). Non gated per step. Candidato
  al prossimo intervento (vedi cronologia analisi).
- Genere persona reso neutro ("counsellor"); il nome corretto arriva a runtime.

## Git

Branch `feature/counselor-persona-english-placeholder`, mergeato in `main` a fine sessione.
Commit atomici: `feat` persona EN+placeholder, `chore` harness make, `docs`.
File estranei lasciati intatti: `docs/.../graphify-out/*`, `schede-bibliografiche/*`,
`.agents/.claude/skills/grill-with-docs`.
