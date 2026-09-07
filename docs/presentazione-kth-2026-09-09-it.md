# Presentazione KTH — 9 settembre 2026 — Versione Italiana

> Copione parlato in italiano, prima persona. 11 slide, ~40 minuti (30 di parlato + demo + domande).
> Copione inglese gemello: `presentation-kth-2026-09-09-en.md` — stessa struttura, slide per slide.
> Parte 1 (slide 1–3): incipit scritto da Daniele, ripulito solo dai refusi.
> Parte 2 (slide 4–11): continuazione.

---

## Slide 1 — Chi sono

**Bullet slide:**

- Daniele Dragoni — PhD visiting, KTH (maggio → ottobre 2026)
- Università Roma Tre — dottorato in AI ed educazione
- Un ritorno allo studio: triennale → scienze cognitive → e-learning e media education → dottorato
- "Non è mai troppo tardi per imparare"

### Discorso (≈ 3 min)

Buongiorno a tutti.

Mi chiamo Daniele Dragoni e sono un PhD visiting. Il mio soggiorno al KTH è iniziato a maggio e si concluderà a ottobre. Sono qui perché nel mio percorso sono obbligatori sei mesi di ricerca all'estero. Ho scelto la Svezia e Stoccolma perché sono affascinato dalla cultura svedese: dai valori green — penso alla battaglia degli alberi di Kungsträdgården —, dal rispetto della persona — penso al movimento MeToo — e dalla grande capacità di innovare, per esempio Spotify. E quindi ho pensato che potesse essere un buon posto per concludere il mio dottorato e finire di scrivere la mia tesi.

Due parole su di me. La mia carriera dentro l'accademia. Mentre molte persone finivano gli studi ed entravano nel mondo accademico ambendo a diventare professori, con una carriera già avviata, io ci ritornavo. E devo dire che è stata una scelta molto importante, perché ha cambiato la mia vita. Ho iniziato a studiare mentre lavoravo, per prendermi una laurea triennale che avevo lasciato a metà, e pian piano sono stato travolto dall'università. Sono stato molto fortunato: ho conosciuto persone che mi hanno aiutato, che mi hanno fatto crescere, che mi hanno spinto a continuare. Così ho preso una laurea magistrale in scienze cognitive, poi durante il Covid una in e-learning e media education, e adesso sto finendo i miei tre anni di dottorato su AI ed educazione. Una situazione a cui non avrei mai pensato sei anni fa, quando sono rientrato in un'aula universitaria. In Italia diciamo: "non è mai troppo tardi per imparare".

---

## Slide 2 — Roma Tre e l'Ostiense

**Bullet slide:**

- Roma Tre: 30 anni, ma erede del Magistero — dove insegnò Luigi Pirandello
- Nessun campus isolato: l'università è innestata in un quartiere, l'Ostiense
- Fabbriche dismesse diventate dipartimenti: ex Alfa Romeo, ex Mattatoio
- Un'università che cambia la faccia del quartiere

### Discorso (≈ 3 min)

Due parole sulla mia università. Io vengo dall'Università di Roma Tre. Una giovane università, che ha compiuto trent'anni — non tanti come il KTH —, ma è un'università che raccoglie una tradizione molto antica a Roma, quella del Magistero, dove ha insegnato uno dei premi Nobel per la letteratura italiani, Luigi Pirandello, nei primi anni del Novecento.

Inoltre, l'università non ha uno sviluppo isolato come quello del campus del KTH, ma si innesta in un quartiere di Roma, l'Ostiense: un quartiere industriale che ha pian piano rivitalizzato, trasformando fabbriche in disuso — quella dell'Alfa Romeo, o il Mattatoio — in dipartimenti universitari. Così ha cambiato la faccia del quartiere.

---

## Slide 3 — CounselorBot: perché, e tre domande

**Bullet slide:**

- L'AI è già usata dagli studenti come consigliere: studio, amicizie, amore, lavoro, salute
- L'AI sta diventando un mediatore culturale
- **D1** — Si può costruire uno strumento AI che aiuti davvero nell'orientamento? Quali vincoli, quale design?
- **D2** — Può dare una prima consulenza sugli esiti degli strumenti di orientamento?
- **D3** — Può essere sicuro su privacy, riservatezza e dati, in linea con le norme europee e italiane?

### Discorso (≈ 4 min)

E adesso, dopo questa breve introduzione, veniamo al cuore della presentazione.

Uno dei progetti del mio dottorato è quello di creare uno strumento AI che potesse aiutare gli studenti nel processo di orientamento scolastico. Così ho costruito CounselorBot.

