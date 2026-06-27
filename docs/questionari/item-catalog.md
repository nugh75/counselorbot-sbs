# Catalogo item — scaffolding multilingue (IT / EN / SV)

Struttura dati per la **somministrazione item-level** e le versioni linguistiche dei
questionari, predisposta per il progetto di adattamento SV/EN
(vedi [`progetto-validazione-qsa-qsar-sv-en.md`](../validazione/progetto-validazione-qsa-qsar-sv-en.md)).

> ⚠️ **Proprietà intellettuale.** QSA, QSAr, QPCS, QPCC sono strumenti protetti
> (M. Pellerey / CNOS-FAP, competenzestrategiche.it). Il **testo degli item** e le
> **chiavi item→fattore / norme stanine** sono materiale degli autori e **non** sono
> inclusi qui. Vanno inseriti solo da ricercatori autorizzati, seguendo il processo
> di traduzione del progetto (WP2: forward + back translation, panel esperti).
> Il QAP è l'adattamento del **CAAS** (Savickas & Porfeli): la struttura a 4 dimensioni
> è pubblica; il testo degli item ufficiali va recuperato dalla fonte autorizzata
> (vocopher.com / pubblicazione CAAS) e inserito nei campi `text`.

## Cosa contiene questo scaffold

- Metadati fattuali: numero item, scala di risposta, fattori (dove pubblici), direzione.
- Per QAP: mappatura **item→dimensione** CAAS (per posizione, pubblica) + scala 1-5.
- Campi `text.{it,en,sv}` **vuoti**, da compilare con i testi (IT dalla fonte ufficiale,
  EN/SV dalle traduzioni autorizzate).
- Chiave `item→fattore` lasciata a `null` per gli strumenti Pellerey (proprietaria).

## Schema di ogni file `<strumento>.json`

```jsonc
{
  "instrument": "QSA",
  "source": "…",            // citazione fonte
  "license_note": "…",      // vincoli d'uso / autorizzazione
  "n_items": 100,
  "response_scale": {         // scala di RISPOSTA agli item
    "min": 1, "max": 4,
    "labels": { "it": [...], "en": [...], "sv": [...] }
  },
  "report_scale": {           // scala del PROFILO restituito
    "type": "stanine", "min": 1, "max": 9
  },
  "factors": [
    { "code": "C1", "name": { "it": "", "en": "", "sv": "" }, "direction": "direct|inverse" }
  ],
  "items": [
    {
      "id": "QSA-001",
      "factor": null,         // codice fattore (proprietario → da inserire)
      "reverse": null,        // item a punteggio inverso (true/false)
      "text": { "it": "", "en": "", "sv": "" }
    }
  ]
}
```

## Workflow di compilazione (per ricercatore autorizzato)

1. Inserire i testi **IT** degli item dalla fonte ufficiale (PDF in `strumenti/`).
2. Tradurre EN e SV con **doppia traduzione indipendente + back-translation** (WP2).
3. Inserire la mappa `factor` e `reverse` di ciascun item dalla chiave ufficiale.
4. Validare contenuto (WP3) e interviste cognitive (WP4) prima del pilot.
5. Caricare il catalogo nell'app (Research Mode, da implementare: PROGETTO §8).

## Rigenerare gli skeleton

```bash
python3 questionari/item_catalog/build_skeletons.py
```
Non sovrascrive file già compilati (scrive solo se mancanti).
