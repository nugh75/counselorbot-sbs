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

Per chi ha ruolo docente, ricercatore o amministratore, la scelta compare in due
testi: nella scheda **Impostazioni della conversazione** prima di avviare e nel
menu Opzioni **dentro** la chat guidata; offre **Taccuino nel contesto**
(predefinito, studente, docente, nessuno): quale taccuino entra nel contesto della
chat per quello strumento. Il default resta quello storico
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
| Assegnazioni | `/profilo/assegnazioni` | Lavorare sulle proposte del docente, condividere una restituzione e leggere il riscontro. Lista breve con filtri (gruppo, tipo, finalità richiesta/proposta, stato) e un solo dettaglio aperto alla volta; pianificazione con spiegazione del lavoro personale; anteprima di restituzione con destinatario esplicito e copia fissa. La revoca conferma in linea sulla scheda. |
| Gruppi e classi | `/profilo/classi` | Consultare le proprie iscrizioni e aderire con un codice di invito; collegamenti contestuali alle assegnazioni del gruppo; messaggi generali del docente leggibili direttamente nella pagina; uscire da un gruppo richiede una conferma che nomina il gruppo e le conseguenze. |
| Orientamento | `/profilo/orientamento` | Consultare riferimenti e opportunità resi disponibili dall’istituzione. |
| Telegram | `/profilo/telegram` | Collegare l’account per le funzioni disponibili nel bot, con guida a tre passi (Apri il bot, Conferma, Verifica collegamento), scadenza del codice visibile e verifica automatica al ritorno nella scheda. |

In Risultati e conversazioni, «Risultato della compilazione» è aperto inizialmente e si può richiudere o riaprire premendo il titolo, anche da tastiera con Invio o Spazio. La chiusura nasconde sintesi, grafici, dettagli e conversazione con il counselor; i contenuti non vengono cancellati e «La mia lettura» resta accessibile subito sotto.

«La mia lettura» si salva esplicitamente per la compilazione selezionata. Se il
cambio di compilazione o la ricerca eliminerebbe una bozza modificata, viene
chiesta conferma prima di scartarla. Annullare conserva testo, compilazione e
ricerca precedenti. Durante il salvataggio campi, ricerca e selezione attendono
la risposta: un errore conserva la bozza e la protezione. Un salvataggio riuscito
o il ripristino dei valori salvati consente il passaggio senza avvisi. Richiudere
il risultato conserva la lettura. Non vi è autosalvataggio.

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

Nel popup di un obiettivo, salva le modifiche all’obiettivo e al metodo prima di
usare **Metti in pratica**: finché ci sono modifiche, il pulsante è disabilitato
con un’istruzione associata. Dopo il salvataggio, apre il modulo **Aggiungi
un’azione** già precompilato con il titolo della strategia. Puoi modificare titolo,
dettagli e data facoltativa; solo la conferma nel modulo crea l’azione personale
collegata all’obiettivo. Anche un obiettivo nuovo va prima salvato, poi si sceglie
e salva il metodo. Durante una bozza di azione o controllo, o un salvataggio in
corso, **Metti in pratica** resta disabilitato e non sostituisce il lavoro.
Un errore lascia le modifiche disponibili per riprovare; Annulla o la chiusura
chiedono conferma prima di abbandonare una bozza, e rifiutare conserva i campi.
Non si tratta di un’attività assegnata dal docente e non vi è autosalvataggio.

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

Con modifiche non salvate al lavoro personale o alla restituzione, chiudere il
dettaglio, aprire un’altra assegnazione (anche tramite collegamento interno) o
cambiare un filtro richiede conferma prima di applicare il passaggio. Annullare
conserva testo, assegnazione aperta e filtri precedenti. Durante un salvataggio
questi controlli attendono la risposta e gli invii duplicati sono impediti. Un
errore conserva la bozza; anche «Ricarica» chiede conferma prima di sostituirla.
Ogni salvataggio aggiorna soltanto la propria parte: salvare la riflessione non
salva né condivide una restituzione ancora in bozza. Il ritorno ai valori salvati
rimuove l’avviso. Cambiare assegnazione dopo lo scarto non trasferisce testo
all’altra. Non vi sono salvataggi o condivisioni automatici.
Il caricamento iniziale senza bozza non richiede conferme di scarto.

