# Taccuino del docente e strumenti: audit e piano proposto

**Stato: proposta da approvare, nessuna implementazione.** S5, 2 ottobre 2026.
Task `dfe31cad-17b1-4bfa-9d1e-854b15637a6b`; goal `30d6a25d-8416-40f9-8ace-ff2272935806`.
Branch `docs/teacher-notebook-tool-overlap`; snapshot `e1e2b0da10d9b85ecc94958247eada20f3d2dba7` (PR29).
Audit statico e piano dello stesso agente, Codex/gpt-6.1-sol high; deroga esplicita dell’utente alla revisione cross-modello. Nessun altro agente.

## 1. Sintesi e decisione richiesta

Il taccuino ha una funzione coerente: descrivere il **ruolo del docente** per contestualizzare una conversazione. Non emerge una ragione sufficiente per eliminare uno dei sei campi. Il problema principale è capire **quanto descrivere qui e quando usare una classe, un obiettivo o un artefatto**.

| Priorità | Conclusione | Proposta |
| --- | --- | --- |
| P1 | «Classi e istituti» invita a riscrivere nomi e dettagli già gestiti nelle classi; il contesto chat può contenere entrambe le descrizioni senza una precedenza esplicita. | Precisare che qui va una panoramica del proprio incarico; i dettagli correnti della singola classe restano in «Contesto classe». Collegare le due superfici senza sincronizzarle. |
| P1 | «Metodologie d’aula» può significare abitudini del docente, pratiche di una classe, schede pubblicate oppure metodo di un obiettivo. Sono funzioni diverse. | Mantenere la nota generale; distinguere «Come insegno di solito», «Come lavoro con questa classe» e «Metodo per questo obiettivo». Il catalogo resta una risorsa condivisa, non un elenco delle proprie abitudini. |
| P1 | Sottotitolo e spiegazione della home descrivono solo la chat didattica e una separazione assoluta dal taccuino personale; oggi esiste già una scelta esplicita del contesto. Anche «taccuino vuoto» non implica assenza del contesto delle classi. | Allineare spiegazioni e default effettivi, senza cambiare selettore, ruoli o envelope. Coordinare i testi del selettore con S4 dopo il suo merge. |
| P2 | «Interessi di formazione», «Esperienza» e «Note» possono raccogliere intenzioni, episodi e lavori senza spiegare il passaggio agli strumenti esistenti. | Dare esempi distintivi e collegamenti volontari a obiettivi personali, Evento professionale, Linea del tempo e Portfolio. Non convertire note in obiettivi automaticamente. |
| P2 | Sei campi da 600 caratteri non equivalgono a sei campi interamente letti dalla chat: il blocco complessivo è tagliato a 1.200 caratteri, nell’ordine dei campi. | Spiegare la sintesi e invitare a esplicitare in chat i dettagli rilevanti. Valutare un diverso criterio di composizione solo con un contratto dedicato. |

**Ciò che funziona:** campi facoltativi, testo libero, ruolo separato dalla persona che studia, salvataggio esplicito con revisioni e deduplicazione, classi autonome, condivisione del contesto classe opt-in, obiettivi/pubblicazioni/assegnazioni confermati dalla persona. La ripetizione di parole fra questi luoghi può essere utile: non prova una ridondanza.

**Scelte davvero aperte:** mantenere la panoramica «Classi e istituti» oppure accompagnarla in futuro con un riepilogo consultivo delle classi gestite? Per la formazione personale bastano collegamenti agli strumenti personali oppure serve un futuro percorso professionale dedicato? Il limite del contesto deve restare un invito alla brevità oppure distribuire spazio fra tutti i campi? Nessuna di queste scelte è assunta come approvata. Raccomandazione: approvare prima il blocco A, poi valutare B; C e D restano eventuali.

## 2. Inventario attuale e contratti

### Campi effettivi

Tutti i campi sono `Optional[str]`, senza obbligo di compilazione: textarea di due righe, `maxLength=600`; il backend converte in stringa, rimuove spazi esterni e tronca a 600 caratteri. Il client invia tutti e sei i campi, usando `null` per i vuoti; il server persiste nella revisione solo i non-null. Non sono selezioni di entità, attestazioni, permessi o riferimenti a cataloghi. Fonti [F1], [F2], [F3].

| Chiave persistita | Etichetta italiana attuale | Placeholder italiano attuale | Lettura plausibile per il docente, da verificare con persone |
| --- | --- | --- | --- |
| `subjects` | Discipline insegnate | Es. matematica e fisica, scienze naturali... | Materie del proprio incarico; non crea una disciplina o una classe. |
| `experience` | Esperienza | Anni di insegnamento, percorsi, incarichi (opzionale) | Sintesi di carriera; «percorsi» potrebbe invitare anche a raccontare singoli episodi. |
| `methodologies` | Metodologie d’aula | Es. cooperative learning, flipped classroom, laboratorio... | Abitudini d’insegnamento; può sembrare la scelta di un metodo per il lavoro corrente. |
| `classes_overview` | Classi e istituti | Es. 3B al Fibonacci, primo anno di accademia (opzionale) | Elenco delle classi concrete e degli istituti; può sembrare sufficiente per registrarli. |
| `formation_interests` | Interessi di formazione | Cosa ti piacerebbe sviluppare come docente (opzionale) | Intenzioni di crescita; non è un obiettivo strutturato né un’attività programmata. |
| `notes` | Note | Tutto ciò che ti riguarda come docente e vuoi far sapere alla conversazione (opzionale) | Contenitore ampio, con promessa implicita di consumo in chat. |

Il sottotitolo attuale è «Auto-descrizione del tuo ruolo: discipline, metodologie, esperienze. Entra nella chat degli obiettivi didattici per contextualizzare l'obiettivo nella tua pratica reale. Non è il taccuino dello studente.» Il messaggio vuoto dice «Taccuino vuoto: la chat degli obiettivi lavorerà solo con ciò che scrivi a voce.» [F1:15,30]. Il testo della home aggiunge che il taccuino personale «non entra in questa conversazione» [F8:43]: è vero nel default docente, ma non dopo la scelta esplicita `student`.

### Proprietà, salvataggio e consumo

- **Proprietario:** username autenticato, accesso gestori piani (`docenti`, ricercatori, amministratori), non soltanto docente puro. GET ultima revisione, POST manuale append-only, contenuto identico senza nuova revisione; GET storico fino a 50 revisioni. Il modello conserva `id`, `username`, `data`, `source`, `created_at`. La UI attuale non presenta lo storico, un pulsante di cancellazione o autosave [F3], [F4], [F7]. L’endpoint DELETE esiste ed elimina anche lo storico: questo piano non lo usa e non propone cancellazioni.
- **Uso dei campi:** `teacher_notebook_context` legge l’ultima revisione, emette ciascun valore non vuoto con etichetta italiana nell’ordine `subjects → experience → methodologies → classes_overview → formation_interests → notes`, aggiunge la data e tronca il blocco completo a 1.200 caratteri [F5]. Nessuna chiave ha un consumo operativo distinto nel percorso ricostruito: nessuna iscrizione, assegnazione o pubblicazione viene ricavata dal testo.
- **Default chat:** `OBIETTIVO_DOCENZA → teacher`; tutti gli altri strumenti → `student`. Il gestore può scegliere `student`, `teacher` o `none`; «Predefinito» non invia il campo. Scelta conservata nel browser e nella sessione congelata; la chiave di storage è unica, non una mappa per strumento [F6], [F9]. Non promettere quindi preferenze indipendenti per ciascuno strumento.
- **Slot `[PROFILE]`:** `teacher` sostituisce taccuino personale, Portfolio, obiettivi personali e punteggi di quello slot con il taccuino docente; soltanto in `OBIETTIVO_DOCENZA` aggiunge le classi selezionate. `student` usa le sorgenti personali e può ricevere il contesto delle classi cui si partecipa, con opt-in e fuori da IDEA. `none` esclude i taccuini e questi contesti personali/classi; non cancella cronologia, conoscenze o gli altri componenti dell’envelope [F6].
- **Limite della separazione:** la scelta riguarda lo slot di profilo, non garantisce l’assenza di ogni dato personale nell’intero prompt. `[READING]` è regolato separatamente, disabilitato per DOCENZA, ma non dalla scelta `teacher/none` negli altri strumenti; la funzione può leggere la lettura personale dello strumento [F6:2885; F10]. Preservare il comportamento attuale; un’eventuale diversa garanzia richiederebbe una scelta esplicita e verifiche dedicate. «Nessuno» non equivale a chat anonima.
- **Classi:** `teacher_groups_context` include nome, scuola, fascia, descrizione e metodologie delle classi attive possedute/condivise, riverificando l’accesso; cap per campo 600 e per blocco 1.200. Il contesto per iscritti ha opt-in separato e cap totale 600, senza `TeacherNote` [F5]. Scrivere un istituto nel taccuino non concede un grant `InstitutionTeacher` [F11].

## 3. Matrice campo → funzione e diagnosi

Legenda: **overlap utile** = parole comuni, finalità differenti; **ambiguità** = testo che non chiarisce il confine; **doppia sorgente potenziale** = lo stesso fatto può divergere in luoghi indipendenti; **disconnessione** = destinazione esistente senza passaggio dal campo; **spiegazione assente/incompleta** = contratto non comunicato. **Ridondanza reale** richiederebbe medesima finalità e dato ripetuto senza utilità: non dimostrata dal solo codice. Confidence alta = fatto statico direttamente verificato; media = impatto UX plausibile, non osservato.

| Campo → destinazione effettiva | Confronto: finalità / tempo / persona e proprietà / granularità | Classificazione e prova | Raccomandazione proposta; impatto e confidence |
| --- | --- | --- | --- |
| `subjects` → Taccuino personale `/profilo/taccuino`; obiettivo didattico | Ruolo che insegna, relativamente durevole, dato individuale del gestore, materie generali; il personale descrive chi apprende, l’obiettivo un risultato per un pubblico. | Overlap utile con il contesto personale; nessun doppio campo disciplinare equivalente dimostrato. [F1:16], [F12], [F13]. | **Mantieni**, hint «Materie che insegni abitualmente». Evita ricompilazione fra ruoli; fatto alta, beneficio media. |
| `experience` → Evento professionale e Linea del tempo; Portfolio | Carriera sintetica e durevole del docente vs un episodio passato datato della persona vs un lavoro documentato. Proprietà personale, ma diversa unità e destinazione. | Overlap utile; ambiguità di «percorsi», disconnessione per episodi/artefatti. [F1:18], [F14], [F15]. | **Precisa**, **collega** volontariamente; qui «Insegno da tre anni», altrove racconto della lezione/lavoro prodotto. Nessuno spostamento automatico; alta/media. |
| `classes_overview` → `/docente/classi`, `StudentGroup`; orientamento istituzionale | Panoramica dell’incarico individuale nel tempo vs classe attuale, entità gestita/condivisa con membri e ID; grant istituzionale attribuito dall’amministrazione, non dall’autore della nota. | Ambiguità e doppia sorgente potenziale su nomi/situazione della classe; disconnessione. Nessuna divergenza reale osservata nei dati. [F1:22], [F5:92], [F11], [F16]. | **Mantieni e precisa** come panoramica, **collega** a classi gestite; non duplicare iscritti/programma e non attribuire permessi. Impatto alto, fatto alta/UX media. Alternativa consultiva in §4. |
| `methodologies` → `StudentGroup.methodologies` | Abitudini trasversali del docente, durevoli e proprie vs accordi/pratiche correnti di una classe specifica, scritti da gestori e condivisibili con iscritti. | Overlap utile se gli ambiti sono distinti; ambiguità e doppia sorgente potenziale se si copia la pratica della 3B anche nel campo generale. Entrambe possono entrare nella chat, senza regola di prevalenza codificata. [F1:20], [F5:112], [F6:2869], [F16:50]. | **Precisa** «Come insegno di solito», **collega** al contesto classe; suggerire differenze locali senza copiarle. Impatto alto; fatto alta/UX media. |
| `methodologies` → `/docente/strategie`, `/docente/materiali`; metodo in `/profilo/obiettivi` | Nota individuale senza ID vs scheda curata/pubblicata nel catalogo condiviso, riusabile; metodo scelto per un singolo obiettivo personale con riferimenti a strategie certificate/proprie, seguito da azioni confermate. Materiale = risorsa, non metodologia. | Overlap utile, ambiguità terminologica; nessuna sincronizzazione esistente. I cataloghi non sono copie per docente/classe. [F17], [F18], [F19]. | **Mantieni e precisa**; collegamenti descritti come «Gestisci il catalogo condiviso» e «Scegli un metodo per un obiettivo personale», non «Le mie metodologie». Non pubblicare dalla nota. Alta/media. |
| `formation_interests` → `OBIETTIVO_STUDIO`, `/profilo/obiettivi`; `OBIETTIVO_DOCENZA` | Interesse di crescita aperto e durevole del docente vs apprendimento personale con criterio/verifica vs risultato didattico atteso per una classe. La persona può avere entrambi i ruoli; il destinatario dell’obiettivo cambia. | Overlap utile; ambiguità sull’obiettivo di chi, disconnessione. Il link risorsa `notebook` esistente riguarda **LearnerProfileRevision**, non TeacherProfileRevision. [F1:24], [F13], [F20]. | **Mantieni**, hint e scelta esplicita fra crescita propria e obiettivo per la classe. **Collega** senza inventare un’origine docente già supportata. Non creare obiettivi dal testo; alta/media. |
| `notes` → Evento professionale/Linea del tempo, Portfolio; note su partecipanti | Contesto residuo sul proprio ruolo, individuale e durevole vs episodio/riflessione datata o lavoro documentato; `TeacherNote` riguarda un partecipante e ha ambito gruppo/piano distinto. | Spiegazione assente del residuo; overlap utile per brevi apprendimenti, ambiguità se diventa diario o nota nominativa. Campi finali potenzialmente esclusi dal cap chat. [F1:26], [F5:63,121], [F14], [F15]. | **Precisa** «Altre informazioni sul mio ruolo», **collega** episodi/lavori; invita a non inserire dati identificativi dei partecipanti. Non definire la nota riservata a un singolo docente come contesto della classe. Alta/media. |

Una conclusione professionale («mi aiuta preparare consegne brevi») può restare nel taccuino; la tappa da cui nasce e il materiale realizzato possono restare altrove. Non è necessario imporre un solo luogo a ogni parola.

## 4. Confine proposto e alternative

Questa è una **proposta di lettura del glossario attuale**, non un nuovo glossario canonico o un ADR.

| Luogo | Domanda guida proposta | Autorità e destinazione da preservare |
| --- | --- | --- |
| Taccuino del docente | «Che cosa della mia pratica abituale aiuta a capire il mio ruolo?» | Autodescrizione individuale facoltativa, non certificata; contesto della conversazione quando scelto/default. Nessuna gestione di classi o pubblicazione. |
| Contesto classe | «Che cosa vale per questa classe e per il lavoro con questi partecipanti?» | `StudentGroup`, proprietà/condivisione esistenti; contesto chat del docente con selezione, per iscritti solo con opt-in. La nota generale non sostituisce questo dato. |
| Obiettivi, metodi, azioni | «Quale risultato voglio ottenere, per chi, con quale prova e quale lavoro?» | Obiettivo personale oppure didattico per la classe; salvataggio, catalogo e assegnazione rimangono scelte distinte. Il metodo dell’obiettivo non aggiorna le abitudini del taccuino. |
| Evento, Linea del tempo, Portfolio, cataloghi | «Quale episodio rileggo, quale lavoro conservo, quale risorsa rendo riusabile?» | Episodio/tappa e lavoro personali; cataloghi curati e condivisi secondo i permessi attuali. Non usare il taccuino come archivio sostitutivo. |

**Classi e istituti:** A, raccomandata ora: mantenere il campo libero per «Secondaria e formazione adulti, incarichi su due sedi», rimandando ai dettagli delle classi. B, eventuale: mostrare vicino al campo un riepilogo in sola lettura delle classi gestite/condivise; la nota resta separata, nessuna fusione di fonti. B richiede approvazione su cosa mostrare, comportamento offline/permessi e protezione della bozza. Un elenco di classi non copre necessariamente tutti gli incarichi dichiarabili; non giustifica rimuovere il campo.

**Formazione del docente:** A, raccomandata ora: intenzioni nel taccuino, apprendimento della persona nei propri obiettivi/OBIETTIVO_STUDIO, didattica della classe in OBIETTIVO_DOCENZA. B: un percorso specifico di sviluppo professionale avrebbe un pubblico e contratti da progettare; non è una funzione attuale e non è compreso nel piano operativo qui proposto. Non rinominare OBIETTIVO_DOCENZA come obiettivo di carriera.

**Contesto generale e classe divergenti:** ora nessuna regola codificata assegna precedenza fra le due note. Il piano lessicale invita a dichiarare le specificità nel contesto classe e nel turno; una futura prevalenza automatica richiederebbe approvazione e test del prompt, senza riscrivere i dati.

## 5. Scenari di verifica dei confini

Sono scenari progettuali, non interviste o risultati di test.

| Scenario | Nel taccuino docente | Altrove / gesto esplicito | Confine stressato |
| --- | --- | --- | --- |
| Docente nuovo, nessuna classe creata | «Insegno scienze, primo incarico; vorrei imparare a dare feedback». Può lasciare altri campi vuoti. | Quando serve gestione di partecipanti crea la classe in `/docente/classi`; un interesse non crea una classe né un grant istituzionale. | Compilare il taccuino non è onboarding obbligatorio né registrazione dell’incarico. |
| Docente su 3B e gruppo adulti, pratiche diverse | «Uso discussione e laboratorio», panoramica delle due sedi. | Programma/convenzioni e metodologie specifiche in ciascun contesto classe; seleziona la classe pertinente alla chat didattica. Opt-in per iscritti deciso per ciascuna classe. | Nessuna sincronizzazione fra nota individuale e testi che possono essere condivisi. |
| Docente anche studente di un master | Esperienza d’insegnamento e interesse a migliorare la valutazione. | Difficoltà/risorse come discente nel taccuino personale; per il proprio apprendimento OBIETTIVO_STUDIO default personale. Può scegliere docente nelle opzioni se pertinente, tornando a Predefinito quando opportuno. | Stessa persona, due prospettive; storage globale del browser e `[READING]` separato impediscono promesse di isolamento totale. |
| Passa dal laboratorio al cooperative learning solo nella 3B | Conserva la sintesi della pratica generale finché resta vera. | Aggiorna il contesto 3B. Se prepara una scheda riusabile la cura nel catalogo; per un obiettivo personale sceglie il metodo, salva e poi conferma l’azione (PR28). | Cambiare metodo di un obiettivo non dichiara una nuova abitudine generale e non pubblica una strategia. |
| Una lezione riuscita produce una scheda e una nuova intenzione | Esperienza sintetica e, se utile, «mi aiuta dare esempi prima della consegna». | Rilegge l’episodio con Evento professionale, salva volontariamente la tappa; conserva la scheda nel Portfolio. Se nasce un obiettivo per la classe usa DOCENZA; se vuole imparare personalmente usa STUDIO (`OBIETTIVO_STUDIO`). | Nota durevole, episodio e artefatto condividono contenuto ma hanno unità e usi distinti. |

## 6. Struttura ASCII e testi esemplificativi — da validare

Struttura possibile del blocco esistente in `/docente`; tutti i sei campi restano disponibili, senza nuova pagina obbligatoria. Il diagramma non approva un redesign della home. I collegamenti sotto i campi sono proposte; le destinazioni esistono già.

```text
Area docenti (struttura attuale conservata)
  Percorso: obiettivi per la mia classe --> chat OBIETTIVO_DOCENZA
  Classe e assegnazioni / Cataloghi / Somministrazioni e ricerca
  Taccuino del docente
    "Descrivi il tuo ruolo e la tua pratica abituale. Tutti i campi sono facoltativi."
    Il mio ruolo
      Discipline insegnate        [subjects]
      Esperienza di insegnamento  [experience]
    La mia pratica e i miei contesti
      Come insegno di solito      [methodologies]
        --> Contesto di una classe: Gruppi e classi
        --> Gestisci il catalogo condiviso: Strategie / Materiali
      Panoramica dei miei incarichi [classes_overview]
        --> Gestisci gruppi e classi
    La mia crescita e altre informazioni
      Interessi di formazione    [formation_interests]
        --> Per imparare io: obiettivi personali / OBIETTIVO_STUDIO
        --> Per la mia classe: OBIETTIVO_DOCENZA
      Altre informazioni sul mio ruolo [notes]
        --> Rileggi un episodio: Evento professionale
        --> Conserva una tappa / un lavoro: Linea del tempo / Portfolio
    [Salva taccuino] (esplicito)
    "La chat usa un contesto sintetico; esplicita nel turno i dettagli rilevanti."

Nella chat guidata, Opzioni (già esistente)
  Taccuino nel contesto: Predefinito | Studente | Docente | Nessuno
  Default: DOCENZA = Docente; altri strumenti = Studente
  Classi selezionate: usate con Docente nella sola chat DOCENZA
```

Esempi di hint italiani, **solo proposte**:

- `methodologies`: «Descrivi come insegni abitualmente. Le pratiche specifiche di una classe si annotano nel suo Contesto classe; il metodo per un obiettivo si sceglie nell’obiettivo.»
- `classes_overview`: «Una panoramica dei tuoi incarichi e contesti. Per descrivere o gestire una classe usa Gruppi e classi. Questa nota non abilita permessi presso un istituto.»
- `formation_interests`: «Che cosa vorresti imparare o sviluppare tu come docente? Quando vuoi renderlo concreto, puoi lavorare su un tuo obiettivo personale.»
- `notes`: «Altre informazioni sul tuo ruolo utili alla conversazione. Per episodi e lavori usa anche Linea del tempo e Portfolio; evita dati identificativi dei partecipanti.»
- Sottotitolo: «Queste note descrivono il tuo ruolo. La chat degli obiettivi per la classe le usa per impostazione predefinita; nelle opzioni puoi scegliere quale taccuino usare anche negli altri strumenti.»
- Vuoto: «Puoi procedere senza compilare il taccuino. Descrivi in chat ciò che serve; nella conversazione didattica possono contribuire anche le classi selezionate, secondo il contesto scelto.»

Gli hint devono essere testo visibile associato ai campi, non soltanto placeholder o tooltip. La riga sui limiti non deve promettere che ogni nota sia letta integralmente. Raggruppamenti e numero dei collegamenti vanno validati prima del codice; possono essere ridotti a pochi rimandi contestuali per evitare rumore.

## 7. Piano incrementale proposto

Ordine sequenziale: **approvazione A → implementazione/merge A → approvazione B e suoi contratti → implementazione/merge B → eventuale C → eventuale D**. Nessun esecutore o task di implementazione viene avviato da questo documento; nessun parallelo futuro senza contratti prima approvati e mergiati.

| Blocco | Scope e file futuri | Contratti/proprietà e dipendenze | DoD e verifiche future | Sforzo / rischio |
| --- | --- | --- | --- | --- |
| **A — Spiegazioni e lessico** | Testi locali di `TeacherNotebook.tsx`, `i18n-teacher-area.ts`; richiamo alle opzioni senza ridisegnare il selettore. Test pertinenti e, nella PR che cambia il prodotto, guida/funzionalità e manifest guidance. | Sei chiavi, ordine persistito, 600/1.200 caratteri, opzionalità, API, ruoli, salvataggio/default invariati. Approvare etichette/hint; attendere merge S4 per rileggere gli stessi componenti e non contraddire i suoi stati/testi. Nessuna modifica del canonico CONTEXT per imporre proposte. | Tutti i sei campi distinguono ruolo/classe/obiettivo; spiegazione copre default, scelta e limite senza promettere anonimato. Parità IT/EN/ES/FR/DE/SV; test dei testi/contratti pertinenti, i18n, typecheck/lint, guidance-check. Browser futuro con API simulate: tastiera, label/hint, mobile e lingua più lunga. Verificare assenza di nuovi invii o cambi di payload. | Piccolo / basso; rischio di traduzione o promessa imprecisa. |
| **B — Collegamenti volontari** | `TeacherNotebook.tsx`, eventuale `TeacherAreaHome.tsx`, testi nelle sei lingue, test del percorso; usare route già esistenti. Nessun nuovo resource kind o prefill con dati del taccuino nell’URL. | A mergiato; approvare destinazioni, priorità dei rimandi e **protezione della bozza prima di navigare**: annullare conserva testo e focus; salvataggio in corso non perde la bozza; nessun autosave introdotto implicitamente. Cataloghi indicati come condivisi, personale separato da didattico; guard destinazione invariati. Coordinamento con esito S4 e PR29, senza estendere le protezioni di PR29 a questo form per sola analogia. | Ogni rimando arriva alla funzione nominata; nessuna creazione, pubblicazione, condivisione o assegnazione per effetto del click. Test browser futuri: bozza salvata/non salvata, annullamento, errore salvataggio, ritorno, docente puro/doppio ruolo/ricercatore/admin e destinazione non autorizzata. Nessun testo sensibile nei parametri URL. | Piccolo–medio / medio, soprattutto navigazione e bozze. |
| **C — Raggruppamento visivo, se serve** | Form in `TeacherNotebook.tsx`, testi; layout home solo se approvato insieme al piano #27. Eventuale riepilogo consultivo classi è uno scope separato da decidere. | A e B mergiati, diagramma ASCII validato e riscontro sui quattro confini. Sei campi/ID e dati invariati; evitare sezioni richiuse obbligatorie. Riesaminare #27: parte del guscio condiviso esiste già, non riscriverlo sulla base del piano storico. | Il docente sa indicare dove annotare abitudine, specificità di classe, intenzione ed episodio; valutazione con persone distinta dai test. Regressioni future focus, ordine lettura, mobile/zoom, screen reader, bozza, salvataggio e sei lingue; riepilogo classi, se scelto, separa fonte consultiva da nota e gestisce accessi revocati. | Medio / medio; può non essere necessario. |
| **D — Eventuale contratto contesto/dati** | Solo dopo decisione: `teacher_context.py`, relativi test; schema/route/modello e versionamento soltanto se una scelta motivata li richiede. Collegamento strutturato al taccuino docente nei goals richiederebbe anche `goals.py` e contratti autorizzativi propri. | Non necessario per A–C. Approvare esplicitamente distribuzione del budget/precedenza delle fonti o nuovo tipo di riferimento. Nessuna fusione col taccuino personale, nessuna reinterpretazione del resource kind `notebook` esistente. Conservare il comportamento default salvo distinta scelta approvata. | Test futuri con tutti i sei campi pieni, campi finali, contenuti brevi/vuoti, classi multiple e accessi revocati; confronto dell’envelope in modalità/default e strumenti pertinenti. Se migrazione: compatibilità, preview, consenso, rollback e storico secondo §8. Solo allora aggiornare grounding reale nella relativa PR. | Medio–grande / alto per prompt, permessi e compatibilità; rinviato. |

Prima di B validare tre domande con esempi: «Dove scriveresti come lavori normalmente?», «Dove registreresti la variante per la 3B?», «Dove conserveresti la scheda prodotta?». Prima di C verificare se hint e rimandi bastano. La validazione UX proposta non è stata eseguita in questo audit.

## 8. Preservazione dati, lingue e accessi

**A–C non richiedono migrazioni.** Mantenere campi, record e revisioni; prima scelta è precisare e collegare, non copiare dati o imporre ricompilazioni. Un rimando navigazionale non è un collegamento persistito fra entità. Non trasferire silenziosamente `classes_overview` in `StudentGroup.description`: cambia ambito e può cambiare pubblico. Non copiare `methodologies` nel catalogo o in un obiettivo; non trasformare `formation_interests` in attività.

Se una scelta successiva richiedesse una migrazione: introdurre un contratto di versione additivo compatibile con le sei chiavi storiche; mostrare origine, anteprima, destinazione e pubblico; acquisire consenso esplicito per ogni trasferimento. Registrare la nuova rappresentazione come nuova revisione append-only, mantenendo intatte le revisioni precedenti e la possibilità di leggerle. Il rollback deve aggiungere una revisione che ripristina i valori precedenti, senza cancellare il percorso. Trasferimenti verso classi/cataloghi/obiettivi devono conservare separatamente i loro controlli di proprietà, revisioni/versioni e revoca; un nuovo collegamento non deve esporre retroattivamente note private. Tale meccanismo non esiste automaticamente solo perché oggi il taccuino è append-only: andrebbe progettato, testato e approvato.

Sei lingue (it/en/es/fr/de/sv), accessibilità, privacy, distinzione fra gestione e iscrizione, grant istituzionali, default chat e scelta del taccuino restano invariati salvo scelta futura esplicita. I contenuti della nota sono autodichiarati, non attestazioni. Nessun accesso ai valori di produzione è necessario per questi primi interventi.

## 9. Evidenze, snapshot e limiti

Tutte le coordinate sotto sono del commit base `e1e2b0da10d9b85ecc94958247eada20f3d2dba7`; il simbolo rende la prova rintracciabile anche se le righe cambiano. I link relativi partono da questo documento.

| ID | Fonte file:riga / simbolo | Prova usata |
| --- | --- | --- |
| F1 | [TeacherNotebook.tsx:12](../../frontend/src/components/teacher/TeacherNotebook.tsx#L12), `TEXTS`, `FIELDS` :135, `save` :165, render :193 | Sei etichette/placeholder nelle sei lingue, ordine, limiti, UI e payload; form senza rimandi operativi. |
| F2 | [schemas.py:696](../../backend/schemas.py#L696), `TEACHER_PROFILE_FIELDS`, `TeacherProfileSave._trim_and_cap` | Sei campi opzionali; limite 600. |
| F3 | [teacher_profile.py:26](../../backend/routes/teacher_profile.py#L26), `get/save_teacher_notebook`, `get_teacher_notebook_history` :71, DELETE :87 | API per username, deduplicazione, revisioni, storico e cancellazione preesistente. |
| F4 | [models.py:625](../../backend/models.py#L625), `TeacherProfileRevision`; `StudentGroup` :1094 | Dati/revisioni del docente separati; campi e proprietà della classe. |
| F5 | [teacher_context.py:17](../../backend/teacher_context.py#L17), `TEACHER_PROFILE_LABELS`, `teacher_notebook_context` :48, `teacher_groups_context` :92, `class_context_for_student` :121 | Ordine/cap; ultime revisioni; accessi e opt-in classe; esclusione note individuali. |
| F6 | [chat_logic.py:63](../../backend/chat_logic.py#L63), `DEFAULT_NOTEBOOK_CONTEXT`, `build_context_envelope` :2809–2889 | Scelta autorizzata, default, composizione dei blocchi e limiti della separazione. |
| F7 | [auth.py:185](../../backend/auth.py#L185), `get_current_plan_manager`; [useTeacherAccessState.ts:9](../../frontend/src/components/teacher/useTeacherAccessState.ts#L9) | Gestori piani e distinzione docente effettivo/accesso all’area. |
| F8 | [i18n-teacher-area.ts:42](../../frontend/src/lib/i18n-teacher-area.ts#L42), `notebookNote`; [TeacherAreaHome.tsx:28](../../frontend/src/components/teacher/TeacherAreaHome.tsx#L28), `notebookSlot`; [docente/page.tsx:26](../../frontend/src/app/docente/page.tsx#L26) | Spiegazione home, posizione e destinazioni già implementate. |
| F9 | [notebook-context.ts:8](../../frontend/src/lib/notebook-context.ts#L8), storage; [NotebookContextSelector.tsx:12](../../frontend/src/components/qsa/NotebookContextSelector.tsx#L12); [GuidedChatInterface.tsx:463](../../frontend/src/components/qsa/GuidedChatInterface.tsx#L463), scelta/payload :992, freeze :1372, Opzioni :1604; [i18n.ts:156](../../frontend/src/lib/i18n.ts#L156) | Quattro opzioni UI, tre valori API, default omesso, persistenza nel browser/ripresa e guard. |
| F10 | [chat_logic.py:2597](../../backend/chat_logic.py#L2597), `_reading_context` | Lettura personale dello strumento, componente distinto dal taccuino. |
| F11 | [institution_access.py:15](../../backend/institution_access.py#L15), `teacher_institutions`, `require_institution_teacher` | Grant attivi; scrivere istituto o classe non abilita l’orientamento istituzionale. |
| F12 | [LearnerProfileCard.tsx:34](../../frontend/src/components/profile/LearnerProfileCard.tsx#L34), `FIELDS`, `CURRENT_FIELDS` | Campi personali distinti, vecchio `goal` nello storico ma non modulo corrente. |
| F13 | [funzionalita-counselorbot.md:74](../../docs-counselorbot/funzionalita-counselorbot.md#L74), percorsi; :99 scelta; :271 area docenti | Documentazione del prodotto, confrontata col codice. |
| F14 | [EventMilestoneCard.tsx:17](../../frontend/src/components/qsa/EventMilestoneCard.tsx#L17), `save` :35, link obiettivo :105 | Episodio → tappa esplicitamente salvata; nessuna scrittura automatica del taccuino docente. |
| F15 | [PortfolioCard.tsx:37](../../frontend/src/components/profile/PortfolioCard.tsx#L37), `PortfolioItem`; [goals.py:209](../../backend/goals.py#L209), `resources` | Lavori personali e risorse collegabili, unità diversa dalla nota sul ruolo. |
| F16 | [GroupsPanel.tsx:46](../../frontend/src/components/admin/GroupsPanel.tsx#L46), testi; `updateClassCtx` :300, form :662; [groups.py:211](../../backend/routes/groups.py#L211) | Contesto per classe, due campi e flag distinti, scrittura indipendente dal taccuino. |
| F17 | [teacher-catalogs.md:3](../operations/teacher-catalogs.md#L3); [certified_strategies.py:21](../../backend/routes/certified_strategies.py#L21), guard/pubblicazione | Cataloghi condivisi curati, non copia per docente/classe e non compilazione di una nota. |
| F18 | [GoalDialog.tsx:200](../../frontend/src/components/goals/GoalDialog.tsx#L200), `MethodPicker` e azione :211; [goals.py:285](../../backend/goals.py#L285), `validate_method` | Metodo per obiettivo, riferimenti e conferma azione; PR28 presente nella base. |
| F19 | [GoalDraftCard.tsx:30](../../frontend/src/components/qsa/GoalDraftCard.tsx#L30), `save`, pubblicazione :63; [personal-goals.md:21](../operations/personal-goals.md#L21) | Obiettivo personale e pubblicazione catalogo separati; proprietà/condivisione. |
| F20 | [goals.py:216](../../backend/goals.py#L216), `resources` | Il kind `notebook` risolve il taccuino personale corrente; non supporta già un’origine TeacherProfileRevision. |

**Storia verificata:** taccuino e contesto introdotti da `23067c6`/`f303dfd`; home e sottopagine da `e50aedb`; scelta del taccuino da `7e373430b0be9fca15b7aa3093cf36374c451fd9`. Le PR [26](https://github.com/nugh75/counselorbot-sbs/pull/26) e [27](https://github.com/nugh75/counselorbot-sbs/pull/27) sono MERGED, ma contengono piani: #26 aggiunge [handoff assegnazioni](../../assegnazioni-modernizzazione-handoff.md) e una modifica lessicale a i18n; #27 aggiunge solo [proposta guscio area docente](../future-implementazione/area-docente-struttura-solidata.md). Il codice attuale ha già `TeacherAreaPage` con guard/header comuni ([TeacherAreaPage.tsx:10](../../frontend/src/components/teacher/TeacherAreaPage.tsx#L10)): non prendere la diagnosi storica «senza guscio» come fotografia attuale, né assumere implementate tutte le sue proposte di navigazione. PR [28](https://github.com/nugh75/counselorbot-sbs/pull/28) e [29](https://github.com/nugh75/counselorbot-sbs/pull/29) sono MERGED e incluse: protezione metodo→azione e bozze assegnazioni/letture. Non provano protezione della bozza di questo taccuino né rilascio runtime.

**Map-first:** lettura JSON del grafo preesistente `/home/nugh75/counselorbot-sbs/graphify-out/graph.json` (4.747 nodi), con selezione di `StudentGroup`/`PortfolioCard` e archi `EXTRACTED` verso gestione gruppi/area personale. I simboli TeacherNotebook/teacher_profile/teacher_context non risultano indicizzati: il grafo è un indice parziale, con coordinate precedenti alla base; le prove sopra derivano da sorgenti correnti, non da inferenze del grafo. Nessun rebuild o scrittura del grafo. Memoria consultata solo per orientare la distinzione col taccuino personale; persistenza docente verificata nei sorgenti attuali.

**Aggiornamento remoto prima della pubblicazione:** eseguito `git fetch origin main`; `origin/main` verificato a `e1e2b0da10d9b85ecc94958247eada20f3d2dba7`, nessun nuovo merge rispetto alla base al controllo. Stato MERGED delle quattro PR verificato con `gh pr view`. S4 `s4-loading-errors-1002` lavora separatamente su caricamento/errori e selettore: nel presente snapshot, errori di caricamento possono diventare un vuoto in TeacherNotebook e DocenzaClassBar; l’hint di quest’ultima testa solo `teacher`, non il default docente [F1:153; DocenzaClassBar.tsx:85,108]. Sono osservazioni di base, non correzioni attribuite a S4 o richieste concorrenti: riesaminarle dopo il suo merge, senza duplicarne il lavoro.

**Verifica documentale:** `make guidance-check` e `python3 scripts/check-platform-guidance.py --check --base e1e2b0da10d9b85ecc94958247eada20f3d2dba7` verdi prima del commit; nessun refresh del manifest necessario. Verificati i 34 link relativi (file esistente e coordinate entro le righe della fonte), confrontate le evidenze con i simboli letti; `git diff --check` verde e scope esclusivo del presente documento. Il diff staged viene controllato prima del commit. Non si aggiornano grounding, guida prodotto o CONTEXT per un piano non implementato.

**Non-goals e non verificato:** nessun codice, test/config applicativi, migrazione, dato/DB, lettura di valori produzione, segreto, servizio, dev server, installazione, Docker/build, deploy/restart o merge. Nessuna revisione cross-modello per deroga; nessuna misura di usabilità, browser, screen reader reale, feedback di docenti o verifica del modello in chat. Le ipotesi su confusione, doppia compilazione e divergenze richiedono validazione con persone; le letture statiche non certificano runtime o distribuzione. L’audit non ridisegna assegnazioni, cataloghi, home o taccuino studente e non crea task successori. Il goal resta aperto per decisione/merge dell’utente.

## Sintesi pronta per l’utente

Il taccuino serve a raccontare come lavori come docente. Le classi descrivono invece il lavoro con un gruppo concreto; obiettivi, azioni e Portfolio servono a fare e conservare qualcosa. Alcune etichette oggi non rendono chiaro questo confine. Propongo prima spiegazioni più precise, poi pochi collegamenti volontari agli strumenti già presenti. I sei campi e i dati restano: non si cancella né si trasferisce nulla. Riorganizzazione e modifiche al contesto chat si valutano solo dopo aver approvato e verificato questi primi passi.