Quali sono le motivazioni che mi hanno spinto a fare questo progetto?

La prima è che gli strumenti di AI ormai sono molto diffusi tra gli studenti, e non vengono usati solo come aiuto per lo studio, ma come veri e propri consiglieri. Servono sia per cercare informazioni, sia per avere consigli sulle azioni da prendere. E questo in vari campi: dalla scelta delle amicizie, all'amore, al lavoro, a consigli medici e di vita. L'AI sta diventando un mediatore culturale.

E quindi la mia prima domanda è stata: è possibile creare uno strumento che possa aiutare effettivamente gli studenti nel processo di orientamento? Come deve essere fatto? Che vincoli deve rispettare? Quale design deve avere?

Un'altra domanda che ci siamo posti, con il mio gruppo di ricerca e il mio supervisore, è: possono, questi oggetti, dare una prima consulenza sugli esiti degli strumenti che abbiamo per l'orientamento? Questi strumenti di solito sono interviste e questionari di self-assessment, che permettono agli studenti di valutare le loro skill, capacità, interessi, valori, visione del mondo, aspirazioni, eccetera. E di riflettere sul loro disegno di vita.

Una terza domanda: come possono essere sicuri da utilizzare, in termini di privacy, riservatezza e questione dei dati, in linea con le norme europee e italiane?

---

## Slide 4 — Cos'è l'orientamento (e perché non è matching)

**Bullet slide:**

- La risposta classica: *matching* — misuri la persona, cataloghi i lavori, fai combaciare (Parsons, 1909)
- Poggia su due stabilità che non esistono più: una persona stabile, un mercato stabile
- Pellerey: orientamento = **dirigere se stessi** nello studio e nel lavoro
  - **Autodeterminazione** — valori, motivi, senso, prospettiva esistenziale
  - **Autoregolazione** — pianificare, monitorare, persistere, attribuire le cause
- Savickas: la carriera non si scopre, si *costruisce* — il costrutto chiave è l'adattabilità
- Le scuole non insegnano quasi mai l'autoregolazione in modo esplicito (Greene, 2018)

### Discorso (≈ 5 min)

A questo punto è bene chiarire cosa si intende per orientamento. Per molto tempo questo termine è stato affiancato a quello di *matching*: fare quel lavoro di far combaciare gli interessi e le capacità di una persona con un lavoro o un percorso di studio.

Il fascino di questo modello è ovvio. È pulito, è misurabile, produce un output chiaro: lo studente fa un test e riceve una lista di professioni adatte. Sembra scienza. E in parte lo è: viene da Frank Parsons, dall'inizio del Novecento, e ha più di un secolo di uso alle spalle.

Ma per noi questo non è sufficiente. L'orientamento dovrebbe essere l'aiutare la persona a sviluppare se stessa, a sviluppare competenze e abilità che le permettano di raggiungere le proprie aspirazioni e vivere una vita soddisfacente — guardando al contesto in cui si trova, cioè rispettando l'ambiente e il lavoro degli altri.

E c'è anche una ragione tecnica per cui il matching non basta più. Michele Pellerey — professore emerito, il padre intellettuale di questa tradizione in Italia — lo dice in modo netto: il modello del matching poggia su due assunzioni di stabilità che oggi non reggono. La prima è una persona stabile, come se le attitudini di un sedicenne fossero fatti finiti, in attesa di essere misurati. La seconda è un mercato stabile, come se il mondo del lavoro restasse educatamente fermo mentre facciamo la diagnosi. Ma il mercato non è fermo: automazione, digitalizzazione, intelligenza artificiale, polarizzazione delle occupazioni. Non puoi leggere l'occupabilità futura di un giovane dalla domanda attuale del mercato, perché quella domanda sarà già cambiata quando il giovane arriverà. Un modello di matching, preso sul serio, ottimizza le persone per i lavori di ieri.

Cosa lo sostituisce? Due risposte, complementari.

La prima è quella di Pellerey: orientamento come capacità di **dirigere se stessi**. Non un momento, ma una competenza, che ha due pilastri. Il primo è l'autodeterminazione: la componente strategica, la capacità di scegliere dove andare — valori, motivi, ideali, e un senso della propria vita, una prospettiva esistenziale. Senza quello, nessuna quantità di informazioni sulle carriere aiuta, perché non c'è un "tu" che sceglie. Il secondo pilastro è l'autoregolazione: la componente operativa. Una volta che hai una direzione, devi gestire il viaggio — pianificare, monitorare, persistere, e soprattutto attribuire correttamente le cause. Ho fallito perché sono incapace, o perché ho studiato con la strategia sbagliata? Quella attribuzione decide se uno studente riprova.