Condividere il riepilogo di un obiettivo è volontario e revocabile. I gestori di un
gruppo possono già vedere Taccuino, risultati e relative conversazioni secondo i
permessi del gruppo. Non affermare che tutto nell’Area personale sia invisibile ai
docenti. Le bozze delle restituzioni e gli obiettivi collegati non sono divulgati
dal flusso delle assegnazioni. L’AI non salva, adotta, condivide o consegna al posto
della persona.

## Docenti, ricercatori e amministrazione

Nel menu della header la voce verso l'area è «Area docente» con l'icona a berretto
da laurea, uguale per docenti, ricercatori e amministrazione.

`/docente` è una panoramica illustrata, come l'Area personale: il primo ingresso
è il Taccuino del docente (`/docente/taccuino`), senza form nella home. Seguono il
percorso «Obiettivi per la mia classe» (DOCENZA) e i tre gruppi (**Classe e assegnazioni**,
**Cataloghi**, **Somministrazioni e ricerca**), nello stesso ordine e con una voce
per ogni pagina. L’ordine visivo coincide con quello dei collegamenti nel DOM e
della navigazione da tastiera. Ogni voce apre una pagina dedicata con il ritorno
all’Area docenti: `/docente/classi` (gruppi e classi gestiti, contesto classe, blocco «Assegnazioni
della classe» con l’elenco in sola lettura delle assegnazioni del gruppo e il
link alla pagina dedicata con filtro già impostato),
`/docente/assegnazioni` (elenco delle assegnazioni effettuate con destinatari e restituzioni, revoca con conferma in linea sulla scheda), `/docente/catalogo-obiettivi`, `/docente/strategie`,
`/docente/materiali`, `/docente/orientamento` (solo docenti) e
`/docente/somministrazioni`. Le pagine applicano lo stesso controllo di accesso
della panoramica. Il Taccuino del docente descrive il ruolo professionale ed entra nel
percorso OBIETTIVO_DOCENZA, distinto dal Taccuino personale. I docenti pubblicano
strategie e materiali direttamente; pubblicano obiettivi nei propri gruppi, mentre
il catalogo comune richiede revisione amministrativa. Possono assegnare a una persona
o a tutto un gruppo, anche vuoto: i nuovi iscritti ricevono le assegnazioni attive.
La gestione dei gruppi è distinta dall’iscrizione personale a un gruppo.

La pagina `/docente/taccuino` si apre dall’ingresso nella home o direttamente,
anche dopo un refresh. La freccia nell’intestazione torna a `/docente`; la bozza
non salvata richiede conferma prima di uscire (Annulla conserva testo, focus e
selezione), e il salvataggio in corso blocca l’uscita. Docenti, ricercatori e
amministratori conservano lo stesso accesso, comprese le anteprime di ruolo.
Il Taccuino studente rimane distinto in `/profilo/taccuino`: un account con
entrambi i ruoli sceglie quale pagina aprire, senza trasferimenti automatici.

Il Taccuino del docente è un’autodescrizione del ruolo e della pratica abituale,
con sei campi **facoltativi**, nell’ordine: discipline abituali, esperienza di
insegnamento sintetica, come insegno di solito, panoramica dei miei incarichi e
contesti, interessi per la mia crescita, altre informazioni sul mio ruolo.
I campi sono raccolti in tre gruppi sempre aperti:

- **Il mio ruolo**: discipline ed esperienza;
- **La mia pratica e i miei contesti**: pratica abituale e incarichi;
- **La mia crescita e altre informazioni**: interessi e note.

Tutti i campi restano visibili e facoltativi, senza un percorso obbligatorio.
Su schermi stretti i comandi e il messaggio di vuoto possono andare a capo.
Gli hint visibili associati ai campi distinguono pratica generale e **Contesto
classe**, interesse personale e obiettivo didattico per la classe, nota breve e
singolo episodio o lavoro. Gli hint restano visibili anche nei campi compilati e
sono associati alla rispettiva textarea. Il messaggio di vuoto usa frasi brevi
anche in tedesco e svedese, mantenendo i comandi nella disposizione attuale.
Le note non creano né gestiscono classi, non concedono
permessi istituzionali, non pubblicano cataloghi e non archiviano artefatti.
Per episodi e lavori restano disponibili Evento professionale, Linea del tempo e
Portfolio; evita dati identificativi dei partecipanti nelle note sul tuo ruolo.

