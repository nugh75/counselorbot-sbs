# CounselorBot: funzionalità e interfaccia attuali

Aggiornato: 7 ottobre 2026. Questo è il riferimento operativo dell’Assistente
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

L’accesso personale usa l’account della Console ai4educ collegata all’installazione.
Login, uscita e collegamenti a Portale, Console e Segreti seguono i domini
configurati per quella installazione; dopo il login si torna alla pagina richiesta
di CounselorBot. Nell’installazione `counselorbot.labform.net` l’account è quello
gestito da `auth.labform.net` e `manager.labform.net`. Il collegamento **Segreti**
dell’amministrazione seleziona il progetto Docker di questa installazione.
Le funzioni AI richiedono
un provider configurato dall’amministratore; la sola disponibilità del sito e
dell’account non garantisce che chat, ricerca con embeddings o OCR siano attivi.
Quando mancano le impostazioni iniziali,
si scelgono counselor e Taccuino. La scelta del counselor resta nell’account e può
essere modificata dalla pagina dei counselor. Metodo di inserimento dei risultati
e modalità di conversazione si ricordano solo selezionando l’apposita casella nella
rispettiva schermata; le preferenze già memorizzate restano valide. Idea chiede la
modalità ogni volta e non cambia la preferenza degli altri strumenti.

### Identità, categorie di approccio e interfaccia selettore counselor

Ogni counselor dispone di un’identità visiva e pedagogica riconoscibile:
- **Frase distintiva (tagline)**: breve sintesi multilingua dello stile di accompagnamento (es. chiarire sfumature con domande, spazio empatico di ascolto, azioni pratiche dirette, metodo strutturato).
- **Categorie di approccio**: appartenenza multipla a categorie base (`filosofo`, `psicologo`, `docente`, `orientatore`, `tutor`) e tratti specifici (`maieutico`, `empatico`, `pragmatico`, `analitico`, `motivazionale`, `metodico`).
- **Copertina e illustrazione YouTube-style (16:9)**: riferimento visivo dedicato alla persona virtuale (`avatar_url`), con illustrazioni vettoriali SVG panoramiche in formato 16:9 (`viewBox="0 0 320 180"`) per ciascuno dei 26 counselor della piattaforma (Marco, Sara, Luca, Elena, Davide, Giulia, Nadia, Nora, Giulio, Iride, Clio, Bruno, Minerva, Bianca, Erik, Carmen, Otto, Teo, Sonia, Rocco, Aidan, Camille, Luz, Vera, Omar, Gemini) disegnate con la palette di sistema (teal, ardesia, indaco con accenti caldi ambra/arancio/oro) che illustrano il mondo, la metafora o il mestiere di ciascun counselor prima della descrizione.
- **Ricerca e raccomandazione per approccio**: ricerca libera in linguaggio naturale (es. «Vorrei qualcuno che mi faccia riflettere con domande...») che consiglia il counselor più adatto spiegando la motivazione, con filtri per lingua, audience e strumento.

Nell'interfaccia utente del selettore counselor (`CounselorSelector`):
- Ciascuna scheda mostra avatar, nome, frase distintiva localizzata in base alla lingua attiva, badge delle categorie di approccio e dettagli del modello AI impiegato.
- Sopra l'elenco è presente una barra di ricerca per approccio («Che tipo di counselor vorresti?») con pulsante di ricerca e scheda di proposta che evidenzia il counselor consigliato, la motivazione e un pulsante per selezionarlo direttamente con un click.
- Sopra le schede è disponibile un filtro rapido a chip per categorie di approccio («Tutti», chip con selezione multipla e pulsante «Azzera filtri»); il selettore mostra solo i counselor che contengono tutti i tag selezionati (logica AND), preservando la priorità dell'eventuale counselor raccomandato se rispetta tutti i filtri attivi.

## Bussola, Assistente e Guida


- **Bussola** (`/bussola`): conversazione per orientarsi fra gli strumenti. Non
  somministra questionari, non raccoglie punteggi e non svolge al proprio interno
  le altre interviste. Le raccomandazioni aprono gli strumenti nelle loro pagine.
- **Assistente** (`/assistente`): risponde sui materiali della base selezionata,
  con modalità studente o docente. Per l’interfaccia e le funzionalità scegliere
  **CounselorBot**. Le altre basi restano distinte; non attribuire alla piattaforma
  le funzioni di competenzestrategiche.it. Il presente documento viene letto a ogni
  richiesta CounselorBot; i documenti di approfondimento sono recuperati dall’indice.
