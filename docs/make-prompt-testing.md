# Testing dei prompt con `make`

Target `make` per ispezionare l'**envelope** (system prompt + messaggio utente) che
un counselor riceve, scegliendo **questionario** e **passo**. Eseguono il path reale
di prompt-audit (`run_prompt_audit_live` / `build_prompt_audit`) dentro il container
backend tramite [scripts/prompt_test.py](../scripts/prompt_test.py).

## Prerequisiti

- Container attivi: `docker compose up -d backend postgres`.
- Per avere l'envelope salvato nei `logs`: full-prompt-logging attivo (default).
  `make prompt-log-on` per assicurarsene.

## Target

| Target | Cosa fa |
|---|---|
| `make help` | Elenco target + variabili + esempi (default goal) |
| `make prompt-steps Q=<quest>` | Elenca gli `id` di step validi per il questionario |
| `make prompt-dry` | Costruisce e stampa l'envelope. **Nessun LLM, nessun log.** Iterazione rapida |
| `make prompt-test` | **Live**: chiama il LLM e salva la riga nei `logs` con envelope |
| `make prompt-log ID=<n>` | Dump di `bot_response` + `system_prompt_final` dal log |
| `make prompt-log-on` / `off` | Attiva/disattiva `log_full_prompt` |

## Variabili (override da riga di comando)

| Variabile | Default | Note |
|---|---|---|
| `Q` | `QSA` | Questionario: `QSA QSAr ZTPI QPCS QPCC QAP SAVICKAS` |
| `STEP` | `intro` | Id dello step (`make prompt-steps Q=...` per la lista) |
| `STUDENT` | `admin` | Username: usato per identity (log) e per caricare i punteggi |
| `COUNSELOR` | `7` | Id counselor; `7` = Nadia (ollama locale) |
| `RESP_LANG` | `it` | Lingua di risposta (**non** `LANG`: collide col locale di shell) |
| `KNOWLEDGE` | `true` | Includi il blocco `[KNOWLEDGE]` (RAG) |
| `MSG` | _(vuoto)_ | Messaggio utente; vuoto = messaggio intro generico |

Container/DB override-abili: `BACKEND PG PGUSER PGDB`.

## Esempi

```bash
# Quali step ha un questionario
make prompt-steps Q=QSA

# Envelope al volo (senza LLM/log)
make prompt-dry Q=QSA STEP=intro
make prompt-dry Q=ZTPI STEP=ztpi-t1 STUDENT=admin

# Test live (chiama Nadia/ollama, salva il log)
make prompt-test Q=QSA STEP=intro
make prompt-test Q=QSAr STEP=qsar-cognitive STUDENT=barbaraambu

# Rivedere l'envelope salvato
make prompt-log ID=11430
```

## Note

- **Studenti fittizi e punteggi**: i punteggi vengono dall'ultimo `questionnaire_results`
  per `(STUDENT, Q)`. Copertura attuale: `admin` = QSA/SAVICKAS/ZTPI, `barbaraambu` =
  QSAr/SAVICKAS. Per gli step di sola presentazione (`*-intro`/`welcome`) i punteggi
  non servono; per gli step di analisi un questionario senza punteggi produce un
  `scores_context` vuoto.
- **Identity nel log**: l'harness chiama `run_prompt_audit_live` con `identity=STUDENT`,
  quindi il log risulta sotto quello studente (username + codice anonimo). L'envelope
  dell'audit usa internamente `identity={}`, perciò il profilo discente auto-dichiarato
  non compare; lo studente incide solo via `scores_context`.
- **Step non valido**: il runner esce con errore e stampa gli step validi, senza
  chiamare il LLM.
