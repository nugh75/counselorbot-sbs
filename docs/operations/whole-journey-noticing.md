# Noticing dell’intero percorso e bozza orientativa

Decisione del proprietario, 24 ottobre 2026: il Noticing deve considerare tutto il
percorso disponibile, compresi Taccuino, strumenti, Portfolio, azioni, schede,
incontri e forum. Estende il Noticing della classe già esistente; quello nella
singola compilazione rimane una lettura esplicitamente locale alla conversazione.

## Fonti e attribuzione

`backend/noticing_sources.py` è il registro dei lettori. Le API verificano prima
proprietà/condivisione della classe e partecipazione corrente dello studente.

| Fonti | Contenuto effettivamente letto |
| --- | --- |
| Conversazioni | Messaggi dello studente nei log guidati/OpenCode/Assistente, Bussola; snapshot congelato o memoria conservata se i log non sono disponibili |
| Strumenti/questionari | Strumento utilizzato e punteggi registrati, senza inferenze diagnostiche |
| Taccuino | Ultimo salvataggio esplicito e riflessioni dello studente; nessuna bozza autosalvata |
| Portfolio | Titolo, descrizione, categoria, data, collegamento e metadati dei file; nessuna lettura visiva automatica |
| Obiettivi | Testi, stato, metodo e bilanci; strategie personali |
| Strumenti visuali | Snapshot attuale di azioni/controlli, schede/mazzi, confronti e linea del tempo; flashcard personali |
| Idea e Tavolo | Mappe attuali, riferimenti testuali conservati e fonti scelte; solo elementi live del Tavolo |
| Attività della classe | Restituzione consegnata e riscontro, senza bozze delle assegnazioni |
| Incontri della classe | Descrizione, stato e data, prenotazione e presenza distinte; individuali solo se riferiti allo studente |
| Forum della classe | Soli contributi pubblicati dello studente, mai parole dei compagni, moderazione, pendenti, nascosti o eliminati |
| Osservazioni docente | Note sullo studente nella classe aperta |
| pQBL | Attività svolta e tentativi registrati |

Le risposte precedenti dell’IA sono contesto separato (ultimi 1500 caratteri,
con indicazione di estratto), utile per comprendere risposte brevi come «sì».
Non sono mai testo citabile come parole dello studente. Le fonti hanno id stabile, tipo, data e attribuzione: `student`, `teacher`,
`saved_work`, `record`. I lavori salvati possono essere costruiti con l’IA e non
diventano automaticamente dichiarazioni personali. Le simulazioni e i prompt di
avvio automatici non sono parole dello studente. Non si leggono configurazioni,
credenziali, prompt di sistema, dati amministrativi o contenuti di altre persone.
I limiti di conservazione delle fonti originali restano quelli dell’applicazione:
il Noticing non ricrea messaggi cancellati o mai registrati.

## Analisi e stato

`student_noticing.py` divide l’intero testo in blocchi limitati, conservando tutte
le parti. Una POST analizza un solo blocco indicato dalla GET. Cache e hash
comprendono contenuto, attribuzione, data, versione del prompt e lingua; ogni
lettura verifica le citazioni. Un blocco cambiato non riusa le note del vecchio.
Una risposta del modello non disponibile lascia il blocco da fare; il client
ferma la sintesi e consente di riprendere. I conteggi sono calcolati dal server.
I filtri strumento/periodo sono restrizioni esplicite; il default considera tutto.
La sintesi della classe legge tutte le note verificate in gruppi limitati e
mostra fino a sei temi; non attribuisce temi collettivi al singolo studente.

GET e apertura delle pagine non chiamano modelli. Le POST usano il normale
`AIService` con l’identità del docente richiedente e le protezioni provider già
configurate. Nessun indice RAG del forum è creato. La precedente esclusione
assoluta del forum dai modelli è sostituita da questa eccezione nominata e
verificata; chat generiche, RAG, ricerca ed esportazioni non acquistano accesso.

## Bozza orientativa

`orientation_advice.py` usa soltanto il Noticing individuale completo, senza
filtri. Ogni paragrafo generato deve riferirsi a elementi esistenti. Il docente
può salvare modifiche, validare oppure copiare il testo. Salvataggio e validazione
sono espliciti; le revisioni conservano autore, testo, evidenze, data e stato.
La modifica toglie la validazione. Fonti mutate rendono la bozza superata e
richiedono aggiornamento dell’analisi e rigenerazione prima di validare.
`xact_lock` e revisione attesa evitano sovrascritture fra schede su Postgres e
SQLite. La nuova tabella append-only `teacher_noticing_artifacts` contiene cache e
revisioni (`student_noticing`, `class_noticing`, `orientation_advice_draft`).
La normale `create_all` di avvio la aggiunge anche alle installazioni esistenti;
nessuna modifica alle tabelle precedenti e nessun comando manuale. Il contenuto
non entra nelle esportazioni dei log e non viene eliminato dalla loro retention.

L’output è uno spunto da rivedere per documenti scolastici. La deliberazione del
consiglio di classe e il caricamento ministeriale rimangono operazioni distinte;
non viene implementata un’integrazione Unica/SIDI.

## API

Prefisso: `/admin/groups/{group_id}/students/{username}`.

| Metodo | Percorso | Uso |
| --- | --- | --- |
| GET | `/noticing?lang=it` | Quadro, copertura e blocchi mancanti; facoltativi `instrument`, `days` |
| POST | `/noticing?lang=it&chunk=HASH` | Analizza il blocco corrente; 409 se le fonti sono cambiate |
| GET | `/noticing-source?source=ID` | Contenuto corrente della fonte autorizzata |
| GET | `/orientation-advice?lang=it` | Ultima versione e stato di aggiornamento |
| POST | `/orientation-advice?lang=it` | `revision`, `operation=generate|save|validate`, `text` |

La GET/POST della classe `/admin/groups/{group_id}/noticing` usa ora `students`
e `charts.students_with_sources`, invece della precedente lista `compilations`.
La POST di sintesi restituisce 409 se manca un blocco. Nessuna modifica agli
endpoint di dettaglio o Noticing della singola compilazione.

## Ambiente e verifica

Avvio frontend con `scripts/dev-noticing-tests.sh`: `127.0.0.1:3170`, upstream
deliberatamente irraggiungibile, API simulate dal browser. Nessun dato reale.
Arresto con Ctrl-C. Per un accesso remoto: `ssh -N -L 3170:127.0.0.1:3170
<utente>@<server>`, poi `http://localhost:3170`.

I test backend usano `artifact_session` su Postgres isolato o SQLite temporaneo;
coprono fonti, citazioni, cambiamenti, appartenenze e versioni/validazione.
La prova browser deve distinguere i risultati del modello simulato da una
valutazione educativa con studenti reali, ancora da svolgere.