Il default è il taccuino **docente** per OBIETTIVO_DOCENZA e quello **studente** per
gli altri strumenti. Nelle Opzioni della chat il docente può scegliere Predefinito,
Studente, Docente o Nessuno. La scelta riguarda il contesto del taccuino, non
ogni dato dell’intera conversazione: la **Lettura** è regolata separatamente
(disabilitata per DOCENZA); **Nessuno non significa anonimato**.
Puoi procedere con il taccuino vuoto: nelle conversazioni didattiche possono
contribuire anche le classi selezionate, secondo il contesto scelto.
Scrivi in modo sintetico ed esplicita nel turno i dettagli rilevanti: restano
600 caratteri per campo e 1.200 complessivi nel blocco del taccuino, nell’ordine
attuale, quindi le note possono non entrare tutte per intero. Salvataggio esplicito,
revisioni, API e autorizzazioni restano invariati. Restano i chiarimenti e i quattro
rimandi contestuali; il raggruppamento riguarda solo il form e non cambia il prompt.

Sotto gli hint del Taccuino del docente trovi rimandi volontari a Gruppi e classi,
Obiettivi personali, Linea del tempo e Portfolio. **Gruppi e classi** apre il popup
«Modifica classe o gruppo» senza uscire dal taccuino. Il selettore parte con
l’invito a scegliere esplicitamente tra gruppi gestiti o condivisi autorizzati;
non deduce una classe dalle note. Nome, scuola/ente, proprietario e iscritti sono
in sola lettura. Lo stesso editor della pagina Classi gestisce fascia e istituto
con PUT immediato dopo selezione; descrizione, metodologie e condivisione del
contesto richiedono **Salva**. **Annulla** scarta solo la bozza del contesto:
non annulla fascia o istituto già salvati. Cambio classe e chiusura (X, Esc,
sfondo, Annulla) chiedono «Continua a modificare» o «Scarta modifiche e prosegui»
quando il contesto è modificato. Ogni PUT in corso blocca cambio e uscita;
un errore conserva il testo e offre un nuovo tentativo. Le modifiche successive
all’invio sopravvivono al salvataggio e rimangono da salvare. Il popup distingue
caricamento, errori recuperabili, lista vuota e accesso negato. Il dialogo mantiene
il focus al proprio interno e lo restituisce alla chiusura.

La bozza privata del taccuino resta montata e conservata aprendo/chiudendo il
popup. Scegliere una classe non salva dati, non modifica sessione, taccuino,
notebook_context o contesto chat e non trasferisce testo in URL o prefill.
La pagina Classi resta raggiungibile dalla normale navigazione; creazione,
membri, inviti, assegnazioni e gestione restano lì. Nessun nuovo autosave,
endpoint, grant, campo o migrazione. I sei campi del taccuino, limiti 600/1.200,
ordine, consenso, default e protezioni rimangono invariati.

Gli altri tre rimandi continuano a navigare verso Obiettivi personali, Linea
del tempo e Portfolio senza parametri o prefill. Gli obiettivi personali
riguardano la tua crescita; il percorso per la classe è separato in alto.
Aprire questi rimandi non copia note né crea, salva, pubblica o condivide
contenuti. Con una bozza privata modificata, conferma lo scarto per uscire o
annulla per conservare testo, focus e selezione. Attendi il salvataggio in corso;
un errore conserva bozza e protezione. Ripristinare i valori salvati rimuove la
protezione; una nuova scheda conserva la bozza nel tab originale. Nessuna cache
persistente delle bozze del docente o dei dati del popup tra account.

