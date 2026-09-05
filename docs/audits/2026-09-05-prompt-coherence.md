# Audit dei prompt e piano applicato — 5 settembre 2026

L'audit riguarda l'intero prompt proposto al modello: persona, istruzioni globali, fase, teoria, punteggi, fonti e skill, memoria, contratti privati e adattamento al provider. La sola lettura dei testi in `backend/prompts/` non descrive il comportamento dell'installazione: sono presenti 62 step e personalizzazioni nel database; i default del codice definiscono 53 step.

La correzione è stata autorizzata con priorità ai modelli locali e possibilità di ripiego locale o cloud, anche a pagamento entro il budget dell'app. Il lavoro è isolato nel branch `fix/prompt-coherence`; le modifiche al diagramma dell'altro agente sono conservate. Lo schema della mappa e il renderer non vengono modificati da questo intervento; viene corretta una frase operativa del suo contesto.

## Problemi riscontrati e interventi

| Priorità | Problema e conseguenza | Intervento verificabile |
|---|---|---|
| P0 | I meta-prompt QSAr riusavano costrutti del QSA completo, suggerendo fattori non misurati | Nove meta-prompt QSAr specifici; riferimenti ai codici dell'effettivo strumento |
| P0 | Persona, step e direttive chiedevano lingue, quantità di domande o consigli incompatibili | Persona limitata allo stile; lingua della conversazione; una domanda per turno; consigli nuovi subordinati a permesso e candidati certificati |
| P0 | Prompt delle sintesi prescrivevano azioni multiple e scadenze 7/30/90 mai concordate | Separazione fra proposte, rifiuti e impegni; scadenze solo se presenti nelle evidenze |
| P0 | Chat normale, streaming e audit preparavano input diversi | Un solo `prepare_chat_turn`; replay delle fonti; dry-run senza generazione o scritture |
| P0 | Modello locale e ripiego cloud non condividevano sempre le stesse protezioni | Adattamento e anonimizzazione per ogni tentativo, anche dopo un fallimento locale; nessun cambio dopo l'inizio dello stream |
| P1 | La memoria degli ultimi turni poteva diventare l'intero fondamento della sintesi | Ricostruzione cronologica dai log; riduzione di tutte le parti, con errore esplicito se una parte non viene elaborata |
| P1 | La brevità visibile poteva togliere spazio alla patch IDEA; il contesto chiedeva anche una domanda dopo il blocco | Budget separato per il JSON, ordine visibile → raccomandazioni → patch; schema minimo presente anche senza skill |
| P1 | Una finestra ampia dichiarata non prova che un modello gestisca bene quel compito | Profili per provider/modello: finestra effettiva, limite operativo di input e teoria facoltativa; errore o ripiego se l'essenziale non entra |
| P1 | Descrizioni dell'app omettevano strumenti o promettevano azioni in ogni step | Catalogo condiviso con Bussola, inclusa disponibilità IDEA e distinzione delle traduzioni interne non validate |
| P1 | Gemini riceveva contesto appiattito; OpenCode esportava regole parziali | Ruoli nativi e istruzione di sistema Gemini; regole comuni e meta-prompt nell'esportazione OpenCode |
| P2 | Risultati dell'audit e provider dichiarato potevano nascondere il ripiego | Tentativi, modello effettivo, adattamenti del contesto e copertura del percorso nei risultati e nei log |

## Piano di lavoro e criteri di chiusura

1. Inventariare i prompt effettivi e conservarne lo stato iniziale: snapshot di 217 valori, esclusi segreti e conversazioni degli studenti.
2. Correggere i conflitti noti nei default e preparare modifiche puntuali ai testi personalizzati, con prima/dopo e hash atteso.
3. Unificare la preparazione, rendere espliciti i permessi del turno e conservare l'intero percorso per le sintesi.
4. Adattare il contesto al modello effettivo e provare i ripieghi prima dell'emissione di contenuto; applicare il controllo di budget e la protezione PII a ogni destinazione.
5. Verificare tutte le combinazioni step/lingua/lunghezza, i casi di errore, la reversibilità e risposte reali con soli dati sintetici.
6. Pubblicare codice e configurazione, aggiornare i testi del database solo se i valori corrispondono ancora a quelli revisionati, verificare servizio e log.

I prompt danno istruzioni; i vincoli strutturali sono anche applicati dal codice dove possibile. Un test statico senza contraddizioni non prova che ogni modello segua sempre tutte le regole.

## Modelli, contesto e ripieghi

In **Admin → Configurazione** sono disponibili i campi seguenti. Le impostazioni non cambiano il preset scelto per il counselor.

