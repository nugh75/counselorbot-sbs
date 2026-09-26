# Area personale: audit dell'interazione e piano di modifica

**Data:** 23 settembre 2026. **Stato:** punti 0.1 e 0.2 approvati e applicati all’ingresso dell’Area personale il 23 settembre 2026, su richiesta dell’utente di vedere le modifiche dopo rebuild Docker. Pilota 0.3 Orientamento e passi 0.3.2.1–0.3.2.3 distribuiti il 23 settembre 2026; **estensione della testata (0.3) a tutte le pagine dell’area applicata il 26 settembre 2026** (mega-pagina `/profilo/*`, workspace unificati azioni/carte/confronto, flashcard e pQBL; `cambiamenti` resta sub-pagina del taccuino, `libretto` ritirata). **Lotto 3A residuo applicato il 26 settembre 2026** (creazione obiettivo progressiva con «Più dettagli ▾»; ponte «Collega a un obiettivo» dal Portfolio): F12/F13/F16 assorbiti. **Lotto 1B applicato il 26 settembre 2026** (F03 stati di errore con Riprova su Taccuino/Compilazioni/Portfolio/Classi/Telegram; F04 uscita dal gruppo confermata; F25 uploader pQBL solo-PDF). **Lotto 4 avviato il 26 settembre 2026 — strumento Linea del tempo**: campo «Cosa programmo» reintrodotto nell'editor (tappe future o senza date, contratto `planned` invariato) e `TimelineTools.tsx` eliminato come dead code (ramo `personal` irraggiungibile). **F23 applicato il 26 settembre 2026** (rinomina in linea con `InlineRename` al posto dei `window.prompt` nativi, con focus, invio/Escape, nei mazzi e nelle colonne di Carte e nei mazzi di Flashcard). **F24 applicato il 26 settembre 2026** (Confronto progressivo: passo 1 Alternative sempre visibile, Criteri/Confronto/Scelta compaiono solo con almeno un'alternativa, etichette di passo 1–4 in sei lingue). Restano nel lotto: F21, F26. Lotti 1A, 5A–5B ancora aperti; il lotto 1A è in backlog con accordo esplicito dell’utente finché gli utenti sono di prova.
**Base del codice esaminato:** `edddddc`. Ambito: le 18 rotte dell'Area personale, i componenti condivisi e i passaggi verso gli strumenti esterni all'area.

## 1. Esito e priorità

L'area offre strumenti utili e già collegati, ma chiede allo studente di conoscere la struttura dell'applicazione prima di capire dove lavorare. La difficoltà principale è passare da «che cosa voglio fare?» a una pagina precisa e, una volta entrati, distinguere il lavoro principale da metadati, collegamenti e operazioni accessorie.

La revisione dovrebbe partire da tre interventi:

1. **Proteggere il lavoro:** impedire la perdita silenziosa di bozze nel Libretto e nel Portfolio; rendere distinguibili errori di caricamento e contenuti assenti.
2. **Orientare:** rendere compatta la pagina d'ingresso, usare nomi coerenti e una testata comune; portare il compito della pagina prima dei collegamenti accessori.
3. **Semplificare l'azione:** separare consultazione e modifica, rendere progressivi i moduli, accompagnare pianificazione e condivisione con azioni esplicite.

Non occorre fondere tutti gli strumenti o introdurre un percorso obbligatorio. Occorre rendere chiaro **quando usare ciascuno strumento, che cosa viene salvato e chi può vederlo**.

### Metodo e limiti

- Lettura della mappa Graphify esistente, poi verifica dei sorgenti attuali. La mappa contiene riferimenti meno recenti del codice: è stata usata per orientare la ricerca, non come prova del comportamento.
- Navigazione Chromium contro il frontend locale già in esecuzione, `http://127.0.0.1:3000`, intercettando tutte le richieste `/api/**` con dati sintetici. Nessuna scrittura ai dati reali e nessuna chiamata di generazione AI reale.
- **36 visite iniziali:** 18 rotte a 1440 × 900 e 390 × 900; stato prevalentemente vuoto, Taccuino con un contenuto di esempio.
- **10 verifiche con dati/interazioni:** Obiettivi, Libretto, Portfolio, Assegnazioni, Classi alle due larghezze.
- **6 verifiche di errore:** risposte 503 simulate su Taccuino, Libretto, Compilazioni, Portfolio, Classi e stato Telegram, a 390 px.
- Le esecuzioni finali non hanno prodotto errori JavaScript non gestiti né overflow orizzontale della pagina nei casi osservati. Questo non dimostra che tutti gli stati o tutti i contenuti siano accessibili.
- Due errori iniziali dipendevano da fixture incomplete di sintesi integrata e preset Tavolo: corretti e rieseguiti; **non sono difetti attribuiti al prodotto**.
- Non eseguiti: sessione pubblica autenticata SSO, dispositivi fisici, lettore di schermo, misure sistematiche del contrasto, intero ciclo AI/PDF/Telegram, tutte le combinazioni di temi, lingue e ruoli. Gli stati interni non riprodotti sono indicati come evidenza da codice o verifiche future.

Legenda: **B** = comportamento osservato nel browser con fixture; **C** = riscontro nei sorgenti; **H** = ipotesi di usabilità da validare con persone. Le difficoltà cognitive non sono misure di abbandono o risultati di un test utenti.

### Elementi da conservare

- Le pagine sono già separate, con gruppi tematici nell'ingresso: non si propone di ricreare una schermata unica con tutti i moduli.
- Sono già presenti collegamenti tra obiettivi, attività, calendario, Portfolio e assegnazioni.
- Il Taccuino distingue salvataggio automatico di sicurezza e **Salva versione** nella cronologia. Non trasformare ogni battitura in una versione.
- Gli strumenti visuali dispongono già di controlli a pulsante/selettore: non introdurre interazioni utilizzabili solo trascinando.
- Portfolio dispone già di apertura immagini a schermo intero; diverse operazioni hanno conferme e protezioni dai conflitti. Correggere le lacune senza rimuovere queste protezioni.
- Conservare l'identità di `docs/design.md`: petrol, ocra e neutri, immagini degli strumenti già disponibili, animazioni contenute. Non assegnare un nuovo colore a ogni strumento.

## 2. Inventario e funzione delle pagine

| Rotta attuale | Compito da rendere riconoscibile | Copertura di questo audit |
| --- | --- | --- |
| `/profilo` | Ritrovare un lavoro e scegliere lo strumento | B: desktop/mobile, ingresso vuoto |
| `/profilo/obiettivi` | Scegliere un obiettivo personale e il prossimo passo | B: vuoto e obiettivo esistente; C: catalogo, creazione, collegamenti |
| `/profilo/taccuino` | Raccontare il proprio contesto | B: lettura ed errore; C: modifica, sicurezza e versioni |
| `/profilo/cambiamenti` | Confrontare versioni e riflettere | B: stato vuoto; C: confronto e dialogo AI |
| `/profilo/libretto` | Documentare una prova e rivederne l'esito | B: vuoto, schede compilabili, cambio scheda ed errore |
| `/profilo/compilazioni` | Ritrovare risultati e conversazioni | B: vuoto ed errore; C: risultato, grafico e conversazione |
| `/profilo/azioni` | Organizzare attività da provare, in corso e provate | B: ingresso; C: creazione, stati e salvataggio |
| `/profilo/timeline` | Pianificare tappe e raccontare esperienze | B: ingresso; C: date, collegamenti e copia nel Portfolio |
| `/profilo/portfolio` | Conservare e ritrovare lavori | B: vuoto, apertura/chiusura modulo ed errore; C: immagini e collegamenti |
| `/profilo/carte` | Raggruppare idee e riflessioni | B: ingresso; C: mazzi, colonne e spostamenti |
| `/profilo/confronto` | Confrontare alternative usando criteri personali | B: ingresso; C: matrice e scelta |
| `/profilo/pqbl` | Studiare un PDF attraverso domande e feedback | B: caricamento iniziale; C: ripresa e fasi successive |
| `/profilo/flashcard` | Memorizzare con carte fronte/retro | B: ingresso; C: creazione, studio e salvataggio |
| `/profilo/tavolo` | Aprire o creare un diagramma di lavoro | B: ingresso; C: creazione e passaggio a `/tavolo/[id]` |
| `/profilo/assegnazioni` | Comprendere una proposta, lavorarci e restituire | B: vuoto e assegnazione non pianificata; C: diario, invio e feedback |
| `/profilo/classi` | Entrare in un gruppo e capire le conseguenze | B: vuoto, gruppo presente, uscita ed errore |
| `/profilo/orientamento` | Trovare persone e appuntamenti dell'istituto | B: vuoto; C: filtri, contatti ed errore |
| `/profilo/telegram` | Collegare un canale aggiuntivo | B: scollegato ed errore; C: codice, collegamento e scollegamento |

## 3. Attriti rilevati e modifiche proposte

Priorità: **P0** protezione del lavoro e rappresentazione corretta degli errori; **P1** ostacolo frequente al compito; **P2** chiarezza e rifinitura. Non sono classificazioni di vulnerabilità di sicurezza.

### Protezione del lavoro e fiducia

| ID / priorità | Before — situazione attuale | After — modifica proposta | Why — effetto sull'interazione | Evidenza |
| --- | --- | --- | --- | --- |
| F01 · P0 | Nel Libretto si può scrivere un titolo, cambiare scheda e tornare: il testo modificato è perso senza conferma. Cambiare strumento reimposta anch'esso il modulo. | Bozza recuperabile per scheda; intercettare cambio scheda, strumento e uscita. Distinguere bozza e salvataggio definitivo. | Lo studente può esplorare senza perdere il lavoro. | B: titolo tornato a «Scheda uno», zero conferme; C: S04 |
| F02 · P0 | Nel Portfolio, la X chiude il modulo con `setForm(null)`; riaprendo, il titolo appena scritto è vuoto. «Nuovo lavoro» può sostituire il modulo aperto. | Protezione della bozza e scelta «Continua a modificare / Scarta bozza»; recupero dopo errore o uscita. | Chiudere un pannello non equivale intuitivamente a cancellare il testo. | B: titolo vuoto alla riapertura, zero conferme; C: S05 |
| F03 · P0 | Risposte 503 producono «nessun lavoro», «nessun questionario», nessuna classe o nessuna scheda. Il Taccuino può scomparire. Telegram può risultare «non collegato». | Stati distinti: caricamento, vuoto, errore, dati precedenti. Errore locale con «Riprova» e contenuti già caricati conservati. | Non far credere che i dati siano spariti o che sia necessario ricrearli. | B: sei errori simulati; C: S01/S03/S04/S05/S10/S11 |
| F04 · P1 | Nelle Classi il piccolo pulsante di uscita invia subito DELETE, senza spiegare le conseguenze o richiedere conferma; l'errore è silenzioso. | «Lascia gruppo» nel menu azioni; conferma con nome del gruppo, conseguenze e recupero possibile; stato di invio ed errore. | Evitare l'uscita accidentale e rendere leggibile il risultato. | B: DELETE immediata alle due larghezze, zero conferme; C: S10 |
| F05 · P1 | Il salvataggio cambia per strumento: Taccuino automatico più versioni; visuali manuale globale; Flashcard automatico; Libretto manuale. | Lessico comune per bozza, modifiche e versione; indicatore compatto in spazio fisso. Conservare i contratti specifici e spiegarli vicino all'azione. | Evitare che «ho aggiunto» sia interpretato come «è già salvato». | B/C: S03/S04/S07/S13 |
| F06 · P0 | Le guardie degli Obiettivi considerano il modulo obiettivo, ma non il testo ancora nella sotto-form di una nuova attività. Nei visuali `dirty` confronta il workspace, non tutti i campi di creazione non ancora aggiunti. | Includere i sotto-moduli nelle protezioni di uscita e recupero; testare anche il tasto Indietro del browser. | Anche una frase non ancora trasformata in attività è lavoro dell'utente. | C: S02/S07; riproduzione dedicata da aggiungere |

### Orientamento e gerarchia

| ID / priorità | Before — situazione attuale | After — modifica proposta | Why — effetto sull'interazione | Evidenza |
| --- | --- | --- | --- | --- |
| F07 · P1 | L'ingresso mostra dati account, riepilogo e 15 grandi schede. Altezza a vuoto: 1.971 px desktop e 3.589 px mobile. | Account nel menu; riepilogo breve e gruppi di collegamenti compatti, con nome e funzione. | Ridurre lo scorrimento per ritrovare strumenti frequenti. | B: S01; H: vantaggio da misurare |
| F08 · P1 | «Su di me», «Taccuino», «Libretto», «Cambiamenti», «Compilazioni» richiedono di imparare un vocabolario. Alcune descrizioni spiegano il funzionamento interno: «non cambia quando scegli una compilazione». | Nomi stabili con una frase d'uso: «Taccuino · Il mio contesto», «Risultati e conversazioni», «Libretto · Le mie prove». | Far scegliere in base al bisogno, senza conoscere il modello dei dati. | B/C: S01 e testi i18n; H |
| F09 · P1 | Nei visuali si sovrappongono testata, grande riquadro «Obiettivi collegati», testata interna e aiuto. Bacheca: titolo ripetuto tre volte. | Una testata; contenuto operativo subito sotto; collegamenti obiettivi in una riga secondaria espandibile. | Liberare la prima schermata e dare una sola gerarchia. | B: screenshot Bacheca; C: S06/S07 |
| F10 · P1 | I ritorni compaiono in posizioni diverse; il `backHref` della testata è un fallback della cronologia, non sempre una destinazione fissa. Manca un accesso uniforme alle altre pagine personali. | «Area personale» come link stabile; «Indietro» solo quando indica la cronologia. Selettore «Vai a…» comune, preservando filtri e posizione. | Distinguere la destinazione dal comportamento del browser. | B/C: S06/S16 |
| F11 · P2 | Le priorità nell'ingresso sono limitate a pochi obiettivi/assegnazioni; una prossima attività conduce all'obiettivo, non direttamente all'attività. Il feedback già presente continua a precedere le altre assegnazioni. | Collegamenti al contenuto preciso; ordinamento trasparente per scadenza/stato. «Feedback disponibile» senza inventare uno stato «non letto». | Rendere utile il riepilogo senza creare una seconda lista completa. | C: JourneyOverview e AssignmentJourney, S02/S09 |

