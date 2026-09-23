# Categorie di Orientamento dell’istituto

Decisione: l’istituto sceglie le proprie categorie, gestite dai suoi docenti.
L’amministratore associa i docenti all’istituto. La lista proposta in precedenza
non è un vocabolario obbligatorio; nessuna categoria viene aggiunta automaticamente.

## Primo passo: associazioni verificate

Implementate le API, i controlli sul server e la scheda amministrativa approvata:
**Amministrazione → Referenti ed eventi → Istituti → Docenti dell’istituto**.
La scheda contiene account docente, «Associa», elenco e «Revoca»; carica l’elenco
all’apertura, consente di riprovare un caricamento fallito e conserva i dati
quando una modifica non riesce. Anche il configuratore docente è implementato
in sviluppo. Il frontend di produzione non espone ancora queste funzioni.

| Metodo e rotta | Accesso e comportamento |
| --- | --- |
| `GET /admin/institutions/{id}/teachers` | Solo amministratore; elenco delle associazioni attive |
| `POST /admin/institutions/{id}/teachers` | Solo amministratore; corpo `{"username":"account.docente"}`; crea o riattiva l’associazione |
| `DELETE /admin/institutions/{id}/teachers/{membership_id}` | Solo amministratore; revoca senza cancellare la riga |
| `GET /teacher/institutions` | Docente autenticato; solo istituti attivi con associazione attiva |

L’identificativo corrisponde esattamente allo username dell’identità SSO,
con gli spazi iniziali/finali rimossi. L’API non interroga l’anagrafica SSO e
non attribuisce il ruolo docente: un’associazione a un account privo del ruolo
non gli concede accesso. La scheda amministrativa spiega questo requisito.

`require_institution_admin` controlla `is_admin`: i ricercatori, ammessi in altri
pannelli amministrativi, non possono concedere o revocare questa abilitazione.
`require_institution_teacher` ricontrolla ruolo, appartenenza e istituto attivo
a ogni chiamata. Non usa il Taccuino, l’appartenenza studente a gruppi o il campo
istituto delle classi. Un docente può avere associazioni a più istituti.

La tabella `institution_teachers` ha unicità su istituto e username, riferimento
all’istituto, stato attivo e autore/date della creazione e dell’ultimo
aggiornamento. Revoca e riattivazione conservano lo stesso identificativo.
Una revoca impedisce l’accesso alle richieste successive; disattivare l’istituto
sospende tutte le sue abilitazioni finché non viene riattivato.

La tabella viene creata dal normale `metadata.create_all` all’avvio del backend;
non serve una migrazione dei dati precedenti. Nessuna associazione è derivata
automaticamente da dati dichiarati dagli utenti. In questa fase si ricostruiscono
le immagini backend e frontend senza sostituire i container di produzione.

## Verifica

```bash
docker compose run --rm --no-deps backend python -m backend.tests.test_institution_teachers
```

La suite usa PostgreSQL in `counselorbot_membership_test`, crea solo le proprie
righe e le rimuove alla fine. Copre amministratore, docente associato, docente
estraneo, studente, ricercatore, anonimo, revoca, riattivazione, istituto inattivo,
tentativi tra istituti e dati di ingresso invalidi. Undici test superati.

## Passi successivi

1. Associazione delle categorie ai contenuti e filtri della directory studente (0.3.2.3).

Le categorie editoriali dell’istituto resteranno distinte dal vocabolario globale
dei bisogni usato per recuperare contatti in chat. Le modifiche non devono
riclassificare automaticamente i dati esistenti o concedere ai docenti poteri di
certificazione sui contenuti.

La verifica browser `frontend/tests/institution-teachers.test.mjs` usa API
simulate: sette test, con associazione/revoca nelle sei lingue, 320/390/1440 px,
errori di caricamento e scrittura, e assenza dei controlli per il ricercatore.
La guida docente descrive ora il configuratore e include una cattura sintetica
in ciascuna delle sei lingue. Le catture non contengono dati di produzione.


## Secondo passo: configuratore docente

Dall’Area docente, il collegamento illustrato **Orientamento dell’istituto** apre
`/docente/orientamento`. Un solo istituto mostra il nome; più istituti abilitati
mostrano un selettore. Senza associazioni non sono disponibili comandi di scrittura.
Tutti i docenti abilitati condividono l’elenco.

`GET /teacher/institutions/{id}/orientation-categories` restituisce
`{revision, categories}`. Senza categorie la revisione è zero e la lettura non crea
righe. `POST` sulla stessa rotta accetta `revision`, `action`, e secondo l’azione
`category_id`, `name`, `description`. Azioni: `create`, `edit`, `move_up`,
`move_down`, `archive`, `restore`. La risposta è l’elenco aggiornato.

- Nome obbligatorio, massimo 120 caratteri; descrizione facoltativa, massimo 2000.
- Spazi esterni rimossi; nomi unici nell’istituto dopo `casefold`, anche in archivio.
- ID UUID stabili; rinomina e ripristino conservano l’identità. Nessuna cancellazione.
- Il ripristino colloca la categoria in fondo all’elenco attivo.
- Ruolo docente, associazione e istituto attivi sono ricontrollati a ogni chiamata.
- Revisione dell’intero elenco verificata atomicamente: una scrittura concorrente
  produce `409` con codice `conflict`; un nome occupato produce `409 duplicate`.
  L’interfaccia conserva la bozza e richiede di ricaricare prima di ritentare
  dopo un conflitto; la ricarica non sostituisce il testo locale.
- Una categoria archiviata da altri non è modificabile fino al ripristino.
  Revoca e mancata autorizzazione bloccano le scritture senza perdere il testo.

Le nuove tabelle `institution_category_collections` (revisione) e
`institution_orientation_categories` (contenuti, ordine, stato e ultima modifica)
sono create all’avvio da `metadata.create_all`, senza migrare o riclassificare
dati esistenti. Nessun elenco predefinito viene inserito.

Il modulo usa salvataggio esplicito, conferma prima di cambiare istituto o uscire
con modifiche e protezione di Indietro/ricarica. I controlli sono tradotti nelle
sei lingue; nomi e descrizioni dell’istituto restano contenuti autoriali.

```bash
docker compose run --rm --no-deps backend python -m backend.tests.test_institution_categories
cd frontend
node --test --experimental-strip-types tests/institution-categories.test.mjs
GUIDE_BASE_URL=http://127.0.0.1:3108 node --test --experimental-strip-types tests/guide-audiences.test.mjs
```

La suite PostgreSQL verifica CRUD, archivio, unicità, isolamento, ruoli/revoca,
riordino e scritture concorrenti reali. La suite browser usa API simulate e
verifica il ciclo completo nelle sei lingue, 320/390/1440 px, tema scuro,
conflitti/errori, istituti multipli e protezione delle bozze, anche senza Navigation API.


Esito del 23 settembre 2026: 22 test PostgreSQL superati (11 categorie e 11
associazioni), 13 test browser del configuratore e 6 della guida superati.
TypeScript, lint dei file modificati e parità delle sei lingue superati.
Le verifiche browser usano fixture; non attestano l’accesso SSO pubblico reale.
Immagini backend/frontend ricostruite con successo; i 13 test del configuratore
sono passati anche sul frontend Docker compilato, avviato temporaneamente su
`127.0.0.1:3110` e poi rimosso. Container di produzione non sostituiti.