| Chiave | Significato |
|---|---|
| `ai_fallback_targets` | Lista ordinata di massimo tre coppie `provider`/`model`; il modello selezionato viene tentato per primo, salvo blocco dei servizi a pagamento |
| `model_context_profiles` | Oggetto indicizzato per `provider/model`, con `context_tokens`, `input_tokens` e `compact` |
| `ai_timeout_seconds` | Timeout di lettura per tentativo, 10–600 secondi; default 120; non è una scadenza totale dello stream |
| `monthly_budget_usd` | Soglia mensile sulla spesa registrata; resta quella dell'applicazione |
| `omniroute_url` | Endpoint OpenAI compatibile; `OMNIROUTE_API_URL` nell'ambiente prevale |

Esempio di ripieghi:

```json
[
  {"provider":"ollama","model":"muse-glimmer:30b"},
  {"provider":"openrouter","model":"openrouter/free"}
]
```

OmniRoute è selezionabile anche come provider principale nei preset. Per aggiungerlo come ripiego si può usare una terza voce `{"provider":"omniroute","model":"auto/best-chat"}` dopo aver verificato gli upstream del gateway. Il catalogo raggiungibile non prova che una generazione possa completarsi.

Esempio di profilo operativo:

```json
{
  "ollama/qwen3.8:latest": {
    "context_tokens":16384,
    "input_tokens":10000,
    "compact":true
  }
}
```

La finestra effettiva Ollama verificata per l'app è 16.384 token. Il massimo del modello riportato da `/api/show` è un'informazione diversa: non va copiato come finestra operativa senza verificare il server. `compact` elimina la teoria facoltativa; il budget può eliminare vecchi scambi completi. Istruzioni operative, messaggio corrente, punteggi, fonti certificate, mappa e note della sintesi non vengono troncati. Se non entrano, il tentativo fallisce prima della chiamata e può passare a un modello con capacità adeguata. La conta è una stima conservativa, non il tokenizer del modello.

Le chiavi API restano gestite da **ai4educ Console → Segreti**, mai dal database dei prompt. Per l'installazione privata di OmniRoute una chiave può non essere richiesta; se configurata, proviene da `OMNIROUTE_API_KEY`. L'invio a OmniRoute è trattato come esterno anche quando il gateway risiede sulla stessa macchina.

### Budget: limite pratico

I servizi a pagamento vengono esclusi quando la spesa registrata raggiunge il tetto, o quando il controllo della spesa fallisce. Locali e OpenRouter esplicitamente gratuiti restano disponibili. `openrouter/auto` e `openrouter/auto:free` non vengono considerati gratuiti.

Il controllo esistente è contabile, non una prenotazione atomica del costo: prezzi sconosciuti, costi non restituiti, chiamate ausiliarie e richieste concorrenti possono non essere interamente coperti. Un limite economico invalicabile richiede anche quote lato provider/gateway e contabilizzazione completa con prenotazioni. Per questa attivazione i ripieghi automatici sono locali o esplicitamente gratuiti; l'integrazione consente anche destinazioni a pagamento configurate dall'amministratore.

## Verifiche

- Batteria dei default: 53 step × 6 lingue × 3 lunghezze = **954 confronti** tra preparazione runtime e audit.
- Batteria sulla copia dei testi effettivi aggiornati: 62 step × 6 lingue × 3 lunghezze = **1.116 combinazioni**. I punteggi intenzionalmente assenti in alcuni ingressi producono l'avviso previsto; non sono errori di coerenza.
- Regressioni su privacy nel passaggio locale/cloud, budget raggiunto, risposta interrotta, finestra insufficiente, ruoli Gemini, replay senza scritture, recupero dello storico nel ripiego, sintesi legacy e aggiornamenti concorrenti dei prompt.
- Controlli frontend: parità delle sei lingue, TypeScript e lint dei file modificati; build eseguita sulla versione integrata con i diagrammi.
- Prove reali sintetiche: Qwen e Muse su A5 inverso, IDEA breve e sintesi Savickas con proposta rifiutata e impegno successivo. OpenRouter gratuito ha completato una prova QSA, riportando costo zero e il modello effettivo. Le risposte richiedono comunque giudizio semantico: il primo giro ha rilevato il contratto IDEA incompleto e interpretazioni troppo assertive, che hanno motivato ulteriori correzioni.

OmniRoute risponde al catalogo, ma le prove di generazione con `auto/best-chat` e `auto/best-free` hanno prodotto errori/timeout. Non è dichiarato operativo come ripiego automatico.

La ripetizione IDEA dopo la correzione ha prodotto patch con almeno due nodi e un collegamento su entrambi i modelli locali; la prosa visibile era rispettivamente di 44 e 43 parole. Sulla versione integrata passano 104 test frontend e 20 verifiche backend degli spazi visuali/PDF. La suite di 99 verifiche su preparazione, aggiornamenti, mappa, segreti e revisioni passa; la suite smoke conta 187 test superati. Restano due avvisi lint preesistenti sulle dipendenze degli hook e avvisi di deprecazione degli strumenti, senza errori nei controlli eseguiti.