### Scrivere, riflettere e documentare

| ID / priorità | Before — situazione attuale | After — modifica proposta | Why — effetto sull'interazione | Evidenza |
| --- | --- | --- | --- | --- |
| F12 · P1 | Un obiettivo esistente si apre già come modulo con motivazione, criteri, riflessione, data, priorità, stato e condivisione; collegamenti e nuova attività vengono dopo. Un solo obiettivo occupa 1.906 px su mobile nella fixture. | Scheda di lettura con prossimo passo; modifica esplicita. Creazione breve: titolo, motivazione facoltativa, dettagli progressivi. | Non far sembrare che occorra compilare tutto per cominciare. | B/C: S02; H |
| F13 · P1 | Il collegamento a un contenuto si fa soprattutto negli Obiettivi, con un select misto di tipi diversi. Modificare il modulo obiettivo disabilita il collegamento finché non si salva. | «Collega a un obiettivo» anche dal contenuto; selezione con ricerca/tipo; salvataggio e collegamento come operazioni distinte e protette. | Evitare il giro di pagine e la perdita del contesto di lavoro. | C: S02/S05/S06 |
| F14 · P1 | Il Libretto espone insieme preparazione, obiettivo, strategia, date, impegno, soddisfazione, difficoltà, scoperte, biografia e osservazioni. Una scheda sintetica produce 3.112 px su mobile. | Sezioni «Preparo / Provo / Rivedo», apribili liberamente; salvataggio raggiungibile. Distinguere pianificazione e bilancio finale. | Ridurre il carico iniziale e rispettare il momento dell'attività. | B/C: S04; H |
| F15 · P1 | Il vuoto del Libretto invita a «compila e premi Salva», ma il modulo è nascosto. «Nuova scheda» persiste immediatamente una scheda con titolo automatico. | Un solo invito «Crea la prima scheda»; prima bozza locale, persistenza esplicita o bozza dichiarata. | Evitare istruzioni impossibili e schede vuote create involontariamente. | B/C: S04 |
| F16 · P1 | «Obiettivo» e riflessioni compaiono in Obiettivi, Libretto, Bacheca e Diario. Alcuni collegamenti esistono, ma il rapporto fra testi non è evidente. | Spiegare la funzione: obiettivo personale, intenzione della singola prova, riflessione della tappa. Collegare, senza sincronizzare o sostituire testi autonomi di nascosto. | Evitare duplicazioni e aspettative di aggiornamento automatico. | C: S02/S04/S07/S08; H |
| F17 · P2 | «Versioni salvate» del Taccuino e pagina «Cambiamenti» sono ingressi separati; Cambiamenti include anche riflessioni sui libretti e una chat. | Versioni con «Confronta»; pagina Cambiamenti con sorgente esplicita e riflessione personale prima dell'opzione AI. | Rendere riconoscibile il legame fra versione, confronto e commento. | B: ingressi; C: S03/S14 |
| F18 · P2 | Per allegare immagini a un nuovo lavoro bisogna salvarlo prima; l'editor resta già aperto dopo il salvataggio. Titoli/descrizioni della pagina e della card Portfolio si ripetono. | Rendere espliciti i due momenti «Crea lavoro → Aggiungi immagini», conservando l'editor aperto; valutare una coda locale immagini solo se utile. Una sola intestazione. | Spiegare il prerequisito senza far sembrare l'aggiunta immagini una funzione non disponibile. | C: S05; B: intestazioni; H: semplificazione da validare |
| F19 · P2 | La ricerca Portfolio avvia richieste a ogni carattere e non scarta esplicitamente risposte superate. | Breve debounce, annullamento/identificazione delle richieste, elenco stabile e stato di caricamento locale. | Una risposta lenta non deve sostituire i risultati della ricerca più recente. | C: S05; rischio di gara da riprodurre con latenza |
| F20 · P1 | Compilazioni ripete testata e selezione; il menu include un frammento di UUID. Risultati, grafico e conversazione sono accodati; errori di sintesi/conversazione non hanno un recupero locale esplicito. | Lista con strumento e data; dettaglio diviso in «Sintesi / Risultati / Conversazione»; ID solo nei dettagli di supporto. Errore e riprova per ciascuna sezione. | Ritrovare una compilazione senza leggere una pagina intera o interpretare codici tecnici. | B: stato vuoto; C: S01 |

### Lavorare con strumenti e persone

| ID / priorità | Before — situazione attuale | After — modifica proposta | Why — effetto sull'interazione | Evidenza |
| --- | --- | --- | --- | --- |
| F21 · P1 | Bacheca e Timeline sono pagine distinte dello stesso workspace. La Bacheca mette i titoli direttamente in input e salva l'intero insieme a fine pagina. | Schede leggibili con modifica esplicita; dettaglio attività condiviso dai due accessi; stato e salvataggio visibili. | Far riconoscere la stessa attività e distinguere lettura da editing. | B/C: S07/S08 |
| F22 · P1 | La Timeline concentra calendario, creazione, dettagli, attività collegate, Portfolio e copia di tappe. Anche un calendario vuoto precede la creazione. | Se vuota, invito diretto a creare; altrimenti vista Elenco/Calendario. Dettaglio della tappa separato; copia nel Portfolio come azione secondaria con anteprima. | Evitare un pannello operativo per ogni possibile compito. | B/C: S08; H |
| F23 · P2 | Carte da ordinare e Flashcard usano entrambe mazzi/carte, ma hanno fini differenti. Nelle carte alcuni rinomina usano prompt nativi; creare e salvare sono due azioni. | Spiegare «raggruppa idee» e «memorizza risposte»; rinomina inline con focus e annulla; stato di salvataggio uniforme. | Evitare scelta dello strumento sbagliato e interazioni imprevedibili. | B/C: S07/S13; H |
| F24 · P1 | Confronto presenta già criteri, scelta finale e dubbi quando non esistono ancora alternative. | Sequenza visiva «Alternative → Criteri → Confronto → Scelta», liberamente rivedibile; campi successivi solo quando pertinenti. | Rendere comprensibile l'ordine del lavoro senza imporre un wizard rigido. | B/C: S07 |
| F25 · P1 | pQBL dice «PDF o Immagine», mentre input e backend accettano PDF; mostra anche «PDF con testo selezionabile». | Testo coerente «Carica un PDF» e limiti prima della scelta; errore comprensibile per formato errato. | Non invitare a un'operazione che il servizio rifiuterà. | B/C: S12, backend `routes/pqbl.py:323` |
| F26 · P2 | Tavolo mette scelta counselor, provenienza del modello, guida, creazione manuale e composizione AI prima dell'elenco; le bozze non nominate si ritrovano nella conversazione di origine. | Tavoli salvati prima; «Nuovo tavolo» e «Crea con AI» distinti; nomina/salvataggio spiegati all'uscita. Dettagli del modello contestuali all'uso AI. | Ritrovare il proprio lavoro senza riconfigurare ogni volta lo strumento. | B/C: S15; H |
| F27 · P1 | Assegnazioni espone descrizioni complete in sequenza senza filtri; «Lavora» apre un blocco che il medesimo pulsante non richiude. | Lista breve con stato, scadenza e mittente; aprire un solo dettaglio; filtri per gruppo, richiesta/proposta e stato. | Rendere gestibili molte assegnazioni, senza una pagina molto lunga. | B/C: S09 |
| F28 · P1 | Prima di pianificare non si vede la restituzione. Pianificare crea attività e tappa: anche chi ha già svolto il lavoro deve attraversare quel passaggio. È un vincolo anche del backend. | Breve termine: spiegare il passaggio e i suoi effetti. Successivamente offrire «Ho già svolto l'attività» con flusso esplicito e contratto backend dedicato. | Non confondere la consegna con la pianificazione personale. | B/C: S09, backend `_edit` richiede un lavoro già creato |
| F29 · P1 | Selezionare un lavoro Portfolio per la restituzione invia titolo e descrizione, non immagini o link privati. L'anteprima esiste, ma «lavoro del Portfolio» può suggerire un allegato completo. | Chiamarlo «Aggiungi titolo e descrizione dal Portfolio»; anteprima con destinatario e contenuto esatto. | Evitare che lo studente creda di avere inviato anche un'immagine. | C: S09 e backend `assignment_work.py:182` |
| F30 · P1 | I messaggi generali del docente si trovano nelle Classi, il feedback sulle restituzioni dentro le Assegnazioni. L'iscrizione ha effetti di visibilità più ampi della singola restituzione. | Collegamenti contestuali fra classe, assegnazione e messaggio; riepilogo «Chi vede cosa» vicino alle operazioni rilevanti. | La presenza di una classe non deve essere confusa con l'invio di un lavoro. | C: S01/S09/S10 e backend gruppi |
| F31 · P2 | Orientamento dà un errore testuale senza riprova; il vuoto può dipendere dall'istituto o dall'assenza di contenuti. | Stati distinti «Scegli istituto / Nessun appuntamento / Nessun risultato / Errore» con azione utile; contatti e date distinguibili. | Evitare pagine che non spiegano come proseguire. | B: vuoto; C: S17 |
| F32 · P1 | Telegram genera codice e deep link, ma non aggiorna automaticamente lo stato dopo il ritorno dal bot; la scadenza è solo nelle istruzioni. | Passi «Apri Telegram → Conferma → Verifica collegamento», controllo al ritorno in primo piano, riprova e codice scaduto. Conservare il deep link esistente. | Far capire se l'operazione fuori dall'app è riuscita. | C: S11; B: ingresso |
| F33 · P1 | La X del modulo Portfolio e l'uscita dalla classe hanno bersagli molto piccoli; alcuni campi del Libretto, come la strategia, hanno testo vicino ma non un'associazione label completa. | Area interattiva di progetto almeno 44 × 44 per icone; label programmatiche, focus visibile, annunci locali di stato. | Migliorare tocco e uso con tastiera/tecnologie assistive. | B: geometria di alcuni controlli; C: S04/S05/S10. Non è una certificazione di accessibilità |
| F34 · P2 | Le date nelle assegnazioni/obiettivi possono apparire come `2026-09-30`; altrove sono localizzate. Titoli e maiuscole non sono uniformi. | Date localizzate, etichette coerenti e messaggi contestuali in tutte le sei lingue. | Ridurre lo sforzo di lettura e i cambi di registro. | B/C: S01/S02/S09 |

## 4. Architettura proposta e regole comuni

### Navigazione: mantenere le rotte, ridurre l'ingombro

**Punto 0.1 — approvato il 23 settembre 2026.** La struttura, i nomi e le descrizioni seguenti registrano la decisione concordata con l'utente. L'approvazione riguarda la nomenclatura e il raggruppamento, non il layout o l'implementazione dell'interfaccia.

La pagina d'ingresso continua a dare accesso a tutti gli strumenti. Le categorie sono titoli di raggruppamento, **non nuove pagine obbligatorie**. Conservare gli URL esistenti e i link con identificativi, anche se cambia il nome visibile.

```text
Area personale
|
+-- Il mio percorso
|   +-- Obiettivi
|   +-- Attivita                 /profilo/azioni
|   +-- Calendario e diario      /profilo/timeline
|
+-- Conoscermi e riflettere
|   +-- Taccuino
|   +-- Libretto
|   +-- Cambiamenti
|   +-- Risultati e conversazioni
|
+-- Studiare e ragionare
|   +-- Studiare da un PDF
|   +-- Flashcard
|   +-- Carte da ordinare
|   +-- Confrontare alternative
|   +-- Tavolo
|
+-- I miei lavori
|   +-- Portfolio
|
+-- Persone e supporto
    +-- Assegnazioni
    +-- Gruppi e classi
    +-- Orientamento
    +-- Telegram
```

#### Nomi e descrizioni approvati

I nomi sono gli stessi nell'ingresso, nelle testate e nel futuro selettore di navigazione. Le descrizioni accompagnano i nomi nell'ingresso. Gli identificativi tecnici e le rotte restano invariati.

| Gruppo | Nome | Descrizione nell'ingresso | Rotta esistente |
| --- | --- | --- | --- |
| Il mio percorso | Obiettivi | Scegli che cosa vuoi raggiungere e il prossimo passo. | `/profilo/obiettivi` |
| Il mio percorso | Attività | Organizza quello che vuoi fare, stai facendo o hai provato. | `/profilo/azioni` |
| Il mio percorso | Calendario e diario | Pianifica le tappe e racconta le esperienze. | `/profilo/timeline` |
| Conoscermi e riflettere | Taccuino | Racconta il tuo contesto, gli interessi e il modo di apprendere. | `/profilo/taccuino` |
| Conoscermi e riflettere | Libretto | Prepara una prova e rifletti su come è andata. | `/profilo/libretto` |
| Conoscermi e riflettere | Cambiamenti | Confronta ciò che hai scritto e rifletti sui cambiamenti. | `/profilo/cambiamenti` |
| Conoscermi e riflettere | Risultati e conversazioni | Ritrova i risultati dei questionari e i dialoghi collegati. | `/profilo/compilazioni` |
| Studiare e ragionare | Studiare da un PDF | Lavora sul tuo materiale attraverso domande e feedback. | `/profilo/pqbl` |
| Studiare e ragionare | Flashcard | Memorizza e ripassa con carte domanda e risposta. | `/profilo/flashcard` |
| Studiare e ragionare | Carte da ordinare | Raggruppa idee e riflessioni. | `/profilo/carte` |
| Studiare e ragionare | Confrontare alternative | Valuta possibilità diverse secondo i tuoi criteri. | `/profilo/confronto` |
| Studiare e ragionare | Tavolo | Costruisci e rivedi diagrammi di lavoro. | `/profilo/tavolo` |
| I miei lavori | Portfolio | Conserva e ritrova i tuoi lavori. | `/profilo/portfolio` |
| Persone e supporto | Assegnazioni | Ritrova le attività dei docenti, prepara le restituzioni e leggi i feedback. | `/profilo/assegnazioni` |
| Persone e supporto | Gruppi e classi | Gestisci le iscrizioni e leggi i messaggi dei docenti. | `/profilo/classi` |
| Persone e supporto | Orientamento | Trova contatti e appuntamenti del tuo istituto. | `/profilo/orientamento` |
| Persone e supporto | Telegram | Collega il tuo account per usare anche questo canale. | `/profilo/telegram` |

Decisioni di nomenclatura e raggruppamento:

- **Compilazioni → Risultati e conversazioni:** il nome esplicita i contenuti disponibili.
- **Cambiamenti è una voce autonoma** dentro «Conoscermi e riflettere», allo stesso livello di Taccuino e Libretto: riguarda entrambe le sorgenti. I collegamenti contestuali dalle versioni del Taccuino restano utili.
- **Portfolio resta nel gruppo autonomo «I miei lavori»**, anche se è l'unica voce: la raccolta degli elaborati si distingue dalla pianificazione delle attività.
- Conservare i nomi caratteristici **Taccuino, Libretto e Tavolo**, chiarendone la funzione attraverso la descrizione.

Usare le **immagini già disponibili e il nome** per riconoscere gli strumenti, come approvato in 0.2. Le icone restano adatte alle azioni convenzionali e secondarie, con nome accessibile e area di tocco sufficiente; non sostituiscono le immagini degli strumenti.

### Testata e navigazione comune — punto 0.3

**Revisione successiva alla prova nel tunnel:** l’utente richiede di eliminare
«Vai a…» a destra e mantenere soltanto «Area personale» a sinistra. Questa
indicazione sostituisce il pannello descritto nello schema storico qui sotto.
La nuova testata conserva immagine, titolo e descrizione.

**Decisione successiva dell’utente:** le categorie non sono fissate centralmente.
Ogni istituto decide le proprie categorie e i docenti di quell’istituto le
amministrano. Le cinque etichette ipotizzate in precedenza non sono una tassonomia
approvata e non vanno inserite automaticamente. «Metodo di studio» può essere
scelto dall’istituto. La nuova gestione è descritta nel punto 0.3.2 seguente.

```text
← Area personale

[immagine] Orientamento
           Descrizione della pagina
```

**Stato: struttura approvata; implementazione pilota in Orientamento, distribuita in produzione il 23 settembre 2026.** La struttura si applica alle sottopagine dell’Area personale. L’ingresso `/profilo`, appena approvato e pubblicato, conserva i cinque gruppi e non riceve un secondo elenco di navigazione. La testata globale con account, lingua e altre azioni conserva le funzioni attuali.

#### 0.3.2 — Categorie dell’istituto gestite dai suoi docenti

**Stato: requisito approvato; l’amministratore associa i docenti all’istituto. Primo passo 0.3.2.1 implementato: API, controlli e scheda amministrativa approvata. Passi 0.3.2.2 e 0.3.2.3 distribuiti in produzione: categorie, associazioni ai contenuti e filtri studenti.**

Obiettivo: l’istituto stabilisce le categorie con cui presentare i propri contatti
e appuntamenti di Orientamento. I suoi docenti possono crearle, rinominarle,
ordinarle e archiviarle. Gli studenti le consultano nella pagina Orientamento.
Non si trasformano automaticamente in nuove attività o strumenti personali.

Riscontro tecnico:

- `backend/referral_needs.py` contiene oggi un vocabolario globale. Serve anche
  alla selezione dei contatti nella conversazione; cambiarlo in etichette libere
  altererebbe quel comportamento senza una corrispondenza definita.
- `backend/routes/orientation_referrals.py` gestisce contatti e appuntamenti
  tramite permessi amministrativi. La directory dello studente usa l’istituto
  risolto dal taccuino o dalle classi (`referral_scope.py`).
- `get_current_plan_manager` riconosce il ruolo docente, non l’appartenenza a un
  istituto. `StudentGroup.institution_id` è modificabile dal docente che gestisce
  la classe: non può diventare da solo un’autorizzazione sull’intero istituto.

Gerarchia degli interventi, da chiudere uno alla volta:

1. **0.3.2.1 — Appartenenza docente–istituto.** Registrare un’associazione esplicita
   e revocabile. Ogni richiesta di gestione verifica sul server ruolo docente,
   istituto attivo e associazione valida. La scelta dell’istituto nel taccuino,
   la creazione di una classe o il nome della scuola non conferiscono permessi.
   Decisione dell’utente: l’associazione e la revoca spettano all’amministratore.
   La gestione non viene delegata a un referente.
2. **0.3.2.2 — Gestione delle categorie.** Nell’Area docente, mostrare soltanto gli
   istituti per cui il docente è abilitato. Per ogni istituto, elenco condiviso
   con nome, descrizione facoltativa, ordine e stato attivo/archiviato. Nomi
   distinti nello stesso istituto; identificativi stabili per rinominare senza
   perdere i collegamenti. Salvataggio esplicito, autore e data della modifica;
   controllo delle revisioni per non sovrascrivere il lavoro di un altro docente.
3. **0.3.2.3 — Associazione ai contenuti e lettura studente.** Consentire ai docenti
   abilitati di associare le categorie ai contatti/appuntamenti del proprio
   istituto, senza estendere implicitamente la modifica o certificazione dei
   contenuti. Le categorie pubbliche appartengono all’istituto dei contenuti;
   eventuali più istituti restano riconoscibili. Il filtro studente usa le
   categorie configurate, senza riproporre «Scelta del percorso» come etichetta
   obbligatoria. Le categorie senza contenuti non producono filtri inutili.

Le categorie dell’istituto sono un’entità distinta dai bisogni globali usati dal
retrieval in chat. Non cancellare i bisogni o riclassificare automaticamente dati
esistenti; la gestione delle categorie non modifica autonomamente i prompt.
Gli eventuali contenuti nazionali restano consultabili senza attribuirli
artificialmente a una categoria di un istituto. Senza categorie configurate,
mostrare i contenuti senza filtro e spiegare ai docenti come aggiungerle.

Schema proposto per la gestione:

```text
AREA DOCENTE
  Orientamento dell’istituto
  Istituto: [solo istituti per cui sono abilitato v]

  Categorie                         [+ Nuova categoria]
  Nome scelto dai docenti            [Modifica] [Altre azioni]
  Un’altra categoria                [Modifica] [Altre azioni]

  Modifica categoria
  Nome          [________________________________]
  Descrizione   [________________________________]
                         [Annulla] [Salva]
```

Schema della lettura studente:

```text
← Area personale
[immagine] Orientamento
           Descrizione

Istituto: nome dell’istituto
[Tutti] [Categoria dell’istituto] [Altra categoria]
Contatti e appuntamenti pertinenti
```

Verifiche richieste: docente abilitato ammesso; docente di altro istituto,
studente e docente con associazione revocata respinti; isolamento tra istituti
anche nelle associazioni categoria–contenuto; rinomina senza perdita dei
collegamenti; archivio senza cancellazione dei contenuti; conflitti tra docenti
rilevati; lettura senza categorie e con più istituti; interfaccia nelle sei
lingue e a 320/390/1440 px. Le categorie scritte dall’istituto restano contenuti
autoriali: eventuali traduzioni devono essere esplicite, non nomi inventati.

#### 0.3.2.2 — Gestione delle categorie da parte dei docenti

**Stato: proposta approvata dall’utente; distribuita in produzione il 23 settembre 2026.**

**Obiettivo dell’intervento:** permettere ai docenti già associati a un
istituto di definire insieme il suo elenco di categorie. Le categorie sono
scelte dall’istituto: nessun elenco precompilato obbligatorio, nessuna attribuzione
automatica dei nomi a Pellerey o Savickas. La descrizione permette ai docenti di
esplicitare il significato educativo condiviso di ogni categoria.

##### A. Ingresso e istituto

Nell’Area docente, vicino alla gestione dei gruppi e delle classi, aggiungere
un collegamento compatto **Orientamento dell’istituto**, accompagnato dalla
stessa immagine Bussola già disponibile. Apre `/docente/orientamento`, una pagina
dedicata, per mantenere leggibile la pagina docente già ricca di sezioni.

- Un solo istituto abilitato: mostrarne il nome, senza selettore inutile.
- Più istituti abilitati: selettore con i soli istituti restituiti dalle API
  delle associazioni; nessuna ricerca nell’anagrafica completa.
- Nessun istituto: «Non sei ancora associato a un istituto. L’amministratore
  può abilitarti.» Nessun comando per autoassegnarsi un istituto.

##### B. Elenco e comandi

```text
← Area docente

[immagine] Orientamento dell’istituto
           Categorie condivise dai docenti dell’istituto

Istituto: nome dell’istituto
          [selettore solo se più di uno]

Categorie                                  [+ Nuova categoria]

Nome scelto dai docenti                                     [⋯]
Breve descrizione, se presente

Un’altra categoria                                         [⋯]
Breve descrizione, se presente

[Mostra archiviate (2)]
```

Una riga per categoria, ordine uguale per tutti i docenti. Il menu a tre punti
raccoglie **Modifica**, **Sposta sopra**, **Sposta sotto**, **Archivia**. Le azioni
di spostamento non disponibili alla prima/ultima posizione sono disabilitate.
Le archiviate sono raccolte in una sezione richiudibile e offrono **Ripristina**.
Non introdurre trascinamento come unico modo per riordinare.

L’elenco inizialmente vuoto spiega: «Non avete ancora definito le categorie
dell’istituto. Aggiungete la prima categoria.» Il pulsante di creazione resta
unico. Nessun dato dimostrativo viene salvato automaticamente.

##### C. Creazione e modifica

Aprire un solo modulo alla volta nella stessa pagina, sopra l’elenco:

```text
Nuova categoria / Modifica categoria

Nome *                [________________________________]
Descrizione           [________________________________]
                      [________________________________]
                      facoltativa

                                      [Annulla] [Salva]
```

- Nome obbligatorio, descrizione facoltativa; nessuna selezione da una tassonomia
  centrale. I nomi devono essere distinguibili nello stesso istituto anche
  dopo aver ignorato differenze di maiuscole e spazi esterni.
- Salvataggio esplicito. Errore di rete: mantenere il testo e offrire la riprova.
- Modifica di una categoria archiviata: ripristinarla esplicitamente, senza
  creare una seconda categoria con lo stesso nome.
- Archivio senza cancellazione definitiva: preservare identità e futuri
  collegamenti a contatti e appuntamenti. Ripristino in fondo all’elenco attivo.
- Con testo non salvato, cambio istituto, apertura di un’altra modifica o uscita
  chiedono se restare oppure scartare. Il ritorno «Area docente» usa la stessa
  protezione. Nessun salvataggio implicito al cambio di pagina.
- Tutti i docenti abilitati dello stesso istituto lavorano sul medesimo elenco;
  nessuna nuova approvazione amministrativa per le singole categorie.
- Una modifica intervenuta da un altro docente non viene sovrascritta: avvisare,
  conservare il testo locale e consentire di ricaricare i dati prima di riprovare.
  Registrare autore e data dell’ultimo aggiornamento.
- I controlli sono tradotti nelle sei lingue. Nomi e descrizioni scelti dai docenti
  conservano la lingua in cui sono stati scritti; niente traduzioni automatiche
  presentate come decisioni dell’istituto.

##### D. Chiusura dell’intervento

Il passo 0.3.2.2 è completato quando due docenti abilitati possono gestire lo
stesso elenco, mentre docenti estranei e studenti non possono modificarlo;
revoche e istituti disattivati sono rispettati anche durante una pagina aperta.
Verificare creazione, duplicati, modifica, riordino, archivio/ripristino,
conflitti, errori con testo conservato e protezione delle modifiche non salvate;
controllare 320/390/1440 px, tastiera e sei lingue.

Il passo **0.3.2.3**, inizialmente successivo, è ora implementato: collega le
categorie ai contatti e agli appuntamenti e le mostra come filtri studenti.

#### 0.3.2.3 — Categorie dei contenuti e filtri studenti

**Stato: struttura confermata dall’utente; distribuita in produzione il 23 settembre 2026.**
Il punto 0.3.2.2 è completato. Questo intervento collega il suo elenco ai
contenuti già presenti, con due superfici coordinate e una sola consegna.

##### A. Assegnazione da parte dei docenti

Nella stessa pagina `/docente/orientamento`, sotto l’elenco delle categorie,
aggiungere **Contatti e appuntamenti**, con due sezioni richiudibili.
Mostrare i contenuti attivi e certificati dell’istituto selezionato; per gli
appuntamenti escludere quelli già conclusi. Nessun accesso alle bozze tramite
questa nuova funzione. Il docente assegna zero, una o più categorie del proprio
istituto; titolo, recapiti, date e certificazione restano gestiti come oggi.

```text
← Area docente
[immagine Bussola] Orientamento dell’istituto
Istituto: nome / selettore già presente

Categorie                         [+ Nuova categoria]
... elenco già realizzato ...

Contatti e appuntamenti
▸ Contatti (3)
▾ Appuntamenti (2)
  Titolo dell’appuntamento                    [⋯]
  Data · categorie assegnate / Nessuna categoria

  Categorie dell’appuntamento
  [✓] Nome scelto dall’istituto
  [ ] Altro nome scelto dall’istituto
                            [Annulla] [Salva]
```

Il menu a tre punti offre **Assegna categorie**. Un solo modulo di modifica
aperto nell’intera pagina; cambio contenuto, istituto o uscita conservano la
protezione delle bozze. Salvataggio esplicito, errore con selezione conservata,
conflitto con ricarica prima del nuovo tentativo. Se non ci sono categorie
attive, spiegare che vanno create nell’elenco sopra, senza comandi inutili.
Le associazioni archiviate restano registrate ma non selezionabili; un
salvataggio delle categorie attive non deve cancellarle implicitamente.

##### B. Consultazione da parte degli studenti

Sostituire i filtri basati su `needs` in `OrientationDirectoryCard` con le
categorie attive associate ai contenuti effettivamente visibili. Restano i
controlli attuali su certificazione, stato, pubblico, lingua e scadenza.

```text
← Area personale
[immagine esistente] Orientamento

Istituto: nome dell’istituto
[Tutti] [Categoria A] [Categoria B]

Appuntamenti
... contenuti corrispondenti ...
Contatti
... contenuti corrispondenti ...

Risorse nazionali
... contatti e appuntamenti nazionali disponibili ...
```

- Le etichette A/B sono segnaposto, non nuove categorie predefinite.
- Una categoria filtra insieme contatti e appuntamenti; **Tutti** include anche
  i contenuti senza categoria. Senza categorie pertinenti il filtro non appare.
- Con più istituti risolti per lo studente, mostrare blocchi distinti con nome e
  filtri propri. Categorie omonime di istituti diversi restano separate.
- Le risorse nazionali sono mostrate una sola volta, fuori dai filtri locali;
  non vengono assegnate arbitrariamente a categorie di un istituto.
- Rinominare aggiorna l’etichetta senza perdere collegamenti. Archiviare nasconde
  il filtro, non il contenuto; ripristinare rende nuovamente utilizzabili i
  collegamenti preservati. Un filtro divenuto non disponibile torna a **Tutti**.

##### C. Dati, permessi e verifica

Aggiungere associazioni persistenti tramite ID, con vincoli contro duplicati e
riferimenti inesistenti. Ogni richiesta verifica sul server ruolo, associazione
attiva, istituto del contenuto e istituto delle categorie. Rifiutare richieste
tra istituti, contenuti nazionali e tentativi di modificare campi estranei alla
classificazione. Le categorie archiviate non possono essere aggiunte ex novo.

Le revisioni devono coprire anche le assegnazioni: un riordino/archivio o una
classificazione concorrente non deve essere sovrascritto. Se l’amministratore
sposta un contenuto tra istituti, nessuna vecchia categoria deve diventare
visibile o modificabile nel nuovo istituto. Ricontrollare lo stato del contenuto
al salvataggio e alla lettura. I bisogni globali e il retrieval in chat restano
separati; nessuna riclassificazione automatica dei dati già presenti.

Verificare isolamento, revoca durante la modifica, conflitti, assegnazione
multipla/rimozione, archivio/ripristino, contenuti senza categorie, risorse
nazionali, più istituti, visibilità e date. Controllare tastiera, sei lingue,
320/390/1440 px e tema scuro. Aggiornare documentazione, guida e catture;
ricostruire le immagini Docker e provarle in isolamento, mantenendo la modalità
di anteprima concordata inizialmente. La successiva richiesta esplicita
dell’utente ha autorizzato la distribuzione in produzione, eseguita il 23 settembre.

Sorgenti verificati: `OrientationDirectoryCard.tsx`, `lib/referrals-api.ts`,
`backend/routes/orientation_referrals.py`, `backend/schemas.py`,
`backend/referral_scope.py` e i modelli dei contenuti. La risposta corrente
espone un solo istituto di intestazione: la lettura per più istituti richiede
una rappresentazione esplicita, non il semplice riuso di quel nome per tutte
le righe.

#### Problema verificato nel codice corrente

`PageHeader.backHref` passa una destinazione di ripiego a `PreviousPageButton`: se esiste una pagina precedente nella cronologia interna, il pulsante esegue `router.back()`. Per questo rinominarlo «Area personale» senza cambiarne il comportamento non garantirebbe quella destinazione. Le pagine visuali aggiungono inoltre una testata interna e un grande riepilogo degli obiettivi; Obiettivi, Cambiamenti, PDF e Flashcard hanno ingressi separati da `ProfilePage`.

Sorgenti verificati: `PageHeader.tsx`, `PreviousPageButton.tsx`, `PersonalVisualWorkspacePage.tsx`, le pagine `/profilo/obiettivi`, `/profilo/cambiamenti`, `/profilo/pqbl` e `FlashcardsPage.tsx`. La proposta riguarda la cornice delle pagine personali; il comportamento di `PageHeader` nelle chat e negli altri ambienti non va cambiato globalmente.

#### Desktop — schema di riferimento

```text
+------------------------------------------------------------------------+
| CounselorBot                                    Account / opzioni      |
+------------------------------------------------------------------------+

  [< Area personale]                                      [Vai a... v]

  [immagine] Nome della pagina                     [Azione principale*]
             Descrizione approvata: a cosa serve questo strumento.

  Obiettivi collegati: 2 [Mostra]                         (se pertinente)
  --------------------------------------------------------------------
  Contenuto operativo: elenco, scheda oppure editor

  Stato delle modifiche e salvataggio: vicino al contenuto che si modifica
```

#### Mobile — stesso ordine, senza elementi sovrapposti

```text
+----------------------------------------+
| CounselorBot             Menu account  |
+----------------------------------------+

  [< Area personale]        [Vai a... v]

  [immagine] Nome della pagina
             Anche su due righe

  Descrizione approvata dello strumento.

  [Azione principale*]       (se esiste)

  Obiettivi collegati: 2 [Mostra]
  ------------------------------------
  Contenuto operativo
```

`*` L’azione principale è facoltativa e corrisponde a un’azione già disponibile nella pagina. Per esempio, «Nuovo lavoro» nel Portfolio o «Modifica» nel Taccuino in lettura; la posizione definitiva dell’azione va adattata alla singola pagina. Se un’azione compare nella testata, non deve essere ripetuta nel contenuto. Non si aggiunge un pulsante generico per riempire lo spazio e non si spostano qui i comandi di salvataggio dei singoli moduli.

Le immagini sono quelle già scelte per l’ingresso, conservando proporzioni e nome visibile. L’immagine accompagna il titolo e non è un pulsante distinto. Su mobile la descrizione passa sotto la coppia immagine/titolo per avere larghezza sufficiente. La testata personale scorre con la pagina: non si aggiunge una seconda barra fissa sotto quella globale.

#### Destinazioni e comportamento

| Elemento | Comportamento previsto |
| --- | --- |
| «Area personale» | Collegamento a `/profilo`, anche se si arriva da un link diretto o da un’altra sottopagina. Eventuali bozze passano prima dalle protezioni di uscita. |
| «Indietro» del browser | Conserva la cronologia reale; non è sostituito dal collegamento alla radice. |
| «Indietro» interno a un compito | Resta solo se serve a tornare a un passaggio o a un elenco nello stesso strumento. Non duplica il ritorno all’Area personale nella testata. |
| «Vai a…» | Apre un pannello con le 17 destinazioni, raggruppate come nell’ingresso. Aprire o chiudere il pannello non cambia pagina, selezione o bozza. |
| Collegamento a un altro strumento | Apre direttamente la rotta scelta, attraversando le protezioni di uscita. Non salva e non condivide nulla automaticamente. |
| Voce della pagina corrente | È riconoscibile come «Pagina attuale» e non avvia una navigazione che azzererebbe parametri o selezioni. |
| Obiettivi collegati | Riga secondaria espandibile quando pertinente; il contenuto operativo resta prioritario. Non sostituisce il riepilogo generale dell’ingresso. |
| Visibilità dei contenuti | Spiegazione vicino alla lettura, modifica o condivisione interessata. Non aggiungere una generica etichetta «Solo io» a tutte le testate. |

#### Pannello «Vai a…»

```text
+-----------------------------------------+
| Vai a...                       [Chiudi] |
|                                         |
| IL MIO PERCORSO                         |
| [immagine] Obiettivi                    |
| [immagine] Attività                     |
| [immagine] Calendario e diario          |
|                                         |
| CONOSCERMI E RIFLETTERE                 |
| [immagine] Taccuino  · Pagina attuale   |
| [immagine] Libretto                     |
| [immagine] Cambiamenti                  |
| [immagine] Risultati e conversazioni    |
|                                         |
| Seguono gli altri tre gruppi approvati. |
+-----------------------------------------+
```

Lo schema mostra un estratto, non una selezione ridotta: nella versione reale ci sono tutti e cinque i gruppi e tutte le 17 voci. Nel pannello bastano immagine e nome; le descrizioni complete restano nell’ingresso e nelle pagine. Non occorre una ricerca per questo elenco.

- Desktop: pannello ancorato al pulsante; mobile: pannello adattato alla larghezza disponibile, con margini laterali. Si apre in sovrapposizione senza spostare il contenuto sottostante; l’altezza segue lo spazio disponibile e l’elenco può scorrere al suo interno.
- È una navigazione con collegamenti, non un menu applicativo che richiede frecce direzionali. Il pulsante dichiara lo stato aperto/chiuso; Tab percorre chiusura e collegamenti nell’ordine dei gruppi.
- All’apertura il focus entra nel pannello. Escape e «Chiudi» lo richiudono e riportano il focus a «Vai a…». Il click esterno e l’uscita del focus chiudono il pannello senza attivare una destinazione; non si impone un blocco del focus da finestra modale.
- Una voce si attiva solo con click o conferma da tastiera. Spostare il focus non cambia pagina. Dopo la navigazione si annuncia il titolo della nuova pagina, compatibilmente con la gestione del focus già prevista per un eventuale contenuto preciso.
- Nomi completi anche quando vanno a capo, righe attivabili alte almeno 44 px, tema chiaro/scuro e sei lingue. La miniatura non sostituisce l’etichetta testuale.

#### Protezioni e integrazione per passi

La navigazione aggiuntiva deve rispettare le bozze. Prima di estenderla alle pagine con moduli modificabili, verificare le guardie esistenti e risolvere le lacune F01/F02/F06 dei lotti 1A: il nuovo collegamento non deve aggirare una conferma o un recupero già disponibili. Il punto 0.3 definisce la struttura, non dichiara risolta la protezione del lavoro.

Struttura validata: procedere con un solo intervento applicativo alla volta:

1. **Pagina pilota: Orientamento.** Applicare la testata e il pannello a una pagina senza bozze di scrittura, verificando ritorno certo, link diretti e uso con tastiera su desktop/mobile.
2. **Pagine successive.** Estendere lo stesso componente una pagina per volta, verificando prima le sue protezioni di uscita. Per le pagine visuali consolidare le testate duplicate e la semantica della pagina senza modificare i moduli di lavoro.
3. **Azioni e contenuti accessori.** Ricollocare soltanto quelli della pagina in esame, preservando i contratti di salvataggio, le versioni e le autorizzazioni.

Criteri di chiusura per ciascuna pagina: un solo titolo principale con il nome approvato; immagine coerente con l’ingresso; «Area personale» sempre diretto a `/profilo`; pannello con tutte le destinazioni; nessuna perdita di bozza o condivisione implicita; parametri e ancore dei link al contenuto preservati; focus comprensibile; nessun overflow a 320/390/1440 px. Le verifiche funzionali restano distinte dalla validazione dello schema.

**Decisione approvata per 0.3:** collegamento stabile «Area personale» a sinistra e pannello «Vai a…» a destra; sotto, un’unica testata con immagine esistente, nome, descrizione e azione principale solo quando utile.

### Salvataggio, errore e uscita

```text
LETTURA --[Modifica]--> BOZZA --[Salva]--> CONTENUTO SALVATO
                           |
                           +-- errore --> bozza presente + Riprova
                           +-- conflitto --> conserva testo + confronto
                           +-- uscita --> recupero o scelta esplicita

TACCUINO: BOZZA --autosave--> BOZZA RECUPERABILE
                         --[Salva versione]--> VERSIONE IN CRONOLOGIA

CARICAMENTO --> DATI | VUOTO AUTENTICO | ERRORE CON RIPROVA
```

Non aggiungere messaggi che fanno saltare il modulo durante la digitazione. Usare uno stato compatto annunciabile; un errore persistente ha invece testo e azione. Se si introduce recupero locale per altri strumenti, separare bozze per utente, tipo e ID, gestire cambio account e non ripubblicare automaticamente una bozza obsoleta dopo un conflitto.

### Visibilità: vincoli da mantenere

| Contenuto | Regola da rappresentare |
| --- | --- |
| Taccuino, risultati e relative conversazioni | L'iscrizione ai gruppi consente già la consultazione ai docenti/ricercatori autorizzati. Non chiamarli genericamente «Solo io». |
| Obiettivo personale | Riepilogo condivisibile con il gruppo scelto; la scelta deve restare esplicita e separata dall'adozione. |
| Attività e diario dell'assegnazione | Lavoro personale: pianificare e riflettere non equivale a inviare. |
| Restituzione | Anteprima e invio espliciti; copia del testo scelto. Modifiche successive al lavoro originale non aggiornano la copia già inviata. |
| Portfolio nella restituzione | Oggi vengono copiati titolo e descrizione. Immagini e link non sono allegati automaticamente. |
| Ritira restituzione / lascia gruppo | Spiegare esattamente gli effetti previsti dalle API; il ritiro rimuove l'accesso alla restituzione e al feedback associato, conservando il lavoro personale. |

Il redesign non deve cambiare queste autorizzazioni attraverso una semplice modifica delle etichette. Una politica di visibilità diversa sarebbe una decisione di prodotto e un intervento backend separati.

## 5. Schemi ASCII delle pagine

Gli schemi rappresentano il progetto dell’interfaccia, non schermate già realizzate. Lo stato di approvazione è indicato per ciascun punto; gli altri schemi restano proposte da validare. Dati, date e nomi sono esempi. Le righe `>` indicano sezioni apribili; `[ ]` pulsanti o campi. Le versioni mobile conservano l'ordine semantico, senza affiancare colonne troppo strette.

I nomi approvati al punto 0.1 (§4) sono il riferimento per gli schemi. L’ingresso (§5.1) li riporta integralmente, incluso l’accesso autonomo a Cambiamenti. Eventuali abbreviazioni negli altri schemi non sono etichette definitive.

### 5.1 Ingresso — `/profilo`

**Punto 0.2 — approvato il 23 settembre 2026, con immagini esistenti al posto delle icone degli strumenti.** Obiettivo: scegliere uno strumento o ritrovare un lavoro dall'ingresso, mantenendo riconoscibili i cinque gruppi approvati. La testata globale, il ritorno e il selettore «Vai a…» saranno definiti al punto 0.3: qui si progetta il contenuto dell'ingresso.

#### Gerarchia approvata

1. **Titolo e una frase di orientamento:** «Area personale» e «Ritrova il tuo lavoro e scegli come proseguire».
2. **Riepilogo “Da riprendere”, quando utile:** massimo tre elementi pertinenti con tipo, titolo, eventuale scadenza e collegamento al contenuto preciso. Due elementi fittizi compaiono negli schemi; non sono dati verificati dell'utente.
3. **Cinque sezioni sempre aperte:** nell'ordine approvato in 0.1, ciascuna con titolo e collegamenti diretti. Nessun gruppo è un passaggio obbligatorio o una sequenza numerata da completare.

Ogni gruppo occupa l'intera larghezza del contenuto; su desktop i suoi collegamenti si distribuiscono su due colonne, in ordine da sinistra a destra e poi dall'alto in basso. Su mobile diventano una sola colonna nello stesso ordine. Portfolio mantiene una sezione autonoma con una sola voce, senza riempitivi.

La scelta di sezioni orizzontali evita di affiancare un gruppo molto lungo a uno con una sola voce. Le righe mantengono tutte le descrizioni approvate; compattezza significa ridurre contenitori, ripetizioni e spazi superflui, non nascondere il testo utile.

#### Desktop — disposizione indicativa a 1440 px

```text
+---------------------------------------------------------------------------------------------------------------+
| Area personale                                                                                                |
| Ritrova il tuo lavoro e scegli come proseguire.                                                               |
+---------------------------------------------------------------------------------------------------------------+
| DA RIPRENDERE (solo se ci sono elementi pertinenti, massimo tre)                                              |
| Attivita: Ripassare il capitolo - 30 set                                  [Apri attivita]                     |
| Assegnazione: Lettura proposta - 2 ott                                   [Apri assegnazione]                  |
+---------------------------------------------------------------------------------------------------------------+
| IL MIO PERCORSO                                                                                               |
| [img] Obiettivi ->                                    | [img] Attività ->                                     |
|     Scegli che cosa vuoi raggiungere e il prossimo    |     Organizza quello che vuoi fare, stai facendo o    |
|     passo.                                            |     hai provato.                                      |
|                                                                                                               |
| [img] Calendario e diario ->                          |                                                       |
|     Pianifica le tappe e racconta le esperienze.      |                                                       |
+---------------------------------------------------------------------------------------------------------------+
| CONOSCERMI E RIFLETTERE                                                                                       |
| [img] Taccuino ->                                     | [img] Libretto ->                                     |
|     Racconta il tuo contesto, gli interessi e il modo |     Prepara una prova e rifletti su come è andata.    |
|     di apprendere.                                    |                                                       |
|                                                                                                               |
| [img] Cambiamenti ->                                  | [img] Risultati e conversazioni ->                    |
|     Confronta ciò che hai scritto e rifletti sui      |     Ritrova i risultati dei questionari e i dialoghi  |
|     cambiamenti.                                      |     collegati.                                        |
+---------------------------------------------------------------------------------------------------------------+
| STUDIARE E RAGIONARE                                                                                          |
| [img] Studiare da un PDF ->                           | [img] Flashcard ->                                    |
|     Lavora sul tuo materiale attraverso domande e     |     Memorizza e ripassa con carte domanda e risposta. |
|     feedback.                                         |                                                       |
|                                                                                                               |
| [img] Carte da ordinare ->                            | [img] Confrontare alternative ->                      |
|     Raggruppa idee e riflessioni.                     |     Valuta possibilità diverse secondo i tuoi         |
|                                                       |     criteri.                                          |
|                                                                                                               |
| [img] Tavolo ->                                       |                                                       |
|     Costruisci e rivedi diagrammi di lavoro.          |                                                       |
+---------------------------------------------------------------------------------------------------------------+
| I MIEI LAVORI                                                                                                 |
| [img] Portfolio ->                                    |                                                       |
|     Conserva e ritrova i tuoi lavori.                 |                                                       |
+---------------------------------------------------------------------------------------------------------------+
| PERSONE E SUPPORTO                                                                                            |
| [img] Assegnazioni ->                                 | [img] Gruppi e classi ->                              |
|     Ritrova le attività dei docenti, prepara le       |     Gestisci le iscrizioni e leggi i messaggi dei     |
|     restituzioni e leggi i feedback.                  |     docenti.                                          |
|                                                                                                               |
| [img] Orientamento ->                                 | [img] Telegram ->                                     |
|     Trova contatti e appuntamenti del tuo istituto.   |     Collega il tuo account per usare anche questo     |
|                                                       |     canale.                                           |
+---------------------------------------------------------------------------------------------------------------+
```

#### Mobile — disposizione indicativa a 390 px

```text
+------------------------------------------+
| Area personale                           |
| Ritrova il tuo lavoro e scegli           |
| come proseguire.                         |
+------------------------------------------+
| DA RIPRENDERE (quando disponibile)       |
| Attivita: Ripassare il capitolo          |
| 30 set                 [Apri attivita]   |
| Assegnazione: Lettura proposta           |
| 2 ott             [Apri assegnazione]    |
+------------------------------------------+
| IL MIO PERCORSO                          |
| [img] Obiettivi ->                       |
|     Scegli che cosa vuoi raggiungere e   |
|     il prossimo passo.                   |
|                                          |
| [img] Attività ->                        |
|     Organizza quello che vuoi fare, stai |
|     facendo o hai provato.               |
|                                          |
| [img] Calendario e diario ->             |
|     Pianifica le tappe e racconta le     |
|     esperienze.                          |
+------------------------------------------+
| CONOSCERMI E RIFLETTERE                  |
| [img] Taccuino ->                        |
|     Racconta il tuo contesto, gli        |
|     interessi e il modo di apprendere.   |
|                                          |
| [img] Libretto ->                        |
|     Prepara una prova e rifletti su come |
|     è andata.                            |
|                                          |
| [img] Cambiamenti ->                     |
|     Confronta ciò che hai scritto e      |
|     rifletti sui cambiamenti.            |
|                                          |
| [img] Risultati e conversazioni ->       |
|     Ritrova i risultati dei questionari  |
|     e i dialoghi collegati.              |
+------------------------------------------+
| STUDIARE E RAGIONARE                     |
| [img] Studiare da un PDF ->              |
|     Lavora sul tuo materiale attraverso  |
|     domande e feedback.                  |
|                                          |
| [img] Flashcard ->                       |
|     Memorizza e ripassa con carte        |
|     domanda e risposta.                  |
|                                          |
| [img] Carte da ordinare ->               |
|     Raggruppa idee e riflessioni.        |
|                                          |
| [img] Confrontare alternative ->         |
|     Valuta possibilità diverse secondo i |
|     tuoi criteri.                        |
|                                          |
| [img] Tavolo ->                          |
|     Costruisci e rivedi diagrammi di     |
|     lavoro.                              |
+------------------------------------------+
| I MIEI LAVORI                            |
| [img] Portfolio ->                       |
|     Conserva e ritrova i tuoi lavori.    |
+------------------------------------------+
| PERSONE E SUPPORTO                       |
| [img] Assegnazioni ->                    |
|     Ritrova le attività dei docenti,     |
|     prepara le restituzioni e leggi i    |
|     feedback.                            |
|                                          |
| [img] Gruppi e classi ->                 |
|     Gestisci le iscrizioni e leggi i     |
|     messaggi dei docenti.                |
|                                          |
| [img] Orientamento ->                    |
|     Trova contatti e appuntamenti del    |
|     tuo istituto.                        |
|                                          |
| [img] Telegram ->                        |
|     Collega il tuo account per usare     |
|     anche questo canale.                 |
+------------------------------------------+
```

Gli schemi mostrano l'intera pagina, non la sola prima schermata. `[img]` rappresenta una delle immagini già disponibili nel progetto; `->` è un indicatore di apertura, non un comando distinto. Le cornici ASCII delimitano le sezioni: non prescrivono card con bordi o sfondi. Le righe reali vanno a capo liberamente, senza troncare nomi o descrizioni. Anche a 320 px rimane una sola colonna; la resa effettiva va verificata durante l'implementazione.

#### Immagini esistenti da riutilizzare

L'utente ha approvato la struttura chiedendo espressamente **le immagini già presenti, non icone** per rappresentare gli strumenti. Le miniature sono accanto al testo, sia su desktop sia su mobile, in uno spazio regolare; conservano proporzioni e trasparenza senza ritagli. Non si generano nuove immagini e non si sostituiscono le illustrazioni con simboli generici. Il nome resta sempre visibile. Le icone delle azioni, come chiusura o ritorno, non sono oggetto di questa sostituzione.

Mappatura verificata il 23 settembre 2026 nei file disponibili sotto `frontend/public` e negli abbinamenti di `frontend/src/app/profilo/page.tsx`:

| Destinazione | Immagine esistente | Riscontro |
| --- | --- | --- |
| Attività | `/images/platform/bacheca-azioni.png` | Già abbinata nell'ingresso attuale. |
| Calendario e diario | `/images/platform/linea-del-tempo.png` | Già abbinata nell'ingresso attuale. |
| Taccuino | `/images/platform/su-di-me.png` | Già abbinata nell'ingresso attuale. |
| Libretto | `/images/platform/libretto.png` | Già abbinata nell'ingresso attuale. |
| Risultati e conversazioni | `/images/platform/compilazioni.png` | Già abbinata nell'ingresso attuale. |
| Studiare da un PDF | `/images/intro/practice.png` | Già abbinata nell'ingresso attuale. |
| Carte da ordinare | `/images/platform/carte-ordinare.png` | Già abbinata nell'ingresso attuale. |
| Confrontare alternative | `/images/platform/confronto.png` | Già abbinata nell'ingresso attuale. |
| Tavolo | `/images/platform/tavolo.png` | Già abbinata nell'ingresso attuale. |
| Portfolio | `/images/platform/portfolio.png` | Già abbinata nell'ingresso attuale. |
| Assegnazioni | `/images/platform/assegnazioni.png` | Già abbinata nell'ingresso attuale. |
| Gruppi e classi | `/images/platform/classi.png` | Già abbinata nell'ingresso attuale. |
| Orientamento | `/images/platform/bussola.png` | Già abbinata nell'ingresso attuale. |
| Telegram | `/images/platform/telegram.png` | File presente; la voce attuale usa ancora `image: null`. |

**Abbinamenti completati nell’implementazione:** Obiettivi usa `/images/cards/focus_goal.png`, Cambiamenti usa `/images/cards/self_reflection.png`, Flashcard usa `/images/cards/feedback_loop.png`. Tutte e tre sono immagini preesistenti, ispezionate prima della scelta; non sono stati generati nuovi asset. Telegram usa ora l’immagine già disponibile. La mappa eseguita dell’ingresso è `frontend/src/lib/personal-area.ts`.

Gli abbinamenti sono stati verificati anche nel browser durante l’implementazione: nomi e immagini nelle sei lingue, desktop/mobile e tema scuro.

#### Interazioni e stati

- **Aprire uno strumento:** immagine, nome e descrizione formano un unico collegamento. Nessun secondo pulsante «Apri» ripetuto nelle 17 voci. Tutte le destinazioni sono disponibili anche senza questionari, obiettivi o contenuti personali già salvati, nel rispetto degli accessi esistenti.
- **Riprendere un lavoro:** il riepilogo precede i gruppi e resta breve. Tipo e titolo rendono distinguibili attività e assegnazioni. Il collegamento porta al contenuto preciso; niente classifiche AI, stato «non letto» o elenco di contenuti «recenti» senza una fonte affidabile. Le regole di selezione e ordinamento saranno definite nell'intervento sul riepilogo (lotto 2, F11), verificando i dati disponibili.
- **Primo accesso o nessun elemento da riprendere:** omettere il riepilogo; il titolo e la frase di orientamento conducono subito agli strumenti. Nessun grande pannello vuoto e nessun invito obbligatorio a creare un obiettivo.
- **Riepilogo in caricamento:** i collegamenti agli strumenti restano utilizzabili. Riservare al riepilogo uno spazio compatto per ridurre gli spostamenti durante il caricamento; nessun blocco a tutta pagina.
- **Errore del riepilogo:** messaggio locale «Non riesco a caricare il riepilogo» e «Riprova». Se esistono dati precedenti, conservarli indicando che non sono aggiornati. L'errore non deve far apparire assenti i lavori, né impedire l'accesso agli strumenti.
- **Account e impostazioni:** restano accessibili dalla testata globale; non occupano un pannello introduttivo nel contenuto. La collocazione precisa rientra in 0.3.
- **Ritorno all'ingresso:** ripristinare per quanto possibile posizione di scorrimento e focus sul collegamento usato; il comportamento della navigazione sarà definito in 0.3.

#### Regole visive e criteri di validazione

- Riutilizzare la larghezza `page-wide`, la tipografia Bricolage Grotesque per il titolo e Inter per il testo, i token petrol e i neutri di `docs/design.md`. Nessun nuovo colore per ciascun gruppo o strumento; le immagini esistenti aiutano il riconoscimento insieme ai nomi. Nessuna nuova animazione decorativa.
- Un solo titolo principale; i cinque titoli di gruppo sono intestazioni di sezione. Separazione attraverso spazio e divisori discreti; nessuna grande illustrazione prima degli accessi operativi.
- Tutta la riga è attivabile, con area di tocco almeno 44 px in altezza e focus visibile. Ordine di lettura e tastiera uguale all'ordine visivo. Immagini decorative con testo alternativo vuoto quando il nome dello strumento è già presente nello stesso collegamento.
- Il riepilogo contiene al massimo tre elementi sia su desktop sia su mobile. Su mobile si accetta lo scorrimento della pagina; non si aggiungono caroselli, scorrimenti interni o sezioni chiuse per nascondere destinazioni.
- Verificare dopo l'implementazione: 17 destinazioni uniche, tutte le descrizioni approvate, Cambiamenti autonomo, Portfolio nel proprio gruppo, primo accesso senza dati, ritorno con riepilogo, errore locale con riprova, tastiera, temi chiaro/scuro, zoom e sei lingue. La riduzione di altezza rispetto all'audit è un obiettivo da misurare, non un risultato già dimostrato.

**Decisione approvata per chiudere 0.2:** riepilogo breve prima dei cinque gruppi sempre aperti; gruppi a larghezza intera con collegamenti su due colonne desktop e una mobile. Ogni voce usa un'immagine esistente accanto al nome e alla descrizione. L’implementazione dell’ingresso è stata successivamente autorizzata e applicata; il punto 0.3 resta separato.

### 5.2 Obiettivi — `/profilo/obiettivi`

```text
Area personale > Obiettivi                        [+ Nuovo obiettivo]
[In corso] [In pausa] [Conclusi / Archivio]          [Cerca...        ]
+----------------------+-------------------------------------------+
| I miei obiettivi      | Organizzare lo studio              [...]  |
| > Organizzare studio | Perche conta: trovare un ritmo sostenibile|
|   Preparare colloquio| [Modifica] [Condivisione: Solo io]         |
|                      |                                           |
|                      | PROSSIMO PASSO                            |
|                      | Ripassare il capitolo          [Apri]     |
|                      | [+ Aggiungi attivita]                     |
|                      |                                           |
|                      | > Materiali e lavori collegati (3)        |
|                      | > Riflessione e revisione                 |
+----------------------+-------------------------------------------+

NUOVO: [Scrivi il tuo] [Scegli dal catalogo]
Obiettivo [_______________________________________________________]
> Perche conta per me / Come riconosco un progresso
Visibilita: Solo io                  [Annulla] [Crea obiettivo]
```

Mobile: elenco e dettaglio come due viste con ritorno al filtro precedente; non anteporre venti schede al modulo selezionato. Catalogo con ricerca, ambito e «Personalizza e scegli», mai adozione automatica. Condivisione con destinatario e anteprima distinta dalla creazione.

### 5.3 Taccuino — `/profilo/taccuino`

```text
Area personale > Taccuino                                [Modifica]
Il mio contesto, per capire meglio il mio percorso.
[Chi puo consultarlo: gestori dei miei gruppi] [Dettagli]
+------------------------------------------------------------------+
| Studio / lavoro       ...                                         |
| Punti di forza        ...                                         |
| Difficolta e risorse  ...                                         |
| Altro                 ...                                         |
+------------------------------------------------------------------+
| [Versioni salvate] [Confronta i cambiamenti]                [...]  |
+------------------------------------------------------------------+
IN MODIFICA: campi leggibili, sezioni progressive
Bozza recuperabile [?]                      [Chiudi] [Salva versione]
```

«Chiudi» va accompagnato da una semantica coerente con l'autosalvataggio: non chiamarlo «Annulla» se non ripristina davvero lo stato precedente. L'eliminazione di Taccuino e storico va nel menu secondario con conferma nominata. Le informazioni sulla visibilità devono adattarsi all'iscrizione effettiva.

### 5.4 Cambiamenti — `/profilo/cambiamenti`

```text
Area personale > Cambiamenti
Confronto [Taccuino v]     Prima [18 set v]   Dopo [23 set v]
+-------------------------------+----------------------------------+
| PRIMA                         | DOPO                             |
| Mi e difficile iniziare.      | Inizio con una sessione breve.   |
+-------------------------------+----------------------------------+
| Che cosa noto di diverso?                                         |
| [Riflessione personale...                                      ]  |
|                                            [Salva riflessione]    |
| > Vuoi discuterne con il counselor AI?                            |
+------------------------------------------------------------------+
```

Mobile: ogni campo cambiato mostra prima e dopo uno sotto l'altro. Con una sola versione: spiegare che il confronto richiede due versioni, senza chiedere una nuova compilazione del questionario. Se si riflette su un Libretto, cambiare chiaramente sorgente e intestazione; non chiamare quel testo «cambiamento del Taccuino».

### 5.5 Libretto — `/profilo/libretto`

```text
Area personale > Libretto                            [+ Nuova scheda]
Strumento [QSA - Strategie di apprendimento v]  Scheda [Il mio piano v]
Titolo: Il mio piano di studio                           [Modifica]
Obiettivo personale collegato: Organizzare lo studio      [Cambia]
+------------------------------------------------------------------+
| [Preparo]                 [Provo]                  [Rivedo]        |
|                                                                  |
| Che cosa voglio provare?  [____________________________________]  |
| Strategia                [Scegli / scrivi...                   ]  |
| > Punti di forza e aspetti su cui lavorare                         |
| > Periodo, motivazione e dettagli                                 |
|                                                                  |
| [PDF]                                   Stato [.] [Salva scheda]  |
+------------------------------------------------------------------+
```

Le tre sezioni non impongono un avanzamento: consentono revisione e compilazione parziale. «Rivedo» contiene impegno, soddisfazione, difficoltà, scoperte e osservazioni; la biografia mantiene i propri eventi. Per Evento significativo di studio/professionale usare il modello narrativo, senza introdurre fattori di questionario. Non sostituire automaticamente l'obiettivo della prova con l'obiettivo personale collegato.

### 5.6 Risultati e conversazioni — `/profilo/compilazioni`

```text
Area personale > Risultati e conversazioni
[Cerca per strumento o data...             ] [Strumento: Tutti v]
+-------------------------+----------------------------------------+
| QSA - 21 settembre      | QSA - 21 settembre             [PDF]   |
| ZTPI - 18 settembre     | [Sintesi] [Risultati] [Conversazione]   |
| QSA -  5 settembre      |                                        |
|                         | Sintesi del percorso                    |
|                         | ...                                    |
|                         | [Apri il libretto]                     |
+-------------------------+----------------------------------------+
> Lettura integrata tra strumenti: spiegazione e avvio facoltativo
```

Mobile: prima elenco, poi dettaglio selezionato. Mostrare la data e il nome esteso dello strumento; riportare il codice del fattore insieme al nome nei risultati. Conservare spiegazioni e indicatori testuali già presenti, senza affidarsi solo al colore. Eliminazione fra le azioni secondarie, con conferma riferita alla compilazione precisa. Non cambiare soglie o interpretazioni psicometriche nell'intervento UX.

### 5.7 Attività — `/profilo/azioni`

```text
Area personale > Attivita                             [+ Attivita]
[Tutte] [Da provare] [In corso] [Provate]         [Obiettivo: Tutti v]
+---------------------+---------------------+----------------------+
| DA PROVARE          | IN CORSO            | PROVATE              |
| Ripasso capitolo    | Lettura articolo    | Intervista           |
| 25 set              | Obiettivo: ...      | Come e andata?       |
| [Apri] [Inizia]     | [Apri] [Ho provato]  | [Rifletti]           |
+---------------------+---------------------+----------------------+
DETTAGLIO: titolo, come provo, stato, obiettivo, data e riflessione
                                         [Annulla] [Salva attivita]
```

Mobile: elenco filtrato, non tre colonne verticali con tutti i moduli aperti. Azioni di stato accessibili senza trascinamento. Per attività di un'assegnazione, mantenere il collegamento alla riflessione della tappa: non crearne una seconda scollegata.

### 5.8 Calendario e diario — `/profilo/timeline`

```text
Area personale > Calendario e diario                    [+ Tappa]
[Elenco] [Calendario]   [Oggi]             [Tutte / Future / Passate]
+------------------------------------------------------------------+
| 25 SET   Ripasso capitolo              Da provare       [Apri]     |
| 28 SET   Incontro di orientamento      Istituto         [Apri]     |
| 21 SET   Presentazione                 Esperienza      [Apri]     |
+------------------------------------------------------------------+
TAPPA: Ripasso capitolo
[Piano] [Come e andata]                  Data [25 settembre] [Modifica]
Attivita collegate [...]    Lavori collegati [...]    Obiettivo [...]
[Salva]           > Crea una copia nel Portfolio / Altre azioni
```

Conservare giorno singolo, periodo e periodo aperto; non costringere a inventare una scadenza. Distinguere le date dell'istituto dalle tappe personali modificabili. «Copia nel Portfolio» deve spiegare che produce un'istantanea: anteprima, conferma e link al lavoro creato, senza simulare una sincronizzazione continua.

### 5.9 Portfolio — `/profilo/portfolio`

```text
Area personale > Portfolio                              [+ Lavoro]
[Cerca...                                  ] [Categoria: Tutte v]
+----------------------+----------------------+--------------------+
| [anteprima]          | [anteprima]          | [anteprima]        |
| Presentazione       | Relazione            | Mappa              |
| 21 set - Scuola      | 18 set - Progetto    | 15 set             |
| [Apri lavoro]        | [Apri lavoro]        | [Apri lavoro]      |
+----------------------+----------------------+--------------------+
EDITOR: Titolo [________________]   Descrizione [__________________]
[Aggiungi immagini]     > Categoria / data / link
Obiettivo [Collega...]  Tappa [Collega...]
Stato [.]                                  [Annulla] [Salva lavoro]
```

Aprire il lavoro in lettura; modifica e rimozione restano esplicite. L'editor resta già aperto dopo il primo salvataggio: conservare questo comportamento e rendere evidente che ora è possibile aggiungere immagini. La coda locale prima del salvataggio è un'estensione facoltativa. Chiarire che aggiungere al Portfolio non invia automaticamente al docente.

### 5.10 Carte da ordinare — `/profilo/carte`

```text
Area personale > Carte da ordinare                       [+ Mazzo]
Raggruppa idee e riflessioni. Per memorizzare usa [Flashcard].
[I miei mazzi v] > Idee per il futuro                    [+ Carta]
+----------------------+----------------------+--------------------+
| MI RAPPRESENTA       | DA ESPLORARE         | NON ORA            |
| [carta]              | [carta]              | [carta]            |
| [Apri] [Sposta v]    | [Apri] [Sposta v]    | [Apri] [Sposta v]  |
+----------------------+----------------------+--------------------+
> Modifica nomi e colonne                 Stato [.] [Salva mazzo]
```

Colonne dell'esempio indicative: rispettare quelle del mazzo. Mobile: filtro per colonna e azione «Sposta», preservando nomi e quantità; drag-and-drop solo come alternativa. Creazione carta con testo prima e illustrazione facoltativa dopo.

### 5.11 Confronto — `/profilo/confronto`

```text
Area personale > Confrontare alternative
[1 Alternative] [2 Criteri] [3 Confronto] [4 La mia scelta]
+------------------------------------------------------------------+
| Quali possibilita stai valutando?                                 |
| [Corso A________________]  [Corso B________________] [+ Terza]    |
|                                        [Aggiungi i criteri]       |
+------------------------------------------------------------------+
CONFRONTO
| Criterio             | Corso A             | Corso B              |
| Interesse           | ...                 | ...                  |
| Impegno richiesto   | ...                 | ...                  |
> La mia scelta: posso ancora lasciare la decisione aperta
```

Su mobile: mostrare un criterio per blocco con le alternative in sequenza; non comprimere una matrice illeggibile. Nessuna graduatoria automatica presentata come decisione dell'utente. Se i dati attuali permettono un solo confronto, non promettere un archivio di confronti senza progettare la persistenza.

### 5.12 Studiare da un PDF — `/profilo/pqbl`

```text
Area personale > Studiare da un PDF
Domande e feedback sul tuo materiale.
+------------------------------------------------------------------+
| [Scegli PDF] o trascinalo qui                                     |
| PDF con testo selezionabile, massimo 10 MB                         |
| Domande nella sessione: [10] [20] [30]                             |
|                                               [Prepara domande]  |
+------------------------------------------------------------------+
IN CORSO: Capitolo 2.pdf    Domanda 3 di 10      [Interrompi e riprendi]
[Domanda...]  [Risposte...]  Feedback...                  [Prosegui]
```

Caricamento con stato, errore e retry; ripresa chiaramente visibile quando esiste progresso recuperabile. Verificare la portata della persistenza prima di promettere ripresa su un altro dispositivo. Il cambiamento da avvio immediato del caricamento a pulsante esplicito è una proposta da validare, non una correzione necessaria al solo errore «PDF o immagine».

### 5.13 Flashcard — `/profilo/flashcard`

```text
Area personale > Flashcard                               [+ Mazzo]
Memorizza e ripassa con carte fronte/retro.
+------------------------------------------------------------------+
| Biologia        12 carte    4 da ripassare     [Studia] [Modifica]  |
| Lingua           8 carte    2 da ripassare     [Studia] [Modifica]  |
+------------------------------------------------------------------+
STUDIO: Biologia                  3 / 12                [Esci]
                        [FRONTE DELLA CARTA]
                          [Mostra risposta]
DOPO LA RISPOSTA:       [Da ripassare] [La so]
```

Conservare l'apertura orientata allo studio già esistente e rendere esplicita la modifica. Rinomina, elimina e azzera progresso sono operazioni differenti; spiegare l'effetto dell'ultima. Stato autosave e recupero dagli errori senza aggiungere un «Salva» puramente decorativo.

### 5.14 Tavolo — `/profilo/tavolo`

```text
Area personale > Tavolo                    [+ Vuoto] [Crea con AI]
Diagrammi che puoi costruire e rivedere.
+------------------------------------------------------------------+
| I MIEI TAVOLI                                                    |
| Piano di studio              Mappa concettuale    [Apri] [...]    |
| Scelta del percorso          Confronto            [Apri] [...]    |
+------------------------------------------------------------------+
CREA CON AI: Che cosa vuoi rappresentare? [_______________________]
> Tipo di diagramma     Counselor [attuale v]    [Prepara proposta]
PROPOSTA: [Anteprima]                            [Scarta] [Accetta]
```

Mantenere il consenso alle proposte AI. Nell'editor `/tavolo/[id]`: ritorno alla lista, nome del tavolo, stato delle modifiche e invito a nominare una bozza prima dell'uscita. Ripresa delle bozze dalla lista è un'estensione da valutare, non una capacità da dare per già disponibile.

### 5.15 Assegnazioni — `/profilo/assegnazioni`

```text
Area personale > Assegnazioni
[Da svolgere] [Restituzioni inviate] [Con feedback] [Tutte]
[Gruppo: Tutti v]                           [Richieste / Proposte v]
+------------------------------------------------------------------+
| Lettura proposta  | Docente / Classe | Entro 30 set | [Apri]       |
+------------------------------------------------------------------+
DETTAGLIO
Cosa mi viene chiesto: ...          Materiale: ...
[Pianifico] [Ho gia svolto l'attivita*]
> Il mio lavoro: attivita e riflessione personale
[Prepara restituzione]

ANTEPRIMA PER IL DOCENTE: Nome docente / Classe
[Testo scelto...                                                 ]
[Aggiungi titolo e descrizione dal Portfolio v]
Questa copia non si aggiorna quando modifichi il lavoro originale.
                                    [Torna al lavoro] [Condividi]

DOPO L'INVIO: Copia inviata il ...   [Leggi feedback] [Ritira...]
```

