# Decisioni sulle contraddizioni dei prompt — 30 ottobre 2026

Domande per decidere come correggere i 35 rilievi dell'[audit dei prompt](prompt-coherence-audit-2026-10-30.md). Dalle risposte nasce il piano di lavoro.

**Come rispondere.** Modifica questo file su GitHub (icona della matita). Per le scelte metti una `x` nella casella: `- [x]`. Per le risposte libere scrivi dopo `Risposta:`. Se una domanda non è chiara, scrivi «non chiaro» e la riformulo. Tra parentesi ci sono gli ID dei rilievi, così puoi ritrovarli nell'audit.

Dove c'è **(consigliato)** è la mia proposta: se ti va bene, basta spuntarla.

---

## 1. Correzioni tecniche, senza scelte di contenuto

Sono errori del programma o istruzioni rimaste vecchie. Non cambiano cosa dice il counselor, ma solo che lo dica senza mostrare pezzi interni e senza istruzioni che si contraddicono:

- il JSON che si vede in chat quando il modello scrive le chiavi in un altro ordine (C04);
- il ragionamento che si vede durante lo streaming nell'Assistente (C05);
- l'ordine dei blocchi interni e del segnale di fine passo, oggi impossibile da rispettare (A02);
- due formati opposti per le frecce delle mappe IDEA (A05);
- la ripresa di una risposta interrotta, che chiede al modello di continuare e insieme di scrivere una risposta completa (A11);
- il formato JSON attivato per errore quando un documento o un messaggio contiene la parola «JSON» (C06);
- le icone del Tavolo, che promettono un campo che il Tavolo ignora (C08);
- la frase «rispondi in inglese» rimasta nel prompt QSAr di secondo livello (B01);
- i prompt mai usati (estrazione skill pQBL, vecchio riassunto in italiano, vecchio meta autocontrollo, modello pQBL a pezzi) (D01, D02, D03, D06);
- l'eccezione «un solo fattore» da portare anche nel prompt QSAr (D04);
- la guida del prodotto, che descrive ancora l'avanzamento automatico del passo, ormai tolto (D05);
- i riferimenti a OpenCode, che spariscono con la PR #739 (B02, B03).

**1.1** Le faccio correggere tutte senza chiederti altro?

- [ ] Sì, tutte (consigliato)
- [ ] Sì, tranne queste (scrivi gli ID):
- [ ] No, prima voglio vederle una per una

Risposta:

**1.2** I prompt mai usati (D01, D02, D03, D06): li elimino o li tengo come archivio?

- [ ] Eliminarli (consigliato: oggi chi li modifica in Amministrazione crede di cambiare qualcosa e invece non succede nulla)
- [ ] Tenerli, segnati chiaramente come «non in uso»

Risposta:

---

## 2. Quando proporre strategie e libri

Questa parte spiega perché strategie e libri arrivano quasi mai.

**2.1** Oggi il programma propone una strategia solo quando lo studente la chiede in modo esplicito, e a volte non riconosce nemmeno la richiesta (C01, C02). Correggo il riconoscimento delle richieste esplicite, in tutte e sei le lingue?

- [ ] Sì (consigliato)
- [ ] No

Risposta:

**2.2** Oltre alle richieste esplicite, il counselor deve **proporre di sua iniziativa** una strategia quando un fattore è debole?

- [ ] No, solo se lo studente la chiede
- [ ] Sì, ma solo nei passi su un fattore da migliorare, al massimo una per passo (consigliato)
- [ ] Sì, in ogni passo dove c'è un fattore da migliorare, anche più di una
- [ ] Altro (scrivi sotto)

Risposta:

**2.3** La fase finale «Domande e approfondimenti» viene presentata come il momento delle azioni pratiche, ma il codice lì vieta le strategie anche se lo studente le chiede (C03). Per ZTPI tutti i passi precedenti sono solo descrittivi, quindi una strategia non arriva mai. Cosa faccio?

- [ ] Nella fase «Domande» una strategia su richiesta esplicita e pertinente; le sintesi restano senza strategie nuove (consigliato)
- [ ] Nella fase «Domande» anche proposte di iniziativa
- [ ] Lasciare il divieto e cambiare il testo che promette le azioni