La pagina **Gruppi e classi** mette la creazione prima dell’elenco e i campi
modificabili prima degli inviti e della gestione dentro ogni scheda. Tutte le
classi e i gruppi partono aperti: puoi comprimerli e riaprirli da tastiera senza
perdere la bozza o avviare operazioni. La chiusura conserva anche note e messaggi
in bozza di un dettaglio partecipante già aperto. Nome e scuola/ente rimangono in sola
lettura dopo la creazione; fascia e istituto si salvano quando cambia la tendina.
Descrizione, metodologie e condivisione del contesto con gli studenti richiedono
**Salva**. Lo stato della bozza, il salvataggio e gli errori rimangono visibili
anche a scheda chiusa. **Riprova salvataggio** ripete l’operazione fallita,
conservando il contesto scritto; i dati salvati non vengono trasferiti a un’altra
classe e una risposta tardiva non cancella le nuove modifiche. Inviti,
condivisioni con colleghi, partecipanti e assegnazioni conservano azioni e
permessi esistenti. Le tre sezioni del Taccuino del docente restano sempre aperte.

Un errore nel caricamento delle classi gestite, del Taccuino del docente o delle
classi selezionabili nella chat viene segnalato con **Riprova**: non significa
che i dati siano vuoti o persi. Il messaggio di vuoto compare solo dopo una
lettura riuscita. Se una rilettura fallisce, i dati già visibili, le bozze e le
classi selezionate restano disponibili. Una rilettura riuscita non sostituisce
le modifiche non salvate del taccuino o del contesto classe.
Il taccuino e il selettore della chat offrono **Aggiorna** per una rilettura
esplicita. Finché la prima lettura non riesce, il taccuino non si può compilare
o salvare e non si possono creare nuovi gruppi. Un salvataggio fallito conserva
la bozza. Non ci sono salvataggi automatici né condivisioni aggiuntive.
Un errore recuperabile del selettore non blocca la chat e non azzera la scelta;
il server continua a verificare ruolo e accesso alle classi a ogni turno.
Gli errori di accesso mantengono il controllo dei permessi, senza mostrare
contenuti riservati o dettagli tecnici del server.

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

### Anteprima delle richieste dei questionari nell’amministrazione

Nelle schede **Prompt per step** e **Step guidati** si può consultare l’anteprima
accanto all’editor. In Step guidati si apre con **Anteprima della richiesta**:
non vengono caricate anteprime per tutti gli step automaticamente. Il campo del
prompt è denominato **Istruzione dello step**, perché il testo viene combinato
con istruzioni di sistema, direttive e contesto.

L’anteprima usa i valori dell’editor, anche non salvati, senza modificare il
database. Un indicatore distingue le modifiche non salvate e si può scegliere
di mostrare la configurazione salvata. Si può scegliere counselor, lingua, sessione e simulare ingresso
nello step o risposta dello studente. La vista **Per componenti** mostra i blocchi
preparati, la provenienza disponibile e componenti esclusi o senza contenuto;
**Messaggi completi** mostra sistema, cronologia e messaggio corrente nell’ordine
simulato dopo l’adattamento alla capacità del modello. Sono disponibili ricerca,
copia e il rapporto di riduzione del contesto. Le selezioni dei componenti nella
scheda Prompt per step richiedono un salvataggio esplicito.

È una simulazione amministrativa, non la registrazione della richiesta inviata
al provider: non esegue chiamate LLM, recuperi esterni o handler delle skill.
Senza sessione possono mancare punteggi e dati personali. Il recupero non eseguito
è segnalato; la vista dei componenti precede eventuali riduzioni, mentre i
messaggi completi riflettono il budget simulato. Le trasformazioni specifiche del
provider, compresa l’anonimizzazione esterna, non sono riprodotte. In caso di
aggiornamento o errore, il contenuto precedente è dichiarato non aggiornato e la
copia è disabilitata. I testi di anteprima supportano le sei lingue dell’interfaccia.

