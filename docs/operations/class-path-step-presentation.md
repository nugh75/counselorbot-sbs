# Presentazione dei passi del piano operativo (OC3)

Attua il piano approvato S0–S5 del 21 ottobre 2026 (Diario
`96488cb8-46aa-423d-9435-fb497a1af048`). Nessuna migrazione.

| Tipo | Titolo predefinito | Data efficace |
| --- | --- | --- |
| Strumento / chat | nome localizzato dello strumento | manuale facoltativa |
| Analisi risultati | tipo di analisi e strumento/origine | manuale facoltativa |
| Somministrazione | titolo reale del piano, poi strumento/codice | scheduled_at |
| Assegnazione | titolo dell’assegnazione | due_date dell’assegnazione |
| Incontro | titolo dell’incontro | starts_at nel fuso del lettore |
| Forum | titolo esplicito del passo | manuale facoltativa |
| Da preparare | configurazione del modello | manuale esistente conservata |

`class-path-presentation.ts` è il resolver comune a editor, pagina studente,
hero, matrice progressi, filtro ritardo e ordinamento. Un titolo o una data
salvati prevalgono sul default; vuoto/null ripristina la derivazione. Le note
sono solo aggiuntive, mai copiate dalla descrizione dell’oggetto. Presentazione
del piano facoltativa, una volta nell’intestazione di ogni vista.

Il controllo condiviso espone personalizzazione, ripristino, label e nota
multilinea (titolo 200 caratteri, nota 1000 nell’editor). I testi storici più
lunghi restano leggibili; nessuna cancellazione automatica. Le API mantengono
i limiti precedenti (note fino a 3000). I pulsanti del controllo non inviano form.

Gli incontri non propongono una nuova data manuale; gli override storici restano
visibili, modificabili e cancellabili. La data dell’incontro appare nei dettagli,
una volta; quella della somministrazione nella riga «Previsto il …» con il luogo
(`class-path-schedule.ts`, dal 22 ottobre su main), non anche come scadenza; una diversa scadenza storica resta distinta. Date senza ora non si
spostano col fuso; datetime seguono il calendario locale, anche a mezzanotte/DST.
Il filtro ritardo ora include le date degli oggetti quando manca un override:
è il cambio di comportamento approvato. Le fasce individuali non inventano date.

Il summary della somministrazione aggiunge solo scheduled_at, senza credenziali.
Il parser API converte target_summary in assignment_summary/meeting_summary.
Il forum non esporta titolo o corpo della discussione: publication_problems
aggiunge forum_step_title_missing (sei lingue) solo in pubblicazione/ripristino.
Bozze incomplete e lettura dei vecchi pubblicati restano compatibili.

I template espongono anche le note già salvate. Aggiorna da modello mostra
presentazione corrente e proposta. Se titolo o nota differiscono dallo snapshot
iniziale, anche per cancellazione, il passo è customized e resta interamente
invariato, anche se rimosso dal modello. Per adottare il testo proposto il docente
lo modifica esplicitamente nell’editor. Passi iniziati, oggetti già creati e
strumenti disabilitati mantengono le protezioni precedenti. Nessun nuovo endpoint.
Salva come modello copia gli override presenti, senza memorizzare nomi derivati.

## Verifica e isolamento

Stato dei risultati e limiti effettivi: prima sezione OC3 di HANDOFF.md.
Unitari: class-path-presentation, class-paths, path-publication, path-templates.
Backend: test_class_paths, test_path_publication, test_path_templates su PG effimero.
Browser: class-path-presentation (390/1440, sei lingue), add-step, placement, templates.
Runner: scripts/dev-class-path-presentation-tests.sh, loopback 3161, API simulate.
Log /tmp/oc3-*.log; screenshot sintetici in frontend/output/playwright.
Immagini isolate counselorbot-backend:oc3-presentation e counselorbot-frontend:oc3-presentation.
Nessun deploy, sudo o pulizia immagini in questa consegna; PR solo draft fino ad audit.
