# Telegram chatbot collegato a CounselorBot

> **Stato:** implementato (branch `feature/telegram-bot`, 2026-07-02). Restano manuali: creazione bot con BotFather, variabili nel `.env` reale, eccezione ai4auth per `/api/telegram/webhook`, `make telegram-set-webhook`.
> **Data:** 2026-07-02
> **Ambito:** creare un bot Telegram collegato a CounselorBot, capace di guidare lo studente nella scelta dello strumento, inserimento dei punteggi e analisi guidata dei risultati.

---

## 1. Obiettivo

Permettere allo studente di usare Telegram come canale alternativo alla UI web per:

1. collegare il proprio account CounselorBot a Telegram;
2. scegliere uno strumento tra `QSA`, `QSAr`, `ZTPI`, `QPCS`, `QPCC`, `QAP`, `SAVICKAS`;
3. inserire punteggi sintetici gia calcolati, per esempio `C1=7 C2=5 ...`;
4. salvare il risultato in `QuestionnaireResult`;
5. avviare la stessa analisi guidata usata dalla chat web;
6. proseguire con domande, riflessione e conclusione.

Non e' consigliato, nel primo rilascio, somministrare tutti gli item QSA/QSAr dentro Telegram: per QSA sarebbero molti messaggi e l'esperienza sarebbe fragile. Se in futuro serve compilare item-per-item, valutare una Telegram Mini App o rimandare alla UI web.

---

## 2. Fonti Telegram ufficiali

- BotFather e token: <https://core.telegram.org/bots/tutorial>
- Bot API: <https://core.telegram.org/bots/api>
- `setWebhook`, `deleteWebhook`, `getWebhookInfo`: <https://core.telegram.org/bots/api#setwebhook>
- Guida webhook: <https://core.telegram.org/bots/webhooks>
- Comandi, bottoni, tastiere, Mini Apps: <https://core.telegram.org/bots/features>

Punti tecnici da rispettare:

- il bot si crea con `@BotFather` usando `/newbot`;
- il token del bot e' un segreto e va trattato come una password;
- il webhook deve essere HTTPS pubblico;
- Telegram supporta webhook sulle porte `443`, `80`, `88`, `8443`;
- `setWebhook` supporta `secret_token`, inviato poi da Telegram nell'header `X-Telegram-Bot-Api-Secret-Token`;
- finche' un webhook e' attivo, non si possono ricevere update con `getUpdates`.

---

## 3. Creazione del bot su Telegram

Da Telegram:

1. aprire `@BotFather`;
2. inviare:

```text
/newbot
```

3. scegliere un nome leggibile, per esempio:

```text
CounselorBot SBS
```

4. scegliere uno username unico che termini con `bot`, per esempio:

```text
counselorbot_sbs_bot
```

5. salvare il token restituito da BotFather in un password manager o nel sistema segreti del server.

Comandi utili da impostare con BotFather (`/setcommands`):

```text
start - Avvia il bot
link - Collega Telegram al tuo account CounselorBot
strumenti - Scegli uno strumento
nuovo - Avvia una nuova analisi
stato - Mostra il percorso corrente
annulla - Annulla il flusso corrente
aiuto - Mostra le istruzioni
```

---

## 4. Variabili d'ambiente

Aggiungere al file `.env` reale del deploy. Non committare valori reali.

```env
TELEGRAM_BOT_TOKEN=123456789:ABCDEF...
TELEGRAM_WEBHOOK_SECRET=stringa_lunga_random_con_A-Z_a-z_0-9_-_solo
TELEGRAM_PUBLIC_WEBHOOK_URL=https://counselorbot-sbs.ai4educ.org/api/telegram/webhook
TELEGRAM_BOT_ENABLED=true
```

Note:

- `TELEGRAM_WEBHOOK_SECRET` deve rispettare i vincoli Telegram per `secret_token`: 1-256 caratteri, solo `A-Z`, `a-z`, `0-9`, `_`, `-`.
- `TELEGRAM_PUBLIC_WEBHOOK_URL` usa `/api/...` per passare dal frontend Next.js al backend tramite rewrite.
- Nel backend la route reale puo' essere `/telegram/webhook`; pubblicamente diventera' `/api/telegram/webhook`.
- Se `ai4auth` protegge tutto il dominio, va configurata un'eccezione solo per `/api/telegram/webhook`.
- Il vhost nginx del dominio e' generato dalla console ai4educ: ogni rigenerazione riscrive il file e **perde** l'eccezione, Telegram torna a ricevere `302` verso la pagina di login e il bot smette di rispondere. Dopo ogni rigenerazione rilanciare lo script idempotente:

```bash
sudo bash scripts/ensure_telegram_webhook_nginx.sh
```

  Sintomo della regressione: `make telegram-info` mostra `"Wrong response from the webhook: 302 Found"` e un `pending_update_count` che cresce.

Aggiornare anche `.env.example` con placeholder, non con segreti reali:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_PUBLIC_WEBHOOK_URL=
TELEGRAM_BOT_ENABLED=false
```

---

## 5. Architettura consigliata

### 5.1 Nuovi moduli backend

File consigliati:

```text
backend/routes/telegram.py
backend/telegram_bot.py
backend/telegram_state.py
```

Responsabilita':

| File | Responsabilita |
|---|---|
| `routes/telegram.py` | endpoint FastAPI webhook, verifica secret token, parsing update |
| `telegram_bot.py` | chiamate alla Bot API (`sendMessage`, tastiere, callback query) |
| `telegram_state.py` | macchina a stati e persistenza conversazione Telegram |

Il backend ha gia `httpx` in `backend/requirements.txt`, quindi il primo MVP puo' chiamare la Bot API senza aggiungere librerie Telegram esterne.

### 5.2 Route webhook

Route backend:

```text
POST /telegram/webhook
```

URL pubblico:

```text
https://counselorbot-sbs.ai4educ.org/api/telegram/webhook
```

La route deve:

1. rifiutare richieste se `TELEGRAM_BOT_ENABLED != true`;
2. verificare `X-Telegram-Bot-Api-Secret-Token`;
3. leggere update `message` e `callback_query`;
4. rispondere subito `{"ok": true}` a Telegram;
5. fare il lavoro AI in modo non bloccante o comunque con timeout controllato;
6. non loggare token o payload sensibili in chiaro.

### 5.3 Registrazione in `main.py`

Aggiungere import:

```python
from .routes import telegram as telegram_routes
```

Poi registrare il router:

```python
app.include_router(telegram_routes.router)
```

Aggiornare anche `backend/tests/test_smoke.py` se l'inventario delle route e' mantenuto in `EXPECTED_ROUTES`.

---

## 6. Collegamento sicuro studente-Telegram

Non collegare automaticamente un `telegram_user_id` a uno studente senza prova di possesso dell'account CounselorBot.

Flusso raccomandato:

1. lo studente entra nella web app autenticata;
2. la web app mostra un codice temporaneo, per esempio `T7K9Q2`;
3. lo studente scrive al bot:

```text
/link T7K9Q2
```

4. il backend valida il codice e salva il mapping:

```text
telegram_user_id -> username CounselorBot
```

### 6.1 Tabelle consigliate

Nuove tabelle o modelli SQLAlchemy:

```text
TelegramAccountLink
  id
  username
  telegram_user_id
  telegram_chat_id
  telegram_username
  linked_at
  revoked_at

TelegramLinkCode
  id
  username
  code_hash
  expires_at
  used_at
  created_at

TelegramConversationState
  id
  telegram_user_id
  telegram_chat_id
  username
  state
  questionnaire_type
  session_id
  conversation_id
  scores JSON
  pending_item JSON
  language
  counselor_id
  updated_at