- **Guida interfaccia** (`/guide`): con percorsi per uso personale e per docenti,
  immagini ingrandibili e collegamenti alle sezioni. È pubblica anche senza login
  nelle installazioni che consentono accesso pubblico; su `counselorbot.labform.net`
  l'intero sito, inclusa la Guida e le sue immagini, richiede l'accesso Console.
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
- **Strumenti e percorsi personalizzati**: gli strumenti e le chat guidate create
  e attivate dall'amministrazione compaiono dinamicamente nel catalogo attività
  dello studente (nella sezione dei percorsi guidati o delle analisi questionari a
  seconda della categoria), con nome, icona, tema e descrizione localizzata.
  Dalla scheda (`/strumenti/<codice>`) è possibile visualizzarne le caratteristiche
  e avviare la chat guidata. Gli strumenti disattivati o riservati ai docenti sono
  esclusi dal catalogo studente.

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
(predefinito, studente, docente, prova, nessuno): quale taccuino entra nel contesto della
chat per quello strumento. Il default resta quello storico
— Taccuino del docente per Obiettivi per la mia classe, Taccuino dello studente per
tutti gli altri strumenti — e «predefinito» non invia nulla al server. La scelta
vale per il solo browser in uso, sopravvive alla chiusura e alla ripresa di una
sessione congelata, ed è riverificata a ogni turno dal server: senza uno di questi
ruoli vale sempre il default. Con «studente» o «nessuno» le classi della chat
docenza restano fuori dal contesto; con «nessuno» la chat resta valida ma senza
taccuini.

Con «prova» il docente sceglie sotto il selettore uno dei suoi **Taccuini di prova**
(studenti immaginari creati in `/docente/taccuini-prova`) e vive la chat guidata dal
lato dello studente per allenarsi a guidarla prima delle sessioni reali. Vale per tutti
gli strumenti guidati e per la Bussola, dove le Opzioni offrono solo «predefinito» e
«prova». Il contesto riceve il taccuino simulato al posto dei dati del docente
(taccuino, portfolio, obiettivi, lettura, classi; nella Bussola anche compilazioni e
sessioni) e un’istruzione separata, nella lingua dell’interfaccia, che dice al
modello che lo studente è simulato e che si tratta dell’allenamento del docente. Il
server accetta solo un taccuino del docente stesso e non archiviato, riverificando il
ruolo a ogni turno: un taccuino archiviato o eliminato non viene sostituito da dati
reali, il contesto resta senza taccuino. Uno studente non può usare taccuini di prova.

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

La sezione **API e ChatGPT** è in fondo alla panoramica dell’Area personale
(`/profilo`) e dell’Area docenti (`/docente`), dopo tutte le sezioni degli strumenti.
Raccoglie i collegamenti alle API personali e all’abbonamento ChatGPT abilitati
per l’installazione, su due colonne da desktop e una da mobile.
Se nessuna delle due funzioni è attiva, la sezione non compare.

### Abbonamento personale ChatGPT (opzionale)

L’amministratore apre **Amministrazione → Configurazione → Generale →
AI dello studente: proprie chiavi e proprio ChatGPT → Collegamento ChatGPT** e preme **Abilita collegamento ChatGPT**. Il server
prepara automaticamente la protezione delle credenziali e salva la scelta:
non servono comandi, modifica di file o riavvio. L’interfaccia indica lo stato
e conferma subito il salvataggio. Il controllo è riservato agli amministratori;
non è disponibile ai ricercatori o alle anteprime di ruolo.

**Disabilita collegamento ChatGPT** nasconde la funzione agli utenti e conserva
gli account collegati. Le nuove richieste usano il modello dell’installazione. La riattivazione mantiene i collegamenti. Se la chiave di
protezione manca per account esistenti, occorre ripristinarla dal backup del
server; il pannello non la sostituisce automaticamente. Chi gestisce il server
deve includere l’archivio protetto delle credenziali nei backup.

Nell’Area personale (`/profilo/chatgpt`) e nell’Area docenti (`/docente/chatgpt`),
**Il tuo abbonamento ChatGPT** consente il collegamento quando la funzione è
attiva. Se disabilitata, la voce, i badge e la sezione della Guida non compaiono;
un accesso diretto rimanda alla rispettiva area personale. **Apri il tuo collegamento ChatGPT** nel pannello
amministrativo porta direttamente a questa scheda. L’accesso a
CounselorBot e quello a ChatGPT sono distinti. La funzione usa il flusso ufficiale
Sign in with ChatGPT per inferenza diretta, attualmente in anteprima: piani e
installazioni ammessi vanno verificati prima dell’attivazione; un piano di
scuola/università non è automaticamente ammesso.

