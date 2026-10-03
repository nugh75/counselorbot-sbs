# Allineamento dei prompt di fabbrica dall’amministrazione

Il pulsante **Allinea prompt di fabbrica** è comune alla pagina Amministrazione,
sopra le schede delle risorse. Si applica a tutte le istruzioni registrate delle
chat e ai dodici percorsi guidati, non soltanto a QSA. L’interfaccia è tradotta
in IT/EN/ES/FR/DE/SV; i testi di fabbrica per il modello rimangono in inglese.

## Uso

1. Aggiornare e avviare frontend e backend della stessa versione. Con Docker,
   aggiornare anche le immagini: il solo pull non cambia il codice nel container.
2. Salvare o annullare le bozze nell’editor e attendere i salvataggi in corso.
3. Aprire **Allinea prompt di fabbrica**. L’operazione è di sola lettura.
4. Espandere gli elementi per confrontare testo attuale e nuovo testo; controllare
   anche l’elenco dei prompt personalizzati o di altro strumento conservati.
5. Se il confronto è corretto, premere **Conferma allineamento**. La pagina
   aggiorna i testi applicati negli editor e registra le versioni precedenti.

Chiudere il pannello non applica nulla. Se non ci sono testi di fabbrica da
aggiornare, manca il comando di conferma. Se il server segnala un conflitto,
ricaricare l’anteprima e verificare nuovamente le differenze. In caso di errore
di rete, ricaricare il confronto per verificare il risultato prima di riprovare.
Durante la richiesta i controlli di modifica attendono la risposta.
Creare, riordinare o eliminare uno step con successo aggiorna lo stato salvato
dell’editor; riordinare non rende salvata un’eventuale bozza del prompt.

Il ripristino di una versione precedente usa lo storico dei prompt già presente;
un ripristino è una scelta amministrativa e rende il testo protetto.
La procedura CLI QSA rimane disponibile in `qsa-factory-alignment.md`.

## Perimetro e protezioni

`backend/prompt_factory_alignment.py` costruisce il catalogo dai registri
`prompt_config`: 93 configurazioni di istruzioni e 101 step al momento
dell’introduzione. Copre anche IDEA, gli obiettivi, gli eventi, le direttive,
i contesti e i prompt configurabili degli assistenti, non soltanto i pannelli
dei questionari visibili nella pagina. Esclude testi dell’interfaccia, varianti
per lingua, impostazioni di provider/modello, persone dei counselor e step
creati dall’amministratore. Non ricrea record cancellati o assenti.

Un testo è aggiornabile se coincide con un hash di fabbrica registrato in
`prompt_factory_legacy.json` oppure con l’ultima revisione seed/migration.
La proprietà admin prevale anche su un hash noto. Salvare esplicitamente un
testo uguale a quello di fabbrica registra comunque la proprietà admin una
sola volta; i successivi salvataggi identici non duplicano lo storico.
Le revisioni del pulsante hanno origine migration e autore dell’operazione:
il testo resta di fabbrica per gli aggiornamenti successivi, fino a una modifica
o a un ripristino amministrativo. Il comando CLI generico mantiene il suo
comportamento precedente, con revisioni admin.

I nuovi default futuri devono entrare nei registri. Conservare gli hash già
presenti e aggiungere quelli delle versioni di fabbrica precedenti se si vuole
riconoscere anche un database che non dispone dello storico.

## API

- `GET /api/admin/prompt-factory-alignment/preview`: versione del piano,
  differenze prima/dopo, testi conservati e `review_hash`.
- `POST /api/admin/prompt-factory-alignment/apply`: accetta soltanto
  `{ "review_hash": "…" }`; restituisce conteggio e valori effettivamente
  aggiornati per sincronizzare gli editor.

Entrambe usano il guard amministrativo esistente. Il client non può fornire
testi da scrivere né destinazioni arbitrarie. Alla conferma il server ricostruisce
il piano con lock dei record, verifica il digest e applica l’intero lotto con
`prompt_updates`. I salvataggi e ripristini admin acquisiscono gli stessi lock
anche quando il testo è identico: una nuova proprietà admin non può inserirsi
fra verifica e applicazione. Un piano cambiato restituisce HTTP409, senza
scritture parziali.
Lo storico conserva il testo precedente e l’autore. Nessuna chiamata LLM,
migrazione dello schema o applicazione automatica all’apertura della pagina.

## Verifica

I test backend usano dati anonimi in schemi isolati di `counselorbot_test` e
verificano i dodici percorsi, gli assistenti, i default QSA precedenti, proprietà
admin, varianti per lingua, anteprima senza scritture, conferma, storico,
successive versioni di fabbrica, no-op, accessi negati, payload arbitrari,
conflitti e rifiuto di conferme ripetute. Quattro casi con connessioni separate
verificano i lock PostgreSQL su salvataggi e ripristini di testi identici.
I test browser simulano tutte le API
e verificano le sei lingue a 390px, il pannello a 1440px, tutte le schede,
annullamento, bozze, creazione/riordino/eliminazione degli step, errori,
conflitti e doppio click.

Esecuzione, dopo aver impostato l’ambiente del backend di sviluppo:

```bash
backend/.venv/bin/python -m pytest -q backend/tests/test_prompt_factory_alignment.py backend/tests/test_prompt_revisions.py backend/tests/test_prompt_updates.py
cd frontend
node --test tests/prompt-factory-alignment.test.mjs
```

La suite browser usa localhost:3107 (`PROMPT_PREVIEW_BASE_URL` per cambiare porta)
e Chromium (`CHROMIUM_PATH` per cambiare eseguibile). Non aggiorna database
reali, non chiama provider e non certifica le risposte di un LLM.
