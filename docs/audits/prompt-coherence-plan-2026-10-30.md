# Piano: correzione delle contraddizioni dei prompt — 30 ottobre 2026

Piano costruito dalle [tue risposte](prompt-coherence-decisions-2026-10-30.md) all'[audit dei prompt](prompt-coherence-audit-2026-10-30.md). Ci sono 4 PR, in quest'ordine. Ognuna ha la sua issue con la milestone «Prompt coherence (Oct 2026)», un agente Opus e i suoi test. Dalla PR 2 in poi, prima di unire l'agente prova 3 o 4 conversazioni vere con il modello di produzione e mette nella PR le risposte prima e dopo.

**Regola per il database (5.1).** Ogni PR che cambia un testo di fabbrica lo scrive anche nel database: le versioni salvate vengono sovrascritte con i nuovi testi. Prima del deploy si fa sempre il backup.

## Due punti da confermare prima di partire

1. **Nome della fase finale (2.3).** Hai chiesto di cambiarlo. Propongo «**Strategie e consigli**» in italiano, e gli equivalenti nelle altre 5 lingue. Va bene, o preferisci un altro nome?
2. **Formato delle risposte (3.3).** Ho capito così: vale l'opzione che l'utente sceglie nella chat. Con «Discorsivo» il modello scrive in prosa, con «Puntato» usa gli elenchi. Il divieto generale di usare elenchi sparisce. Il piano finale di IDEA resta numerato. È giusto?

## PR 1 — Correzioni tecniche (sezione 1)

`fix: keep private LLM output out of chat and drop dead prompts`

- **JSON con le chiavi in un altro ordine (C04):** il filtro riconosce l'oggetto `{answer, recommendations}` dalle chiavi, in qualunque ordine, mentre la risposta arriva e anche alla fine. Il filtro del frontend fa lo stesso. Il JSON normale resta visibile.
- **Ragionamento nell'Assistente (C05):** durante lo streaming lo stesso separatore della chat guidata toglie il ragionamento, prima della lettura a voce.
- **Ordine dei blocchi interni (A02):** prima il testo visibile, poi i blocchi privati, per ultimo il segnale di fine passo. La stessa regola vale per passi, note, sintesi e bozze.
- **Frecce delle mappe IDEA (A05):** un solo formato (`source` e `target`) in skill, contratto ed esempi.
- **Ripresa di una risposta interrotta (A11):** un contratto apposta, che chiede di continuare con le parole rimaste e dice quali blocchi privati mancano ancora.
- **Formato JSON (C06):** lo decide chi chiama il modello, non la presenza della parola «JSON» nel testo.
- **Icone del Tavolo (C08):** separata la regola delle icone dal campo `factor`, che il Tavolo ignora.
- **QSAr di secondo livello (B01):** tolto «in English»; vale la regola generale della lingua.
- **Prompt mai usati (D01, D02, D03, D06):** eliminati, compresi i controlli in Amministrazione e le chiavi nel database (1.2).
- **QSAr a un solo fattore (D04):** portata nel prompt QSAr l'eccezione già usata nel QSA.
- **Guida del prodotto (D05):** tolta la descrizione dell'avanzamento automatico del passo; ora descrive il promemoria di scelta.
- **OpenCode (B02, B03):** si chiudono con la #739, che lo rimuove, e la PR 1 lo verifica.

**Test:** test di streaming e del parser per C04, C05 e A11; test sul formato JSON per C06; un test per ogni prompt eliminato. Le conversazioni di prova non servono: il contenuto delle risposte non cambia.

## PR 2 — Strategie e libri (sezione 2)

`feat: give strategies and readings in the final phase`

- **Quando si danno le strategie (2.2 e 2.3).**
  - I passi sui fattori servono ad analizzare e non propongono strategie.
  - La fase finale (nuovo nome, vedi sopra) è quella delle strategie e dei consigli: il counselor le propone di sua iniziativa per i fattori da migliorare, e le dà anche su richiesta.
  - Se lo studente chiede una strategia in un passo precedente, il counselor risponde che le darà nella fase finale e prosegue l'analisi.
- **Riconoscere le richieste (2.1, C01, C02).**
  - Il programma decide se lo studente chiede un consiglio leggendo solo il suo messaggio, senza le istruzioni interne del passo.
  - Riconosce le richieste di strategie nelle 6 lingue, compreso il suggerimento che offre l'app stessa.
  - La stessa decisione vale anche su Telegram.