La seconda risposta è quella di Mark Savickas: la *career construction*, il *life designing*. La carriera non è la scoperta di un incastro che esisteva già; è qualcosa che la persona costruisce, una storia che racconta e rivede, in cui il lavoro è un capitolo. Il costrutto chiave diventa l'adattabilità, non l'incastro.

E c'è una ragione empirica dura per prendere tutto questo sul serio. Come ha documentato Jeffrey Greene nel 2018, le scuole di tutto il mondo dedicano quasi zero tempo all'insegnamento esplicito dell'autoregolazione, nonostante le evidenze siano solide. Il risultato è quello che ogni università vede: matricole che erano eccellenti dentro un ambiente scolastico molto controllato, e che crollano — o abbandonano — nel momento in cui il controllo sparisce. Non è mai stato insegnato loro a dirigersi.

Notate cosa cambia. L'obiettivo non è più la risposta giusta, ma il processo giusto. E il processo giusto è fatto di conversazione e riflessione. Che è, esattamente, ciò che un'AI conversazionale potrebbe sostenere — se è costruita per sostenere quel processo, e non per vendere risposte.

---

## Slide 5 — Gli strumenti: le competenze strategiche

**Bullet slide:**

- Eredità: **competenzestrategiche.it** — piattaforma gratuita del gruppo Pellerey (CNOS-FAP), dal 2011
- Questionari: **QSA** (1996) e **QSAr** — strategie di apprendimento; **QPCS** / **QPCC** — competenze strategiche percepite; **ZTPI** — prospettiva temporale; **QAP** — adattabilità professionale
- Narrativi: intervista **Savickas**, eventi significativi di studio e di lavoro
- Riflessivi: **IDEA** — una mappa cumulativa di un'idea, di una tesi, di un dubbio
- Il profilo è un inizio, non un verdetto
- **Il collo di bottiglia non sono gli strumenti: è la mediazione**

### Discorso (≈ 5 min)

Ora gli strumenti. Perché io non ho inventato strumenti nuovi: ho preso strumenti validati e ho dato loro uno strato conversazionale.

Tutto discende da un'infrastruttura reale e viva: competenzestrategiche.it, la piattaforma online gratuita costruita dal gruppo di ricerca di Pellerey con il supporto del CNOS-FAP, la federazione salesiana della formazione professionale. Serve scuole, università e centri di orientamento da circa il 2011.

L'albero genealogico comincia con il QSA, il Questionario sulle Strategie di Apprendimento, pubblicato da Pellerey nel 1996: trent'anni di storia di validazione. Misura come uno studente studia — le strategie cognitive da un lato, i fattori affettivi e motivazionali dall'altro: ansia, volizione, perseveranza, attribuzione causale. Il QSAr è la forma ridotta. Poi ci sono il QPCS e il QPCC, sulle competenze strategiche percepite e sulle convinzioni, per studenti più grandi e adulti. Lo ZTPI, dalla ricerca di Zimbardo, misura come una persona si rapporta a passato, presente e futuro — un costrutto molto connesso al successo accademico. Il QAP misura l'adattabilità professionale nelle quattro dimensioni di Savickas: preoccupazione, controllo, curiosità, fiducia.

Due strumenti non danno punteggi, ma racconti. L'intervista di costruzione di carriera di Savickas — che sulla carta è qualcosa che un consulente fa di persona, e sulla piattaforma diventa una conversazione guidata a passi. E gli eventi significativi, di studio o professionali, dove lo studente racconta una storia e l'AI lo aiuta ad analizzarla.

E poi c'è IDEA, il più recente, e il mio preferito. Non è un questionario. Lo studente arriva con un'idea informe: un possibile tema di tesi, un'ipotesi di carriera, un progetto, un dubbio. La piattaforma non assegna punteggi: costruisce, turno dopo turno, una mappa cumulativa di quell'idea — assunzioni, evidenze, alternative, implicazioni, domande aperte — e finisce con un piano esplicito. IDEA è la forma più pura di quello che questa piattaforma vuole essere: non diagnosticare la persona, ma aiutarla a sviluppare un pensiero.

E qui arriva il principio pedagogico che governa tutti quanti: il profilo — l'insieme dei punteggi — è un inizio, non un verdetto. In questa tradizione il questionario è un dispositivo riflessivo: serve ad aprire una conversazione su di sé.

