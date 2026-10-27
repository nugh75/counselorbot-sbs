# Lavoro personale, classi e ripresa delle chat

## Punto unico per lo studente

Area studente → **In corso, compilazioni e risultati** (`/profilo/compilazioni`)
riunisce conversazioni riprendibili, azioni personali in corso, compilazioni,
risultati e conversazioni associate. Gli errori del riepilogo non nascondono i
risultati e consentono di riprovare. Le simulazioni dei taccuini di prova restano
nell'area docente. La home mantiene il collegamento a questa sezione.

## Politica di classe

`backend/class_chat_settings.py` è il resolver condiviso da chat sincrona,
streaming, preparazione del prompt e `GET /student/class-chat-settings`.

- Le classi provengono dalle iscrizioni dell'identità autenticata e devono essere
  attive. `group_ids` del client non seleziona né esclude le politiche applicate.
- Ogni parametro è bloccato se almeno una classe lo blocca. Il valore viene
  esclusivamente dalle classi che lo bloccano; se vi sono blocchi discordanti,
  prevale la classe con ID minore, quindi quella creata per prima.
- Un blocco senza valore usa `standard` per il formato, `medium` per la lunghezza
  e `standard` per l'analisi. Le classi permissive forniscono soltanto default,
  conservando le scelte esplicite dello studente. La vista del catalogo non
  permette di eludere questi vincoli.
- Le politiche sono rilette a ogni turno, anche su sessioni riprese. L'analisi è
  applicata prima di configurare il provider; restano i vincoli del modello e
  quelli dei passi che vietano il ragionamento. Il contenuto obbligatorio del
  profilo conserva il budget minimo già previsto dalla chat.
- Il docente può rimuovere un valore con `null`; omettere il campo lo conserva.
  Salvataggio, revisioni e audit rimangono quelli delle impostazioni di classe.
- I controlli di avvio e della chat usano la stessa API. Durante caricamento o
  errore restano disabilitati; l'errore espone Riprova. I valori bloccati correnti
  prevalgono anche sulle preferenze salvate in una sessione precedente.

## Docenti partecipanti

Un account docente può iscriversi a un'altra classe con il normale codice, usare
Area studente, vedere i propri piani e risultati e ricevere le politiche della
classe. L'iscrizione non concede gestione della classe o accesso ai dati altrui;
il ruolo docente rimane disponibile per le proprie classi. Le chat dello
strumento `OBIETTIVO_DOCENZA` conservano il contesto docente esplicitamente scelto.
Proprietario e docenti condivisi possono leggere gli iscritti della classe anche
senza una distinta nomina nell'istituto; i controlli sui singoli dati rimangono.

## Ripresa nei piani

Le risposte leggere di `/session/frozen` includono `resume_href` solo quando il
server trova un vincolo corrente della stessa persona a un passo accessibile.
La destinazione riapre il passo somministrazione o approfondimento. Le sessioni
storiche, non più correnti o senza passo disponibile conservano la ripresa
ordinaria per ID, senza indirizzare a un altro risultato del piano.

La ripresa conserva fase, messaggi, diramazione attiva, bozza, contatori,
preferenze e checkpoint di scorrimento. Non invia un nuovo turno né rigenera
l'introduzione della fase già aperta. «Reinserisci i dati» rimane una scelta
esplicita; non viene attivata durante una semplice ripresa.

Gli autosalvataggi della stessa sessione sono ordinati e la cancellazione finale
attende quelli in corso. La firma comprende contenuti completi, navigazione,
bozza, counselor, lingua e analisi: anche un testo sostituito con un altro della
stessa lunghezza produce un salvataggio. Si salva dopo il turno e alla normale
uscita; restano i limiti del browser su rete assente, chiusura forzata e richieste
`keepalive` oltre 64 KiB. Il comando esplicito di pausa segnala gli errori prima
di lasciare la chat.

## Verifiche

- `backend/tests/test_class_chat_settings.py`: richieste API manipolate,
  ingressi del provider, classi discordanti/inattive, reset, audit, docente
  partecipante e visibilità degli iscritti di un istituto.
- `backend/tests/test_plan_chat_resume.py`: destinazioni dei passi correnti,
  identità docente partecipante e revoca dell'iscrizione.
- `frontend/tests/student-continuity.test.mjs`: sezione unica, fase e bozza
  conservate, blocchi correnti, errore/riprova e salvataggi concorrenti.
- `frontend/tests/plan-questionnaire-chats.test.mjs`: ripresa diretta di una
  somministrazione, QPCC, analisi, scelte finali e nuovo inserimento separato.

Runner e isolamento in [live-dev-environment.md](live-dev-environment.md).