**Collega ChatGPT** genera un codice di associazione CounselorBot, valido dieci
minuti: non è un token o una chiave API OpenAI. Se disponibile, **Scarica
l’assistente grafico per macOS** scarica un’app per Mac Intel e Apple Silicon,
senza Python né terminale. La persona copia il codice, estrae lo ZIP e apre
l’assistente sullo stesso Mac del browser; incolla il codice e preme **Collega**.
Si apre l’accesso ufficiale a ChatGPT e il trasferimento delle credenziali avviene
automaticamente. L’app non è notarizzata da Apple: l’eventuale autorizzazione
all’apertura si gestisce dalle impostazioni macOS, come indicato nel pannello.

La sezione **Collegamento da terminale (anche SSH)** conserva lo strumento
Python 3.10+. Il codice incollato è visibile: premere Invio per confermare;
`--hide-code` permette l'inserimento nascosto. L'assistente grafico va aperto
sul computer del browser. La CLI può funzionare sullo host SSH usando
`--no-browser --callback-port 1455`: inoltrare dal computer del browser
`127.0.0.1:1455` alla stessa porta dello host e aprire nel browser l'URL mostrato.
Il callback resta locale; il loopback del container code-server è separato
da quello dello host e richiede un inoltro verso il container stesso.
Il backend verifica e conserva cifrate le
credenziali; non vanno incollate nell’interfaccia o nella chat. L’ingress
portabile consente solo i tre endpoint con codice di associazione temporaneo;
le pagine personali e le altre API continuano a richiedere il login Console.

Dopo il collegamento occorre scegliere un modello tra quelli disponibili per
il proprio account e premere **Usa il mio abbonamento**. Collegare l’account
da solo non cambia il modello. La scelta personale precede il preset del
counselor, mantenendo chat e memoria in CounselorBot. La scheda e le impostazioni
chat mostrano la scelta; la quota si consulta nelle impostazioni di ChatGPT
e non viene convertita in costi API stimati.

Ogni persona usa il proprio collegamento: quello di un docente non viene
usato dagli studenti. Consultare un risultato altrui non seleziona l’abbonamento
del proprietario del risultato. I profili di prova non usano abbonamenti.
Credenziali scadute/revocate richiedono un nuovo accesso; indisponibilità
temporanee conservano il collegamento. Quota esaurita e risposte interrotte
producono un avviso, senza passaggio automatico alle API a pagamento.

**Usa il modello dell’installazione** disattiva la preferenza personale.
**Scollega** elimina le credenziali locali e tenta la revoca presso OpenAI:
se non confermata, controllare anche le connessioni nelle impostazioni ChatGPT.
La registrazione resta disponibile per ricollegare lo stesso account. Dopo
averlo scollegato, **Collega un altro account ChatGPT** azzera la registrazione.

La modalità copre chat native, Bussola, sintesi e strumenti testuali che usano
il servizio AI autenticato. OpenCode richiede la scelta esplicita del modello
dell’installazione: le credenziali personali non passano agli agenti. RAG ed
OCR continuano a usare i servizi dell’installazione. OpenAI elabora i messaggi:
`store: false` non garantisce assenza di conservazione presso il fornitore;
il filtro locale dei dati personali segue la configurazione esistente.

Nell’anteprima amministrativa, **Richiesta Responses per ChatGPT** mostra
endpoint, istruzioni e messaggi quando l’amministratore ha selezionato il
proprio abbonamento. La struttura precede il filtro dei dati personali;
la simulazione non chiama modelli e non espone credenziali. I prompt restano
in inglese e l’interfaccia è disponibile nelle sei lingue.

Configurazione e limiti: `docs/operations/chatgpt-subscription.md`.

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

## API personali

Quando l’amministratore abilita **API personali** in **Amministrazione →
Configurazione → Generale → AI dello studente: proprie chiavi e proprio ChatGPT**,
studenti e docenti trovano il collegamento nella propria pagina personale:
`/profilo/api-personali` per l’Area personale e `/docente/api-personali` per
l’Area docenti. Le due pagine condividono le impostazioni dello stesso account.
La funzione è disabilitata per default e il ricercatore non può abilitarla.
L’attivazione prepara automaticamente la protezione delle chiavi: non occorre
configurare variabili, modificare file o eseguire comandi sul server. Le chiavi
sono conservate dopo riavvii e aggiornamenti; l’archivio protetto va incluso
nei backup insieme al database.