Ma questo è anche il punto debole di tutto il sistema. Perché un profilo di punteggi non significa nulla senza quella conversazione. Il gruppo di ricerca stesso insiste: i questionari funzionano solo quando un insegnante, un tutor o un consulente aiuta lo studente a leggere e interpretare i risultati. E gli esperti non sono sempre disponibili. Non su larga scala, non alle undici di sera prima di un esame, non per ogni studente che ne avrebbe bisogno.

Gli strumenti aspettano una guida che raramente c'è. Ecco il vuoto in cui si inserisce CounselorBot.

---

## Slide 6 — Come è fatto: l'harness (risposta a D1)

**Bullet slide:**

- Stack volutamente noioso: FastAPI + Next.js + PostgreSQL, Docker, streaming SSE
- Non il modello — l'**harness**: l'infrastruttura di script, comandi, testi e prompt intorno al modello
  - **Envelope** — persona del counselor + dati e punteggi + prompt del passo + conoscenza recuperata + taccuino + storia: riassemblato a ogni turno
  - **Passi guidati** — una macchina a stati per ogni strumento, salvata nel database, modificabile senza toccare il codice
  - **Skills engine** — classificatore deterministico: attiva al massimo un comportamento primario
  - **RAG** — quattro collezioni di conoscenza
- Il vincolo di design: **i consigli vengono solo dal catalogo certificato, e solo nei passi autorizzati**

### Discorso (≈ 5 min)

Veniamo alla prima domanda: come deve essere fatto uno strumento del genere? Quali vincoli deve rispettare?

La mia risposta, in una parola, è: *harness*. Non il modello — l'harness. Con questa parola intendo l'infrastruttura di script, comandi, testi e prompt che dà a un modello linguistico la capacità di essere efficace e pertinente in un dominio specifico. Il motore è impressionante; l'harness decide se il viaggio è sicuro e se arrivi. La maggior parte del mio lavoro ingegneristico non è stata nel chiamare il modello: è stata nel costruire l'harness.

Lo stack è volutamente noioso: backend FastAPI, frontend Next.js, PostgreSQL, tutto in Docker, chat in streaming SSE. Dietro un'unica astrazione ci sono tredici provider AI, dai servizi commerciali ai modelli locali — e torno tra poco su questo punto, perché riguarda la terza domanda.

La parte interessante è cosa succede intorno al modello a ogni singolo turno. Lo chiamo *envelope*, la busta. Ogni messaggio viene assemblato da: la persona del counselor — perché l'AI ha un nome, un carattere, un ambito di competenza; i dati e i punteggi dello studente; il prompt del passo corrente del percorso guidato; la conoscenza recuperata dalle collezioni; il taccuino dello studente; e la storia della conversazione. Niente è improvvisato: la piattaforma decide, turno per turno, cosa il modello può sapere e cosa gli viene chiesto di fare.

Il percorso guidato è lo scheletro pedagogico. Per ogni strumento c'è una sequenza di passi salvata nel database — introduzione, analisi dei fattori, sintesi — ciascuno con il suo prompt, modificabile da un amministratore senza toccare il codice. Il passo decide la modalità; la modalità decide cosa il modello può fare.

Poi c'è lo *skills engine*, ed è la parte di cui sono più orgoglioso. Un classificatore di intenti deterministico, ad alta precisione, gira a ogni turno e attiva al massimo un comportamento primario: consigli certificati — strategie pratiche prese da un catalogo curato da educatori, mai inventate dal modello; spiegazione del profilo; suggerimenti di lettura da un catalogo certificato; confronto di profili nel tempo; oppure una ricerca web su fonti whitelistate per le domande fattuali, invece che dalla memoria del modello. Se il classificatore non è sicuro, si ricade sulla conversazione normale.

Il punto è questo: il modello può essere creativo nella forma, ma il consiglio è sempre tracciabile a un catalogo. E i consigli sono ammessi solo in passi specifici — quelli di sintesi — e da nessun'altra parte. Questo è il significato meccanico della responsabilità di un consulente.

Quindi, la risposta alla prima domanda: il design non sta nel prompt. Sta nei vincoli. Un buon prompt non garantisce che il consiglio venga dal catalogo, né che il docente veda la classe, né che il modello si fermi dove deve fermarsi. Il valore è nell'architettura, non nella singola risposta.

---

## Slide 7 — Il tempo della riflessione (secondo vincolo di design)

**Bullet slide:**

- Il primo vincolo era il modello. Il secondo è il **tempo**: come deve essere scandita la riflessione in una chat?
- Una conoscenza e una scelta hanno bisogno di tempo: si devono sedimentare
- Per design: **conversazione e riflessione sono due momenti separati**
- Durante la conversazione: appunti con strumenti appositi — note, azioni, confronti e carte
- Negli spazi propri, senza AI: **Taccuino** (riflettere su di sé), **Libretto**, **Portfolio**
- Il docente entra lì: legge chat e Taccuino, e scrive a sua volta note per correggere il tiro
- Raccomandazioni (libri, strategie) e base di conoscenza RAG: contenuti inseriti dai docenti, con schede appropriate

### Discorso (≈ 3 min)

Il primo vincolo di design era il modello — locale o provider esterno, ne parlo tra poco. Il secondo vincolo riguarda il tempo: come deve essere scandito il tempo della riflessione, attraverso una chat o in altro modo?

La risposta che ci siamo dati è netta: una conoscenza e una scelta hanno bisogno di tempo, si devono sedimentare. E gli studenti devono avere spazi propri di riflessione, senza AI. Per questo, per design, abbiamo separato il momento della conversazione da quello della riflessione.

Durante la conversazione, lo studente può prendere nota con strumenti appositi: annotazioni, azioni da compiere, confronti, carte. Poi ci sono momenti in cui scrive e riflette sull'interazione: questo avviene con il Taccuino, che serve a riflettere su di sé, e con il Libretto e il Portfolio. Momenti in cui lo studente scrive di suo pugno.

E il docente può entrare in questa interazione: leggendo le chat dello studente e il suo Taccuino, e scrivendo a sua volta note, per correggere il tiro di quello che è stato fatto.

Infine, ci sono sistemi di raccomandazione — per esempio libri e strategie — che il chatbot può usare, ma che devono essere inseriti dai docenti e avere delle schede appropriate. E c'è una base di conoscenza, il RAG, che sta alla base dell'interazione e dà al chatbot il contesto per interagire bene in un compito specifico.

È un modo per dire che l'AI può sostenere la conversazione, ma non può sedimentare al posto dello studente.

---

## Slide 8 — La prima consulenza sugli esiti (risposta a D2) + demo

**Bullet slide:**

- Non sostituisce il consulente: è la **prima linea** della conversazione
- Cosa fa: legge il profilo con lo studente, collega i punteggi a comportamenti concreti, propone strategie, apre domande
- Cosa non fa: non diagnostica, non decide, non inventa consigli, non chiude il caso
- Il **taccuino**: open learner model append-only, scritto dallo studente, con storia delle revisioni
- Il docente rilegge; la sessione resta come traccia
- **[DEMO — 4 min]**

### Discorso (≈ 5 min + demo)

Seconda domanda: possono, questi oggetti, dare una prima consulenza sugli esiti degli strumenti?

La mia risposta, per ora, è: sì — a condizione che sia esplicitamente *una prima* consulenza. CounselorBot non automatizza la consulenza di orientamento. Struttura una prima conversazione riflessiva, e la lascia aperta.

Concretamente. Lo studente compila un questionario — diciamo il QSAr. Ottiene un profilo per fattori. A quel punto, invece di ricevere un PDF con dei grafici che nessuno gli spiegherà mai, entra in un percorso guidato: il counselor gli presenta un fattore alla volta, gli chiede se si riconosce, gli chiede di raccontare un episodio concreto, collega il punteggio a un comportamento di studio reale. Poi, nei passi di sintesi, propone strategie prese dal catalogo certificato. E alla fine lo studente scrive nel proprio taccuino cosa ha capito.

Il taccuino è importante. È un *open learner model*: append-only, con storia completa delle revisioni. Non è l'AI che scrive un referto sullo studente; è lo studente che scrive su di sé, e l'AI che lo aiuta a farlo. La differenza è tutta lì.

E ci sono cose che il sistema non fa, per design. Non diagnostica. Non decide per lo studente. Non inventa consigli. E non chiude il caso: la sessione resta come traccia, il docente la rilegge, e la conversazione può continuare con un essere umano.

Su questo abbiamo un dataset di interazioni supervisionate che stiamo analizzando, e la sperimentazione è in corso. Non vi presento risultati di efficacia: sarebbe disonesto. Vi presento una piattaforma funzionante e un oggetto di ricerca.

E ora vi mostro come funziona. [DEMO]

---

## Slide 9 — Privacy, AI locale, norme (risposta a D3)

**Bullet slide:**

- Tredici provider dietro un'unica astrazione — **inclusi modelli locali** (Ollama, llama.cpp)
- Locale = i dati non escono: demo, controllo dei costi, interazioni sensibili
- Prima che i dati escano: **gateway di privacy** — nomi, email, istituzioni, identificatori nel testo libero
  - Anonimizzazione quando la risposta non richiede re-identificazione
  - Pseudonimizzazione quando serve, con la mappatura solo sul server locale
- Ricerca: piani di somministrazione, consenso informato, **codici anonimi**, export item per item
- Nessuna traduzione arriva a uno studente senza certificazione umana
- GDPR e AI Act: minori, dati particolari, decisioni che riguardano l'istruzione

### Discorso (≈ 4 min)

Terza domanda, e per me la più difficile: come rendere sicuri strumenti del genere su privacy, riservatezza e dati?

Comincio da una scelta architetturale. CounselorBot può instradare le richieste verso provider esterni, ma supporta anche modelli locali, tramite Ollama e llama.cpp. I modelli locali sono utili per le dimostrazioni, per il controllo dei costi, per il funzionamento offline o a basso budget — ma soprattutto per le interazioni sensibili, perché in quel caso i dati non escono dal server. I provider esterni restano utili quando contano la qualità, la latenza o capacità specifiche.

Nella costruzione di CounselorBot abbiamo tenuto aperte entrambe le strade, perché i modelli locali sono sempre più performanti: Qwen 3, per esempio, rende meglio di molti modelli proprietari, anche se alcune capacità di ragionamento restano oggi appannaggio dei grandi modelli. La scelta che abbiamo fatto è quella agnostica: chi usa il software decide, in maniera trasparente, cosa utilizzare.

Il punto è che questa decisione deve essere esplicita, e deve essere visibile. Prima che i dati escano dal sistema locale, un gateway di privacy dovrebbe identificare nomi, email, istituzioni, identificatori nel testo libero e dettagli potenzialmente sensibili. Quando la risposta non richiede la re-identificazione, i dati vengono anonimizzati. Quando la re-identificazione serve per la sessione, si usa la pseudonimizzazione, tenendo la mappatura solo sul server locale. Non è una soluzione completa al problema della privacy — voglio essere chiaro su questo — ma rende il confine visibile e governabile. E il confine visibile è la precondizione di qualsiasi conformità.

Sul lato ricerca il quadro è più netto, perché ci sono procedure consolidate: i ricercatori somministrano gli strumenti attraverso piani di somministrazione con consenso informato e codici di ricerca anonimi. Il ricercatore lavora su dati che non portano mai un nome. L'esportazione è item per item, per l'analisi psicometrica.

E c'è un principio che vale anche per i contenuti: nessuna traduzione raggiunge uno studente finché un essere umano non l'ha certificata. C'è un protocollo — bozza, tradotta, revisionata, pilota, validata — e una traduzione automatica può arrivare solo al primo gradino. Sono gli esseri umani a decidere cosa vedono gli studenti.

Il quadro normativo europeo, qui, non è un ostacolo: è un vincolo di design. Il GDPR ci dice che stiamo trattando dati di minori e, potenzialmente, dati particolari — perché una conversazione sull'ansia da esame *è* un dato sulla salute. L'AI Act ci dice che i sistemi che incidono su percorsi educativi non sono giocattoli. Progettare per quei vincoli fin dall'inizio è più facile che rincorrerli dopo. E, in un certo senso, è la stessa cosa che chiede la pedagogia: sapere sempre chi sta guardando cosa.

---

## Slide 10 — Il circuito umano (e chi ha scritto il codice)

**Bullet slide:**

- Il rischio sociale: man mano che i modelli migliorano, le persone chiedono meno alle persone
- L'AI è **un nodo** di una rete umana, non il centro
  - Docenti: gruppi classe, risultati e conversazioni dei propri studenti, note, messaggi (web e Telegram)
  - Ricercatori: somministrazioni, consenso, codici anonimi, dati grezzi
  - Studenti: taccuino, libretti, portfolio
- E un risultato collaterale: **questa piattaforma è stata costruita da un non-programmatore**
- L'AI cambia chi ha il permesso di costruire software

### Discorso (≈ 4 min)

C'è un motivo che mi preoccupa più degli altri, e che sta dietro tutte e tre le domande. Man mano che i modelli diventano bravi a conversare, le persone chiedono meno alle persone. Lo studente che avrebbe chiesto a un amico, a un professore, a un genitore, adesso chiede a un modello. La comodità sostituisce la comunità.

