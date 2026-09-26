# CounselorBot: funzionalità e interfaccia attuali

Aggiornato: 26 settembre 2026. Questo è il riferimento operativo dell’Assistente
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

La testata mette in evidenza i quattro ingressi principali: **Bussola**,
**Assistente**, **Guida** e **Profilo**. Le voci legate al ruolo (**Area docente**
per docenti/ricercatori, **Amministrazione** per gli admin) restano nel menu a tre
punti, insieme a uscita e preferenze; su schermi stretti il menu raccoglie tutte
le voci nello stesso ordine.

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
  Senza parametro `audience` il percorso segue il ruolo: docenti, ricercatori e
  amministratori aprono la versione docente, studenti e visitatori quella
  studente, e solo chi può usare l’assistente docente vede il selettore dei due
  percorsi. Tutte le 15 sezioni personali e le 7 sezioni per docenti includono almeno uno
  screenshot pertinente; le schermate della piattaforma sono disponibili nelle
  sei lingue, mentre le due viste della chat sono dimostrazioni in italiano.
- Interfaccia e conversazioni: italiano, inglese, spagnolo, francese, tedesco e
  svedese. Sono disponibili tema chiaro/scuro, navigazione responsive e lettura vocale dal menu a tre punti.

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
  una Mappa cumulativa della sessione, distinta da Profilo, Taccuino e Lettura.
- **Evento significativo di studio** (`EVENTO_STUDIO`) e **Evento significativo
  professionale** (`EVENTO_PROFESSIONALE`): rileggono un solo episodio, anche positivo,
  in sei passi (episodio, fatti, cosa ha funzionato, difficoltà, seconda lettura,
  prossima volta), seguiti dalla sintesi al passo 7. La sintesi è una bozza di
  tappa della Linea del tempo da rivedere e salvare esplicitamente; ciò che si
  proverà la prossima volta può diventare un obiettivo. Non sono eventi del calendario.
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

Per chi ha ruolo docente, ricercatore o amministratore, lo stesso menu offre
**Taccuino nel contesto** (predefinito, studente, docente, nessuno): quale taccuino
entra nel contesto della chat per quello strumento. Il default resta quello storico
— Taccuino del docente per Obiettivi per la mia classe, Taccuino dello studente per
tutti gli altri strumenti — e «predefinito» non invia nulla al server. La scelta
vale per il solo browser in uso, sopravvive alla chiusura e alla ripresa di una
sessione congelata, ed è riverificata a ogni turno dal server: senza uno di questi
ruoli vale sempre il default. Con «studente» o «nessuno» le classi della chat
docenza restano fuori dal contesto; con «nessuno» la chat resta valida ma senza
taccuini.

La generazione può essere interrotta; “Continua” riprende una risposta incompleta.
Le risposte possono essere ascoltate; i controlli dei messaggi offrono diagrammi
e feedback quando disponibili. Il lettore nel menu di navigazione legge il testo visibile,
con impostazioni di voce e motore; la correzione della pronuncia è visibile solo
all’amministratore. La chat guidata e la Bussola accettano
registrazione del microfono o file audio: la trascrizione è da controllare, salvo
invio immediato scelto esplicitamente. In conversazione vocale si avvia e si ferma
la registrazione; il microfono non riparte da solo.

Le conversazioni guidate con progressi si salvano dopo le risposte per essere
riprese anche da un altro dispositivo. Congela sessione salva e chiude. La ripresa
riporta percorso e conversazione, ma non garantisce memoria illimitata del modello.
Eliminare un punto di ripresa non elimina i risultati del questionario o gli altri
lavori. Il progresso PDF, invece, è locale al browser.

## Area personale e strumenti

**Testata comune (26 settembre 2026):** tutte le pagine dell’Area personale
(Taccuino, Risultati, Assegnazioni, Classi, Telegram, Portfolio, Tavolo,
Orientamento, Azioni, Carte, Confronto, Linea del tempo, Flashcard e pQBL) hanno
la stessa testata: a sinistra il collegamento **Area personale**, sempre diretto
all’ingresso; sotto l’immagine, il titolo e la descrizione. Il pannello «Vai a…»
è stato rimosso su richiesta dell’utente.

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

Seguono cinque gruppi sempre aperti: **Conoscermi e riflettere**, **Il mio percorso**,
**Studiare e ragionare**, **I miei lavori**, **Persone e supporto**. Le 17 destinazioni
hanno immagini già presenti, nome e descrizione, su due colonne desktop e una mobile.
Analisi combinata dei profili è uno strumento autonomo in Conoscermi e riflettere,
accanto a Taccuino, Cambiamenti e Risultati e conversazioni; Portfolio resta nel gruppo
I miei lavori. Anche senza questionari o obiettivi si può aprire ciascuno strumento.
I dati account restano nel menu della testata, senza un riquadro nell’ingresso.

