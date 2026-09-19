# Obiettivi personali e catalogo docente

L'area personale apre con **Il mio percorso**, gli obiettivi attivi e le prossime
attività collegate. Gli strumenti sono raggruppati in conoscenza/riflessione,
esplorazione/azione, documentazione e supporto. Attività, carte e confronto hanno
accessi diretti, mantenendo il workspace personale già esistente.

## Uso

- `/profilo/obiettivi`: scegliere una proposta dal catalogo, cercarla per testo o
  ambito, personalizzarla oppure scrivere un proprio obiettivo. Più obiettivi
  possono restare attivi. Per chi sta ancora esplorando è disponibile la Bussola.
- Ogni obiettivo ha motivazione, criterio di miglioramento, priorità, data di
  revisione, riflessione e stato: in corso, in pausa, concluso, archiviato.
  La conclusione è una scelta della persona, mai dedotta dalle attività svolte.
- Collegare attività, tappe, carte, confronto personale, Taccuino corrente,
  schede del Libretto, Tavoli salvati e lavori del Portfolio. I titoli vengono
  risolti dalle fonti attuali; un elemento eliminato diventa non disponibile.
- Creare un'attività dall'obiettivo la inserisce nello stesso piano usato dalla
  Linea del tempo. Una data aggiunge anche una tappa collegata alla stessa attività.
  Eliminare un obiettivo rimuove i collegamenti, conserva attività e materiali.
- `/docente`: **Catalogo obiettivi** consente creazione, duplicazione, revisione
  e archiviazione. Il docente pubblica per i gruppi che gestisce, oppure invia
  una proposta al catalogo comune con stato **In revisione**. Solo l'amministratore
  pubblica nel catalogo comune, dalla stessa schermata. Una proposta di gruppo
  è visibile solo ai membri di un gruppo attivo.
- La condivisione studente è facoltativa e revocabile: rende disponibili ai
  docenti del gruppo titolo, stato, criterio, riflessione e data di revisione.
  Non concede accesso a motivazione, Taccuino o materiali privati collegati.
  Uscita dal gruppo, disattivazione e rimozione della gestione revocano l'accesso.

Le assegnazioni esplicite di obiettivi e materiali da parte dei docenti sono
distinte dagli obiettivi personali: vedi [Cataloghi e assegnazioni](catalog-assignments.md).

## Dati e coerenza

Nuove tabelle PostgreSQL: `goal_catalog`, `personal_goals`, `goal_resource_links`.
La creazione è additiva e idempotente tramite `Base.metadata.create_all` già
usato dall'applicazione. Sei proposte iniziali italiane sono inserite al bootstrap
con slug univoci e `ON CONFLICT DO NOTHING`: le modifiche editoriali non vengono
sovrascritte. I docenti possono scrivere contenuti in ciascuna delle sei lingue;
la lingua di ciascuna proposta è visibile. I contenuti non sono tradotti
automaticamente. L'interfaccia è tradotta in tutte e sei le lingue.

L'adozione conserva una copia della versione di catalogo selezionata. Gli
aggiornamenti successivi della proposta non cambiano gli obiettivi già adottati.
Modifiche e collegamenti personali verificano `revision`; il catalogo verifica
`version`. Una scrittura obsoleta restituisce 409. Le richieste di adozione e
creazione attività usano un `request_id` per rendere sicuro il retry dopo un
problema di rete. La creazione attività e i collegamenti sono una transazione.

I collegamenti verificano la proprietà delle risorse sul server, anche per
utenti amministratori. Il server costruisce etichette e indirizzi; il client non
può proporre collegamenti a contenuti di altri utenti. Il modello dati esistente
di attività e calendario resta la fonte comune: nessun secondo elenco di attività.
Il Taccuino conserva il campo libero `goal`; gli obiettivi strutturati sono
presentati a parte e non riscrivono retroattivamente l'autodescrizione.

Chat guidata e Bussola ricevono un riepilogo limitato degli obiettivi attivi e
dei collegamenti disponibili. Aiuto e suggerimenti del Tavolo ricevono solo gli
obiettivi attivi esplicitamente collegati a quel Tavolo. I dati sono dichiarati
materiale dell'utente, non istruzioni; il counselor propone, non adotta, condivide
né conclude obiettivi. La regola QSA-first della Bussola è preservata.

## API

Tutte le route richiedono autenticazione; quelle `/teacher` richiedono il ruolo
gestore già usato per gruppi/piani, più verifiche puntuali di proprietà e ambito.

| Metodi | Route | Funzione |
| --- | --- | --- |
| GET | `/user/goal-catalog` | Proposte pubblicate accessibili |
| GET, POST | `/teacher/goal-catalog` | Elenco gestibile e creazione |
| PUT | `/teacher/goal-catalog/{id}` | Revisione/versione/pubblicazione/archiviazione |
| GET, POST | `/user/goals` | Elenco personale e adozione/creazione |
| PUT, DELETE | `/user/goals/{id}` | Aggiornamento o cancellazione con revisione |
| GET | `/user/goal-groups` | Gruppi attivi a cui condividere |
| GET | `/user/goal-resources` | Risorse personali collegabili |
| POST | `/user/goals/{id}/links` | Collegamento verificato |
| DELETE | `/user/goals/{id}/links/{link_id}` | Rimozione del solo collegamento |
| POST | `/user/goals/{id}/actions` | Attività e tappa facoltativa |
| GET | `/teacher/groups/{group_id}/goals` | Soli riepiloghi condivisi |

## Verifica riproducibile

- `backend/tests/test_goals.py`: API e isolamento su schema transazionale di
  `counselorbot_test`; catalogo, autorizzazioni, revisioni, retry, condivisione,
  proprietà, aggiornamento dei riferimenti, calendario e contesto del counselor.
- Regressioni: personal timeline, visual tools, orientation, tavolo e feedback.
- Browser: avviare `backend.tests.goals_browser_server` in un container di prova,
  esponendo `127.0.0.1:18096:8096`, e il frontend di produzione su porta 3107.
  Dal frontend eseguire `npm run test:goals`. `GOALS_BASE_URL` e `GOALS_API_URL`
  permettono porte alternative. Per l’avvio diretto della fixture,
  `GOALS_TEST_HOST` e `GOALS_TEST_PORT` configurano il bind (default `0.0.0.0:8096`).
  La fixture browser sovrascrive l'identità solo
  nell'app di test, usa uno schema isolato e lo annulla alla chiusura; le API degli
  obiettivi e del calendario sono reali. Gli altri servizi sono simulati.
  Non includere questa app nel server di produzione.
- Build/typecheck, ESLint e controllo i18n dal percorso `frontend/`.

Il trasferimento storico degli strumenti visuali continua a seguire le regole
esistenti della Linea del tempo: i nuovi collegamenti non importano tutte le
carte o tutti i confronti dalle conversazioni pregresse.

## Esito della verifica del 19 settembre 2026

- 118 test backend su obiettivi e regressioni di timeline, strumenti visuali,
  Bussola e Tavolo; altri 7 smoke test su chat, Taccuino, Libretto e Portfolio.
- 189 test unitari frontend; 11 prove browser sulle API reali di obiettivi e
  calendario in PostgreSQL isolato, con desktop, mobile, tema scuro, sei lingue,
  ruoli docente/amministratore, conflitti, revoca e accessi diretti agli strumenti.
- TypeScript, build di produzione e i18n superati. ESLint senza errori;
  restano due warning preesistenti sulle dipendenze degli hook in `ConfigForm.tsx`.
- Immagini backend/frontend ricostruite; volumi persistenti esistenti conservati.

Verifica sul servizio avviato: pagina obiettivi locale HTTP 200, API anonima
locale 401 e quattro worker backend avviati senza errori. Il dominio pubblico
risponde con il redirect 302 al login SSO. Le tre tabelle e le sei proposte
iniziali pubblicate sono state verificate direttamente nel database attivo.
I permessi studente/docente/amministratore sono verificati nei test integrati;
non è stata eseguita una sessione browser autenticata contro il dominio pubblico.