```

Il codice di link va salvato hashato, non in chiaro. Scadenza consigliata: 10 minuti.

### 6.2 Revoca collegamento

Prevedere:

```text
/unlink
```

e una voce nella web app per revocare Telegram.

---

## 7. Flusso conversazionale Telegram

### 7.1 Primo avvio

```text
Studente: /start
Bot: Benvenuto. Collega il tuo account CounselorBot con /link CODICE.
```

Se gia collegato:

```text
Bot: Ciao <nome>. Vuoi iniziare una nuova analisi?
[Nuova analisi] [Riprendi]
```

### 7.2 Scelta strumento

Usare inline keyboard:

```text
Scegli lo strumento:
[QSA] [QSAr]
[ZTPI] [QPCS]
[QPCC] [QAP]
[Savickas]
```

Per `QSA`, `QSAr`, `ZTPI`, `QPCS`, `QPCC`, `QAP` il primo MVP usa inserimento punteggi sintetici.

Per `SAVICKAS` non ci sono punteggi numerici: si avvia direttamente il percorso narrativo guidato.

### 7.3 Inserimento punteggi sintetici

Formato accettato:

```text
C1=7 C2=5 C3=3 C4=6 C5=4 C6=8 C7=5 A1=6 A2=7 A3=5 A4=3 A5=6 A6=7 A7=4
```

Regole:

- accettare separatori spazio, virgola, punto e virgola, newline;
- accettare `:` oltre a `=`;
- normalizzare codici fattore case-insensitive;
- validare codici ammessi per lo strumento scelto;
- validare valori interi `1..9`;
- se manca un fattore, chiedere solo quelli mancanti;
- se ci sono codici extra, segnalarli senza salvare.

Esempio risposta:

```text
Ho letto questi punteggi QSA:
C1=7, C2=5, C3=3, ...

Vuoi salvarli e avviare l'analisi?
[Conferma] [Correggi] [Annulla]
```

### 7.4 Salvataggio risultato

Al click su `Conferma`:

1. generare `session_id` UUID;
2. creare o riusare `conversation_id`;
3. salvare `QuestionnaireResult` con `username`, `questionnaire_type`, `scores`;
4. avviare la prima fase guidata.

### 7.5 Analisi guidata

Riutilizzare le logiche esistenti:

- `GuidedStep` dal DB;
- `/qsa/guided-ui-texts` come riferimento funzionale per ordine e testi;
- `ChatRequest` / logica di `routes/chat.py`;
- `build_context_envelope`;
- `session_memory`;
- `QuestionnaireResult`.

Per ogni step:

1. costruire `scores_context` nello stesso formato della UI web;
2. chiamare la logica chat con:

```json
{
  "message": "",
  "mode": "<system_prompt_mode dello step>",
  "phase": "<step.id>",
  "use_phase_prompt": true,
  "scores_context": "<profilo formattato>",
  "session_id": "<uuid>",
  "conversation_id": "<conversation_id>",
  "questionnaire_type": "<strumento>",
  "language": "it",
  "max_tokens": 700,
  "counselor_id": "<opzionale>"
}
```

3. inviare la risposta allo studente via `sendMessage`;
4. mostrare:

```text
[Prossimo step] [Fai una domanda] [Concludi]
```

### 7.6 Domande libere

Quando lo studente scrive una domanda durante uno step:

```json
{
  "message": "<testo studente>",
  "mode": "<mode corrente>",
  "phase": "<step corrente>",
  "use_phase_prompt": false,
  "scores_context": "<profilo formattato>",
  "session_id": "<uuid>",
  "conversation_id": "<conversation_id>",
  "questionnaire_type": "<strumento>",
  "language": "it",
  "max_tokens": 700
}
```

Il bot deve rispondere e restare nello stesso step finche' lo studente preme `Prossimo step`.

---

## 8. `scores_context`: evitare divergenze web/Telegram

La UI web costruisce il testo per il modello in `GuidedChatInterface.tsx` con una funzione `buildScoresFormatter`.

Per Telegram conviene spostare o duplicare in backend una funzione equivalente, per esempio:

```python
def format_scores_context(db, questionnaire_type: str, scores: dict, language: str = "it") -> str:
    ...
```

Output atteso per QSA/QSAr/QPCS/QPCC/QAP:

```text
PROFILO QSA DELLO STUDENTE:
- C1 (Strategie elaborative): 7/9
- C2 (Autoregolazione): 5/9
...
```

Output atteso per ZTPI:

```text
PROFILO TEMPORALE DELLO STUDENTE:
T1 (Passato Negativo): 4/9 T2 (Passato Positivo): 7/9 ...
```

Output atteso per Savickas:

```text
CONTESTO INTERVISTA SAVICKAS: percorso narrativo qualitativo senza punteggi numerici.
```

Questa funzione deve usare i fattori dal DB (`Factor`) quando disponibili, non una lista hardcoded duplicata.

---

## 9. Target Make consigliati

Aggiungere target nel `Makefile`. I target devono caricare `.env` locale e fallire se mancano variabili.

```make
.PHONY: telegram-check-env telegram-get-me telegram-set-webhook telegram-delete-webhook telegram-info telegram-send-test telegram-logs