Per questo ho progettato la piattaforma come *human-in-the-loop* fin dall'inizio, e non come funzionalità aggiunta dopo. Il circuito umano è nell'architettura dei ruoli. Gli insegnanti creano gruppi classe — gli studenti entrano con un codice di invito — e possono vedere i risultati e le conversazioni dei propri studenti, scrivere note, mandare messaggi che arrivano sul web o via Telegram. Questo trasforma la piattaforma in qualcosa che un insegnante può davvero usare in classe, non in un chatbot privato. I ricercatori lavorano con i piani di somministrazione. E lo studente tiene i propri artefatti: taccuino, libretti, portfolio.

E poi c'è un ultimo punto, che riguarda me e che secondo me riguarda anche voi.

Io non sono un programmatore. La mia formazione è educativa e umanistica. Eppure questa è una piattaforma funzionante, con backend, database, frontend, API in streaming, un bot Telegram, tredici provider dietro un'astrazione. È stata scritta in larghissima parte con l'assistenza dell'AI, guidata da qualcuno che conosce profondamente il dominio e il codice solo a distanza di braccio.

Per me questa è la proprietà più sottovalutata dell'AI attuale: cambia chi ha il permesso di costruire software. Permette a un esperto di dominio di costruirsi i propri strumenti, invece di scrivere una specifica e sperare che qualcun altro capisca cosa intendeva. Non è un dettaglio di questa storia: è uno dei risultati.

---

## Slide 11 — Cosa cerco al KTH, e chiusura

**Bullet slide:**

- Collaborazione con il KTH (prof. Olle Bälter): **validare il QSAr in svedese** con studenti KTH
  - Interviste cognitive → pilota → raccolta dati → psicometria (CTT, CFA) → norme
  - Il manuale è già scritto, in inglese
- Prossimi passi: PQBL, fine-tuning su sessioni QSA reali, rafforzare anonimizzazione e pseudonimizzazione, benchmark modelli locali vs esterni
- **Il modello è una commodity; la posizione no**
- Provatelo, rompetelo, mettetelo in discussione

### Discorso (≈ 3 min)

Chiudo con quello che sono venuto a cercare qui.

A maggio ho scritto al professor Olle Bälter, qui al KTH, proponendo una collaborazione: validare la versione svedese del QSAr con studenti del KTH. Interviste cognitive, uno studio pilota, raccolta dati, poi la psicometria — teoria classica dei test, analisi fattoriale confermativa, e infine le norme. Il manuale è già scritto, in inglese, e la pipeline dei dati è già pronta nella piattaforma.

Quindi, se questa presentazione ha una richiesta pratica, è questa: cerco una casa per questa validazione — studenti, corsi, un contesto pilota — e cerco il feedback di questo dipartimento sul sistema stesso. EECS è esattamente il posto dove la domanda pedagogica e la domanda ingegneristica si possono discutere insieme.

E poi ci sono i passi successivi: il PQBL, l'apprendimento a partire da domande generate da documenti; il fine-tuning di un modello su conversazioni QSA reali, perché ormai abbiamo un dataset di interazioni supervisionate; il rafforzamento dello strato di anonimizzazione e pseudonimizzazione; e un confronto sistematico tra modelli locali e modelli esterni sulla qualità della conversazione di orientamento.

Ma la tesi generale che vi lascio è una sola. L'AI educativa non può essere ridotta a un modello più un prompt. Ha bisogno di uno strato di mediazione controllato: una teoria chiara dell'orientamento, strumenti validati, contenuti certificati, AI locale quando è possibile, instradamento attento alla privacy quando non lo è, e un vero circuito umano intorno a ogni studente.

Un *harness*, in inglese, è quello che permette a un animale forte di tirare qualcosa di pesante nella direzione giusta. I modelli sono forti. La direzione deve venire da noi: dalla pedagogia, dall'etica, dalle persone a cui stanno a cuore gli studenti. Il modello è una commodity; la posizione no.

Ed è per questo che l'invito, alla fine, è a voi: provatelo, rompetelo, mettetelo in discussione. È a questo che serve un dipartimento.

Grazie.

---

# Materiale di supporto

## Cronometro

| Slide | Contenuto                           | Minuti             |
| ----- | ----------------------------------- | ------------------ |
| 1     | Chi sono                            | 3                  |
| 2     | Roma Tre e l'Ostiense               | 3                  |
| 3     | CounselorBot: perché + tre domande | 4                  |
| 4     | Cos'è l'orientamento               | 5                  |
| 5     | Gli strumenti                       | 5                  |
| 6     | L'harness (D1)                      | 5                  |
| 7     | Il tempo della riflessione          | 3                  |
| 8     | Prima consulenza (D2) + demo        | 5 + 4              |
| 9     | Privacy e AI locale (D3)            | 4                  |
| 10    | Circuito umano + non-programmatore  | 4                  |
| 11    | KTH e chiusura                      | 3                  |
|       | **Totale parlato**            | **~48**      |
|       | Con tagli (vedi sotto)              | ~35 + 5 di domande |

