# W4 — Strategie di vita e continuità della conversazione

## Contenuto e percorsi

Quattro strategie QSA/QSAr in italiano hanno un aggancio puntuale alle schede
Ottone e un adattamento editoriale dichiarato: vedi
[schede W4b](w4b-strategie-azione-vita.md). Le nuove installazioni ricevono il
percorso QPCC a sette step e QAP a sei, con prompt di intervista e sintesi,
label e domande nelle sei lingue. I percorsi amministrativi esistenti non sono
sovrascritti. Gli alias dei vecchi percorsi restano leggibili per le sessioni
storiche.

Le aperture di risposta entrano anche negli step già popolati attraverso un
inserimento una tantum (`response_openings_v1_applied`). Le domande preesistenti
restano; successive modifiche o cancellazioni amministrative non vengono
annullate. Il clic su un suggerimento prepara il testo nel compositore e porta
il focus lì, senza inviare una risposta incompleta.

## Sidebar e memoria

«Letture e film» e «Strategie» mantengono i cataloghi certificati. La terza voce
«Consigli e domande» raccoglie al massimo un consiglio e una domanda dichiarati
nel blocco privato del turno. Il parser verifica che il testo compaia nella
risposta visibile e applica il limite dello step ai consigli. Un blocco assente,
malformato o riferito a testo tagliato non crea voci fantasma.

Le domande hanno chiusura e riapertura esplicite da parte dello studente.
Passare allo step successivo non le chiude; il modello non modifica lo stato.
I consigli usano gli stati già previsti per le proposte. Salvataggio fallito:
lo stato precedente rimane visibile ed è disponibile «Riprova». Le voci sono
isolate per proprietario e sessione e ricompaiono al resume.

La normalizzazione del testo produce un identificatore stabile contro i
duplicati identici, anche con differenze di maiuscole o punteggiatura. Nel
prompt entrano le ultime 12 note (massimo 220 caratteri di testo ciascuna) e le
note precedenti nominate esplicitamente: lo storico completo resta in sidebar.
La non ripetizione di parafrasi è una direttiva al modello, non una garanzia
semantica del database. Il ledger non riapre una domanda chiusa dallo studente.
Le risposte già salvate non sono riscritte né classificate retroattivamente.

## Correzioni tecniche

- Asserzioni sulle letture allineate al contratto di selezione effettiva.
- Direttiva strategie corretta nelle sei lingue: una candidata entra nella
  sidebar solo se proposta e dichiarata; non era già visibile prima della risposta.
- Quattro errori di rendering riprodotti nell'ambiente Python locale privo di
  `dot`. La verifica si esegue nel container con Graphviz, senza indebolire i
  controlli sul rendering SVG, PNG e PDF.
- `model_context_profiles` dell'istanza: aggiunti
  `deepseek/deepseek-v4-flash` (1.000.000 token, capacità conservativa rispetto
  al valore 1M della [documentazione DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/))
  e `openrouter/deepseek/deepseek-v4-flash` (1.048.576, verificato nell'API
  pubblica [OpenRouter](https://openrouter.ai/deepseek/deepseek-v4-flash)).
  Nessuna modifica agli altri profili o alle credenziali.
- L'audit conserva nel report le rimozioni di contesto richieste da un profilo
  `compact`. Queste rimozioni intenzionali non generano un falso allarme di
  capacità; la perdita di storia e le riduzioni non pianificate restano warning.
- Iride verificata sul preset 15, `ollama/nemotron-cascade-2:latest`, thinking
  attivo. Aggiornato `CONTEXT.md` con ledger, ANCHOR, PERSPECTIVE e continuità.

## Verifica da ripetere dopo sessioni reali

```bash
python3 -m scripts.chat_metrics --since 2026-09-06
```

Usare l'ambiente con `DATABASE_URL` configurato verso l'istanza, senza stampare
le credenziali. Baseline fornita: parlato 34:1, richiami 5%, verifiche 4/144,
`factor` 16%, 33 riesecuzioni. Il semplice carattere `?` non prova che la domanda
sia finale, unica e pertinente: affiancare un campione letto manualmente.
Se il tasso resta basso, controllare il prompt effettivamente inviato e i suoi
limiti prima di sperimentare una posizione diversa di ANCHOR.