Risposta:

**2.4** Quante strategie nuove al massimo in una risposta? Oggi la skill ne permette una più una «di supporto», il contratto del turno una sola (A13).

- [ ] Una sola (consigliato)
- [ ] Una principale più una di supporto
- [ ] Altro:

Risposta:

**2.5** Nel QSA, se per un fattore non c'è nessuna strategia certificata, il counselor può prenderne una dalle strategie approvate di supporto (A07)?

- [ ] Sì, se non c'è una certificata
- [ ] No, solo strategie certificate (consigliato: è la regola più recente)

Risposta:

**2.6** Il testo teorico del passo «Competenze sociali» (Pellerey) contiene consigli pratici già pronti, per esempio «studia con un solo compagno di fiducia», che il modello propone ignorando il catalogo (A08). Cosa faccio?

- [ ] Togliere i consigli dal testo teorico e metterli nel catalogo delle strategie, dove li puoi approvare (consigliato)
- [ ] Lasciarli nel testo, ma usarli solo quando le regole del turno permettono una strategia

Risposta:

**2.7** Libri: oggi ci sono due liste, il catalogo delle letture («le sole opere da proporre») e i documenti trovati per la risposta («le sole fonti citabili»). Quando ci sono entrambe, un libro del catalogo può risultare vietato (A12).

- [ ] Una sola lista: si può proporre e citare tutto ciò che è nel catalogo o nei documenti trovati (consigliato)
- [ ] Due liste separate: il catalogo per proporre, i documenti solo per citare

Risposta:

**2.8** Nel database di produzione non c'è nessuna lettura certificata, quindi i libri non possono comparire. Pensi di caricarle tu da Amministrazione, o vuoi che prepari un elenco iniziale da approvare?

- [ ] Le carico io
- [ ] Preparami un elenco da approvare (da quali fonti? scrivi sotto)
- [ ] Per ora niente libri

Risposta:

---

## 3. Domande e formato delle risposte

**3.1** Quante domande al massimo per risposta? Oggi la regola generale dice una, ma l'apertura della fase finale ne chiede tre (A03). In alcuni passi con una strategia ne servirebbero due: una riflessiva e una sull'azione (A09).

- [ ] Sempre una sola: quando c'è un'azione, la domanda riguarda l'azione (consigliato)
- [ ] Una sola, ma quando c'è un'azione sono ammesse due
- [ ] L'apertura della fase finale può farne tre, le altre risposte una

Risposta:

**3.2** Le sintesi finali (Obiettivi, QSA essenziale) dicono «non fare altre domande», ma un'altra regola aggiunge in fondo una domanda sul futuro dello studente (A04). Cosa preferisci?

- [ ] Le sintesi finiscono senza domande: l'apertura sul futuro diventa una frase (consigliato)
- [ ] Le sintesi possono finire con una domanda

Risposta:

**3.3** Elenchi puntati: la regola generale li vieta, ma la preferenza «risposte schematiche» che sceglie l'utente li chiede, e il piano finale di IDEA è numerato (A01). Chi vince?

- [ ] Vince la preferenza dell'utente; il piano IDEA resta numerato; altrimenti prosa (consigliato)
- [ ] Sempre prosa, tranne il piano IDEA
- [ ] Altro:

Risposta:

**3.4** Le tabelle dei profili hanno due regole: al massimo 3 colonne (preferenze) e 4 colonne (regole delle tabelle dei fattori) (A01). Quale tengo?

- [ ] 4 colonne per le tabelle dei profili, 3 per le altre (consigliato: le tabelle dei profili già usano 4 colonne)
- [ ] Sempre al massimo 3
- [ ] Altro:

Risposta:

**3.5** Quando un passo QPCS apre una nuova area, il prompt chiede di spiegare brevemente cosa significa, ma la regola generale vieta le spiegazioni non richieste (A10). Ammetto una definizione breve, una o due frasi, all'apertura di ogni area?

