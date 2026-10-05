# Livelli di contesto e varianti dei prompt (CR1–CR4)

In **Amministrazione → Configurazione & Prompt → Generale**, «Contesto per
modello» consente di modificare i livelli e assegnarli manualmente a un nome
esatto `provider/modello`. Non esiste una classificazione automatica per taglia
del modello. Senza assegnazione resta il comportamento precedente, compresi
gli eventuali limiti e il flag `compact` già configurati.

```text
Generale → Contesto per modello
  Livelli: Totale | Ristretto | Minimo | Aggiungi livello
    Nome, tetti token, massimo record conoscenze, scambi recenti, meta, testi del livello
    Salva livelli
  Assegnazioni manuali
    Provider/modello → livello → finestra/budget → Salva assegnazioni
Mappa dei prompt
  Ogni prompt → [Totale] [Ristretto] [Minimo] → ≈ token
    Modifica → Salva nel database (con conferma se condiviso)
Anteprima step
  Preset scelto → totale/budget → token per blocco → messaggi completi
```

## Dati e salvataggi

- `model_context_levels`: oggetto JSON di livelli; ogni id stabile ha `label`,
  `directives_tokens`, `persona_tokens`, `profile_tokens`, `knowledge_tokens`,
  `knowledge_top_n`, `history_turns`, `meta`, `short_prompt`.
- `model_context_profiles`: conserva `context_tokens`, `input_tokens`, `compact`
  e aggiunge `level` per ciascun nome esatto. `ollama/model` e
  `ollama/model:latest` sono due assegnazioni distinte.
- I livelli iniziali sono dati in `backend/model_context.py`, restituiti da
  `GET /admin/model-context-levels` quando non esiste una personalizzazione.
  Non vengono salvati all'apertura o riseminati all'avvio.
- I due pulsanti salvano separatamente tramite `POST /admin/config`. Il backend
  valida campi e riferimenti, serializza le due configurazioni su PostgreSQL e
  rifiuta di eliminare un livello ancora assegnato. Salvataggio fallito: la
  bozza resta disponibile. Salvare un nuovo livello prima di assegnarlo.
- Cambiare `label` rinomina il livello visibile senza cambiare l'id. «Aggiungi
  livello» crea una bozza basata sul primo livello esistente, da personalizzare
  e salvare esplicitamente. Nessuna assegnazione viene creata automaticamente.

Campi vuoti: nessun tetto. Zero: esclude il blocco opzionale o lo storico.
Le direttive globali obbligatorie si conservano intere: se il loro tetto è
insufficiente, il turno viene rifiutato prima dell'invio, anziché troncarle.
La persona è conservata o omessa interamente; il profilo conserva paragrafi
completi. Le conoscenze conservano record completi nell'ordine ricevuto:
fonti RAG `[SOURCE N]` con tutti i loro paragrafi, record di catalogo con il
relativo contesto oppure paragrafi completi per formati non strutturati.
Il limite `knowledge_top_n` conta record, non titoli isolati. I blocchi privati
operativi (mappa Idea, fonti private, contratti, evidenza del percorso) restano
protetti. I componenti disabilitati nello step non vengono riabilitati dal
livello. Lo storico mantiene scambi recenti completi; messaggio corrente e
punteggi in esso presenti non vengono troncati.

## Varianti per ogni prompt e misure

In **Mappa dei prompt**, ogni testo destinato al modello ha i pulsanti
**Totale**, **Ristretto** e **Minimo**: direttive globali, sistema, follow-up,
meta dello strumento e dello step, varianti Idea, istruzioni di ogni step e
persona di ciascun counselor. Selezionare il livello, premere **Modifica**,
inserire il testo e **Salva**. Le varianti sono indipendenti e restano nel DB.
I pulsanti del livello sono disabilitati durante la modifica: salvare o
annullare prima di cambiare, per conservare la bozza.

Totale usa il testo già esistente e il suo proprietario (Config, GuidedStep o
Counselor). Gli altri livelli salvano righe Config con chiave
`<chiave-base>__level_<id-livello>` e revisioni `origin=admin`, tramite
`POST /admin/config`. Per step e persona le chiavi base sono
`guided_step:<id>:prompt` e `counselor_persona:<id>`. I livelli personalizzati
salvati in Generale aggiungono pulsanti; gli ID sono codificati senza collisioni.
Leggere la Mappa non crea righe. Nessuna migrazione o riscrittura all'avvio.

