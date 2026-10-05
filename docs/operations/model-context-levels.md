# Livelli di contesto e varianti brevi (CR1–CR4)

In **Amministrazione → Configurazione & Prompt → Generale**, «Contesto per
modello» consente di modificare i livelli e assegnarli manualmente a un nome
esatto `provider/modello`. Non esiste una classificazione automatica per taglia
del modello. Senza assegnazione resta il comportamento precedente, compresi
gli eventuali limiti e il flag `compact` già configurati.

```text
Generale → Contesto per modello
  Livelli: Totale | Ristretto | Minimo | Aggiungi livello
    Nome, tetti token, massimo record conoscenze, scambi recenti, meta, breve
    Salva livelli
  Assegnazioni manuali
    Provider/modello → livello → finestra/budget → Salva assegnazioni
Mappa dei prompt
  Prompt normale      ≈ token
  Variante breve      ≈ token → Modifica → Salva (con conferma se condivisa)
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

## Variante breve e misure

Ogni prompt di sistema e di follow-up nella Mappa ha una voce `__short`, nello
stesso livello di appartenenza e con gli stessi consumatori. È vuota finché
l'amministratore la scrive: questa implementazione non contiene testi brevi
generati dall'agente. Il salvataggio usa le revisioni e le conferme esistenti;
non modifica il prompt normale. Un livello con `short_prompt=true` usa il
testo breve disponibile, altrimenti quello normale. Le direttive dinamiche di
lingua, punteggi, consigli e formato vengono applicate a entrambe le sezioni.
Ogni tentativo di ripiego ricompone il contesto originale per il proprio modello.

La stima è `ceil(byte UTF-8 / 3) + 8` per messaggio: non è un tokenizer del
provider. Badge in Mappa e conteggio della bozza si aggiornano senza salvare.
L'anteprima permette di scegliere un preset attivo, mostra il totale, il budget
disponibile, le riduzioni e il conteggio per blocco; una capacità sconosciuta
rimane sconosciuta. I conteggi dei blocchi ripartiscono il totale senza
duplicare l'overhead del messaggio di sistema. Il rapporto `context_budget`
è conservato nei dettagli dei log dei turni sync e streaming. L'anteprima
resta senza chiamate ai modelli e senza trasformazioni PII del trasporto.

## Prompt Lab e confronto ripetibile

Gli snapshot includono configurazione dei livelli, assegnazioni, varianti brevi
e hash del codice di composizione. Il worker applica i limiti del modello a
ogni braccio e conserva il rapporto del contesto realmente inviato. Il client
locale invia anche il `num_ctx` configurato.

Il comando `python -m backend.prompt_lab.context_comparison` prepara un set
fisso di **tre step per ciascuno dei dodici strumenti**: apertura, posizione
centrale, chiusura. Usa solo default di fabbrica, una cronologia sintetica in
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