- [ ] Sì, una definizione breve all'apertura dell'area (consigliato)
- [ ] No, si spiega solo se lo studente chiede

Risposta:

---

## 4. Contenuti dei percorsi

**4.1** Le competenze strategiche sono **sette** (nei testi teorici di Pellerey) o **otto** (in una domanda suggerita dall'Assistente) (B07)?

- [ ] Sette
- [ ] Otto
- [ ] Non sono sicuro: tolgo il numero dalla domanda suggerita (consigliato finché non decidi)

Risposta:

**4.2** Savickas: un testo di riserva chiede una sintesi con un piano fisso a 7, 30 e 90 giorni, mentre il prompt principale dice «non inventare scadenze, usa solo quelle concordate» (B04). Quale regola?

- [ ] Solo le scadenze concordate con lo studente (consigliato)
- [ ] Sempre un piano 7/30/90 giorni

Risposta:

**4.3** Obiettivo docenza: la sintesi mostra al docente attività e valutazione per la classe, ma la bozza salvata descrive «primi passi personali e piano se-allora», come per uno studente (B06). Allineo la bozza a quella del docente (attività, prova, criterio)?

- [ ] Sì (consigliato)
- [ ] No, spiegami meglio

Risposta:

**4.4** QPCC: il prompt fisso dice che sono «correnti» tutte le 10 scale, mentre il codice passa solo quelle del passo (A06). Il modello può così parlare di fattori di cui non ha i dati. Tengo solo l'elenco generato dal codice per il passo?

- [ ] Sì (consigliato)
- [ ] No

Risposta:

**4.5** Bussola: la scheda QPCC contiene le istruzioni per condurre l'intervista, ma la Bussola deve solo descrivere gli strumenti (B05). In più tre schede salvate sono rimaste alla versione vecchia: QPCC «5 aree» invece di 10 scale, e Obiettivo studio e docenza «7 passi» invece di apertura più 5 (B08). Cosa faccio?

- [ ] La scheda QPCC diventa solo descrittiva, e allineo le tre schede vecchie ai testi attuali (consigliato)
- [ ] La scheda QPCC diventa solo descrittiva, e le tre schede vecchie le aggiorno io a mano
- [ ] Altro:

Risposta:

**4.6** Assistente: il suo contesto fisso dice che i questionari a item sono in prova solo in inglese, spagnolo e svedese, e che l'analisi combinata richiede tutti e tre gli strumenti (QSA/QSAr, ZTPI, Savickas). Il codice invece supporta 6 lingue e ne chiede 2 su 3 tra QSA, QSAr e ZTPI (C07). Faccio generare quel contesto dal codice, così non resta più indietro?

- [ ] Sì (consigliato)
- [ ] Aggiorno solo il testo, a mano

Risposta:

---

## 5. Come procedere

**5.1** Molti prompt sono anche salvati nel database e possono essere stati modificati da te in Amministrazione. Quando correggo un prompt di fabbrica, cosa succede a quello salvato?

- [ ] Aggiorno quelli mai modificati; per quelli modificati ti mostro la differenza e decidi tu (consigliato)
- [ ] Sovrascrivo tutti con i nuovi testi di fabbrica
- [ ] Non tocco il database: aggiorno solo i testi di fabbrica

Risposta:

**5.2** Ordine dei lavori. Propongo quattro PR:
1. le correzioni tecniche (sezione 1);
2. strategie e libri (sezione 2);
3. domande e formato (sezione 3);
4. contenuti dei percorsi (sezione 4).

- [ ] Va bene (consigliato)
- [ ] Prima strategie e libri, poi il resto
- [ ] Altro ordine:

Risposta:

**5.3** Prima di unire le PR sui prompt (2, 3 e 4), vuoi che l'agente provi qualche conversazione vera con il modello di produzione, con dati di prova, e ti mostri le risposte prima e dopo?

- [ ] Sì, 3 o 4 conversazioni campione per PR (consigliato: costa poche chiamate al modello)
- [ ] No, bastano i test automatici

Risposta:

**5.4** Altro che vuoi aggiungere o cambiare:

Risposta:
