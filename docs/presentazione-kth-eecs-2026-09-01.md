# CounselorBot — Presentazione KTH EECS

> Talk di max 40 minuti, max 10 slide. Pubblico: dipartimento EECS, KTH — professori e dottorandi (~10 persone). Discorso in inglese (primario), versione italiana per preparazione personale.

---

## Slide 1 — Title

**Titolo slide:** *CounselorBot: An AI Harness for Guided Self-Reflection in Study and Career Orientation*

**Bullet slide:**
- CounselorBot — an AI platform for orientation and strategic competences
- Built on the pedagogy of Michele Pellerey (Roma Tre) and Savickas' career construction
- From Rome to Stockholm: a bridge between an old pedagogical tradition and new AI infrastructure
- KTH EECS — [date]

---

### Discorso EN (≈ 1 min)

Good morning, and thank you for having me. My name is [nome], and today I want to tell you about CounselorBot — a platform I have been building that sits at the intersection of two worlds: an old Italian pedagogical tradition, the tradition of educational guidance and "strategic competences", and the new infrastructure of large language models.

The story starts in Rome, at the university I come from, Roma Tre, and it ends here, at KTH, with a working system and a research plan that I hope will involve some of you.

The title uses a word I will explain properly in a few minutes: "harness". Not the model — the harness. Because my argument today is that the interesting problem is no longer whether an LLM can talk to a student, but what kind of infrastructure we must build around it so that the conversation is effective, pertinent, and safe. And I built that infrastructure without being a programmer — which is itself part of the point.

---

### Discorso IT (≈ 1 min)

Buongiorno e grazie per l'invito. Mi chiamo [nome] e oggi vi parlo di CounselorBot, una piattaforma che ho costruito e che sta all'incrocio di due mondi: una vecchia tradizione pedagogica italiana — la tradizione dell'orientamento e delle "competenze strategiche" — e la nuova infrastruttura dei modelli linguistici di grandi dimensioni.

La storia comincia a Roma, nell'università da cui vengo, Roma Tre, e finisce qui al KTH, con un sistema funzionante e un piano di ricerca che spero coinvolga qualcuno di voi.

Il titolo usa una parola che spiegherò bene tra qualche minuto: "harness". Non il modello — l'harness. Perché la mia tesi oggi è che il problema interessante non è più se un LLM sappia parlare con uno studente, ma quale infrastruttura dobbiamo costruirgli intorno perché la conversazione sia efficace, pertinente e sicura. E quell'infrastruttura l'ho costruita senza essere un programmatore — il che fa già parte del punto.

---

### Note per te

- Apertura con mappa mentale: Roma → KTH. Il pubblico KTH apprezza subito sapere che c'è un collegamento con loro (vedi slide 9, Olle Bälter).
- Non spiegare "harness" qui: lascialo sospeso, torna alla slide 4.
- Se qualcuno chiede subito "cos'è?" — risposta breve: "l'impalcatura di prompt, strumenti e vincoli intorno al modello".

---

## Slide 2 — Roma Tre: new and ancient at the same time

**Bullet slide:**
- Founded 1992 — "a young university for young people"
- But its roots go back to the old Magistero: the historic teacher-training institute
- Luigi Pirandello (Nobel Prize for Literature, 1934) taught there 1898–1922
  - His unpublished drawings survive on the exam records of those years
- Today Roma Tre hosts the research group that created the platform competenzestrategiche.it (Pellerey, Margottini, Ottone)
- The 2019 conference "Dirigere se stessi nello studio e nel lavoro" was held right there

---

### Discorso EN (≈ 4 min)

I come from Roma Tre, the third public university of Rome. It was founded in 1992, and its official motto says a lot: "a young university for young people". It is young — thirty years old, roughly my age — and it grew fast into one of the largest universities in Italy.

But at the same time it is old, because it is built on an older institution. When Roma Tre was created, it inherited the Magistero, the historic institute for teacher training that had been part of the University of Rome since the nineteenth century. And here is the detail I like most: between 1898 and 1922, the Magistero employed as a teacher of Italian language and stylistics a certain Luigi Pirandello — yes, the Pirandello, the 1934 Nobel Prize winner, the author of "Six Characters in Search of an Author". He was not famous yet. He was a young, struggling teacher, and he taught there for almost twenty-five years. A few years ago, Roma Tre held an exhibition with his unpublished drawings — doodles he made on the examination records, in the margins of his students' grades. So the university I come from is literally new and ancient at the same time: founded yesterday, but its lecture halls carry the ghost of a Nobel laureate.

There is a second reason why Roma Tre matters for this talk. Today, Roma Tre is home to the research group of Michele Pellerey and Massimo Margottini, the group that developed the theory of "strategic competences" and the platform competenzestrategiche.it — the free online environment of self-assessment questionnaires that I will present shortly. In September 2019 they organized an international conference at Roma Tre, "Dirigere se stessi nello studio e nel lavoro" — "Directing oneself in study and work" — and the proceedings were published by Roma Tre Press. The theoretical foundation of everything I built comes from there.

So that is the first half of my pedigree: a young university, with old roots, where the pedagogical framework behind CounselorBot was born. And now the city around it — because Rome is not a backdrop, it is part of the argument.

---

### Discorso IT (≈ 4 min)

Vengo da Roma Tre, la terza università statale di Roma. È stata fondata nel 1992, e il suo motto ufficiale dice molto: "un'università giovane e per giovani". È giovane — ha trent'anni, più o meno la mia età — ed è cresciuta rapidamente fino a diventare una delle più grandi università italiane.

Ma allo stesso tempo è antica, perché è costruita su un'istituzione più vecchia. Quando Roma Tre fu creata, ereditò il Magistero, lo storico istituto di formazione degli insegnanti che faceva parte dell'Università di Roma fin dall'Ottocento. Ed ecco il dettaglio che amo di più: tra il 1898 e il 1922, il Magistero ebbe come insegnante di lingua e stilistica italiana un certo Luigi Pirandello — sì, quel Pirandello, premio Nobel 1934, autore di "Sei personaggi in cerca d'autore". Allora non era ancora famoso. Era un giovane insegnante che lottava, e insegnò lì per quasi venticinque anni. Qualche anno fa Roma Tre ha dedicato una mostra ai suoi disegni inediti — scarabocchi fatti sui verbali d'esame, a margine dei voti dei suoi studenti. L'università da cui vengo è letteralmente nuova e antica allo stesso tempo: fondata ieri, ma le sue aule portano il fantasma di un premio Nobel.

C'è un secondo motivo per cui Roma Tre conta in questa presentazione. Oggi Roma Tre ospita il gruppo di ricerca di Michele Pellerey e Massimo Margottini, il gruppo che ha sviluppato la teoria delle "competenze strategiche" e la piattaforma competenzestrategiche.it — l'ambiente online gratuito di questionari di autovalutazione che vi presenterò tra poco. Nel settembre 2019 hanno organizzato un convegno internazionale a Roma Tre, "Dirigere se stessi nello studio e nel lavoro", e gli atti sono stati pubblicati da Roma Tre Press. Le fondamenta teoriche di tutto ciò che ho costruito vengono da lì.

Questa è la prima metà del mio pedigree: un'università giovane, con radici antiche, dove è nato il quadro pedagogico dietro CounselorBot. E ora la città che la circonda — perché Roma non è uno sfondo, fa parte dell'argomento.

---

### Note per te

- Aneddoto Pirandello: colpisce sempre. Se qualcuno sorride, aggiungi: "He doodled on the exam records of his students — and today we keep those records in an archive."
- Collegamento col pubblico: dottorandi KTH = giovani ricercatori. "Roughly my age" crea simpatia.
- Se tempi stretti: taglia il paragrafo sul convegno 2019 e recupera l'informazione alla slide 7.

---

## Slide 3 — Rome: a city you have to learn to look at

**Bullet slide:**
- Rome is full of hidden places — you need to know where to look, and how
- The Aventine Hill: Piazza dei Cavalieri di Malta, a green door designed by Piranesi (1765)
- Through the keyhole: St. Peter's dome, perfectly framed at the end of a hedge avenue
- One glance, three states: the gardens of the Order of Malta, Italy, the Vatican
- The metaphor: orientation instruments are keyholes — small apertures onto yourself, and you need someone to help you look through them

---

### Discorso EN (≈ 3–4 min)

Let me take you to a very specific place in Rome. On the Aventine Hill, one of the quietest hills of the city, there is a small square, Piazza dei Cavalieri di Malta. On one side stands an enormous green door — the gate of the Priory of the Knights of Malta. The gate was designed in 1765 by Giovanni Battista Piranesi, the great engraver — and it is, by the way, his only architectural work.

Now, this door has a keyhole. It is a completely ordinary keyhole, less than three centimeters wide. But if you crouch and look through it, you see something extraordinary: at the end of a perfectly trimmed hedge avenue, framed like a picture, the dome of Saint Peter's Basilica — the dome by Michelangelo. The laurel hedges are planted so that the dome looks closer and larger than it really is. The city, which is everywhere, suddenly fits into a keyhole.

And there is more. In that single glance you look through three states at once: the garden belongs to the Sovereign Order of Malta — it is extraterritorial territory; the middle distance is Rome, Italy; and the dome at the end is the Vatican, another state. Three countries in one keyhole. People queue there every day, in silence, one person at a time, to look.

Why am I telling you this? Because this keyhole is, for me, the best metaphor for what orientation means. The view — your future, your way of studying, your direction in life — is enormous, but you can only perceive it through a small aperture, and only if you know where the aperture is and how to look through it. A questionnaire of self-reflection is exactly that: a tiny opening through which a person can finally see something large and important about themselves. And like the keyhole, it works much better when someone tells you "crouch here, look now, tell me what you see" — when there is a guide. That is the problem I want to solve: the apertures exist, the guides are few. So I built a guide.

---

### Discorso IT (≈ 3–4 min)

Portiamoci in un luogo molto preciso di Roma. Sul colle Aventino, uno dei colli più silenziosi della città, c'è una piccola piazza, Piazza dei Cavalieri di Malta. Su un lato si erge un enorme portone verde — il cancello del Priorato dei Cavalieri di Malta. Il cancello fu progettato nel 1765 da Giovanni Battista Piranesi, il grande incisore — ed è, tra l'altro, la sua unica opera architettonica.

Questo portone ha una toppa. È una toppa del tutto ordinaria, larga meno di tre centimetri. Ma se ti abbassi e guardi attraverso, vedi qualcosa di straordinario: in fondo a un viale di siepi perfettamente potate, incorniciata come un quadro, la cupola di San Pietro — la cupola di Michelangelo. Le siepi di alloro sono piantate in modo che la cupola appaia più vicina e più grande di quanto sia. La città, che è ovunque, all'improvviso entra in una toppa.

E c'è di più. In quello sguardo unico guardi attraverso tre Stati contemporaneamente: il giardino appartiene al Sovrano Ordine di Malta — è territorio extraterritoriale; la distanza media è Roma, Italia; e la cupola in fondo è il Vaticano, un altro Stato. Tre Paesi in una toppa. Ogni giorno la gente fa la fila lì, in silenzio, una persona alla volta, per guardare.

Perché vi racconto questo? Perché questa toppa è, per me, la migliore metafora di cosa significhi orientamento. La vista — il tuo futuro, il tuo modo di studiare, la tua direzione nella vita — è enorme, ma puoi percepirla solo attraverso una piccola apertura, e solo se sai dov'è l'apertura e come guardarci dentro. Un questionario di autoriflessione è esattamente questo: una minuscola apertura attraverso cui una persona può finalmente vedere qualcosa di grande e importante di sé. E come la toppa, funziona molto meglio quando qualcuno ti dice "abbassati qui, guarda adesso, dimmi cosa vedi" — quando c'è una guida. Questo è il problema che voglio risolvere: le aperture esistono, le guide sono poche. Così ho costruito una guida.

---

### Note per te

- Questa è la slide "emotiva": parla lentamente, fai la pausa dopo "three countries in one keyhole".
- Metafora chiave da riusare: keyhole = questionario; guide = CounselorBot + docente. Riprendila alla slide 10.
- Se mostri una foto del keyhole: non mostrare subito la vista, fai indovinare. "What do you think you see through it?"

---

## Slide 4 — Why CounselorBot

**Bullet slide:**
1. AI lets a non-programmer build software — that is how this platform was made
2. Students increasingly use generalist chatbots as psychologists and counsellors — but generalist tools follow business logics, not the user's
3. What a model needs is a harness: an infrastructure of scripts, commands, texts and prompts that makes LLMs effective and pertinent
4. Self-assessment questionnaires work — but they need expert mediation (teacher, tutor) to be understood, and experts are not always available
5. The social risk: people stop asking people. This platform is human-in-the-loop by design — teachers, researchers and students interact around it

---

### Discorso EN (≈ 6–7 min)

Why did I build this? Five reasons.

First — and I want to be honest about this — because for the first time it was possible. I am not a programmer. My background is in education and the humanities. And yet here is a working platform with a backend, a database, a frontend, streaming APIs, a Telegram bot. All of it written mostly with AI assistance, guided by somebody who knew the domain deeply and the code only at arm's length. This is, for me, the most underrated property of current AI: it changes who is allowed to build software. It lets domain experts build their own tools instead of writing a specification for someone else. That is not a detail of this story — it is one of the main findings.

Second — students are already using AI as a psychologist and a career counsellor. They do it today, at scale. They open a generalist chatbot and pour into it questions about anxiety, study strategies, life choices. Now, I am not going to say that is always wrong. But notice what a generalist chatbot is: a product with its own incentives. It is optimized for engagement, for market share, for business logic that has nothing to do with the educational well-being of a nineteen-year-old. And it is built to avoid value judgments. It will not tell a student "this study strategy you describe is hurting you" — because that would be a position, and the product has no position. A counsellor must have a position. A good counsellor is exactly someone with a trained judgment. So the first thing CounselorBot does is commit to a position: a pedagogical framework, a set of instruments, a catalogue of certified advice.

Third — the harness. A model by itself is a general capability. What makes it effective in a specific domain is everything around it: the system prompts, the sequence of guided steps, the scripts, the retrieval, the constraints, the fallbacks. I use the word "harness" deliberately: an infrastructure of scripts, commands, texts and prompts that gives an LLM the capacity to be effective and pertinent. The engine is impressive; the harness decides whether the journey is safe and whether you arrive. Most of my engineering effort was not in calling the model — it was in building the harness.

Fourth — the instruments already existed, and they are excellent. Since 1996, the Italian tradition has questionnaires like the QSA, developed by Michele Pellerey, that measure learning strategies, motivation, self-regulation — the "strategic competences" you need to direct yourself in study and work. They are free, validated, and used in hundreds of schools. But here is the catch: a score profile means nothing without a conversation. The research group itself insists that the questionnaires only work when a teacher, a tutor, or a counsellor helps the student read and interpret the results. And experts are not always available — not at scale, not at midnight before an exam, not for every student who needs them. The instruments wait for a guide that is rarely there. That gap is exactly where an AI can sit — not as a replacement for the expert, but as the first line of the conversation.

Fifth — and this is the reason that worries me most — there is a social risk in this technology. As models get better at conversation, people ask fewer people. The student who would have asked a friend, a professor, a parent, now asks a model. Convenience replaces community. So I designed the platform as human-in-the-loop from the start: the student talks to the AI, but around the student there are real humans — teachers who see the results and the conversations of their class, researchers who administer the instruments with proper consent and anonymous codes, and the student's own artifacts: a notebook, a portfolio. The AI is one node in a human network, not a replacement for it.

---

### Discorso IT (≈ 6–7 min)

Perché l'ho costruito? Cinque motivi.

Primo — e voglio essere onesto — perché per la prima volta era possibile. Non sono un programmatore. La mia formazione è in ambito educativo e umanistico. Eppure ecco una piattaforma funzionante con backend, database, frontend, API di streaming, bot Telegram. Tutto scritto per lo più con l'assistenza dell'AI, guidato da qualcuno che conosce profondamente il dominio e il codice solo a distanza di braccio. Questa è, per me, la proprietà più sottovalutata dell'AI attuale: cambia chi ha il permesso di costruire software. Permette agli esperti di dominio di costruirsi i propri strumenti invece di scrivere una specifica per qualcun altro. Non è un dettaglio di questa storia — è uno dei risultati principali.

Secondo — gli studenti stanno già usando l'AI come psicologa e consulente di carriera. Lo fanno oggi, su larga scala. Aprono un chatbot generalista e ci riversano domande su ansia, strategie di studio, scelte di vita. Non dico che sia sempre sbagliato. Ma notate cos'è un chatbot generalista: un prodotto con i propri incentivi. È ottimizzato per l'engagement, per la quota di mercato, per logiche di business che non hanno nulla a che fare col benessere educativo di un diciannovenne. Ed è costruito per evitare giudizi di valore. Non dirà mai a uno studente "questa strategia di studio che descrivi ti sta danneggiando" — perché sarebbe una posizione, e il prodotto non ha posizioni. Un consulente deve avere una posizione. Un buon consulente è esattamente qualcuno con un giudizio addestrato. Quindi la prima cosa che CounselorBot fa è impegnarsi in una posizione: un quadro pedagogico, un insieme di strumenti, un catalogo di consigli certificati.

Terzo — l'harness. Un modello da solo è una capacità generica. Ciò che lo rende efficace in un dominio specifico è tutto ciò che gli sta intorno: i prompt di sistema, la sequenza di passi guidati, gli script, il retrieval, i vincoli, i fallback. Uso la parola "harness" deliberatamente: un'infrastruttura di script, comandi, testi e prompt che dà a un LLM la capacità di essere efficace e pertinente. Il motore è impressionante; l'harness decide se il viaggio è sicuro e se arrivi. La maggior parte del mio sforzo ingegneristico non è stato nel chiamare il modello — è stato nel costruire l'harness.

Quarto — gli strumenti esistevano già, e sono eccellenti. Dal 1996, la tradizione italiana ha questionari come il QSA, sviluppato da Michele Pellerey, che misurano strategie di apprendimento, motivazione, autoregolazione — le "competenze strategiche" necessarie per dirigersi nello studio e nel lavoro. Sono gratuiti, validati, usati in centinaia di scuole. Ma ecco il punto: un profilo di punteggi non significa nulla senza una conversazione. Lo stesso gruppo di ricerca insiste sul fatto che i questionari funzionano solo quando un insegnante, un tutor o un consulente aiuta lo studente a leggere e interpretare i risultati. E gli esperti non sono sempre disponibili — non su larga scala, non a mezzanotte prima di un esame, non per ogni studente che ne ha bisogno. Gli strumenti aspettano una guida che raramente c'è. Quel vuoto è esattamente dove può sedersi un'AI — non come sostituto dell'esperto, ma come prima linea della conversazione.

Quinto — ed è il motivo che mi preoccupa di più — c'è un rischio sociale in questa tecnologia. Man mano che i modelli migliorano nella conversazione, le persone chiedono meno alle persone. Lo studente che avrebbe chiesto a un amico, a un professore, a un genitore, ora chiede a un modello. La comodità sostituisce la comunità. Così ho progettato la piattaforma come human-in-the-loop fin dall'inizio: lo studente parla con l'AI, ma intorno allo studente ci sono persone vere — insegnanti che vedono i risultati e le conversazioni della loro classe, ricercatori che somministrano gli strumenti con consenso e codici anonimi, e gli artefatti dello studente stesso: un taccuino, un portfolio. L'AI è un nodo di una rete umana, non un suo sostituto.

---

### Note per te

- Punto 1: fondamentale per il pubblico EECS. Potrebbero chiedersi "come ha fatto un non-programmatore?". Risposta pronta: architettura semplice e modulare (FastAPI + Next.js), iterazione continua con AI, test smoke su DB di test. Non vergognartene: presentalo come demo della tesi.
- Punto 3: definizione harness = la tua definizione, usala letterale ("infrastructure of scripts, commands, texts and prompts").
- Punto 2: attento al tono — non attaccare i vendor generalisti, dire "they are good products doing what products do".
- Cut plan: se vai lungo, taglia il punto 5 qui e recuperalo alla slide 9.

---

## Slide 5 — What orientation means: Pellerey's answer

**Bullet slide:**
- Orientation ≠ a one-time test; it is learning to *direct oneself* in study and work
- Two pillars (Pellerey):
  - **Self-determination** — choosing one's direction: values, motives, sense, existential perspective
  - **Self-regulation** — managing one's actions: planning, monitoring, persisting, attributing causes
- Four fundamental needs: autonomy, competence, relation — and *sense*
- EU Key Competences: "managing one's own learning and career" — learning to learn
- The gap: schools teach almost no explicit self-regulation (Greene, 2018); first-year students arrive disoriented

---

### Discorso EN (≈ 4–5 min)

Before I show you the system, I need to take one step back into the theory — because the theory is what the system enforces. The question: what is orientation?

The word "orientation" in education usually evokes a moment: a test at the end of school that tells you which career fits you. Michele Pellerey — professor emeritus at the Università Pontificia Salesiana in Rome and the intellectual father of this tradition — has spent decades arguing for a different answer. For him, orientation is not a moment, it is a competence: the capacity to *direct oneself* in study and work — "dirigere se stessi". And that capacity has two pillars.

The first pillar is **self-determination**: the strategic component. It is the capacity to choose where you want to go — which involves values, motives, ideals, and something Pellerey insists on: a sense of your own life, an existential perspective. Without that, no amount of information about careers helps, because there is no "you" choosing.

The second pillar is **self-regulation**: the operational component. Once you have a direction, you must manage the journey — plan, monitor your progress, persist through difficulty, and, crucially, attribute causes correctly: did I fail because I am incapable, or because I studied with the wrong strategy? Those attributions decide whether a student tries again.

Pellerey grounds all of this in the classic humanistic needs — autonomy, competence, and relation — to which he adds a fourth: the need for *sense*, for meaning. Students are not optimization problems; they are people looking for a direction that makes sense.

Now, this is not an eccentric theory. It aligns with the European Recommendation on Key Competences, which puts at the centre "managing one's own learning and career" — learning to learn. And there is a hard empirical reason to take it seriously: as Jeffrey Greene documented in 2018, schools all over the world spend almost no time teaching self-regulation explicitly, despite solid evidence that it works. The result is what every university sees: first-year students who were excellent inside a highly controlled school environment, and who fall apart — or drop out — the moment the control is removed. They were never taught to direct themselves. Orientation, in Pellerey's sense, is precisely that education. And it is an education that can be delivered through conversation.

---

### Discorso IT (≈ 4–5 min)

Prima di mostrarvi il sistema, devo fare un passo indietro nella teoria — perché la teoria è ciò che il sistema impone. La domanda: cos'è l'orientamento?

La parola "orientamento" in educazione evoca di solito un momento: un test a fine scuola che ti dice quale carriera ti si addice. Michele Pellerey — professore emerito all'Università Pontificia Salesiana di Roma e padre intellettuale di questa tradizione — ha passato decenni a sostenere una risposta diversa. Per lui l'orientamento non è un momento, è una competenza: la capacità di *dirigere se stessi* nello studio e nel lavoro. E quella capacità ha due pilastri.

Il primo pilastro è l'**autodeterminazione**: la componente strategica. È la capacità di scegliere dove andare — il che coinvolge valori, motivi, ideali e qualcosa su cui Pellerey insiste: un senso della propria vita, una prospettiva esistenziale. Senza quello, nessuna quantità di informazioni sulle carriere aiuta, perché non c'è un "tu" che sceglie.

Il secondo pilastro è l'**autoregolazione**: la componente operativa. Una volta che hai una direzione, devi gestire il viaggio — pianificare, monitorare i progressi, persistere nelle difficoltà e, soprattutto, attribuire correttamente le cause: ho fallito perché sono incapace, o perché ho studiato con la strategia sbagliata? Quelle attribuzioni decidono se uno studente riprova.

Pellerey fonda tutto questo sui classici bisogni umanistici — autonomia, competenza e relazione — a cui aggiunge un quarto: il bisogno di *senso*, di significato. Gli studenti non sono problemi di ottimizzazione; sono persone che cercano una direzione che abbia senso.

Non è una teoria eccentrica. Si allinea con la Raccomandazione europea sulle competenze chiave, che mette al centro "gestire il proprio apprendimento e la propria carriera" — imparare ad imparare. E c'è una dura ragione empirica per prenderla sul serio: come ha documentato Jeffrey Greene nel 2018, le scuole di tutto il mondo dedicano quasi nessun tempo all'insegnamento esplicito dell'autoregolazione, nonostante le solide evidenze a favore. Il risultato è ciò che ogni università vede: matricole che erano eccellenti dentro un ambiente scolastico altamente controllato, e che crollano — o abbandonano — nel momento in cui il controllo sparisce. Non è mai stato insegnato loro a dirigersi. L'orientamento, nel senso di Pellerey, è esattamente quell'educazione. Ed è un'educazione che si può fare attraverso la conversazione.

---

### Note per te

- Definisci i due pilastri con gesto a due mani: destra = autodeterminazione, sinistra = autoregolazione.
- Citazione utile: "Students are not optimization problems; they are people looking for direction." Usala anche in chiusura.
- Se qualcuno chiede "chi è Pellerey?" — hai la scheda: professore emerito UPS Roma, coordinatore del gruppo CompetenzeStrategiche, QSA dal 1996, autore con Margottini/Ottone.

---

## Slide 6 — Against matching

**Bullet slide:**
- The classic approach: trait-factor matching (Parsons) — measure the person, catalogue the jobs, find the fit
- It assumes two stable things: a stable person and a stable labour market
- Neither holds: automation, digitalization, AI, job polarization — the market changes faster than the diagnosis
- Pellerey (2016): employability cannot be read off from the current demand of the market; orientation must build *self-direction*
- Savickas: career construction / life design — the person makes the self, they do not find a slot
- QAP: the Italian adaptation of the Career Adapt-Abilities Scale — concern, control, curiosity, confidence

---

### Discorso EN (≈ 4–5 min)

There is a classical answer to "what is orientation", and it is the answer I want to argue against — carefully, because it contains something true. The classical answer is the trait-factor, or matching, model: it goes back to Frank Parsons at the beginning of the twentieth century. You measure the person — their traits, aptitudes, interests — you catalogue the occupations and their requirements, and you match the two. Person meets job. Square peg, square hole.

The appeal is obvious: it is clean, it is testable, it produces a clear output. A student takes a test and receives a list of fitting professions. That feels like science.

The problem, as Pellerey has argued, is that the model rests on two assumptions of stability that no longer hold. The first is a stable person: as if a sixteen-year-old's aptitudes were finished facts, waiting to be measured. The second is a stable market: as if the world of work would politely stay put while the diagnosis is made. But the market is not stable — automation, digitalization, artificial intelligence, the polarization of occupations. Pellerey's point, in his 2016 essay "Orientation as empowerment of the human person", is sharp: you cannot read a young person's future employability off the current demand of the labour market, because that demand will have changed by the time they arrive. A matching model, taken seriously, optimizes people for yesterday's jobs.

So what replaces it? Two complementary answers. Pellerey's: build the person's capacity for self-direction — the competences that let them navigate a changing landscape, tied to a deep sense of their own life. And Mark Savickas': career construction, or life designing. Savickas — the leading theorist of vocational psychology today — describes career not as the discovery of a pre-existing fit, but as something the person *makes*: a story the person tells and revises, in which work is one chapter. The key construct becomes adaptability, not fit. That is why one of the instruments on the platform is the QAP, the Italian adaptation of the Career Adapt-Abilities Scale: four dimensions — concern for one's own professional future, control over one's development, curiosity to explore, confidence to act.

Notice what changes: the goal is no longer "the right answer", but the right *process* — a person who can direct themselves, adapt, and keep re-deciding. And that is a process of conversation and reflection. Which is, of course, exactly what a conversational AI can support — if it is built to support that process, and not to sell answers.

---

### Discorso IT (≈ 4–5 min)

C'è una risposta classica a "cos'è l'orientamento", ed è la risposta contro cui voglio argomentare — con cautela, perché contiene qualcosa di vero. La risposta classica è il modello trait-factor, o matching: risale a Frank Parsons all'inizio del Novecento. Si misura la persona — tratti, attitudini, interessi — si catalogano le occupazioni e i loro requisiti, e si fa combaciare le due cose. Persona e lavoro. Il piolo quadrato nel buco quadrato.

Il fascino è ovvio: è pulito, è verificabile, produce un output chiaro. Uno studente fa un test e riceve una lista di professioni adatte. Sembra scienza.

Il problema, come ha argomentato Pellerey, è che il modello poggia su due assunzioni di stabilità che non reggono più. La prima è una persona stabile: come se le attitudini di un sedicenne fossero fatti finiti, in attesa di essere misurati. La seconda è un mercato stabile: come se il mondo del lavoro restasse educatamente fermo mentre si fa la diagnosi. Ma il mercato non è stabile — automazione, digitalizzazione, intelligenza artificiale, polarizzazione delle occupazioni. Il punto di Pellerey, nel suo saggio del 2016 "Orientamento come potenziamento della persona umana", è netto: non puoi leggere l'occupabilità futura di un giovane dalla domanda attuale del mercato del lavoro, perché quella domanda sarà già cambiata quando il giovane arriverà. Un modello di matching, preso sul serio, ottimizza le persone per i lavori di ieri.

Allora cosa lo sostituisce? Due risposte complementari. Quella di Pellerey: costruire la capacità di autodirezione della persona — le competenze che le permettono di navigare un paesaggio che cambia, legate a un senso profondo della propria vita. E quella di Mark Savickas: la career construction, o life designing. Savickas — il principale teorico della psicologia vocazionale di oggi — descrive la carriera non come la scoperta di un incastro preesistente, ma come qualcosa che la persona *costruisce*: una storia che la persona racconta e rivede, in cui il lavoro è un capitolo. Il costrutto chiave diventa l'adattabilità, non l'incastro. Per questo uno degli strumenti sulla piattaforma è il QAP, l'adattamento italiano della Career Adapt-Abilities Scale: quattro dimensioni — preoccupazione per il proprio futuro professionale, controllo sul proprio sviluppo, curiosità di esplorare, fiducia di agire.

Notate cosa cambia: l'obiettivo non è più "la risposta giusta", ma il *processo* giusto — una persona capace di dirigersi, adattarsi e continuare a ri-decidersi. Ed è un processo di conversazione e riflessione. Il che è, ovviamente, esattamente ciò che un'AI conversazionale può sostenere — se è costruita per sostenere quel processo, e non per vendere risposte.

---

### Note per te

- Per pubblico EECS: "optimizes people for yesterday's jobs" — frase chiave, colpisce.
- Savickas: cita il titolo del suo articolo 2024 (nel repo): "Career Studies and Life Designing: Self-Making". Se chiedono riferimenti: Savickas & Porfeli 2012 per la CAAS; Maggiori, Rossier, Savickas 2015 per la short form.
- Il QAP come ponte: matching → adaptability. Così la critica non è solo distruttiva.

---

## Slide 7 — The instruments: strategic competences

**Bullet slide:**
- Heritage: competenzestrategiche.it — free platform by the Pellerey group (CNOS-FAP), growing since 2011
- Instruments on CounselorBot:
  - **QSA** (Pellerey, 1996) — learning strategies, cognitive + affective
  - **QSAr** — reduced form
  - **QPCS** — perceived strategic competences
  - **QPCC** — perceived competences and beliefs
  - **ZTPI** — Zimbardo time perspective
  - **QAP** — career adaptability
  - **SAVICKAS** — narrative career construction interview
  - Study / professional significant events (narrative)
  - **IDEA** — free chat that brings one idea into focus, building a cumulative map
- The profile is a beginning, not a verdict: scores exist to open a conversation

---

### Discorso EN (≈ 5–6 min)

Now the instruments — the apertures I promised you.

Everything here descends from a real, live infrastructure: competenzestrategiche.it, the free online platform built by Pellerey's research group with the support of CNOS-FAP, the Salesian vocational training federation. It has been serving schools, universities and guidance centres since around 2011, and it hosts the questionnaires of this tradition. What I did was not to invent instruments — I took validated instruments and gave them a conversational layer.

The family tree starts with the QSA, the Questionnaire on Learning Strategies, published by Pellerey in 1996 — thirty years of validation history. It measures how a student studies: cognitive strategies on one side, affective and motivational factors on the other — anxiety, volition, perseverance, attribution. The QSAr is its reduced form, for quicker administration. Then there are the strategic-competence instruments: the QPCS, perceived strategic competences, and the QPCC, competences and beliefs — for older students and adults. The ZTPI, from Zimbardo's time-perspective research, measures how a person relates to past, present and future — a construct that turns out to be deeply connected to academic success. The QAP, as we saw, measures career adaptability in the four dimensions of concern, control, curiosity and confidence.

Two instruments are narrative rather than scored. The Savickas career construction interview is, on paper, something a counsellor does in person; on the platform it becomes a guided conversation in steps. And then there are the significant events — study events, professional events — where the student tells a story and the AI helps to analyse it.

One more instrument, the newest, and my favourite: IDEA. It is not a questionnaire at all. The student arrives with a shapeless idea — a possible thesis topic, a career hypothesis, a project, a doubt. The platform does not score anything; it builds, turn after turn, a cumulative map of the idea — assumptions, evidence, alternatives, implications, open questions — with every node in its role, and the map growing as an append-only history of the person's own thinking. It ends with an explicit plan. IDEA is the purest form of what this platform is about: not diagnosing the person, but helping the person develop a thought.

And here is the pedagogical principle that governs all of them: the profile — the set of scores — is a beginning, not a verdict. In this tradition, the questionnaire is a reflective device: its purpose is to open a conversation about oneself. The score is the keyhole; the conversation is what you see through it. That is why the instruments alone were never enough — and why the conversational layer was the missing piece.

---

### Discorso IT (≈ 5–6 min)

Ora gli strumenti — le aperture che vi avevo promesso.

Tutto discende da un'infrastruttura reale e viva: competenzestrategiche.it, la piattaforma online gratuita costruita dal gruppo di ricerca di Pellerey con il supporto del CNOS-FAP, la federazione salesiana della formazione professionale. Serve scuole, università e centri di orientamento dal 2011 circa, e ospita i questionari di questa tradizione. Io non ho inventato strumenti — ho preso strumenti validati e gli ho dato uno strato conversazionale.

L'albero genealogico comincia col QSA, il Questionario sulle Strategie di Apprendimento, pubblicato da Pellerey nel 1996 — trent'anni di storia di validazione. Misura come uno studente studia: da un lato le strategie cognitive, dall'altro i fattori affettivi e motivazionali — ansia, volizione, perseveranza, attribuzione. Il QSAr è la sua forma ridotta, per somministrazioni più rapide. Poi ci sono gli strumenti sulle competenze strategiche: il QPCS, competenze strategiche percepite, e il QPCC, competenze e convinzioni — per studenti più grandi e adulti. Lo ZTPI, dalla ricerca di Zimbardo sulla prospettiva temporale, misura come una persona si rapporta a passato, presente e futuro — un costrutto che risulta profondamente connesso al successo accademico. Il QAP, come abbiamo visto, misura l'adattabilità professionale nelle quattro dimensioni di concern, control, curiosity e confidence.

Due strumenti sono narrativi, non a punteggio. L'intervista di costruzione di carriera di Savickas è, su carta, qualcosa che un consulente fa di persona; sulla piattaforma diventa una conversazione guidata a passi. E poi ci sono gli eventi significativi — di studio, professionali — in cui lo studente racconta una storia e l'AI aiuta ad analizzarla.

Un ultimo strumento, il più nuovo, e il mio preferito: IDEA. Non è affatto un questionario. Lo studente arriva con un'idea informe — un possibile tema di tesi, un'ipotesi di carriera, un progetto, un dubbio. La piattaforma non assegna punteggi; costruisce, turno dopo turno, una mappa cumulativa dell'idea — assunzioni, evidenze, alternative, implicazioni, domande aperte — con ogni nodo nel suo ruolo, e la mappa che cresce come storia append-only del pensiero della persona. Finisce con un piano esplicito. IDEA è la forma più pura di ciò che è questa piattaforma: non diagnosticare la persona, ma aiutarla a sviluppare un pensiero.

Ed ecco il principio pedagogico che governa tutto: il profilo — l'insieme dei punteggi — è un inizio, non un verdetto. In questa tradizione il questionario è un dispositivo riflessivo: il suo scopo è aprire una conversazione su se stessi. Il punteggio è la toppa; la conversazione è ciò che vedi attraverso. Per questo gli strumenti da soli non sono mai bastati — e per questo lo strato conversazionale era il pezzo mancante.

---

### Note per te

- Non elencare tutti gli strumenti a voce: fai scorrere lo sguardo sui primi sei, dedica tempo a SAVICKAS, eventi e IDEA.
- IDEA: qui puoi anticipare che tornerà nella demo (slide 8). 
- "The score is the keyhole" — richiamo della metafora, fallo notare.

---

## Slide 8 — The platform

**Bullet slide:**
- Stack: FastAPI + Next.js + PostgreSQL, Docker; 13 AI providers behind one abstraction, SSE streaming
- The harness, concretely:
  - **Envelope**: persona + student data + scores + step prompt + retrieved knowledge + history, assembled every turn
  - **Guided steps**: DB-driven conversational state machine per instrument
  - **Skills engine**: deterministic intent classifier activates at most one primary behaviour — certified advice, profile explanation, reading suggestions, profile comparison, whitelisted web lookup
  - **RAG**: four knowledge collections (platform, framework, instruments, site docs)
  - **Counselors**: AI personas with scopes, languages, voices
- Open learner model: the student's notebook (append-only), booklets, portfolio
- Groups, Telegram, frozen sessions

---

### Discorso EN (≈ 6–7 min)

Now the engineering. I will show you the harness, because that is the part I believe is generalizable beyond this application.

The stack is deliberately boring: a FastAPI backend, a Next.js frontend, PostgreSQL, everything in Docker. Behind one abstraction there are thirteen AI providers — from OpenAI and Anthropic to local models through Ollama and llama.cpp — with a monthly budget fallback: when the budget is spent, the platform quietly switches to the local model. The chat streams over SSE.

The interesting part is what happens around the model on every single turn. I call it the envelope. Every message is assembled from: the counselor persona — the AI has a name, a character, a scope; the student's data and scores; the prompt of the current step of the guided path; knowledge retrieved from the collections; the student's notebook, the open learner model; and the conversation history. Nothing is improvised: the platform decides, turn by turn, what the model is allowed to know and what it is asked to do.

The guided path is the pedagogical skeleton: for each instrument, a sequence of steps stored in the database — introduction, factor analysis, synthesis — each with its own prompt, editable by administrators without touching code. The step decides the mode; the mode decides what the model may do. Advice, for instance, is allowed only in specific steps — the synthesis steps — and nowhere else.

Then the skills engine. This is the part I am most proud of. A deterministic, high-precision intent classifier runs on every turn and activates at most one primary behaviour: certified advice — practical strategies from a catalogue curated by educators, never invented by the model; profile explanation — helping the student read their own scores; reading suggestions — books and films from a certified catalogue; profile comparison — the same questionnaire over time; or a whitelisted web lookup for factual questions, answered from encyclopedias and validated sources rather than from the model's memory. If the classifier is not sure, it falls back to plain conversation. The point: the model can be creative, but the advice is always traceable to the catalogue. That is what a counsellor's responsibility means, mechanically.

Around the student: the taccuino — the notebook — an append-only open learner model where the student writes what they are discovering about themselves, with a full revision history; per-instrument booklets; a portfolio; class groups with invite codes; and a Telegram bot, so the conversation can continue outside the web app.

And now, let me show you — [DEMO].

---

### Discorso IT (≈ 6–7 min)

Ora l'ingegneria. Vi mostro l'harness, perché è la parte che credo generalizzabile oltre questa applicazione.

Lo stack è volutamente noioso: backend FastAPI, frontend Next.js, PostgreSQL, tutto in Docker. Dietro un'unica astrazione ci sono tredici provider AI — da OpenAI e Anthropic ai modelli locali via Ollama e llama.cpp — con un fallback a budget mensile: quando il budget è finito, la piattaforma passa silenziosamente al modello locale. La chat viaggia in streaming SSE.

La parte interessante è ciò che accade intorno al modello a ogni singolo turno. Lo chiamo envelope. Ogni messaggio è assemblato da: la persona del counselor — l'AI ha un nome, un carattere, un ambito; i dati e i punteggi dello studente; il prompt del passo corrente del percorso guidato; la conoscenza recuperata dalle collezioni; il taccuino dello studente, l'open learner model; e la storia della conversazione. Niente è improvvisato: la piattaforma decide, turno per turno, cosa il modello può sapere e cosa gli viene chiesto di fare.

Il percorso guidato è lo scheletro pedagogico: per ogni strumento, una sequenza di passi salvati nel database — introduzione, analisi dei fattori, sintesi — ognuno col suo prompt, modificabile dagli amministratori senza toccare il codice. Il passo decide il modo; il modo decide cosa il modello può fare. I consigli, per esempio, sono permessi solo in passi specifici — i passi di sintesi — e da nessun'altra parte.

Poi lo skills engine. È la parte di cui sono più orgoglioso. Un classificatore di intenti deterministico e ad alta precisione gira su ogni turno e attiva al massimo un comportamento primario: consigli certificati — strategie pratiche da un catalogo curato da educatori, mai inventate dal modello; spiegazione del profilo — aiutare lo studente a leggere i propri punteggi; suggerimenti di lettura — libri e film da un catalogo certificato; confronto di profili — lo stesso questionario nel tempo; o una ricerca web whitelistata per domande fattuali, risposta da enciclopedie e fonti validate invece che dalla memoria del modello. Se il classificatore non è sicuro, ricade sulla conversazione normale. Il punto: il modello può essere creativo, ma il consiglio è sempre tracciabile al catalogo. Ecco cosa significa la responsabilità di un consulente, meccanicamente.

Intorno allo studente: il taccuino — un open learner model append-only dove lo studente scrive ciò che scopre di sé, con storia completa delle revisioni; i libretti per strumento; il portfolio; i gruppi classe con codici di invito; e un bot Telegram, così la conversazione può continuare fuori dalla web app.

E ora vi mostro — [DEMO].

---

### Note per te

- DEMO: 5 minuti massimi. Percorso consigliato: (1) login studente, (2) avvio QSAr o IDEA, (3) un turno di chat con envelope visibile se puoi (make prompt-dry Q=QSAr STEP=... genera l'envelope), (4) pannello admin: passi guidati e catalogo strategie, (5) mappa IDEA. Screenshot di riserva se rete assente.
- Se vuoi mostrare l'envelope davvero: `make prompt-dry Q=QSAr STEP=qsar-cognitive` — output markdown con tutti i blocchi. Ottima slide di backup.
- 13 provider: non serve elencarli, lo stack è "deliberately boring" — il pubblico EECS apprezza l'understatement.

---

## Slide 9 — Human-in-the-loop and research

**Bullet slide:**
- Around the student: teachers, researchers, classmates — the AI is one node, not the centre
- Teachers: classes and groups, see own students' results and conversations, notes and messages (web + Telegram)
- Researchers: administration plans, informed consent, anonymous research codes, raw item-level export
- Validation pipeline: item responses → CSV → psychometrics (R/CFA) → stanine norms
- Six languages with a certification protocol: draft → translated → reviewed → pilot → validated
- Collaboration with KTH (Prof. Olle Bälter): validating the QSAr with Swedish students

---

### Discorso EN (≈ 4 min)

Reason five from the beginning — people stop asking people — is why the human loop is not an afterthought in this system. It is the architecture.

The student is not alone with the model. Around them there are roles. Teachers create class groups — students join with an invite code — and the teacher can see the results and the conversations of their own students, write notes, send messages that arrive on the web or through Telegram. This turns the platform into something a teacher can actually use in a classroom, not a private chatbot. Researchers administer the instruments through administration plans: informed consent, anonymous research codes — the researcher works on data that never carries a name — and export of raw, item-level responses for psychometric analysis.

The validation pipeline is real: raw responses go out as CSV, the analysis happens in R with classical test theory and CFA, and the norms — the stanine thresholds — come back into the platform. Six languages are supported — Italian, English, Spanish, French, German, Swedish — but here is a principle I want to underline: no translation reaches a student until a human has certified it. There is a protocol — draft, translated, reviewed, pilot, validated — and an automatic translation can only ever arrive at the first rung. The humans decide what students see.

And this is the part of the talk where Stockholm enters the story properly. Last May I wrote to Professor Olle Bälter here at KTH, proposing a collaboration: validate the Swedish version of the QSAr with KTH students — cognitive interviews, a pilot study, data collection, then the psychometrics. The manual is already written, in English. So if this talk has a practical ask, it is this: I am looking for a home for this validation — students, courses, a pilot context — and for feedback from this department on the system itself. EECS is exactly the place where the pedagogical question and the engineering question can be discussed together.

---

### Discorso IT (≈ 4 min)

Il motivo cinque dell'inizio — le persone smettono di chiedere alle persone — è il motivo per cui il circuito umano non è un ripensamento in questo sistema. È l'architettura.

Lo studente non è solo col modello. Attorno a lui ci sono ruoli. Gli insegnanti creano gruppi classe — gli studenti entrano con un codice di invito — e l'insegnante può vedere i risultati e le conversazioni dei propri studenti, scrivere note, mandare messaggi che arrivano sul web o via Telegram. Questo trasforma la piattaforma in qualcosa che un insegnante può davvero usare in classe, non in un chatbot privato. I ricercatori somministrano gli strumenti attraverso piani di somministrazione: consenso informato, codici di ricerca anonimi — il ricercatore lavora su dati che non portano mai un nome — ed esportazione delle risposte grezze item per item per l'analisi psicometrica.

La pipeline di validazione è reale: le risposte grezze escono come CSV, l'analisi avviene in R con teoria classica dei test e CFA, e le norme — le soglie stanine — rientrano nella piattaforma. Sono supportate sei lingue — italiano, inglese, spagnolo, francese, tedesco, svedese — ma ecco un principio che voglio sottolineare: nessuna traduzione raggiunge uno studente finché un essere umano non l'ha certificata. C'è un protocollo — bozza, tradotta, revisionata, pilota, validata — e una traduzione automatica può arrivare solo al primo gradino. Sono gli umani a decidere cosa vedono gli studenti.

Ed è qui che Stoccolma entra davvero nella storia. A maggio ho scritto al professor Olle Bälter qui al KTH, proponendo una collaborazione: validare la versione svedese del QSAr con studenti del KTH — interviste cognitive, uno studio pilota, raccolta dati, poi la psicometria. Il manuale è già scritto, in inglese. Quindi se questo talk ha una richiesta pratica, è questa: cerco una casa per questa validazione — studenti, corsi, un contesto pilota — e feedback da questo dipartimento sul sistema stesso. EECS è esattamente il posto dove la domanda pedagogica e la domanda ingegneristica si possono discutere insieme.

---

### Note per te

- Slide "politica" del talk: la richiesta di collaborazione va detta guardando la stanza, con calma.
- Se Olle Bälter è presente: nominarlo direttamente ("and I hope Olle will forgive me for saying this before he answered").
- Numeri da riempire: quanti studenti, quanti piani di somministrazione attivi, quante lingue realmente pilotate. Vedi sezione "Numeri da riempire".

---

## Slide 10 — Closing: a harness is a promise

**Bullet slide:**
- A third way: between the generalist chatbot (no position) and the human counsellor (not scalable)
- The harness = the position: pedagogy, instruments, certified advice, human certification, human loop
- What is next: PQBL (question-based learning from documents), fine-tuning on real QSA sessions, validating the translations, more instruments
- The keyhole, again: the apertures existed. What was missing was a guide — and now a guide can be built by anyone who cares enough

---

### Discorso EN (≈ 2–3 min)

Let me close by going back to where I started.

The students were already using generalist chatbots as counsellors. On one side, that generalist chatbot: capable, available, cheap — but with no position, no pedagogical commitment, no human responsibility. On the other side, the human counsellor: wise, caring, formative — and scarce. CounselorBot is an attempt at a third way: a harness that carries a pedagogical position. Not a model that talks — a system that commits: to a theory of orientation, to validated instruments, to advice that is certified by educators, to translations that are certified by humans, and to a human loop around every student.

The word "harness" matters one last time. A harness is what lets a strong animal pull something heavy in the right direction. The models are strong. The direction has to come from us — from pedagogy, from ethics, from the people who care about students. If there is one general lesson from this project, it is that the harness is the actual product. The model is a commodity; the position is not.

What comes next: PQBL — problem-based learning on documents, where a text becomes a set of generated questions; fine-tuning a model on real QSA conversations, because we now have a dataset of supervised interactions; validating the translations through the six-language protocol; and more instruments, in more contexts. And of course — the invitation to you: try it, break it, question it. That is what a department is for.

And the keyhole. The apertures were already there — the instruments, the theory, thirty years of validation. What was missing was a guide at every aperture, at every hour. A guide can now be built by anyone who cares enough — that is what AI changed, and that is the story I came here to tell. Thank you.

---

### Discorso IT (≈ 2–3 min)

Chiudo tornando da dove sono partito.

Gli studenti usavano già chatbot generalisti come consulenti. Da un lato, quel chatbot generalista: capace, disponibile, economico — ma senza posizione, senza impegno pedagogico, senza responsabilità umana. Dall'altro, il consulente umano: saggio, premuroso, formativo — e scarso. CounselorBot è un tentativo di terza via: un harness che porta una posizione pedagogica. Non un modello che parla — un sistema che si impegna: verso una teoria dell'orientamento, verso strumenti validati, verso consigli certificati da educatori, verso traduzioni certificate da umani, e verso un circuito umano attorno a ogni studente.

La parola "harness" conta un'ultima volta. Un harness è ciò che permette a un animale forte di tirare qualcosa di pesante nella direzione giusta. I modelli sono forti. La direzione deve venire da noi — dalla pedagogia, dall'etica, dalle persone che hanno a cuore gli studenti. Se c'è una lezione generale di questo progetto, è che l'harness è il vero prodotto. Il modello è una commodity; la posizione no.

Cosa viene dopo: PQBL — apprendimento basato su problemi a partire da documenti, dove un testo diventa un insieme di domande generate; fine-tuning di un modello su conversazioni QSA reali, perché ora abbiamo un dataset di interazioni supervisionate; la validazione delle traduzioni attraverso il protocollo a sei lingue; e più strumenti, in più contesti. E naturalmente — l'invito a voi: provatelo, rompetelo, mettetelo in discussione. È a questo che serve un dipartimento.

E la toppa. Le aperture c'erano già — gli strumenti, la teoria, trent'anni di validazione. Mancava una guida a ogni apertura, a ogni ora. Una guida ora può essere costruita da chiunque tenga abbastanza — è questo che l'AI ha cambiato, ed è questa la storia che sono venuto a raccontare. Grazie.

---

### Note per te

- Ultima frase collegata alla toppa: cerchio chiuso. 
- Lascia 3 minuti per domande dentro i 40; se sfori, questa slide è la più comprimibile.
- "The model is a commodity; the position is not" — frase da mettere in grassetto sulla slide, se puoi.

---

# Materiale extra

## Fonti (da citare se richiesto)

- Pellerey M., *Orientamento come potenziamento della persona umana in vista della sua occupabilità: il ruolo delle soft skills, o competenze professionali personali generali*, Rassegna CNOS, 1 (2016), pp. 41–50.
- Pellerey M., *Orientamento professionale e prospettiva futura*, Rassegna CNOS, 2 (2016), pp. 53–64.
- Pellerey M., *Dirigere se stessi nello studio e nel lavoro. Riflessioni*, Convegno "Dirigere se stessi nello studio e nel lavoro", Roma, 13 settembre 2019 (slide deck nel repo).
- Pellerey M., Margottini M., Ottone E. (a cura di), *Dirigere se stessi nello studio e nel lavoro. Competenzestrategiche.it: strumenti e applicazioni*, Roma TrE-Press, 2020.
- Epifani F., Margottini M., Ottone E., *Guida all'uso della piattaforma www.competenzestrategiche.it*, CNOS-FAP, 3ª ed., 2023.
- Greene J., *Self-Regulation in Education*, Routledge, 2018.
- Heckman J., *character skills* e ruolo della coscienziosità (citato in Pellerey 2019).
- Savickas M. L., *Career Studies and Life Designing: Self-Making*, 2024 (PDF nel repo).
- Maggiori C., Rossier J., Savickas M. L., *Career Adapt-Abilities Scale — Short Form*, Journal of Career Assessment, 2015.
- Savickas M. L., Porfeli E. J., *Career Adapt-Abilities Scale*, 2012.
- Zimbardo P. G., Boyd J. N., *Putting time in perspective*, Journal of Personality and Social Psychology, 1999 (per ZTPI).
- Raccomandazione del Consiglio UE sulle competenze chiave per l'apprendimento permanente (2018).

## Numeri da riempire (dal pannello admin / tua esperienza)

- [ ] Studenti registrati su CounselorBot: ___
- [ ] Sessioni di chat guidata completate: ___
- [ ] Piani di somministrazione attivi: ___
- [ ] Strumenti effettivamente validati finora (stato lingue in ContentLanguageVersions): ___
- [ ] Risposte item-per-item raccolte per la validazione QSAr (N = ___)
- [ ] Contatto Olle Bälter: stato della risposta (risposto? in attesa?)
- [ ] Costo mensile reale in API (utile per la slide 8: "budget fallback"): ___

## Aneddoti di riserva

- **Keyhole, dettaglio fila**: ogni giorno c'è una fila silenziosa di sconosciuti davanti a un portone, uno alla volta. "The most sociable queue in Rome: strangers who take turns looking at the same beauty."
- **Giardino degli Aranci / Santa Sabina**: se il pubblico chiede altro su Roma: a due passi dalla toppa c'è il Giardino degli Aranci (aranceto con vista sul Tevere) e Santa Sabina, basilica del V secolo con la porta lignea originale — "Rome is a city of apertures: keyholes, orange gardens, doors from the year 430."
- **Pirandello, seconda battuta**: "He was not yet the Nobel laureate; he was a precarious adjunct. It is comforting to know that the university's most famous teacher was once just a stressed young man correcting exams."
- **IDEA in metafora**: "If the questionnaires are the keyhole, IDEA is the map of what you saw through it."

## Domande probabili e risposte pronte

1. **"Why not just use ChatGPT with a good prompt?"**
   Prompt = una frase; harness = stato, dati, retrieval, vincoli, certificazione. Un buon prompt non garantisce che il consiglio venga dal catalogo, né che la traduzione sia certificata, né che l'insegnante veda la classe. Il valore è l'architettura, non la singola risposta.

2. **"How do you guarantee the advice is good?"**
   Consigli solo da catalogo certificato (certified strategies), attivati da classificatore deterministico solo nei passi autorizzati. Feedback degli studenti raccolto (helpful/unhelpful). Benchmark interno. Mai improvvisato.

3. **"What about privacy and minors?"**
   Redazione PII sui log, codici anonimi per la ricerca, consenso nella somministrazione, autenticazione forward-auth con ruoli da gruppi. Filtri età per materiali sensibili nel catalogo letture.

4. **"How did a non-programmer build this?"**
   Iterazione AI-driven con architettura semplice e modulare; test smoke su DB Postgres dedicato; documentazione continua. Il dominio era mio; l'AI ha tradotto il dominio in codice.

5. **"Is this validated?"**
   Gli strumenti sì (QSA dal 1996, letteratura ampia). La piattaforma no — ed è esattamente il programma di ricerca: validazione QSAr con KTH (slide 9), pipeline dati già pronta.

6. **"What if the model says something wrong?"**
   L'envelope restringe lo spazio: solo conoscenza recuperata, consigli solo da catalogo, passi con modi limitati. E l'umano nel loop (docente, ricercatore) vede le conversazioni.

7. **"Why six languages?"**
   Gli strumenti esistono in traduzione da anni sul sito di origine; il protocollo di certificazione evita che una traduzione automatica arrivi agli studenti senza revisione umana.

## Piano di taglio (se il talk va lungo)

- Slide 2: taglia convegno 2019 (recuperi in slide 7) → −1 min
- Slide 4: taglia punto 5 (recuperi in slide 9) → −1 min
- Slide 7: elenca strumenti senza commento → −1,5 min
- Slide 8: demo da 5 a 3 min → −2 min
- Slide 10: comprimibile a 1 min → −1 min
- Totale recuperabile: ~6 min

## Link utili (verificati)

- Roma Tre su Pirandello (mostra "Il caos tra le righe"): https://www.uniroma3.it/en/articoli/il-caos-tra-le-righe-i-disegni-inediti-e-i-libri-di-luigi-pirandello-527914/
- Keyhole dei Cavalieri di Malta (Order of Malta): https://www.orderofmalta.int/government/st-peter-basilica-through-the-keyhole/
- Guida competenzestrategiche.it 2023 (CNOS-FAP): https://biblioteca.cnos-fap.it/pubblicazione/strumenti-e-metodologie-di-orientamento-formativo-e-professionale-nel-quadro-dei-processi-di-apprendimento-permanente/
- Scheda bibliografica "Orientamento come potenziamento della persona umana" (ESSPER/LIUC): https://biblio.liuc.it/scripts/essper/RicercaNoJavascript.asp?tipo=scheda&codice=2379409