`*` Percorso futuro con adeguamento backend: oggi occorre prima pianificare. Nella prima fase mantenere la sequenza attuale ma spiegare «Crea un'attività e una tappa personali; non invia nulla». L'invio non deve completare automaticamente un obiettivo; la modifica di una riflessione non deve aggiornare la copia già condivisa. Nessun badge «letto» finché non esiste una funzione che lo registri.

### 5.16 Gruppi e classi — `/profilo/classi`

```text
Area personale > Gruppi e classi                         [+ Entra]
+------------------------------------------------------------------+
| Classe 3A                      [Assegnazioni] [Messaggi] [...]    |
| Gestita da ...                 [Chi puo vedere cosa]              |
+------------------------------------------------------------------+
ENTRA: Codice [____________]                         [Verifica]
Riepilogo: nome gruppo, gestori e visibilita dei tuoi contenuti.
                                            [Annulla] [Conferma]

LASCIA GRUPPO: Vuoi lasciare Classe 3A?
Effetti su accesso, assegnazioni e contenuti personali: ...
                                            [Resta] [Lascia gruppo]
```

L'anteprima del codice prima di entrare richiede un contratto backend che esponga solo le informazioni necessarie, con gli stessi controlli di accesso/invito. Nel primo intervento si può già migliorare conferma, testo e gestione errori senza inventare quell'endpoint. Distinguere codice errato da rete assente o errore del servizio.

### 5.17 Orientamento — `/profilo/orientamento`

```text
Area personale > Orientamento
Istituto: Nome istituto                            [Cambia contesto]
[Persone a cui rivolgermi] [Appuntamenti]
+------------------------------------------------------------------+
| TUTOR ORIENTAMENTO        Quando puo aiutarmi: ...                 |
| Nome / ruolo             Come contattarlo: ...      [Contatto]    |
|                                                                  |
| OPEN DAY                 28 settembre, ore ...       [Dettagli]    |
| > Porta questa data nel tuo calendario personale                  |
+------------------------------------------------------------------+
VUOTO: Nessun appuntamento pubblicato. [Vedi le persone disponibili]
ERRORE: Non riesco a caricare gli appuntamenti.             [Riprova]
```

Il cambio di istituto deve condurre alla fonte del contesto già prevista, senza mantenere un secondo dato divergente. Un eventuale inserimento nel calendario è esplicito, evita doppioni e conserva la provenienza istituzionale; va verificato contro le API esistenti prima di implementarlo.

### 5.18 Telegram — `/profilo/telegram`

```text
Area personale > Telegram
Usa CounselorBot anche da Telegram.
+------------------------------------------------------------------+
| Stato: Non collegato                             [Collega]        |
+------------------------------------------------------------------+
| 1. [Apri il bot ufficiale su Telegram]                            |
| 2. Conferma il collegamento nel bot                               |
| 3. Torna qui: [Verifica collegamento]                             |
| > In alternativa: comando da copiare, scadenza e nuovo codice      |
+------------------------------------------------------------------+
COLLEGATO: @nomeutente       Ultima verifica ...       [Scollega...]
ERRORE: Stato non verificabile                         [Riprova]
```

Non mostrare «Non collegato» finché la verifica non è riuscita. Prima scelta il deep link, codice manuale come alternativa; nessun messaggio reale inviato automaticamente dal frontend. Scollegamento con esito visibile e aggiornamento dello stato.

## 6. Piano di implementazione per lotti

### Avanzamento delle decisioni preliminari

Si affronta un solo intervento alla volta. La chiusura di un punto di pianificazione registra una decisione, non l'avvenuta implementazione. Ogni successiva modifica UI richiede prima la validazione del relativo schema ASCII, poi implementazione e verifiche circoscritte.

| Punto | Decisione | Stato | Criterio di chiusura |
| --- | --- | --- | --- |
| 0.1 | Nomi e raggruppamento degli strumenti | **Approvato e registrato — 23 settembre 2026** | Cinque gruppi, 17 destinazioni oltre all'ingresso, nomi e descrizioni definiti in §4; Portfolio autonomo e Cambiamenti allo stesso livello di Taccuino e Libretto |
| 0.2 | Schema ASCII dell'ingresso | **Approvato e registrato — 23 settembre 2026 (§5.1)** | Riepilogo breve, cinque gruppi aperti, due colonne desktop e una mobile; immagini esistenti accanto a nome e descrizione. Applicato all’ingresso; abbinamenti immagini completati |
| 0.3 | Schema della testata e navigazione comune | **Schema approvato; pilota Orientamento implementato (§4); esteso a tutte le pagine dell’area il 26 settembre 2026** | Titolo, azione principale, ritorno e accesso alle altre pagine validati |

Gli schemi specifici di Libretto, Assegnazioni e delle altre pagine saranno validati prima dei rispettivi interventi. Nessuno schema successivo è approvato per effetto della chiusura di 0.1.

### Lotti applicativi di riferimento

Ogni lotto deve produrre un risultato verificabile e una revisione delle schermate prima di procedere al successivo. Le dimensioni sono relative: **S** = modifica circoscritta, **M** = più componenti, **L** = flusso con contratti frontend/backend. Non sono stime di giorni.

| Lotto | Intervento e problemi coperti | Superfici principali | Dimensione / dipendenze | Criterio di chiusura |
| --- | --- | --- | --- | --- |
| 0 | Validare nomenclatura e schemi di ingresso, pagina, Libretto e Assegnazioni | Questo documento e prototipo navigabile dopo validazione ASCII | S; nessuna modifica funzionale | Verificare con scenari concreti che si riconosca dove agire e dove si torna |
| 1A | Bozze e uscita: F01, F02, F06 | StudentBookletCard, PortfolioCard, GoalsPanel, VisualTools, TimelineTools | M; indipendente dalla nuova grafica | Nessuna perdita silenziosa cambiando scheda, chiudendo o navigando; recupero dopo errore; conflitto senza sovrascrittura automatica |
| 1B | Errori, uscita gruppi, testo pQBL: F03, F04, F25; base F33 | ProfilePage, profilo/*, MyGroupsCard, TelegramLinkCard, pQBL | M; avviabile dopo revisione dei contratti attuali | I sei 503 producono errori con riprova; uscita confermata; PDF descritto correttamente |
| 2 | Testata e ingresso: F07–F11, F34; uniformità F05/F33 | layout personale, ProfilePage, PageHeader, JourneyOverview, i18n | M; lotto 0 validato | Una sola testata, percorso di ritorno certo, tutti gli strumenti raggiungibili, azione principale visibile prima dei pannelli accessori |
| 3A | Obiettivi e collegamenti: F12, F13, F16 | GoalsPanel, GoalUI, componenti destinatari | M/L; lotto 2 e guardie 1A | Creare un obiettivo senza compilare il bilancio; aprire un'attività precisa; collegare senza perdere la bozza |
| 3B | Libretto/Taccuino/Portfolio/Risultati: F14–F20 | Componenti profilo, ProfileChangeReflection, lettura risultati | L, da dividere per pagina; 1A prima | Moduli progressivi, contratti di versione conservati, allegati nello stesso flusso, ricerca stabile |
| 4 | Strumenti operativi: F21–F24, F26; accessibilità residua F33 | VisualTools, TimelineTools, FlashcardsPage, TavoloList | L, un singolo strumento per volta; lotto 2 | Lettura distinta da modifica; mobile utilizzabile senza trascinamento; date e relazioni conservate |
| 5A | Assegnazioni e supporto con API attuali: F27, F29–F32; spiegazione F28 | AssignmentsPanel/Work/Journey, Classi, Orientamento, Telegram | M; lotti 1B/2 | Restituzione comprensibile, destinatario ed esatto contenuto visibili, retry e verifiche di stato |
| 5B | Estensioni da decidere: consegna di lavoro già svolto, anteprima invito, eventuale recupero bozze Tavolo | API assignment_work/groups/tavolo e relative UI | L; decisione separata, dopo 5A | Contratti, autorizzazioni e migrazioni definiti; nessuna adozione o condivisione implicita |

### Indicazioni tecniche per chi implementerà

1. Separare la struttura comune dell'Area personale dai contenuti delle pagine senza riscrivere tutta `ProfilePage` in un solo intervento. Oggi varie rotte la riesportano e il caricamento generale chiede risultati dei questionari anche per sezioni che non li mostrano: ridurre il caricamento al fabbisogno della pagina.
2. Riutilizzare `Button`, `PageHeader`, `ConfirmInline`, Tooltip e token esistenti. Evitare un secondo sistema di design.
3. Non introdurre subito un salvataggio universale per tutti gli strumenti: verificare revisioni, autosave, snapshot e recupero di ciascun tipo. Uniformare prima linguaggio, stati e protezione delle bozze.
4. Un dettaglio condiviso di attività/tappa deve riferirsi agli ID esistenti. Il nuovo punto di ingresso non deve creare un secondo record dello stesso lavoro.
5. Conservare deep link `?goal=`, `?event=`, `?instrument=`, `?booklet=` e `#assignment-`/`#portfolio-`. L'apertura da link diretto deve evidenziare e rendere raggiungibile il contenuto scelto.
6. La condivisione rimane un'operazione distinta dal salvataggio. Verificare `revision`, conflitti 409, destinatari, anteprima del Portfolio e ritiro anche lato backend.
7. Etichette e messaggi nelle sei lingue; date formattate per lingua, senza cambiare i valori inviati alle API. Nessuna concatenazione fragile di frasi tradotte.
8. Per le modifiche applicative future: test mirati, build, ricostruzione delle immagini Docker coinvolte e verifica runtime. Questo audit modifica solo documentazione e non richiede rebuild.

## 7. Verifiche di accettazione

### Scenari funzionali

| Scenario | Esito atteso dopo l'intervento |
| --- | --- |
| Primo accesso senza contenuti | Si capisce che cosa offrono gli strumenti; nessun obiettivo o questionario obbligatorio per accedere a lavori personali |
| Ritorno con molti contenuti | Ritrovare un obiettivo fra 20, una scheda fra 30 e un'assegnazione fra 20 usando filtri/ricerca, senza scorrere tutti gli editor |
| Libretto: modifica, altra scheda, altro strumento, Indietro | Bozza conservata o scelta esplicita; nessun reset silenzioso |
| Portfolio: testo, X, Nuovo, navigazione | Bozza protetta; immagini aggiungibili senza perdere il contesto dell'editor |
| Nuova attività non ancora aggiunta | Anche il testo nei campi di creazione è protetto, negli Obiettivi e nei visuali |
| Rete assente, 503, 401/403, conflitto 409 | Messaggi diversi e utili; dati non presentati come vuoti; testo non perso; accesso da ripristinare distinto da retry |
| Modifica Taccuino e Salva versione | Sicurezza automatica senza affollare la cronologia; solo conferma esplicita produce la versione significativa |
| Assegnazione → pianificazione → riflessione → restituzione | Ogni passaggio dichiara l'effetto; solo l'ultimo invia; niente doppio diario |
| Portfolio → restituzione → modifica originale | L'anteprima coincide con la copia inviata; il contenuto già condiviso non cambia silenziosamente |
| Ritiro restituzione e uscita dal gruppo | Conferma contestuale; accessi aggiornati secondo il contratto; lavoro personale conservato dove previsto |
| Link diretto e browser Indietro | Contenuto giusto, focus utile, filtro e posizione recuperati quando si torna alla lista |
| pQBL e Telegram | Nessun formato promesso ma rifiutato; progresso/errori comprensibili; ritorno da Telegram con verifica reale dello stato |

### Verifica visiva e accessibilità

- Viewport futuri: 320, 390, 768 e 1440 px, contenuti brevi e lunghi, tema chiaro/scuro, zoom 200%, tutte le lingue supportate. Le misure effettivamente svolte nell'audit restano quelle elencate nella sezione 1.
- Un solo titolo principale per pagina e assenza di intestazioni duplicate senza funzione. Prima operazione utile visibile senza grandi pannelli introduttivi, compatibilmente con contenuto e zoom.
- Percorso completo con sola tastiera; focus alla nuova vista, al messaggio d'errore quando serve e al controllo di origine alla chiusura di un dialogo.
- Nomi accessibili per icone, input e select; stati annunciati senza ripetizioni a ogni battitura; errore legato al campo pertinente.
- Obiettivo di progetto 44 × 44 per controlli iconici, testo e stato non affidati al solo colore, contrasto misurato nelle combinazioni realmente renderizzate.
- La barra persistente non copre contenuti o tastiera; nessun salto durante il salvataggio; preferenza di movimento ridotto rispettata. La presenza di regole globali per focus e movimento ridotto va preservata.
- Pagine lunghe: niente attese AI o caricamenti accessori che blocchino l'intero strumento; nessuna risposta vecchia che sostituisca una ricerca più recente.

### Verifica con persone

Breve prova formativa con 4–6 studenti, senza presentarla come validazione statistica: «Ritrova il tuo lavoro», «Scegli un obiettivo e aggiungi un'attività», «Racconta come è andata», «Invia solo questa parte al docente». Osservare prima scelta di pagina, ritorni inutili, richieste di aiuto e interpretazione della visibilità. Confrontare i risultati con l'interfaccia attuale prima di estendere la nuova struttura a tutte le pagine.

## 8. Evidenze riproducibili e sorgenti

### Risultati osservati

| Prova | Risultato |
| --- | --- |
| Hub senza obiettivi e assegnazioni, 1440/390 px | Altezza documento 1.971/3.589 px; nessun overflow orizzontale |
| Obiettivo esistente, 390 px | Dettaglio in modifica già aperto, altezza 1.906 px |
| Libretto con due schede, 390 px | Altezza 3.112 px; titolo non salvato perso passando all'altra scheda e tornando |
| Portfolio, desktop/mobile | Titolo inserito perso dopo X e riapertura; nessuna conferma |
| Classi, desktop/mobile | Click su uscita genera DELETE immediata, senza dialogo |
| 503 Portfolio/Compilazioni/Libretto | Visualizzato rispettivamente vuoto lavori/questionari/schede |
| 503 Taccuino/Classi/Telegram | Editor nascosto / elenco senza segnalazione / «Telegram non collegato» |
| Assegnazione non pianificata | Disponibile pianificazione; restituzione non ancora esposta |

Artefatti locali temporanei, tutti con dati sintetici: `/tmp/counselorbot-personal-audit-2026-09-23/` contiene `report.json`, screenshot e testi; le sottocartelle `details/` ed `errors/` contengono gli approfondimenti. Script: `/tmp/audit-personal-area.mjs`, `/tmp/audit-personal-details.mjs`, `/tmp/audit-personal-errors.mjs`. Non sono necessari per leggere questo piano e non sono artefatti permanenti del repository. Le prove registrano il comportamento del frontend con risposte controllate, non certificano backend o SSO.

Riproduzione manuale minima: nel Libretto modificare il titolo di una scheda, aprirne un'altra e tornare senza salvare; nel Portfolio aprire Nuovo lavoro, scrivere il titolo, chiudere con X e riaprire; per gli errori intercettare la GET pertinente con 503 e verificare testo/azione di recupero. Eseguire soltanto su fixture o account di prova, senza uscire da gruppi reali.

### Mappa dei sorgenti

I numeri di riga si riferiscono alla base esaminata; simboli e nomi dei file restano il riferimento dopo modifiche successive.

| Rif. | Sorgente e punti di lettura |
| --- | --- |
| S01 | [ProfilePage](../../frontend/src/app/profilo/page.tsx): `PERSONAL_AREAS` circa riga 51, `loadData` 207, caricamento conversazioni 251, hub 487–600, sezioni 603 e seguenti |
| S02 | [GoalsPanel](../../frontend/src/components/goals/GoalsPanel.tsx): `GoalForm` 27, `GoalDetail` 43, `dirty` 51; [JourneyOverview](../../frontend/src/components/goals/JourneyOverview.tsx) |
| S03 | [LearnerProfileCard](../../frontend/src/components/profile/LearnerProfileCard.tsx): caricamento 102, `setHidden` 111/149, cronologia 203; [learner_profile backend](../../backend/routes/learner_profile.py): separazione autosave/manuale |
| S04 | [StudentBookletCard](../../frontend/src/components/profile/StudentBookletCard.tsx): caricamento/cambio 162–202, `createBooklet` 295, lista schede 450, vuoto 493, campi e azioni 500–635 |
| S05 | [PortfolioCard](../../frontend/src/components/profile/PortfolioCard.tsx): `load` 80, `saveItem` 133 circa, editor 254, immagini 289; [PortfolioTimelineLinks](../../frontend/src/components/profile/PortfolioTimelineLinks.tsx) |
| S06 | [PersonalVisualWorkspacePage](../../frontend/src/components/visual/PersonalVisualWorkspacePage.tsx): testata, JourneyOverview e VisualTools |
| S07 | [VisualTools](../../frontend/src/components/visual/VisualTools.tsx): `dirty` 87, salvataggio 170, sezione con ruolo dialog 229, Bacheca 293, Carte 327, footer 537 |
| S08 | [TimelineTools](../../frontend/src/components/visual/TimelineTools.tsx): calendario e creazione 95 e seguenti, anteprima/copia 69–94; [TimelineDateFields](../../frontend/src/components/visual/TimelineDateFields.tsx) |
| S09 | [AssignmentsPanel](../../frontend/src/components/teacher/AssignmentsPanel.tsx), [AssignmentWork](../../frontend/src/components/teacher/AssignmentWork.tsx): `WorkEditor`, `load`, ramo `!work.planned`, anteprima e invio; [AssignmentJourney](../../frontend/src/components/teacher/AssignmentJourney.tsx); [backend assignment_work](../../backend/routes/assignment_work.py): `_edit` 67, `share` 169, `withdraw` 194 |
| S10 | [MyGroupsCard](../../frontend/src/components/profile/MyGroupsCard.tsx): `load` 64, `leave` 74, pulsante 132; [TeacherNotesCard](../../frontend/src/components/profile/TeacherNotesCard.tsx); [backend groups](../../backend/routes/groups.py): membri, Taccuino e risultati 325 e seguenti |
| S11 | [TelegramLinkCard](../../frontend/src/components/profile/TelegramLinkCard.tsx): `loadStatus` 77, deep link 104, stato e istruzioni 152 e seguenti |
| S12 | [pQBL personale](../../frontend/src/app/profilo/pqbl/page.tsx): ripresa, `startUpload`, ingresso 524–542; [pQBL backend](../../backend/routes/pqbl.py): controllo estensione 323 |
| S13 | [FlashcardsPage](../../frontend/src/components/flashcards/FlashcardsPage.tsx): caricamento, salvataggio serializzato, ripasso e modifica |
| S14 | [ProfileChangeReflection](../../frontend/src/components/profile/ProfileChangeReflection.tsx): `load` 162, modalità Taccuino/Libretto, riflessione e chat |
| S15 | [TavoloList](../../frontend/src/components/tavolo/TavoloList.tsx), [TavoloCompose](../../frontend/src/components/tavolo/TavoloCompose.tsx), [TavoloCounselor](../../frontend/src/components/tavolo/TavoloCounselor.tsx) |
| S16 | [PageHeader](../../frontend/src/components/ui/PageHeader.tsx), [PreviousPageButton](../../frontend/src/components/ui/PreviousPageButton.tsx) |
| S17 | [OrientationDirectoryCard](../../frontend/src/components/profile/OrientationDirectoryCard.tsx): caricamento, filtri e stati 40–66 |

**Perimetro della consegna dell’audit originario:** solo questo documento. Nessun componente applicativo, dato, API, autorizzazione o container modificato. Le modifiche descritte richiedono una successiva implementazione autorizzata, salvo l’ingresso successivamente applicato e documentato in §9; la validazione degli schemi ASCII precede la generazione del codice UI.


## 9. Applicazione dell’ingresso approvato — 23 settembre 2026

L’utente ha chiesto di vedere le modifiche con un rebuild Docker. Applicati i punti
0.1 e 0.2 a `/profilo`, senza avviare il redesign delle pagine interne o la nuova
navigazione comune 0.3. Le testate già gestite da `ProfilePage` riprendono i nomi
approvati; l’unico adeguamento operativo interno è l’ancora dell’attività per
aprire il contenuto preciso dal riepilogo.

- `PersonalAreaHome.tsx`: cinque gruppi aperti, 17 collegamenti illustrati, due
  colonne desktop/una mobile; rimosso il riquadro account dall’ingresso.
- `personal-area.ts`: immagini preesistenti e riepilogo unico di massimo tre
  elementi, con deduplicazione delle attività, date disponibili prima degli
  elementi senza data, feedback indicato come disponibile.
- `i18n-personal-area.ts`: nomi, descrizioni e stati nelle sei lingue.
- Il caricamento del riepilogo è indipendente; errori con Riprova conservano i
  dati già ottenuti. L’ingresso non richiede più i risultati dei questionari.
- Guida nelle sei lingue e relative schermate dell’ingresso aggiornate;
  documentazione viva per Bussola e Assistente allineata.

Verifiche concluse:

- 207 test unitari frontend superati, compresi deduplicazione e limite del riepilogo.
- TypeScript e controllo i18n superati. ESLint senza errori; nel componente visuale
  restano cinque warning preesistenti (due simboli inutilizzati e tre immagini).
- Otto test browser dell’ingresso superati anche sul container ricostruito, con
  API simulate: sei lingue, 320/390/1440 px, immagini decodificate, tema scuro,
  tastiera, errore parziale/riprova, caricamento lento e attività aperta con focus.
- Tre test della navigazione visuale superati; sei test della Guida superati.
- Build `docker compose build frontend` completata; container ricreato con
  `docker compose up -d --no-deps frontend`, avvio regolare e `/profilo` locale 200.
- Hash delle sei nuove schermate della Guida nel container uguali ai sorgenti.
- Dominio pubblico: 302 verso SSO; il test browser locale con fixture non è una
  verifica di sessione pubblica autenticata. Nessuna scrittura ai dati reali.

Le tre incompatibilità TypeScript preesistenti negli import dei test sono state
allineate alla convenzione già usata dal progetto (`@ts-expect-error` per gli
import `.ts` eseguiti da Node). Backend e altri servizi non richiedono rebuild
per questo intervento; nessun volume o dato persistente è stato modificato.

### 0.3 — Pilota Orientamento e anteprima di sviluppo

Struttura approvata dall’utente e applicata soltanto a `/profilo/orientamento`.
`PersonalAreaHeader` riusa nomi, gruppi e immagini dell’ingresso: ritorno diretto
alla radice, pannello con 17 destinazioni (16 collegamenti e pagina attuale),
titolo unico e descrizione. Apertura/chiusura conserva filtri e URL; tastiera,
focus e scorrimento interno sono verificati anche su mobile orizzontale.
L’estensione alle altre pagine resta un intervento successivo, una alla volta.

La preview usa Next su loopback e un proxy con fixture dimostrative; il tunnel
Cloudflare ha una configurazione isolata da quella di produzione. Sono esposti
l’ingresso, Orientamento e la guida. Le altre destinazioni mostrano un avviso;
le API non previste e ogni scrittura sono bloccate. Avvio e arresto documentati
in `docs/operations/personal-area-dev-preview.md`.

Verifiche:

- 207 test unitari superati; TypeScript, i18n (sei lingue) ed ESLint superati.
- 21 test browser superati: sette del pilota/proxy, otto dell’ingresso e sei
  della guida. I sette del pilota sono stati ripetuti dopo gli ultimi ritocchi
  a focus e altezza disponibile, tutti superati.
- Browser reale sul tunnel: pagina Orientamento visibile, pannello con 16 link,
  nessun errore JavaScript. HTTP pubblico 200. Dati esclusivamente dimostrativi.
- Guida aggiornata nelle sei lingue e sei schermate aggiunte; manifest di
  allineamento rigenerato e `make guidance-check` superato.
- Immagine frontend Docker ricostruita. Il container di produzione resta alla
  versione precedente durante la revisione della preview; stato del container
  verificato attivo. Nessuna modifica a volumi o dati persistenti.

### Revisione del pilota dopo il riscontro dell’utente

Rimosso «Vai a…» con relativo pannello e traduzioni non più usate. Resta il
collegamento a sinistra all’Area personale, con area attivabile di almeno 44 px.
Guida e sei schermate aggiornate. Sette test browser superati nelle sei lingue,
a 320/390/1440 px e in orizzontale; TypeScript, i18n, ESLint e controllo della
documentazione superati. Verifica pubblica nel tunnel: un solo collegamento
nella testata e nessun pulsante. Immagine Docker ricostruita; produzione ancora
alla versione precedente. La successiva decisione sulle categorie configurabili per istituto è registrata
nel punto 0.3.2.

### 0.3.2.1 — Associazioni docente–istituto

Completato il primo intervento della nuova gestione, dopo la scelta e la
validazione dell’utente: solo l’amministratore associa e revoca i docenti.
Aggiunti modello persistente, API, controlli riutilizzabili per le categorie e
scheda in Amministrazione → Referenti ed eventi → Istituti. Nessuna associazione
reale creata e nessuna categoria imposta agli istituti.

Verifiche: undici test backend su PostgreSQL dedicato, ripetuti dalla nuova
immagine; sette test browser con dati simulati nelle sei lingue, compresi
320/390/1440 px, errori e accesso del ricercatore. TypeScript, ESLint, i18n e
allineamento documentazione superati. Immagini backend e frontend ricostruite;
container di produzione lasciati alla versione precedente durante la revisione.
Il configuratore delle categorie (0.3.2.2), inizialmente successivo, è ora implementato come documentato sotto.


### 0.3.2.2 — Categorie condivise tra docenti

Implementata la struttura approvata in `/docente/orientamento`: immagine Bussola
esistente, istituto fisso o selettore, unico modulo esplicito, menu a tre punti
per modifica/ordine/archivio, archiviate richiudibili con ripristino in coda.
Controlli in sei lingue; contenuti scritti dall’istituto senza traduzioni automatiche.

API protette da ruolo e associazione verificata a ogni richiesta; revisione
dell’elenco e scrittura atomica per i conflitti, ID stabili, nomi unici anche
nell’archivio. Nessuna tassonomia precaricata e nessuna modifica dei filtri studenti.
La guida docente include descrizione e sei nuove catture sintetiche.
Le immagini Docker vengono ricostruite senza sostituire i container di produzione.

Verifica completata: 22 test backend, 13 del configuratore (anche sulla build
Docker) e 6 della guida; TypeScript, lint mirato e parità lingue superati.
Immagini backend/frontend ricostruite. Comandi riproducibili e limiti in
`docs/operations/institution-orientation-categories.md`.
Il successivo intervento **0.3.2.3** è stato approvato e implementato come riportato sotto.


### 0.3.2.3 — Assegnazioni ai contenuti e filtri degli studenti

Realizzata la struttura approvata: sezioni richiudibili Contatti/Appuntamenti,
menu a tre punti e unico modulo per assegnare più categorie. Permessi verificati
a ogni chiamata; bozze e selezioni conservate in caso di errore/conflitto.
Le revisioni dell’istituto coprono categorie e assegnazioni; il contenuto è
bloccato durante il salvataggio e la sua data di modifica viene confrontata.

La directory studente usa gruppi distinti per istituto e categorie associate ai
soli contenuti visibili. Le risorse nazionali sono fuori dai filtri locali.
I campi piatti della risposta restano disponibili per il calendario esistente.
Nessuna categoria imposta, nessuna modifica del retrieval della chat.
Guida docente/studente e 12 catture aggiornate nelle sei lingue.
Dettagli di verifica e stato del rilascio in
`docs/operations/institution-orientation-categories.md`.


### Rilascio richiesto dall’utente — 23 settembre 2026

Dopo la conferma del punto 0.3.2.3, l’utente ha richiesto di mettere in produzione
le modifiche realizzate e preparare l’handoff. Immagini backend/frontend
ricostruite, 61 test backend e 34 prove browser passati (queste ultime sulla
build Docker con API simulate). Eseguito `docker compose up -d --no-deps backend frontend`.
Il precedente vincolo di sola anteprima è superato per le modifiche già realizzate.
Il lavoro UI restante non è autorizzato in blocco: riprendere un intervento alla
volta da `area-personale-handoff.md`.