Una variante vuota eredita **Totale**, anche dopo un salvataggio esplicito;
Minimo non eredita Ristretto. Le vecchie righe `__short` rimangono compatibili
solo con Ristretto, finché non si salva la sua nuova riga: salvarla vuota
rimuove esplicitamente tale eredità. I testi di Totale restano disponibili.
Conferme per prompt condivisi e storico/ripristino restano quelli esistenti.

Il livello assegnato esattamente a provider/modello sceglie i suoi testi quando
**Usa i testi del livello, se presenti** è attivo (`short_prompt`, nome storico
del flag nel JSON). Nessuna assegnazione: testi Totale. Un ripiego usa di nuovo
l'envelope originale con il livello del proprio modello. Retrieval, evidenza,
ledger e dati vengono raccolti una sola volta; ogni variante riceve gli stessi
contratti obbligatori, punteggi, direttive dinamiche e formato.

I limiti del livello restano attivi **dopo** aver selezionato i testi: se
**Includi meta prompt** è spento, anche la variante meta è esclusa; una persona
che supera il tetto viene omessa interamente. Ristretto e Minimo hanno meta
spento nei default. Attivarlo in Generale se si vuole inviare quel blocco.
Le istruzioni di step cambiano solo all'ingresso (`use_phase_prompt`), anche
nei turni QPCS/Idea che le ripetono nel messaggio al modello. Il messaggio
libero dello studente non viene sostituito. Etichette, colori, domande suggerite
e note admin conservano i loro editor: non sono istruzioni del modello.

La stima è `ceil(byte UTF-8 / 3) + 8` per messaggio: non è un tokenizer del
provider. Badge in Mappa e conteggio della bozza si aggiornano senza salvare.
L'anteprima permette di scegliere un preset attivo, mostra il totale, il budget
disponibile, le riduzioni e il conteggio per blocco; una capacità sconosciuta
rimane sconosciuta. I conteggi dei blocchi ripartiscono il totale senza
duplicare l'overhead del messaggio di sistema. Il rapporto `context_budget`
è conservato nei dettagli dei log dei turni sync e streaming. L'anteprima
resta senza chiamate ai modelli e senza trasformazioni PII del trasporto.

## Prompt Lab e confronto ripetibile

Gli snapshot includono configurazione dei livelli, assegnazioni, varianti per livello
e hash del codice di composizione. Il worker applica i limiti del modello a
ogni braccio e conserva il rapporto del contesto realmente inviato. Il client
locale invia anche il `num_ctx` configurato.

Il comando `python -m backend.prompt_lab.context_comparison` prepara un set
fisso di **tre step per ciascuno dei dodici strumenti**: apertura, posizione
centrale, chiusura. Confronta Totale, Ristretto e Minimo: **108 envelope**
nel conteggio senza generazione e **216 prove** con due modelli. Usa solo default di fabbrica, una cronologia sintetica in
italiano e assenza esplicita di punteggi. Non importa prompt o dati operativi,
non scrive versioni brevi e non attiva configurazioni. Richiede un database
PostgreSQL vuoto con nome terminante in `_test`, su loopback.

```bash
DATABASE_URL=postgresql://context_test:context_test@127.0.0.1:18598/counselorbot_context_eval_test \
COUNSELOR_TRANSLATE_DISABLED=1 ADMIN_SYNC_DISABLED=1 \
python -m backend.prompt_lab.context_comparison --prepare-only --output /tmp/context-tokens.json
```

Per un confronto live, usare un **altro database test vuoto** e omettere
`--prepare-only`; scegliere esplicitamente i due modelli locali con
`--models <grande> <piccolo>` e l'endpoint locale con `--gateway <url>`.
Il limite `--max-seconds` predefinito è 600; risposte mancanti, errori e verdetti
illeggibili rimangono nel denominatore. Il giudice è calibrato con risposta
corretta/errata e non conosce il livello del braccio; digest cambiati invalidano
il confronto. La valutazione automatica non sostituisce la revisione educativa.
Vedere [risultati e limiti](model-context-levels-validation.md).

## Ambiente e rilascio

`scripts/dev-context-frontend.sh` avvia su `127.0.0.1:3165`, con backend
inaccessibile su `127.0.0.1:9`. Le verifiche browser intercettano tutte le API.
Tunnel: `ssh -N -L 3165:127.0.0.1:3165 <utente>@<server>`, poi
`http://localhost:3165/admin?section=general`. Arrestare con Ctrl+C nel terminale
del processo. [Dettagli dev](live-dev-environment.md).

Non è stato eseguito un deploy. Le immagini di validazione sono isolate e
non aggiornano container, DB o prompt operativi. Dopo il merge, il rilascio del
codice e le assegnazioni manuali restano azioni distinte.