| Funzione | Dove | Che cosa permette |
| --- | --- | --- |
| Obiettivi | `/profilo/obiettivi` | Organizzare gli obiettivi in una rete, dal perché al come: sopraobiettivi e sottobiettivi, anche con più genitori; toccare un obiettivo per modificarlo in una finestra popup, dove si scrive un nuovo obiettivo o si adotta e personalizza una proposta del catalogo (in creazione restano visibili titolo, motivazione e data di revisione; criteri, priorità, stato e condivisione sono sotto «Più dettagli»); scegliere un metodo (strategie certificate o proprie), pianificare azioni e controlli, collegare prove e lavori; chiudere con un bilancio, che diventa una tappa della Linea del tempo; scaricare il PDF «Percorso dell’obiettivo»; condividere un ramo con i docenti di un gruppo (mai i sopraobiettivi). Su computer anche vista mappa. Completare un’attività non conclude automaticamente un obiettivo: lo stato resta sempre manuale, è la persona a rivederlo. |
| Linea del tempo | `/profilo/timeline` | Vedere tutto nel tempo: tappe passate, azioni datate, revisioni degli obiettivi e appuntamenti dell’istituto, con vista calendario e filtri per tipo. Qui si aggiungono solo tappe passate, con data o periodo, simbolo, diario, collegamenti al Portfolio e la rilettura dell’esperienza (cosa ha funzionato, cosa proverò), che può diventare un obiettivo o un’azione; per le tappe future o senza data compare anche «Cosa programmo»; una legenda spiega i simboli; azioni e obiettivi si aprono sulle loro pagine. |
| Studiare da un PDF (pQBL) | `/profilo/pqbl` | Caricare un PDF con testo selezionabile (massimo 100 MB), generare domande e ricevere feedback; modalità apprendimento e verifica finale. `/pqbl` reindirizza qui. |
| Flashcard | `/profilo/flashcard` | Preparare mazzi di domande e risposte, modificarli (il nome del mazzo si cambia direttamente nella pagina: Invio salva, Esc annulla) e ripassare in una sessione di studio, mostrando la risposta e registrando il proprio esito. |
| Tavolo | `/profilo/tavolo` | Lavorare con materiali, idee e counselor; riaprire Tavoli salvati quando la funzione è abilitata. In cima c’è «I tuoi tavoli salvati» (aprire, rinominare nella riga, eliminare); sotto, in «Crea un nuovo tavolo», la creazione manuale, la composizione con AI e la scelta di counselor e modello, che contano solo per la creazione con AI. |
| Carte da ordinare | `/profilo/carte` | Raccogliere e ordinare pensieri in più mazzi, usando colonne, modelli e trascinamento; mazzi e colonne si rinominano direttamente nella pagina. Non sono le Flashcard per il ripasso. |
| Confrontare alternative | `/profilo/confronto` | Confrontare alternative con criteri personali, in quattro passi visibili: Alternative → Criteri → Confronto → Scelta. Criteri, schede e scelta compaiono dopo aver inserito almeno un’alternativa. |
| Azioni | `/profilo/azioni` | Organizzare le azioni del proprio piano personale; ogni azione può avere una data facoltativa (giorno o periodo) e il collegamento «Vedi sulla linea del tempo». Le carte si leggono come testo (titolo, fase, tipo, data) e si modificano una alla volta con «Modifica» (titolo, spostamento, dettagli, date), chiudendo con «Chiudi»; il salvataggio resta quello della pagina. Anche il testo scritto in un modulo di creazione e non ancora aggiunto (azione, carta, criterio, alternativa) conta come modifica non salvata e fa chiedere conferma prima di uscire. |
| Taccuino | `/profilo/taccuino` | Scrivere contesto, difficoltà, risorse personali e ciò che conta per sé; conservare revisioni esplicite; trasformare la difficoltà principale in un obiettivo. |
| Cambiamenti | `/profilo/cambiamenti` | Riflettere sulle differenze fra revisioni del Taccuino. |
| Portfolio | `/profilo/portfolio` | Documentare lavori con titolo, descrizione, categoria, data, collegamenti e immagini; collegare un lavoro a un obiettivo attivo con «Collega a un obiettivo». Chiudere con la X un modulo con modifiche non salvate chiede conferma prima di scartarle. |
| Risultati e conversazioni | `/profilo/compilazioni` | Consultare i risultati e le conversazioni disponibili nel proprio account; scrivere «La mia lettura» di ogni risultato (punti di forza, aree da far crescere, cosa mi dice di me) e renderne un’area un obiettivo. |
| Analisi combinata dei profili | `/profilo/analisi-combinata` | Generare una lettura integrata di almeno due strumenti tra QSA, QSAr e ZTPI. Si apre dal gruppo Conoscermi e riflettere e non compare più sotto i singoli risultati. |
| Assegnazioni | `/profilo/assegnazioni` | Lavorare sulle proposte del docente, condividere una restituzione e leggere il riscontro. Lista breve con filtri (gruppo, tipo, finalità richiesta/proposta, stato) e un solo dettaglio aperto alla volta; pianificazione con spiegazione del lavoro personale; anteprima di restituzione con destinatario esplicito e copia fissa. |
| Gruppi e classi | `/profilo/classi` | Consultare le proprie iscrizioni e aderire con un codice di invito; collegamenti contestuali alle assegnazioni del gruppo; messaggi generali del docente leggibili direttamente nella pagina; uscire da un gruppo richiede una conferma che nomina il gruppo e le conseguenze. |
| Orientamento | `/profilo/orientamento` | Consultare riferimenti e opportunità resi disponibili dall’istituzione. |
| Telegram | `/profilo/telegram` | Collegare l’account per le funzioni disponibili nel bot, con guida a tre passi (Apri il bot, Conferma, Verifica collegamento), scadenza del codice visibile e verifica automatica al ritorno nella scheda. |