telegram-check-env:
	@test -n "$$TELEGRAM_BOT_TOKEN" || (echo "TELEGRAM_BOT_TOKEN mancante"; exit 2)
	@test -n "$$TELEGRAM_WEBHOOK_SECRET" || (echo "TELEGRAM_WEBHOOK_SECRET mancante"; exit 2)
	@test -n "$$TELEGRAM_PUBLIC_WEBHOOK_URL" || (echo "TELEGRAM_PUBLIC_WEBHOOK_URL mancante"; exit 2)

telegram-get-me:
	@set -a; . ./.env; set +a; \
	curl -s "https://api.telegram.org/bot$$TELEGRAM_BOT_TOKEN/getMe"

telegram-set-webhook:
	@set -a; . ./.env; set +a; \
	curl -s -X POST "https://api.telegram.org/bot$$TELEGRAM_BOT_TOKEN/setWebhook" \
		-d "url=$$TELEGRAM_PUBLIC_WEBHOOK_URL" \
		-d "secret_token=$$TELEGRAM_WEBHOOK_SECRET" \
		-d 'allowed_updates=["message","callback_query"]' \
		-d "drop_pending_updates=true"

telegram-delete-webhook:
	@set -a; . ./.env; set +a; \
	curl -s -X POST "https://api.telegram.org/bot$$TELEGRAM_BOT_TOKEN/deleteWebhook" \
		-d "drop_pending_updates=true"

telegram-info:
	@set -a; . ./.env; set +a; \
	curl -s "https://api.telegram.org/bot$$TELEGRAM_BOT_TOKEN/getWebhookInfo"

telegram-send-test:
	@if [ -z "$(CHAT_ID)" ]; then echo "Uso: make telegram-send-test CHAT_ID=<id>"; exit 2; fi
	@set -a; . ./.env; set +a; \
	curl -s -X POST "https://api.telegram.org/bot$$TELEGRAM_BOT_TOKEN/sendMessage" \
		-d "chat_id=$(CHAT_ID)" \
		-d "text=Test CounselorBot Telegram OK"

telegram-logs:
	docker compose logs -f backend