La persona può salvare **più connessioni AI**, ciascuna con nome riconoscibile,
provider, modello e chiave API, anche dello stesso provider o di account esterni
diversi. Le chiavi sono cifrate e non vengono restituite né mostrate dopo il
salvataggio. In modifica, il campo vuoto conserva la chiave per quel provider;
cambiarlo richiede una chiave nuova. L’eliminazione di una connessione chiede
conferma, rimuove la chiave e le associazioni e conserva i counselor.

Nella stessa pagina si può associare ciascuna connessione a **uno o più counselor**.
I counselor mantengono la propria personalità e i prompt del percorso, usando
modello e chiave della connessione assegnata. La connessione predefinita si
applica ai counselor senza associazione e alle funzioni senza counselor; può
essere impostata su API di sistema. La lista counselor mostra il modello
assegnato nell’account. Le scelte non cambiano i counselor dell’istituzione.
**Usa le mie API personali** e **Salva associazioni e utilizzo** attivano le scelte;
la disattivazione torna alle API di sistema. API personali e abbonamento ChatGPT
restano alternative, conservando tutte le credenziali.

Studenti e docenti possono **creare counselor personali**, con nome, descrizione
e istruzioni **nella propria lingua**, senza traduzione obbligatoria. Le
istruzioni si aggiungono alle regole del percorso. I prompt di fabbrica restano
in inglese. I counselor sono privati nell’account: non compaiono agli altri utenti,
nel catalogo amministrativo o nei flussi di allineamento dei prompt. Si possono
modificare o eliminare con conferma e selezionare nelle nuove conversazioni.

**Prova connessione e modello** invia su richiesta un breve messaggio neutro al
modello salvato, senza contenuti personali. Consuma quota e può avere un costo;
la pagina lo indica prima della prova. Quota esaurita, modello indisponibile,
chiave rifiutata, limite di richieste e servizio di protezione dei dati assente
hanno messaggi distinti nelle sei lingue, anche negli step guidati. Una prova
breve riuscita non garantisce quote future o capacità sull’intero percorso.
La chat distingue anche un servizio non raggiungibile, una sessione di accesso
non valida e un passaggio incompatibile con la configurazione corrente. Questi
messaggi rimangono leggibili nelle sei lingue anche quando il problema precede
l’inizio della risposta; i dettagli grezzi del provider restano nascosti.
**Ripeti passaggio** ritenta lo stesso step con il counselor scelto, conservando
la conversazione precedente. La presentazione QSA/QSAr non attiva il ragionamento
del modello, anche con configurazioni precedenti dello step.
Il modulo protegge le bozze; errori di salvataggio conservano chiave e campi.
Le configurazioni precedenti vengono conservate come connessioni predefinite.
I costi personali restano a carico dell’account provider di ciascuna chiave.

In **Amministrazione → Configurazione → Generale → AI dello studente: proprie chiavi e proprio ChatGPT →
Protezione dei dati per i modelli esterni**, il vero amministratore sceglie **Filtro di base + modello
locale** oppure **Solo filtro di base (senza Ollama)** e salva. La prima modalità
rimane quella predefinita e blocca le richieste esterne se il servizio locale
non risponde. La seconda permette di provare l’app in cloud senza modelli locali,
mantenendo il filtro automatico di email, telefoni e identificativi riconosciuti.
Non garantisce la rimozione di nomi, indirizzi o tutte le informazioni sanitarie
dal testo libero: i limiti sono mostrati prima del salvataggio. Per le prove si
usano dati fittizi. La scelta vale anche per API personali e ChatGPT; si applica
alle nuove richieste su tutti i processi senza riavvio. Nessun cambio automatico
quando si apre la pagina. Il ricercatore non può modificare questa protezione.

La scelta vale per chat, Bussola, Assistente, studio da PDF, analisi combinata,
sintesi PDF dei risultati, Tavolo e diagrammi, secondo le associazioni salvate. Il filtro dei dati per provider esterni resta applicato. I servizi
locali, la voce, i benchmark e il terminale tecnico mantengono la configurazione
di sistema. Sono ammessi i provider esterni supportati, senza URL arbitrari.
Se la chiave personale dà errore non si passa automaticamente alle chiavi di
sistema.

