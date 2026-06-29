# CounselorBot — test del prompt/envelope per questionario e passo.
# Esegue il path reale di prompt-audit (run_prompt_audit_live) dentro il container
# backend, sceglie questionario + step, chiama il LLM e salva l'envelope nei logs.

BACKEND ?= counselorbot_backend
PG      ?= counselorbot_postgres
PGUSER  ?= counselorbot_user
PGDB    ?= counselorbot

# Parametri del test (override da riga di comando: make prompt-test Q=QSAr STEP=qsar-cognitive)
Q         ?= QSA
STEP      ?= intro
COUNSELOR ?= 7
STUDENT   ?= admin
RESP_LANG ?= it
KNOWLEDGE ?= true
MSG       ?=

# docker exec con tutte le PT_* + lo script via stdin (niente file baked nell'immagine).
define RUN_PROMPT
	docker exec -i \
		-e PT_Q="$(Q)" -e PT_STEP="$(STEP)" -e PT_COUNSELOR="$(COUNSELOR)" \
		-e PT_STUDENT="$(STUDENT)" -e PT_LANG="$(RESP_LANG)" -e PT_KNOWLEDGE="$(KNOWLEDGE)" \
		-e PT_MSG="$(MSG)" -e PT_MODE="$(1)" \
		$(BACKEND) python - < scripts/prompt_test.py
endef

.DEFAULT_GOAL := help
.PHONY: help prompt-test prompt-dry prompt-steps prompt-log prompt-log-on prompt-log-off

help: ## Mostra questo aiuto
	@echo "CounselorBot — test del prompt (envelope) per questionario e passo"
	@echo ""
	@echo "Target:"
	@echo "  make prompt-test    Chiama il LLM e SALVA il log con envelope (default)"
	@echo "  make prompt-dry     Solo envelope (no LLM, no log) — iterazione rapida"
	@echo "  make prompt-steps   Elenca gli step disponibili per Q"
	@echo "  make prompt-log     Dump dell'envelope salvato (ID=<log id>)"
	@echo "  make prompt-log-on  Attiva il full-prompt-logging (envelope nei logs)"
	@echo "  make prompt-log-off Disattiva il full-prompt-logging"
	@echo ""
	@echo "Variabili (default):"
	@echo "  Q=$(Q)  STEP=$(STEP)  STUDENT=$(STUDENT)  COUNSELOR=$(COUNSELOR)  RESP_LANG=$(RESP_LANG)  KNOWLEDGE=$(KNOWLEDGE)"
	@echo ""
	@echo "Esempi:"
	@echo "  make prompt-test Q=QSA STEP=intro"
	@echo "  make prompt-test Q=QSAr STEP=qsar-cognitive STUDENT=barbaraambu"
	@echo "  make prompt-dry  Q=ZTPI STEP=ztpi-t1 STUDENT=admin"
	@echo "  make prompt-steps Q=QPCS"

prompt-test: ## Test live: chiama il LLM e salva il log (con envelope se logging attivo)
	$(call RUN_PROMPT,live)

prompt-dry: ## Test dry: stampa solo l'envelope, nessun LLM e nessun log
	$(call RUN_PROMPT,dry)

prompt-steps: ## Elenca gli step (id + label) del questionario Q
	@docker exec $(PG) psql -U $(PGUSER) -d $(PGDB) -c \
		"SELECT id, label, sort_order FROM guided_steps WHERE questionnaire_type='$(Q)' ORDER BY sort_order, id;"

prompt-log: ## Dump dell'envelope + bot_response per ID=<log id>
	@if [ -z "$(ID)" ]; then echo "Uso: make prompt-log ID=<log id>"; exit 2; fi
	@echo "===== BOT RESPONSE (log $(ID)) ====="
	@docker exec $(PG) psql -U $(PGUSER) -d $(PGDB) -t -A -c \
		"SELECT details::jsonb->>'bot_response' FROM logs WHERE id=$(ID);"
	@echo "===== SYSTEM_PROMPT_FINAL (log $(ID)) ====="
	@docker exec $(PG) psql -U $(PGUSER) -d $(PGDB) -t -A -c \
		"SELECT details::jsonb->'envelope'->>'system_prompt_final' FROM logs WHERE id=$(ID);"

prompt-log-on: ## Attiva log_full_prompt (envelope salvato nei logs)
	@docker exec $(PG) psql -U $(PGUSER) -d $(PGDB) -c \
		"UPDATE configs SET value='true' WHERE key='log_full_prompt'; \
		 INSERT INTO configs(key,value,description) \
		 SELECT 'log_full_prompt','true','Salva il prompt finale + envelope nei log' \
		 WHERE NOT EXISTS (SELECT 1 FROM configs WHERE key='log_full_prompt');"
	@echo "log_full_prompt = true"

prompt-log-off: ## Disattiva log_full_prompt
	@docker exec $(PG) psql -U $(PGUSER) -d $(PGDB) -c \
		"UPDATE configs SET value='false' WHERE key='log_full_prompt';"
	@echo "log_full_prompt = false"