```

Nota: il target `telegram-check-env` sopra non vede `.env` se invocato da solo senza caricarlo. In implementazione scegliere una delle due strade:

1. includere `.env` nel Makefile con attenzione ai caratteri speciali;
2. usare in ogni target `set -a; . ./.env; set +a;` e fare il check nello stesso shell.

La seconda opzione e' piu' coerente con i target esistenti e meno invasiva.

---

## 10. Sicurezza e privacy

Requisiti minimi:

1. non salvare mai `TELEGRAM_BOT_TOKEN` in git;
2. usare `TELEGRAM_WEBHOOK_SECRET` e verificare l'header Telegram;
3. accettare solo chat private nel primo MVP;
4. ignorare messaggi da gruppi e canali;
5. non permettere analisi senza account collegato;
6. codici `/link` monouso, hashati, con scadenza breve;
7. permettere `/unlink`;
8. loggare solo metadati minimi;
9. non loggare il payload completo Telegram se contiene testo libero studente;
10. mantenere gli stessi vincoli di ownership della web app.

Implicazione ai4auth:

- `/api/telegram/webhook` deve essere pubblica per Telegram;
- tutte le altre route restano protette;
- la route pubblica e' protetta dal secret token Telegram e dal fatto che l'utente non puo' usare dati studente senza link verificato.

---

## 11. Deploy

Sequenza consigliata:

1. creare bot con BotFather;
2. aggiungere variabili al `.env` reale;
3. implementare backend route, modelli, state machine, Makefile;
4. aggiungere placeholder a `.env.example`;
5. rebuild backend:

```bash
docker compose up -d --build backend
```

6. verificare container:

```bash
docker compose ps
docker compose logs -f backend
```

7. registrare webhook:

```bash
make telegram-set-webhook
```

8. verificare:

```bash
make telegram-info
```

9. aprire Telegram e provare:

```text
/start
/link CODICE
```

---

## 12. Test minimi

### 12.1 Test backend

Aggiungere test in `backend/tests/test_smoke.py`:

- route webhook registrata;
- webhook rifiuta secret mancante o errato;
- webhook accetta secret corretto;
- `/start` su utente non collegato manda istruzioni `/link`;
- `/link CODICE` valido crea mapping;
- codice scaduto o gia usato viene rifiutato;
- scelta strumento aggiorna `TelegramConversationState`;
- parsing punteggi valida valori `1..9`;
- conferma punteggi crea `QuestionnaireResult`;
- primo step guidato chiama AIService mockato;
- messaggi da gruppo vengono ignorati.

### 12.2 Test manuale Telegram

Checklist:

```text
make telegram-get-me
make telegram-set-webhook
make telegram-info
```

Poi in Telegram:

```text
/start
/link <codice>
/strumenti
```

Inserire punteggi esempio:

```text
C1=7 C2=5 C3=3 C4=6 C5=4 C6=8 C7=5 A1=6 A2=7 A3=5 A4=3 A5=6 A6=7 A7=4
```

Verifiche:

- il bot conferma i punteggi;
- salva il risultato;
- risponde con il primo step guidato;
- in admin compaiono log e `QuestionnaireResult`;
- `make telegram-info` non mostra `last_error_message`.

---

## 13. Troubleshooting

### `getWebhookInfo` mostra `last_error_message`

Controllare:

- URL pubblico corretto;
- TLS valido;
- route esclusa da ai4auth;
- container backend attivo;
- rewrite `/api/:path*` funzionante;
- header secret gestito correttamente.

### Telegram non chiama il webhook

Controllare:

```bash
make telegram-info
```

Se `url` e' vuoto, registrare:

```bash
make telegram-set-webhook
```

### Il bot risponde 403

Probabili cause:

- secret token mancante o diverso;
- `TELEGRAM_BOT_ENABLED=false`;
- route ancora protetta da ai4auth;
- richiesta non proveniente da update supportato.

### Il bot non analizza i risultati

Controllare:

- mapping Telegram-account presente;
- `QuestionnaireResult` creato con `username`;
- `scores_context` formattato correttamente;
- `GuidedStep` presente per lo strumento;
- provider AI configurato.

---

## 14. Fasi di implementazione raccomandate

| Fase | Contenuto | Note |
|---|---|---|
| 1 | BotFather, env, Makefile, route webhook minimale `/start` | Nessuna AI |
| 2 | Link account con codice temporaneo | Prima sicurezza, poi UX |
| 3 | State machine Telegram + scelta strumento | Inline keyboard |
| 4 | Parsing punteggi sintetici + salvataggio `QuestionnaireResult` | QSA/QSAr/ZTPI/QPCS/QPCC/QAP |
| 5 | Riutilizzo chat guidata per step e domande libere | AIService mockato nei test |
| 6 | Savickas come flusso narrativo senza punteggi | Dopo stabilizzazione |
| 7 | Hardening privacy, admin revoca, metriche | Prima del rilascio pubblico |

---

## 15. Decisioni aperte

1. **Compilazione item-per-item dentro Telegram?** Raccomandazione: no nel v1; usare punteggi sintetici.
2. **Telegram Mini App?** Raccomandazione: valutarla solo se si vuole replicare la somministrazione completa degli item.
3. **Lingue supportate nel v1?** Raccomandazione: partire da `it`, poi usare `language_code` Telegram e preferenze app.
4. **Counselor selection in Telegram?** Raccomandazione: opzionale nel v1, default al counselor selezionato o a un preset.
5. **Streaming AI su Telegram?** Raccomandazione: no nel v1; inviare risposta completa. Telegram supporta interazioni ricche, ma il flusso semplice e' piu' robusto.

---

## 16. Criterio di completamento MVP

L'MVP e' completo quando:

1. `make telegram-set-webhook` registra il webhook;
2. `make telegram-info` conferma webhook attivo senza errori;
3. uno studente autenticato puo' generare un codice web e collegare Telegram;
4. da Telegram puo' scegliere `QSA`;
5. puo' inserire tutti i punteggi QSA sintetici;
6. il backend salva un `QuestionnaireResult` con lo stesso `username`;
7. il bot avvia il primo `GuidedStep`;
8. una domanda libera durante lo step riceve risposta AI;
9. i test smoke passano;
10. il deploy Docker e' ricostruito e verificato.
