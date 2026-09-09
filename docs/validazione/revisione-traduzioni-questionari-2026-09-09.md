# Revisione editoriale dei questionari — 9 settembre 2026

Revisione approvata dall'utente dopo l'audit degli item e delle risposte presenti
nel database. Le versioni restano `pilot`: questa correzione linguistica non è
una validazione psicometrica.

## Intervento

Il manifest `scripts/data/questionnaire_translation_fixes_20260909.json` contiene
87 testi prima/dopo e una scala di risposta prima/dopo, con la motivazione di
ogni correzione. Le lingue interessate sono en, es, fr, de e sv.

- QSA 3, 16, 40, 47, 52, 53, 59, 64, 78, 82, 91, 94 e QSAr 39, 44:
  eliminazione della frequenza esplicita introdotta nella traduzione di
  formulazioni come «mi capita» e «mi succede». La frequenza resta nella scala.
  Le formulazioni svedesi con `händer det`/`det händer` sono conservate.
- QSAr 32 es e ZTPI 54 sv: rimozione rispettivamente di `siempre` e `ofta`,
  aggiunti dalle traduzioni rispetto alla sorgente inglese.
- QPCC de: distinzione tra le risposte 2 e 3, precedentemente identiche.
- Correzioni grammaticali e semantiche puntuali in QSA, QSAr, QPCC, QAP e ZTPI,
  comprese sessione di studio (QSA 81) e interesse per il futuro professionale
  anziché ansia (QAP 6).

`Even` e gli equivalenti concessivi restano dove esprimono una condizione
significativa. Non è stata applicata una rimozione generalizzata degli avverbi:
gli item ZTPI con `often`/`rarely` e QPCS 4 richiedono una verifica distinta
della relazione tra fonte e scala. Il controllo non certifica l'equivalenza
complessiva di questi strumenti rispetto alle edizioni originali.

Riferimenti per il confronto QSA/QSAr:

- [Presentazione dei fattori e degli item QSA](https://www.competenzestrategiche.it/mod/book/tool/print/index.php?id=65).
- [QSA, questionario italiano](https://www.competenzestrategiche.it/mod/url/view.php?id=133).
- [QSAr, questionario italiano](https://www.competenzestrategiche.it/pluginfile.php/2095/mod_folder/content/0/01_Strumenti/QSAr_it.pdf?forcedownload=1).

## Applicazione e verifiche

Lo script usa le credenziali già configurate in `DATABASE_URL`, senza stamparle.
Da un ambiente con dipendenze backend e accesso al database:

```bash
python3 -m scripts.test_fix_questionnaire_translations
python3 -m scripts.fix_questionnaire_translations --dry-run
python3 -m scripts.fix_questionnaire_translations --apply
```

Il dry-run è il comportamento predefinito. L'applicazione blocca le righe durante
la transazione, confronta il testo corrente con il testo revisionato e annulla
tutto se trova una modifica concorrente. Una seconda applicazione non riscrive
i testi già corretti. I testi JSON prevalgono sulle colonne legacy, che restano
disponibili come da convenzione del progetto.

Le versioni delle lingue effettivamente modificate ricevono l'etichetta
`editorial-2026-09-09`, aggiunta all'eventuale etichetta precedente, e una nota
di provenienza. Stati di validazione, risposte raccolte, punteggi, numerazione,
fattori e reverse scoring non vengono modificati.

L'immagine backend non include `scripts/`. Per questa applicazione i soli tre
file dello script, del test e del manifest sono stati copiati temporaneamente
in `/tmp/questionnaire-editorial-fix` nel container e avviati con
`PYTHONPATH=/tmp/questionnaire-editorial-fix:/app`, usando la configurazione già
presente. Non occorre ricostruire immagini: cambiano dati DB, script operativi
e documentazione, non il codice applicativo incluso nelle immagini.

Esito sul database in esecuzione:

- quattro test isolati superati, inclusi rollback e conservazione delle lingue;
- dry-run: 88 campi; applicazione: 88 campi; ripetizione: zero campi;
- API `/instruments/{code}/rules`: verificate tutte le 30 combinazioni di sei
  strumenti e cinque lingue, per 1.380 testi e 30 scale;
- testi non interessati identici alla fotografia precedente; stati `pilot`
  conservati in tutte le combinazioni.

Il seed storico resta invariato, coerentemente con il catalogo gestito nel DB.
Su un database ricreato da quel seed, eseguire questa revisione dopo aver
caricato le traduzioni revisionate di partenza. Una traduzione diversa provoca
un conflitto esplicito e richiede un nuovo confronto editoriale.