Spegnendo la funzione, l’amministratore fa usare le API di sistema alle nuove
richieste e nasconde i collegamenti dalle aree personali. Le richieste già
avviate terminano con la configurazione iniziale. Le chiavi salvate restano
cifrate. Anche il modulo e la sezione della Guida scompaiono: un link diretto
rimanda alla rispettiva area personale. Alla riattivazione riprende la scelta
salvata. I dettagli di attivazione automatica e ripristino sono in
`docs/operations/personal-api-settings.md`.

## Docenti, ricercatori e amministrazione

Nel menu della header la voce verso l'area è «Area docente» con l'icona a berretto
da laurea, uguale per docenti, ricercatori e amministrazione.

`/docente` è una panoramica illustrata, come l'Area personale: il primo ingresso
è il Taccuino del docente (`/docente/taccuino`), senza form nella home, seguito dai
**Taccuini di prova** (`/docente/taccuini-prova`). Seguono il
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

La pagina `/docente/taccuini-prova` raccoglie gli studenti immaginari del docente,
senza limite di numero: ognuno ha un nome e gli stessi campi del taccuino studente
(età, genere, classe/professione, anno o percorso, contesto, obiettivo, difficoltà,
punti di forza e di debolezza, note), su una sola colonna. Ogni studente di prova
può essere associato a una o più classi gestite o condivise con il docente: nella
chat simulata entra il contesto di quelle classi solo dove il docente ha attivato la
condivisione con gli studenti, esattamente come per uno studente iscritto (mai in Idea
e nella Bussola); la pagina segnala le classi non condivise. Le classi sono
riverificate a ogni turno: una classe disattivata o una condivisione revocata esce
dal contesto.

Ogni taccuino di prova ha un **repertorio di prove**: profili di questionario
(QSA, QSAr, ZTPI, QPCS, QPCC, QAP, scala 1–9) dello studente simulato, più d’uno per
strumento. Si aggiungono a mano con lo stesso modulo della chat, generandone uno
plausibile da ritoccare (valori casuali più frequenti al centro della scala) oppure
arrivano dalla chat: con «Prova» attivo, i punteggi inseriti o caricati all’avvio vanno
nel repertorio del taccuino e non tra le Compilazioni del docente. Nella schermata del
metodo di inserimento il docente sceglie lo studente simulato (stessa scelta delle
Opzioni) e trova i profili del suo repertorio accanto ai propri risultati salvati. I
profili del repertorio non entrano mai nelle Compilazioni, nei confronti tra i profili
del docente né nei dati di ricerca; in prova il confronto tra compilazioni usa il
repertorio dello studente simulato e la Bussola conosce gli strumenti che ha già
«compilato» (tipo e data, senza punteggi). Si creano, modificano, archiviano, ripristinano
ed eliminano (con conferma) con salvataggio esplicito; gli archiviati non compaiono
nelle Opzioni della chat. Sono visibili solo al docente che li ha creati e non
contengono né toccano dati di studenti reali: la pagina invita a non inserirne.

Il Taccuino del docente è un’autodescrizione del ruolo e della pratica abituale,
con sei campi **facoltativi** su una sola colonna, come il taccuino dello studente (la nota in testa alla pagina ricorda le scelte Predefinito, Studente, Docente, Prova e Nessuno), nell’ordine: discipline abituali, esperienza di
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
questi permessi. Le credenziali di sistema dei provider sono gestite centralmente in ai4educ
Console; CounselorBot mostra stato e controlli senza consentire di modificarle.

## Esportazioni e limiti

Sono disponibili report di sessione e Libretti in PDF, risultati salvati e sintesi
incrociate quando ci sono i dati richiesti. L’analisi combinata richiede QSA o QSAr,
ZTPI e Savickas. Le proposte AI aiutano a riflettere, non sono diagnosi o decisioni
vincolanti. Le funzioni disabilitate o non autorizzate non vanno presentate come
accessibili a ogni account. L’assistente deve indicare la pagina e il prossimo
passo utile, senza inventare pulsanti o promettere azioni eseguite automaticamente.

### Sezioni della configurazione

In **Amministrazione → Configurazione & Prompt** la sezione si sceglie dal
filtro **Sezione**, non da una fila di pulsanti. Il filtro raggruppa
**Impostazioni** (Generale, Mappa dei prompt, Direttive Globali) e **Strumenti —
vista classica** (QSA, QSAr, ZTPI, Savickas, eventi significativi, obiettivi,
QPCS, QPCC, QAP, con le quattro schede storiche) e ha un campo di
ricerca che trova anche il nome esteso dello strumento. Si usa con mouse o
tastiera (frecce, Invio, Esc). La sezione scelta resta nell’indirizzo
(`/admin?section=qsa`): ricaricando la pagina o condividendo il link si riapre
la stessa sezione; un valore non riconosciuto apre Generale.