## Piano di taglio (se sfori)

- Slide 4: taglia il paragrafo su Greene e le matricole → −1 min
- Slide 5: elenca i questionari senza commentarli uno per uno, tieni solo QSA, QAP e IDEA → −2 min
- Slide 7: tagliala intera se sei in ritardo, è il collegamento tra D1 e D2 → −3 min
- Slide 8: demo da 4 a 2,5 min → −1,5 min
- Slide 10: taglia il rischio sociale, tieni solo i ruoli e il non-programmatore → −1,5 min
- Slide 11: comprimibile a 1,5 min → −1,5 min
- Recuperabili: ~7,5 min

## Note di regia

- Slide 1–2 sono personali: parla lento, guarda la stanza. È qui che il pubblico decide se ti ascolta.
- Slide 3: le tre domande sono la spina dorsale. Numerale a voce e con la mano. Poi richiamale esplicitamente all'inizio delle slide 6, 8 e 9 ("prima domanda", "seconda domanda", "terza domanda").
- Slide 4: due mani per i due pilastri — destra autodeterminazione, sinistra autoregolazione.
- Frase da far atterrare, pausa dopo: *"un modello di matching ottimizza le persone per i lavori di ieri"*.
- Slide 9: è la slide che il pubblico EECS attaccherà per primo. Ammetti subito il limite ("non è una soluzione completa") — toglie forza all'obiezione.
- Slide 10: il punto sul non-programmatore va detto senza scusarsi. È un risultato, non una confessione.
- Se Olle Bälter è in sala: nominalo guardandolo.

## Domande probabili

1. **"Perché non basta ChatGPT con un buon prompt?"** — Prompt = una frase. Harness = stato, dati, retrieval, vincoli, certificazione. Un prompt non garantisce che il consiglio venga dal catalogo, né che l'insegnante veda la classe, né che il modello si fermi.
2. **"Come garantisci che il consiglio sia buono?"** — Solo da catalogo certificato, attivato da classificatore deterministico, solo nei passi autorizzati. Feedback degli studenti raccolto. Mai improvvisato.
3. **"E la privacy dei minori?"** — Redazione PII sui log, codici anonimi per la ricerca, consenso nella somministrazione, filtri d'età sul catalogo letture, opzione modello locale.
4. **"Come ha fatto un non-programmatore a costruirlo?"** — Architettura semplice e modulare, iterazione continua con AI, smoke test su un DB dedicato, documentazione continua. Il dominio era mio; l'AI ha tradotto il dominio in codice.
5. **"È validato?"** — Gli strumenti sì (QSA dal 1996). La piattaforma no, ed è esattamente il programma di ricerca: validazione QSAr con il KTH, pipeline dati già pronta.
6. **"E se il modello dice una cosa sbagliata?"** — L'envelope restringe lo spazio: solo conoscenza recuperata, consigli solo da catalogo, passi con modalità limitate. E c'è l'umano nel loop che vede le conversazioni.

## Da riempire prima del 9

- [ ] Studenti registrati: ___
- [ ] Sessioni guidate completate: ___
- [ ] Risposte item per item raccolte per la validazione QSAr (N = ___)
- [ ] Stato della risposta di Olle Bälter
- [ ] Demo: rete disponibile? Screenshot di riserva pronti?

## Fonti (se richieste)

- Pellerey M., *Orientamento come potenziamento della persona umana in vista della sua occupabilità*, Rassegna CNOS, 1 (2016), pp. 41–50.
- Pellerey M., Margottini M., Ottone E. (a cura di), *Dirigere se stessi nello studio e nel lavoro*, Roma TrE-Press, 2020.
- Epifani F., Margottini M., Ottone E., *Guida all'uso della piattaforma competenzestrategiche.it*, CNOS-FAP, 3ª ed., 2023.
- Greene J., *Self-Regulation in Education*, Routledge, 2018.
- Savickas M. L., *Career Studies and Life Designing: Self-Making*, 2024.
- Savickas M. L., Porfeli E. J., *Career Adapt-Abilities Scale*, 2012.
- Zimbardo P. G., Boyd J. N., *Putting time in perspective*, JPSP, 1999.
- Raccomandazione del Consiglio UE sulle competenze chiave per l'apprendimento permanente (2018).