L’editor dei prompt per step presenta un solo gruppo di selettori per sessione,
counselor e lingua; i dati della sessione compaiono nell’anteprima, senza duplicati
nell’editor. Appunti e selezioni dei componenti sono approfondimenti richiudibili.
Una risposta dello studente vuota richiede un messaggio di prova prima di generare
l’anteprima. L’assenza del modello e i principali limiti della simulazione sono
spiegati nella lingua dell’interfaccia; gli avvisi originali restano nei dettagli
tecnici. I blocchi distinguono inclusione simulata, esclusione, dato assente e
recupero non eseguito. Tutti gli strumenti che condividono il pannello e le sei
lingue usano lo stesso comportamento.

La stampa delle pagine con anteprima nasconde testata fissa e navigazione,
espande gli approfondimenti e rende stampabili i testi delle bozze senza aree a
scorrimento. Dopo la stampa ripristina l’apertura precedente dei blocchi. Queste
regole non modificano le altre pagine dell’applicazione.
Il testo modificabile di uno step guidato è stampabile anche quando il suo
pannello di anteprima è chiuso; non occorre aprire ogni anteprima per stampare
le istruzioni degli step.

### Prompt QSA di fabbrica e appartenenza degli step

Il percorso QSA di fabbrica contiene dieci step: presentazione, lettura dei
fattori cognitivi e affettivi, sei letture tematiche di secondo livello e sintesi.
Le istruzioni per il modello sono in inglese; la direttiva di lingua determina
le risposte del counselor nelle sei lingue dell’applicazione. I testi di fabbrica
seguono la Guida Costruzione Prompt QSA: lettura dei soli fattori pertinenti,
etichette e inversioni già calcolate, domanda riflessiva e al massimo una
strategia certificata quando il turno la consente. Presentazione e lettura dei
fattori non introducono consigli; la sintesi non introduce strategie nuove.
Un consiglio richiesto esplicitamente in un follow-up può attivare una strategia
nei passaggi consentiti, rispettando le esclusioni salvate dall’amministratore.

Le presentazioni QSAr, ZTPI e Savickas appartengono ai rispettivi strumenti e
non compaiono tra gli step QSA. I record di fabbrica precedentemente classificati
come QSA vengono riclassificati senza riscrivere istruzioni o traduzioni.
Le opzioni dell’editor QSA mostrano i valori di fabbrica dello step quando manca
una configurazione salvata; i valori salvati continuano a prevalere.

Un database esistente mantiene i propri testi: l’allineamento dei vecchi prompt
di fabbrica si applica mediante un piano controllato con hash e storico, con
possibilità di rollback. I prompt personalizzati sono segnalati e preservati.

### Allineamento dei prompt di fabbrica per tutte le chat

In Amministrazione, «Allinea prompt di fabbrica» apre il confronto dei prompt
salvati con i default aggiornati di tutte le chat e dei dodici percorsi guidati.
Comprende prompt di sistema, step, direttive condivise e contesti configurabili
degli assistenti; impostazioni operative, testi dell’interfaccia, varianti per
lingua e persone dei counselor restano esclusi. Le istruzioni di fabbrica per
il modello mantengono l’inglese; il pannello è disponibile nelle sei lingue.

L’anteprima identifica gli step con strumento, etichetta e ID, e mostra testo
attuale e nuovo testo, insieme ai prompt personalizzati
o assegnati a un altro strumento che vengono conservati. Aprire o chiudere il
confronto non modifica il database. Solo «Conferma allineamento» applica il lotto
visualizzato e conserva i testi precedenti nello storico. Se un prompt cambia
dopo l’anteprima, occorre ricaricare il confronto: non viene applicato un lotto
parziale. Le modifiche nell’editor e i salvataggi in corso bloccano l’allineamento;
durante l’operazione i controlli dell’editor attendono la risposta.
Anche i salvataggi o ripristini contemporanei di un altro amministratore
attendono l’allineamento, compresi quelli che confermano un testo identico.

Si aggiornano solo istruzioni registrate e riconosciute come fabbrica tramite
hash precedenti o revisioni seed/migration; la proprietà amministrativa prevale.
Un salvataggio esplicito dell’amministratore rende il testo protetto anche se
coincide con la versione di fabbrica. I testi aggiornati dal pulsante rimangono
riconoscibili come fabbrica per gli allineamenti successivi. La conferma aggiorna
gli editor della pagina; non richiama un LLM e non richiede comandi nel terminale.