Nella sezione Generale, dopo modello attivo, ripieghi e funzioni, il blocco
**AI dello studente: proprie chiavi e proprio ChatGPT** riunisce in quest’ordine **API personali**,
**Collegamento ChatGPT** e **Protezione dei dati per i modelli esterni**. Le
**API Keys** della piattaforma sono dell’amministratore e restano fuori dal
blocco, subito sotto.

### Mappa dei prompt delle chat guidate

**Amministrazione → Configurazione & Prompt → Mappa dei prompt**
(`/admin?section=prompt-map&instrument=QSA`) mostra tutti i testi che una chat
guidata usa, dal comune al particolare, e permette di modificarli sul posto.
Si sceglie lo strumento (tutti quelli con step guidati, Idea compresa); la pagina
ha quattro livelli, ciascuno apribile e richiudibile dalla propria intestazione,
senza un menu laterale. Comune e Gruppi partono chiusi; Strumento e Step sono
aperti, con il primo step espanso. La scelta delle sezioni aperte viene conservata
nel browser per la mappa; «vai» apre anche la sezione di destinazione.
Il registro degli strumenti supporta strumenti e percorsi dinamici configurati
nel database con metadati estesi (`is_active`, `tool_category`, `description_i18n`,
`target_audience`, `icon`, `color_theme`, `interview_mode`): la mappa include
automaticamente tutti gli strumenti registrati con risoluzione convenzionale
dei testi, mentre il catalogo studenti filtra solo gli strumenti attivi mantenendo
le bozze visibili agli amministratori.
La testata della Mappa dei prompt e l'editor degli strumenti includono il pulsante
**+ Nuova Chat Guidata** / **+ Nuovo Strumento**, che apre una procedura guidata
accessibile in 3 passaggi:
1. **Dati base**: codice identificativo univoco (slug maiuscolo, es. `ORIENTA_TEST`),
   titolo e descrizione multilingua nelle 6 lingue, categoria (`guided` per chat
   conversazionali o `assessment` per questionari psicometrici), destinatari
   (`student`, `teacher`, `both`), icona, colore tema, modalità di avanzamento
   (`interactive` o `direct`) e opzione di salvataggio iniziale come bozza (`is_active=false`).
2. **Template passaggi**: scelta della struttura iniziale degli step tra percorso
   riflessivo standard a 3 passi (Introduzione → Esplorazione → Sintesi), colloquio
   tematico a passo singolo o strumento vuoto, con anteprima in tempo reale degli step generati.
3. **Counselor e rilascio**: selezione dei counselor abilitati a condurre il percorso,
   riepilogo della configurazione e invio coordinato che crea lo strumento (`POST /admin/instruments`),
   gli step iniziali (`POST /admin/guided-steps`) e associa i counselor abilitati
   (`PUT /admin/counselors/{id}`). Al termine, la mappa seleziona automaticamente il nuovo percorso.

### Sandbox di collaudo per l'amministratore (Anteprima chat)

La testata della Mappa dei prompt e la barra degli strumenti dell'Editor dei questionari
includono il pulsante **Collauda chat** (`admin.promptMap.testChat` / `admin.q.testChat`),
che consente all'amministratore di verificare immediatamente il funzionamento della
chat guidata per lo strumento selezionato in un ambiente protetto ed effimero:
- **Sessione effimera e isolata**: la chat di collaudo invia il flag `preview: true`
  al backend (`POST /chat`), che disabilita il salvataggio dei log su database (`models.Log`),
  la generazione di raccomandazioni persistenti (`models.SessionRecommendation`), l'inserimento
  nel pool di memoria risposte condivise e il monitoraggio dei thread. I dati degli studenti
  e le statistiche di ricerca rimangono completamente incontaminati.
- **Supporto strumenti in bozza**: la sandbox permette di collaudare e percorrere
  tutti gli step configurati anche quando lo strumento è ancora nello stato di bozza
  (`is_active=false`), verificando la risposta del counselor, le domande suggerite e
  l'avanzamento tra i passaggi prima della pubblicazione nel catalogo.
- **Scelta del counselor e riavvio rapido**: l'amministratore può selezionare al volo
  qualsiasi counselor configurato per osservarne lo stile di conduzione, oppure riavviare
  la sessione azzerando istantaneamente la memoria temporanea (`DELETE /api/memory/:sessionId`).
