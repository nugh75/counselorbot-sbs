# CounselorBot: funzionalità e interfaccia attuali

Aggiornato: 23 settembre 2026. Questo è il riferimento operativo dell’Assistente
CounselorBot e della Bussola. Descrive funzioni effettivamente disponibili; la
visibilità può dipendere dal ruolo, dalla lingua e dalla configurazione. Non è
un elenco di azioni che l’assistente può eseguire al posto della persona.

## Presentazione, attività e navigazione

La presentazione (`/`) offre quattro ingressi illustrati: **Bussola**, **Analisi
questionari**, **Percorsi guidati**, **Area personale e strumenti**. Il collegamento
“Vedi tutte le attività e i percorsi” apre il catalogo (`/?view=home`). Nel catalogo
viene prima la Bussola, poi le analisi dei questionari, i percorsi guidati e l’Area
personale e strumenti. **Riprendi un’attività** è in fondo, con l’immagine del puzzle;
le attività interrotte sono raggiungibili anche dalla navigazione.

Non esiste più una categoria “Allenamento”. **Studiare da un PDF** è nell’Area
personale, accanto alle Flashcard. Il catalogo non contiene più il riquadro
“Counselor · Come procediamo” né “Rivedi la presentazione iniziale”. Il comando
indietro e la navigazione permettono di tornare alle pagine precedenti.

L’accesso personale usa l’account ai4educ. Quando mancano le impostazioni iniziali,
si scelgono counselor e Taccuino. La scelta del counselor resta nell’account e può
essere modificata dalla pagina dei counselor. Metodo di inserimento dei risultati
e modalità di conversazione si ricordano solo selezionando l’apposita casella nella
rispettiva schermata; le preferenze già memorizzate restano valide. Idea chiede la
modalità ogni volta e non cambia la preferenza degli altri strumenti.

## Bussola, Assistente e Guida

- **Bussola** (`/bussola`): conversazione per orientarsi fra gli strumenti. Non
  somministra questionari, non raccoglie punteggi e non svolge al proprio interno
  le altre interviste. Le raccomandazioni aprono gli strumenti nelle loro pagine.
- **Assistente** (`/assistente`): risponde sui materiali della base selezionata,
  con modalità studente o docente. Per l’interfaccia e le funzionalità scegliere
  **CounselorBot**. Le altre basi restano distinte; non attribuire alla piattaforma
  le funzioni di competenzestrategiche.it. Il presente documento viene letto a ogni
  richiesta CounselorBot; i documenti di approfondimento sono recuperati dall’indice.
- **Guida interfaccia** (`/guide`): pubblica anche senza login, con percorsi per
  uso personale e per docenti, immagini ingrandibili e collegamenti alle sezioni.
  Tutte le 15 sezioni personali e le 7 sezioni per docenti includono almeno uno
  screenshot pertinente; le schermate della piattaforma sono disponibili nelle
  sei lingue, mentre le due viste della chat sono dimostrazioni in italiano.
- Interfaccia e conversazioni: italiano, inglese, spagnolo, francese, tedesco e
  svedese. Sono disponibili tema chiaro/scuro, navigazione mobile e lettura vocale.

## Analisi dei questionari

**QSA, QSAr, ZTPI, QPCS, QPCC e QAP** sono i sei questionari con punteggi. In italiano
si compilano su competenzestrategiche.it, poi si portano i risultati in CounselorBot.
Nelle altre cinque lingue sono disponibili versioni sperimentali interne, non ancora
validate: questa limitazione va dichiarata quando vengono proposte.

I risultati si inseriscono manualmente oppure si estraggono da PDF/immagine, con
controllo della persona prima di proseguire. La visualizzazione e la chat aiutano
la riflessione sui fattori; un punteggio alto non è sempre un punto di forza, perché
alcuni fattori sono invertiti. Non si fanno diagnosi. La scheda di ciascuno strumento
(`/strumenti/<codice>`) ne spiega finalità, svolgimento e dati necessari.

## Percorsi guidati senza punteggi

- **Savickas**: intervista narrativa sulla costruzione del percorso professionale.
- **Idea**: esplora un’idea, una decisione, un progetto o un concetto concreto; produce
  una Mappa cumulativa della sessione, distinta da Profilo, Taccuino e Libretto.
- **Evento significativo di studio** (`EVENTO_STUDIO`) e **Evento significativo
  professionale** (`EVENTO_PROFESSIONALE`): rileggono un solo episodio, anche positivo,
  in sei passi (episodio, fatti, cosa ha funzionato, difficoltà, seconda lettura,
  prossima volta), seguiti dalla sintesi al passo 7. La sintesi è una bozza del
  Libretto da rivedere e salvare esplicitamente. Non sono eventi del calendario.
- **Il mio obiettivo di apprendimento** (`OBIETTIVO_STUDIO`): definisce un obiettivo,
  con livello di apprendimento, controllo SMART, difficoltà, piano, prova e data di
  verifica. Offre percorso completo o essenziale; alla fine propone una bozza di
  obiettivo che la persona deve confermare, non un obiettivo salvato automaticamente.
- **Obiettivi per la mia classe** (`OBIETTIVO_DOCENZA`): variante raggiungibile da
  `/docente`, basata sulle classi selezionate e sul Taccuino del docente. Allinea
  obiettivo, attività e valutazione; pubblicazione nel catalogo o assegnazione
  richiedono una scelta esplicita.

## Chat, voce e ripresa

Nella chat guidata si scrive sotto la conversazione. La barra dei passi permette
indietro, ripeti e avanti. Il menu a tre punti offre pannello, **formato** della
risposta (conversazione, elenco, tabella), **lunghezza** (breve, media, lunga), voce,
lingua e Congela sessione. Formato e lunghezza sono scelte indipendenti.
Il percorso essenziale QSA prevede tre risposte e la sintesi; non va esteso a QSAr
o agli altri questionari. I due percorsi sugli obiettivi hanno la propria versione
essenziale. L’esperienza OpenCode è un’alternativa quando disponibile.

La generazione può essere interrotta; “Continua” riprende una risposta incompleta.
Le risposte possono essere ascoltate; i controlli dei messaggi offrono diagrammi
e feedback quando disponibili. Il lettore nella navigazione legge il testo visibile,
con impostazioni di voce, motore e pronuncia. La chat guidata e la Bussola accettano
registrazione del microfono o file audio: la trascrizione è da controllare, salvo
invio immediato scelto esplicitamente. In conversazione vocale si avvia e si ferma
la registrazione; il microfono non riparte da solo.

Le conversazioni guidate con progressi si salvano dopo le risposte per essere
riprese anche da un altro dispositivo. Congela sessione salva e chiude. La ripresa
riporta percorso e conversazione, ma non garantisce memoria illimitata del modello.
Eliminare un punto di ripresa non elimina i risultati del questionario o gli altri
lavori. Il progresso PDF, invece, è locale al browser.

## Area personale e strumenti

**Interfaccia aggiornata in produzione il 23 settembre 2026:**
nella pagina **Orientamento**, la nuova testata mantiene a sinistra il collegamento
**Area personale**, sempre diretto all’ingresso. Sotto compaiono l’immagine
esistente, il titolo e la descrizione. Il pannello «Vai a…» è stato rimosso
su richiesta dell’utente. Le altre sottopagine saranno riviste separatamente.

**Categorie dell’istituto — disponibili in produzione:** ogni istituto definisce le
proprie categorie di Orientamento tramite i suoi docenti. L’amministratore
associa e può revocare i docenti dell’istituto; dichiarare una scuola nel
Taccuino o in una classe non concede questo permesso. Sono
disponibili le API e la scheda amministrativa delle associazioni, in **Referenti ed eventi → Istituti → Docenti dell’istituto**:
account docente, «Associa», elenco e «Revoca». Occorre indicare lo username
esatto di un account che abbia già il ruolo docente. Nell’Area docente, **Orientamento dell’istituto**
apre l’elenco condiviso: i docenti abilitati possono creare, descrivere, modificare,
riordinare, archiviare e ripristinare le categorie. Nessun nome è imposto. Con più
istituti si sceglie quello su cui lavorare; senza associazioni si vede una spiegazione.
Il salvataggio è esplicito; errori e conflitti conservano il testo inserito, mentre
l’uscita con modifiche non salvate richiede conferma. Nella sezione **Contatti e
appuntamenti**, il menu a tre punti offre **Assegna categorie**: si possono
selezionare più categorie per un contenuto pubblicato del proprio istituto.
Recapiti, date e certificazione mantengono la gestione attuale. La pagina studente
usa le categorie dell’istituto come filtri comuni a contatti e appuntamenti;
**Tutti** include quelli senza categoria. Con più istituti, ciascuno ha i propri
filtri: categorie con lo stesso nome restano distinte tra istituti. Ogni contenuto
è presentato nel contesto del proprio istituto. Le risorse nazionali compaiono separatamente. Archiviare una categoria
nasconde il filtro senza cancellare i contenuti o i collegamenti; ripristinarla
rende nuovamente disponibili le associazioni. Queste funzioni sono state distribuite in produzione il 23 settembre 2026.

L’Area personale (`/profilo`) apre con **Da riprendere**, solo quando ci sono
lavori pertinenti: al massimo tre attività collegate a obiettivi attivi, obiettivi
senza attività aperte o assegnazioni. Le date disponibili precedono gli elementi
senza data; un feedback è indicato come disponibile, non come non letto.
Il riepilogo porta al lavoro preciso, conserva i dati precedenti in caso di errore
e offre Riprova; il caricamento non blocca i collegamenti agli strumenti.

Seguono cinque gruppi sempre aperti: **Il mio percorso**, **Conoscermi e riflettere**,
**Studiare e ragionare**, **I miei lavori**, **Persone e supporto**. Le 17 destinazioni
hanno immagini già presenti, nome e descrizione, su due colonne desktop e una mobile.
Cambiamenti è autonomo accanto a Taccuino e Libretto; Portfolio resta nel gruppo
I miei lavori. Anche senza questionari o obiettivi si può aprire ciascuno strumento.
I dati account restano nel menu della testata, senza un riquadro nell’ingresso.

| Funzione | Dove | Che cosa permette |
| --- | --- | --- |
| Obiettivi | `/profilo/obiettivi` | Scrivere un obiettivo o adottare e personalizzare una proposta del catalogo; collegare lavori e rivedere i progressi. |
| Calendario e diario | `/profilo/timeline` | Pianificare attività su una data o un periodo, poi annotare cosa è successo e riflettere. |
| Studiare da un PDF (pQBL) | `/profilo/pqbl` | Caricare un PDF con testo selezionabile (massimo 100 MB), generare domande e ricevere feedback; modalità apprendimento e verifica finale. `/pqbl` reindirizza qui. |
| Flashcard | `/profilo/flashcard` | Preparare mazzi di domande e risposte, modificarli e ripassare in una sessione di studio, mostrando la risposta e registrando il proprio esito. |
| Tavolo | `/profilo/tavolo` | Lavorare con materiali, idee e counselor; riaprire Tavoli salvati quando la funzione è abilitata. |
| Carte da ordinare | `/profilo/carte` | Raccogliere e ordinare pensieri in più mazzi, usando colonne, modelli e trascinamento. Non sono le Flashcard per il ripasso. |
| Confrontare alternative | `/profilo/confronto` | Confrontare alternative con criteri personali. |
| Attività | `/profilo/azioni` | Organizzare le azioni del proprio piano personale. |
| Taccuino | `/profilo/taccuino` | Scrivere contesto, difficoltà e risorse personali; conservare revisioni esplicite. |
| Cambiamenti | `/profilo/cambiamenti` | Riflettere sulle differenze fra revisioni del Taccuino e sulle prove del Libretto. |
| Libretto | `/profilo/libretto` | Raccogliere e modificare riflessioni per strumento, con esportazione PDF. |
| Portfolio | `/profilo/portfolio` | Documentare lavori con titolo, descrizione, categoria, data, collegamenti e immagini. |
| Risultati e conversazioni | `/profilo/compilazioni` | Consultare i risultati e le conversazioni disponibili nel proprio account. |
| Assegnazioni | `/profilo/assegnazioni` | Lavorare sulle proposte del docente, condividere una restituzione e leggere il riscontro. |
| Gruppi e classi | `/profilo/classi` | Consultare le proprie iscrizioni e aderire con un codice di invito. |
| Orientamento | `/profilo/orientamento` | Consultare riferimenti e opportunità resi disponibili dall’istituzione. |
| Telegram | `/profilo/telegram` | Collegare l’account per le funzioni disponibili nel bot. |

Un **Profilo** è l’insieme dei punteggi di un questionario. Il **Taccuino** è
l’autodescrizione scritta dalla persona. Il **Libretto** contiene riflessioni per
strumento. Il **Portfolio** raccoglie lavori. La **Mappa** appartiene a una sessione
Idea. Questi nomi non sono intercambiabili.

## Salvataggi, obiettivi e condivisione

Il salvataggio automatico lavora in background, senza messaggi di successo che
spostano la pagina. Eventuali errori restano visibili per permettere il recupero.
Nel Taccuino l’autosalvataggio protegge una bozza recuperabile; solo il salvataggio
manuale crea una revisione significativa nella cronologia. Non attribuire
all’assistente la scrittura automatica del Taccuino. PDF e alcuni strumenti locali
conservano il progresso nel browser: non promettere una ripresa universale fra
dispositivi. Nei moduli con Salva o Condividi occorre confermare esplicitamente.

Completare un’attività non conclude automaticamente un obiettivo. I collegamenti
fra obiettivo e risorse non ne sincronizzano o condividono il contenuto. Le
assegnazioni possono essere proposte da esplorare oppure attività con restituzione
attesa e scadenza facoltativa. “Lavora su questa assegnazione” apre l’editor nella
stessa pagina: piano e diario sono anche nel calendario. Si prepara una restituzione
separata, si controlla l’anteprima e si condivide con il docente assegnante. Le
modifiche private successive non cambiano la copia condivisa. Si può ritirare la
restituzione con il relativo riscontro conservando il lavoro personale.

Condividere il riepilogo di un obiettivo è volontario e revocabile. I gestori di un
gruppo possono già vedere Taccuino, risultati e relative conversazioni secondo i
permessi del gruppo. Non affermare che tutto nell’Area personale sia invisibile ai
docenti. Le bozze delle restituzioni e gli obiettivi collegati non sono divulgati
dal flusso delle assegnazioni. L’AI non salva, adotta, condivide o consegna al posto
della persona.

## Docenti, ricercatori e amministrazione

`/docente` gestisce gruppi/classi, contesto classe, somministrazioni, cataloghi e
assegnazioni. Il Taccuino del docente descrive il ruolo professionale ed entra nel
percorso OBIETTIVO_DOCENZA, distinto dal Taccuino personale. I docenti pubblicano
strategie e materiali direttamente; pubblicano obiettivi nei propri gruppi, mentre
il catalogo comune richiede revisione amministrativa. Possono assegnare a una persona
o a tutto un gruppo, anche vuoto: i nuovi iscritti ricevono le assegnazioni attive.
La gestione dei gruppi è distinta dall’iscrizione personale a un gruppo.

I ricercatori dispongono anche di contatti e somministrazioni tramite codici anonimi
secondo le autorizzazioni. L’amministrazione tecnica (`/admin`) configura counselor,
prompt, passi guidati, strumenti, lingue, cataloghi, modelli AI, trascrizione, basi
documentali, registri, costi e strumenti di audit. Il ruolo docente non concede
questi permessi. Le credenziali dei provider sono gestite centralmente in ai4educ
Console; CounselorBot mostra stato e controlli senza consentire di modificarle.

## Esportazioni e limiti

Sono disponibili report di sessione e Libretti in PDF, risultati salvati e sintesi
incrociate quando ci sono i dati richiesti. L’analisi combinata richiede QSA o QSAr,
ZTPI e Savickas. Le proposte AI aiutano a riflettere, non sono diagnosi o decisioni
vincolanti. Le funzioni disabilitate o non autorizzate non vanno presentate come
accessibili a ogni account. L’assistente deve indicare la pagina e il prossimo
passo utile, senza inventare pulsanti o promettere azioni eseguite automaticamente.