In Risultati e conversazioni, «Risultato della compilazione» è aperto inizialmente e si può richiudere o riaprire premendo il titolo, anche da tastiera con Invio o Spazio. La chiusura nasconde sintesi, grafici, dettagli e conversazione con il counselor; i contenuti non vengono cancellati e «La mia lettura» resta accessibile subito sotto.

Il vecchio indirizzo del libretto, `/profilo/libretto`, porta a Risultati e conversazioni.

Un **Profilo** è l’insieme dei punteggi di un questionario. Il **Taccuino** è
l’autodescrizione scritta dalla persona. La **Lettura** è ciò che la
persona legge in un risultato. Il libretto non c’è più: le sue domande vivono in
Lettura, Obiettivi (metodo, controlli, bilancio), Taccuino e Linea del tempo. Il **Portfolio** raccoglie lavori. La **Mappa** appartiene a una sessione
Idea. Questi nomi non sono intercambiabili.

## Salvataggi, obiettivi e condivisione

Il salvataggio automatico lavora in background, senza messaggi di successo che
spostano la pagina. Eventuali errori restano visibili per permettere il recupero.
Se il caricamento di Taccuino, Risultati, Portfolio, Classi o Telegram non riesce,
la scheda mostra un errore con **Riprova** invece di dire che non ci sono dati: i
dati già visibili restano e un errore non fa risultare Telegram scollegato.
Nel Taccuino l’autosalvataggio protegge una bozza recuperabile; solo il salvataggio
manuale crea una revisione significativa nella cronologia. Non attribuire
all’assistente la scrittura automatica del Taccuino. PDF e alcuni strumenti locali
conservano il progresso nel browser: non promettere una ripresa universale fra
dispositivi. Nei moduli con Salva o Condividi occorre confermare esplicitamente.

Completare un’attività non conclude automaticamente un obiettivo. I collegamenti
fra obiettivo e risorse non ne sincronizzano o condividono il contenuto. Le assegnazioni possono essere proposte da esplorare oppure attività con restituzione
attesa e scadenza facoltativa, con filtri per gruppo, tipo, finalità (richiesta o proposta)
e stato (da esplorare, pianificata, inviata, con riscontro). Nella lista dello studente si
apre una sola scheda per volta con date localizzate; nella vista docente le schede restano
sempre espanse. “Lavora su questa assegnazione” apre l’editor nella stessa pagina: la pianificazione
chiarisce che attività e tappa restano personali e non inviano nulla al docente. Si prepara
una restituzione separata: l’anteprima mostra il destinatario, il contenuto esatto e avvisa
che la copia inviata non cambia se si modifica il lavoro originale. Si può ritirare la
restituzione con il relativo riscontro conservando il lavoro personale.

Condividere il riepilogo di un obiettivo è volontario e revocabile. I gestori di un
gruppo possono già vedere Taccuino, risultati e relative conversazioni secondo i
permessi del gruppo. Non affermare che tutto nell’Area personale sia invisibile ai
docenti. Le bozze delle restituzioni e gli obiettivi collegati non sono divulgati
dal flusso delle assegnazioni. L’AI non salva, adotta, condivide o consegna al posto
della persona.

## Docenti, ricercatori e amministrazione

Nel menu della header la voce verso l'area è «Area docente» con l'icona a berretto
da laurea, uguale per docenti, ricercatori e amministrazione.

`/docente` è una panoramica illustrata, come l'Area personale: in alto il percorso
«Obiettivi per la mia classe», poi tre gruppi (**Classe e assegnazioni**,
**Cataloghi**, **Somministrazioni e ricerca**) con una voce per ogni pagina e, in
fondo, il Taccuino del docente. Ogni voce apre una pagina dedicata con il ritorno
all’Area docenti: `/docente/classi` (gruppi e classi gestiti, contesto classe, blocco «Assegnazioni
della classe» con l’elenco in sola lettura delle assegnazioni del gruppo e il
link alla pagina dedicata con filtro già impostato),
`/docente/assegnazioni`, `/docente/catalogo-obiettivi`, `/docente/strategie`,
`/docente/materiali`, `/docente/orientamento` (solo docenti) e
`/docente/somministrazioni`. Le pagine applicano lo stesso controllo di accesso
della panoramica. Il Taccuino del docente descrive il ruolo professionale ed entra nel
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