- **Doppia modalità di visualizzazione**: la sandbox è disponibile sia come comoda
  finestra modale integrata direttamente nella Mappa dei prompt e nell'Editor questionari,
  sia a schermo intero tramite la rotta dedicata `/admin/preview-chat?instrument=<CODICE>`.
- **Protezione accessi**: l'endpoint di chat con `preview=true` e la pagina di anteprima
  sono rigorosamente riservati agli utenti con privilegi di amministrazione (403 per non-admin).
- **Verifica automatizzata e test**: i collaudi della sandbox verificano la completezza delle chiavi i18n nelle sei lingue supportate e l'isolamento dei payload effimeri.

Ogni testo e la sua bozza mostrano il numero stimato di token, compresi persona
del counselor e domande suggerite. Ogni istruzione destinata al modello ha i
pulsanti **Totale**, **Ristretto** e **Minimo**. Sono disponibili anche le
varianti per i livelli personalizzati salvati in Generale. Include direttive, meta prompt,
follow-up, varianti Idea, istruzioni di step e persona. Seleziona il livello,
premi **Modifica**, inserisci il testo e **Salva**: ogni variante è indipendente,
salvata nel database con il proprio storico e la conferma per testi condivisi.
Una variante vuota usa Totale; Minimo non usa il testo di Ristretto. Durante
la modifica, salva o annulla prima di cambiare livello per conservare la bozza.
Totale mantiene il testo esistente; le vecchie varianti brevi valgono soltanto
per Ristretto finché non viene salvata la sua nuova variante.

Il modello usa i testi del livello assegnato quando «Usa i testi del livello,
se presenti» è attivo. I limiti dei blocchi restano validi: per inviare anche
una variante meta, attiva «Includi meta prompt» nel livello; i default Ristretto
e Minimo lo escludono. L'anteprima con preset mostra i testi scelti sia nei
blocchi sia nei messaggi. Il testo libero dello studente non viene sostituito.

In **Generale → Contesto per modello**, l'amministratore può rinominare e
aggiungere livelli, modificare i tetti dei componenti e assegnare un livello
a un nome esatto di provider/modello. Totale, Ristretto e Minimo sono i livelli
iniziali. Salvataggio dei livelli e delle assegnazioni è esplicito; un errore
conserva la bozza. Nessun modello riceve un livello automaticamente. Lo step
mantiene la precedenza per i componenti esclusi; il messaggio corrente e i
contratti obbligatori sono conservati. Configurazione, stime e limiti della
verifica automatica: `docs/operations/model-context-levels.md`.

Prompt Lab conserva negli snapshot questi livelli e le assegnazioni e adatta
ogni prova al modello scelto. Il risultato conserva il rapporto dei token del
contesto effettivamente inviato. Un conteggio minore non dimostra una risposta
migliore: la verifica automatica richiede lettura educativa dei risultati e
non attiva configurazioni o prompt.

1. **Comune a tutte le chat guidate**: la persona del counselor (sola lettura;
   «Modifica» apre un riquadro che salva con la stessa funzione del tab Counselor,
   con il suo storico), le sei direttive globali e i testi usati da ogni strumento,
   come il prompt della fase Domande.
2. **Gruppi**: testi condivisi da più strumenti (per esempio i prompt
   dell’intervista e della sintesi dei due Eventi significativi). Ogni insieme di
   strumenti ha un riquadro proprio, che si apre con l’elenco degli strumenti del
   gruppo per nome breve (lo strumento scelto è evidenziato) e con l’avviso che
   una modifica vale per tutti quegli strumenti, citati per nome. Ogni voce dice
   da quali strumenti è usata e, aprendo «N step», quali step di ciascuno.
3. **Strumento**: meta prompt, prompt delle domande dello studente (per QSA e QSAr),
   testi delle fasi Domande e Conclusione e prompt di sistema condivisi da più step.
4. **Step**, in ordine di percorso con le fasi fisse Domande e Conclusione: nome
   nelle sei lingue, colore, istruzione dello step, prompt di sistema proprio dello
   step, meta prompt dello step se sovrascrive quello dello strumento, note per la
   fase, domande suggerite e anteprima. I componenti del contesto compaiono subito
   dopo nome, colore e istruzione dello step. Anche ogni step è apribile e
   richiudibile dalla sua intestazione.

«Modifica domande» apre un popup dello step con le sei lingue: permette di
aggiungere, modificare, eliminare con conferma e spostare le domande suggerite,
con gli stessi dati della scheda Domande suggerite step. Ogni comando salva
esplicitamente; una bozza non salvata chiede conferma prima di essere abbandonata.