## Stato applicato e rilascio

Sono stati aggiornati **71 testi salvati**, dopo aver verificato l'assenza di modifiche concorrenti. Il confronto dopo il riavvio conferma 71 corrispondenze su 71 con il piano revisionato. La scelta globale resta `ollama/qwen3.8:latest`; i ripieghi sono `ollama/muse-glimmer:30b` e `openrouter/openrouter/free`. Entrambi i profili locali usano finestra 16.384, input operativo 10.000 e `compact=true`; il timeout è 120 secondi e il budget registrato resta 10 USD/mese.

Le immagini `counselorbot-10-step-backend:prompt-coherence` e `counselorbot-10-step-frontend:prompt-coherence` sono state costruite dal worktree `/home/nugh75/counselorbot-sbs-prompts`. Il codice include i commit dell'altro agente fino a `cb363cf`, compresi gli spazi visuali. Le cartelle runtime e i volumi restano quelli del checkout `/home/nugh75/counselorbot-sbs`; non ricreare il servizio usando cartelle dati vuote del worktree.

Backend `/openapi.json`, frontend e dry-run autenticato rispondono HTTP 200. Quattro worker avviati, nessun errore nei log di avvio. I contenuti campionati di memoria, documentazione e upload corrispondono a quelli esistenti; Docker Desktop può rappresentare gli stessi bind con propri percorsi interni.

La prova live autenticata con il preset esistente **Iride / Qwen senza reasoning**, IDEA breve e retrieval escluso ha risposto HTTP 200 in **2,4 secondi**, con due nodi, un collegamento e nessun warning. La prova con retrieval e reasoning globali attivi ha invece incontrato timeout dell'embedding e del primo modello: il ripiego **Muse** ha completato e registrato la risposta, con circa **215 secondi** nella fase di generazione; il client di verifica aveva già raggiunto il proprio timeout di 150 secondi. È una limitazione di latenza ancora presente, non una prova di mancata coerenza risolta dai soli prompt. I preset di ragionamento sono conservati: un budget di reasoning elevato consuma anche lo spazio disponibile nella finestra e può rendere necessario il ripiego.

Snapshot, piano, configurazione precedente e override Compose sono conservati con accesso ristretto in `/home/nugh75/.cache/counselorbot-prompt-audit/2026-09-05/`. Il comando di ricreazione della versione verificata è:

```bash
docker compose \
  --project-directory /home/nugh75/counselorbot-sbs \
  --env-file /home/nugh75/counselorbot-sbs/.env \
  -f /home/nugh75/counselorbot-sbs-prompts/docker-compose.yml \
  -f /home/nugh75/.cache/counselorbot-prompt-audit/2026-09-05/deploy.override.yml \
  up -d --no-deps --no-build backend frontend
```

Per una futura ricostruzione usare questo worktree/branch, o prima integrare le modifiche nel checkout scelto per il rilascio. Una build dal precedente checkout senza integrazione non contiene le correzioni dei prompt.

## Aggiornamento protetto dei prompt salvati

`backend/prompt_updates.py` gestisce piani revisionabili con valori prima/dopo. `apply` blocca e controlla **tutte** le righe prima di modificarne una: se un altro agente o amministratore ha cambiato un prompt, l'intera applicazione viene interrotta. Le revisioni sono registrate anche per il rollback. Nessuna migrazione di avvio riscrive indiscriminatamente i testi personalizzati.

```bash
python -m backend.prompt_updates plan before.json --output plan.json
python -m backend.prompt_updates apply plan.json
python -m backend.prompt_updates rollback plan.json
```

Il piano generato automaticamente richiede revisione per le modifiche concettuali ai meta-prompt personalizzati. Conservare snapshot e piano con accesso ristretto fuori dal repository; non includere dump di produzione nei commit. Per annullare anche le modifiche al comportamento occorre ripristinare separatamente l'immagine applicativa, mantenendo volumi e dati.

## Fonti tecniche verificate

- [Ollama: finestra di contesto](https://docs.ollama.com/context-length).
- [OpenRouter: router gratuito](https://openrouter.ai/docs/guides/routing/routers/free-router) e [varianti gratuite](https://openrouter.ai/docs/guides/routing/model-variants/free): disponibilità e scelta dell'upstream possono cambiare.
- [OpenRouter: addebiti con auto e auto:free](https://openrouter.zendesk.com/hc/en-us/articles/51679572756123-I-used-openrouter-auto-free-or-auto-and-still-got-charged).
- [OmniRoute: repository ufficiale](https://github.com/diegosouzapw/OmniRoute).