- **Quante strategie (2.4).** Nella fase finale non c'è più il limite di una per risposta: si trattano insieme i fattori da migliorare. Le sintesi restano senza strategie nuove.
- **Strategie approvate (2.5, A07).** Nel QSA, se per un fattore non c'è una strategia certificata, si può usare una di quelle approvate di supporto. La regola si allinea in tutti i prompt.
- **Competenze sociali (2.6, A08).** I consigli pratici escono dal testo teorico ed entrano nel catalogo come strategie da approvare. Il testo teorico resta solo descrittivo.
- **Libri (2.7, A12).** Una sola lista: si può proporre e citare tutto ciò che è nel catalogo delle letture o nei documenti trovati.
- **Catalogo delle letture (2.8).** L'agente prepara un elenco di prova di letture su studio, motivazione, orientamento e competenze strategiche, con autore, titolo e anno verificabili, e lo carica nel database come letture certificate. L'elenco va nella PR, così puoi toglierne qualcuna.
- **Prova:** 4 conversazioni (QSA, QSAr, ZTPI, QPCC) che mostrano che nei passi sui fattori non arrivano strategie, che le richieste fatte in anticipo vengono rimandate alla fase finale, e che nella fase finale arrivano strategie e libri.

## PR 3 — Domande e formato (sezione 3)

`fix: one question per reply and the chosen answer format`

- **Domande per risposta (3.1, A03, A09).** Sempre una sola; quando c'è un'azione, la domanda riguarda l'azione. Anche l'apertura della fase finale ne fa una sola, non tre.
- **Sintesi (3.2, A04).** Possono finire con una domanda, anche quella sul futuro dello studente. Si toglie il «non fare altre domande» dalle sintesi di Obiettivi e QSA essenziale.
- **Formato (3.3, A01).** Vale l'opzione scelta nella chat (Discorsivo o Puntato), come al punto 2 da confermare.
- **Tabelle (3.4).** Le tabelle dei profili hanno 4 colonne, le altre al massimo 3.
- **Definizioni (3.5, A10).** All'apertura di ogni area QPCS c'è una definizione breve, di una o due frasi. Le altre spiegazioni arrivano solo su richiesta.
- **Prova:** 3 conversazioni (fase finale, sintesi, area QPCS), con entrambi i formati.

## PR 4 — Contenuti dei percorsi (sezione 4)

`fix: align path contents across prompts and briefs`

- **Competenze strategiche (4.1, B07).** Il numero esce dalla domanda suggerita dell'Assistente.
- **Savickas (4.2, B04).** Solo le scadenze concordate con lo studente: tolto il piano fisso a 7, 30 e 90 giorni dal testo di riserva.
- **Obiettivo docenza (4.3, B06).** La bozza descrive attività, prova e criterio.
- **QPCC (4.4, A06).** Esce l'elenco fisso delle 10 scale «correnti»: i fattori del passo li indica solo il codice.
- **Bussola (4.5, B05, B08).** La scheda QPCC diventa solo descrittiva. Le tre schede vecchie (QPCC, Obiettivo studio e docenza) si allineano ai testi attuali.
- **Assistente (4.6, C07).** Il contesto fisso con strumenti, lingue e requisiti dell'analisi combinata viene generato dal codice.
- **Prova:** 3 conversazioni (Bussola su QPCC, Savickas fino alla sintesi, Obiettivo docenza).

## Come lavoriamo

- **Ordine:** una PR alla volta, perché toccano gli stessi file.
- **Unione e deploy:** unisco io quando i controlli passano e, dalla PR 2 in poi, dopo che hai visto le conversazioni di prova; poi l'agente di deploy rifà backend e frontend.
- **Agenti:** Opus per le PR 1, 2 e 4; Opus anche per la 3, perché tocca il contratto comune.
- **Test e disco:** i test del backend girano uno alla volta. Prima di ogni build si controlla lo spazio sul disco.
- **Senza `sudo`:** non serve nessun passo con `sudo`.
- **Tempo stimato:** dalla PR 1 alla PR 4 servono circa 1 o 2 giorni di lavoro degli agenti, conversazioni di prova comprese.