Nel livello Step, «Aggiungi step» chiede nome, identificativo, tipo, istruzione
facoltativa e posizione (in fondo o prima di uno step). Le frecce spostano uno
step nel percorso dello strumento. Su mobile i comandi stanno su una riga
separata, sotto il titolo e il conteggio dello step. Domande e Conclusione sono
fasi fisse, senza
comandi di spostamento o eliminazione; dalla mappa non si può eliminare l’unico
step rimasto dello strumento. Per eliminare uno step si apre una conferma con
il numero delle sessioni e dei messaggi registrati che lo usano e l’elenco degli
identificativi delle sessioni, con il numero di messaggi di ciascuna. L’uso è
ricavato dai log conservati dello stesso strumento e della stessa fase: non
ricostruisce sessioni prive di log o già rimosse dalla conservazione. Se l’uso
non è leggibile, l’eliminazione resta bloccata. Occorre digitare l’identificativo
esatto dello step e premere «Elimina step». Configurazioni dei prompt, storico
delle revisioni, trascrizioni e domande suggerite restano conservati; le domande
dello step eliminato non sono più proposte nel percorso. Se la creazione riesce
ma il posizionamento fallisce, lo step resta in fondo e un avviso invita a
riprovare con le frecce.

Ogni testo si modifica in un solo posto, al livello a cui appartiene; agli step
compare **ereditato**, in grigio, con il collegamento «vai» al livello giusto.
Il livello non è scritto a mano: il server lo calcola contando quanti strumenti e
step usano il testo, con le stesse regole della chat. Ogni voce ha un’etichetta
di destinazione: **→ MODELLO · ingresso** (inviato quando lo studente entra nello
step), **→ MODELLO · ogni turno**, **→ MODELLO · domande dello studente**,
**→ STUDENTE** (mostrato, mai inviato al modello), **SOLO ADMIN** (note di lavoro)
e **FILTRO CONTESTO** (componenti). Un testo usato da più strumenti o da più step
chiede una conferma che elenca chi lo usa (strumenti per nome e numero di step)
prima del salvataggio. I testi per lo
studente si modificano lingua per lingua. Ogni salvataggio passa dalle funzioni già
esistenti e resta nello storico delle revisioni, ripristinabile dalla voce stessa;
uno step può ricevere un meta prompt proprio con «Sovrascrivi per questo step».

L’**Anteprima di ciò che riceve il modello** di uno step usa i valori salvati e
colora il bordo dei blocchi secondo il livello da cui provengono: grigio per il
comune, ocra per i gruppi, petrolio per lo strumento, viola per lo step; i blocchi
su fondo grigio arrivano dal codice o dai dati della sessione. Il turno libero dello studente usa
lo stesso tipo di richiesta della chat, per esempio le domande sui fattori in QSA.

Le quattro schede storiche restano nella vista classica di ogni strumento, che ha
il collegamento «Apri nella mappa dei prompt». La pagina funziona anche su
telefono: i livelli diventano una barra scorrevole e lo step si sceglie da un menu.
Testi dell’interfaccia nelle sei lingue.

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
Si può scegliere un preset di modello attivo e vedere token per blocco, totale
e budget di ingresso; la capacità non configurata rimane sconosciuta.

È una simulazione amministrativa, non la registrazione della richiesta inviata
al provider: non esegue chiamate LLM, recuperi esterni o handler delle skill.
Senza sessione possono mancare punteggi e dati personali. Il recupero non eseguito
è segnalato; la vista dei componenti precede eventuali riduzioni, mentre i
messaggi completi riflettono il budget simulato. Le trasformazioni specifiche del
provider, compresa l’anonimizzazione esterna, non sono riprodotte. In caso di
aggiornamento o errore, il contenuto precedente è dichiarato non aggiornato e la
copia è disabilitata. I testi di anteprima supportano le sei lingue dell’interfaccia.

Il **Prompt di sistema** mostrato nella scheda Prompt per step è quello che la
chat usa davvero all’ingresso nello step: la chiave viene calcolata dal server
con la stessa regola della chat (per gli step di apertura conta l’id dello step,
per gli altri il tipo di step). Vale per tutti gli strumenti, compresi gli
obiettivi e le aperture di QPCS, QPCC e QAP. Nella scheda Step guidati il menu
del campo Prompt di sistema elenca i tipi di step che il server conosce, compresi
quelli degli obiettivi e di Idea, e mostra sempre il tipo salvato.

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
