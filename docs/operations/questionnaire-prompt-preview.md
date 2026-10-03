# Anteprima dei prompt dei questionari

In Configurazione & Prompt, scegliere uno strumento e aprire Prompt per step
oppure Step guidati → Anteprima della richiesta. Modificare l’istruzione senza
salvare e controllare l’anteprima affiancata; scegliere un counselor, lingua e una
sessione di esempio. Per una risposta scegliere Risposta dello studente e
inserire un messaggio. L’anteprima non effettua chiamate ai modelli.

Verifiche:

```bash
source /workspace/.cloud-counselorbot/runtime.sh
backend/.venv/bin/python -m pytest backend/tests/test_smoke.py -q
cd frontend
npx tsc --noEmit --incremental false
node --test tests/prompt-request-preview.test.mjs
```

Il test browser usa API simulate e Chromium di sistema (`CHROMIUM_PATH` può
selezionare un altro eseguibile). `PROMPT_PREVIEW_BASE_URL` cambia il server Next
predefinito sulla porta 3107. Verifica desktop/mobile, bozze senza salvataggio,
ordine dei messaggi, risposta dello studente e anteprima fallita.

L’endpoint admin dry-run accetta `config_overrides` per soli testi `prompt_*` e
`directive_*` e `step_mode_override` per simulare il selettore di sistema senza
modificare lo step salvato. L’accesso resta amministrativo. Non scrive configurazioni,
log o cronologia. I componenti mostrano la composizione prima della riduzione;
l’envelope riflette la riduzione simulata. L’anteprima non rappresenta la richiesta
finale di rete dopo anonimizzazione o conversioni specifiche del provider.

Per vedere il ramo in Codespaces: preservare le modifiche locali, fare fetch del
ramo della PR, installare solo eventuali nuove dipendenze e riavviare i processi.
Questo intervento non cambia dipendenze né schema del database. Non occorre
ricopiare il database. In produzione il codice è incluso nelle immagini: dopo
il merge serve la procedura di deploy/rebuild prevista dal progetto.
