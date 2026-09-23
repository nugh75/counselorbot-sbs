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

## Stato del percorso

I passi 0.3.2.1–0.3.2.3 sono distribuiti in produzione dal 23 settembre 2026,
su richiesta esplicita dell’utente. Le note di sola anteprima sotto descrivono
le verifiche precedenti al rilascio.

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


## Terzo passo: assegnazione e directory studente

Nella pagina docente, Contatti e Appuntamenti sono sezioni richiudibili. Il menu
a tre punti di ogni contenuto offre **Assegna categorie**: zero, una o più
categorie attive, con salvataggio esplicito. Un solo modulo può essere aperto,
anche rispetto all’editor delle categorie. Le bozze sopravvivono a errori e
ricariche per conflitto; un contenuto scomparso lascia il modulo visibile e
impedisce il salvataggio. Una selezione archiviata nel frattempo va rimossa
esplicitamente prima di salvare.

| API | Contratto |
| --- | --- |
| `GET /teacher/institutions/{id}/orientation-contents?lang=it` | Revisione, categorie e contenuti attivi/certificati del solo istituto; appuntamenti non conclusi. Non espone bozze. |
| `POST /teacher/institutions/{id}/orientation-contents/{kind}/{content_id}/categories?lang=it` | `kind`: `referral` o `event`; corpo `revision`, `category_ids`, `content_updated_at`; restituisce lo snapshot aggiornato. |
| `GET /orientation-directory` | Aggiunge `institution_groups`: istituto, categorie pertinenti, contatti/appuntamenti con `category_ids`. Conserva `institution`, `referrals`, `events` per i client esistenti. |

Ogni assegnazione verifica ruolo e associazione docente, istituto attivo e
appartenenza del contenuto e delle categorie. Rifiuta categorie archiviate,
contenuti nazionali, bozze, contenuti inattivi e appuntamenti conclusi. Campi
estranei al contratto sono rifiutati: nessun permesso implicito di modifica o
certificazione. Le risposte sono `403` per accesso negato, `404` per contenuto
non disponibile, `409` per revisione/data/categorie non più valide, `422` per
corpi non validi. Nessun errore incrementa la revisione.

Le tabelle nuove `institution_referral_categories` e `institution_event_categories`
hanno chiavi composte categoria/contenuto e riferimenti con cancellazione a
cascata. Registrano autore e data della creazione del collegamento. Sono create
da `metadata.create_all`, senza riclassificare dati. Il salvataggio sostituisce
solo i collegamenti a categorie attive dell’istituto, preservando gli archiviati.
La revisione comune serializza anche le modifiche delle categorie. Un lock sulla
riga del contenuto e il confronto di `updated_at` proteggono dalle modifiche
amministrative. Dopo uno spostamento tra istituti i vecchi collegamenti non
compaiono nel nuovo istituto.

La directory riusa i controlli esistenti di certificazione, pubblico, lingua,
stato e scadenza. Offre filtri solo per categorie attive con contenuti visibili,
ell’ordine deciso dai docenti. I gruppi sono identificati dall’istituto e gli
ID distinguono nomi uguali. **Tutti** include i contenuti non classificati;
le risorse nazionali restano fuori dai filtri locali e compaiono una sola volta.
I bisogni della chat e il suo retrieval non vengono modificati.

```bash
docker compose run --rm --no-deps backend python -m unittest backend.tests.test_institution_category_assignments backend.tests.test_institution_categories backend.tests.test_institution_teachers
docker compose run --rm --no-deps backend python -m backend.tests.test_orientation_referrals
cd frontend
node --test --experimental-strip-types tests/institution-categories.test.mjs tests/institution-directory.test.mjs
GUIDE_BASE_URL=http://127.0.0.1:3108 node --test --experimental-strip-types tests/guide-audiences.test.mjs
```

Durante la prima esecuzione della suite preesistente `test_orientation_referrals`,
l’import di `backend.main` ha creato le due tabelle nuove anche nel database
configurato del servizio: verificate entrambe vuote. Il test è stato corretto
per indirizzare anche il `create_all` dell’import al database di test. Nessun
contenuto o associazione reale è stato inserito. I container di produzione
restano alla versione precedente.


## Rilascio del 23 settembre 2026

Su richiesta esplicita dell’utente sono stati sostituiti i container backend e
frontend usando le immagini appena ricostruite. Nessun volume o database rimosso.
Verifiche: 33 test PostgreSQL per associazioni/categorie/assegnazioni, 28 test
del retrieval, 34 test browser (20 editor, 8 directory, 6 guida) sulla build
Docker, TypeScript, lint mirato e parità delle sei lingue. I test browser usano
API simulate; la verifica del login SSO con un account reale resta distinta.

Verifica dopo il rilascio: pagine locali `/profilo/orientamento`,
`/docente/orientamento` e `/guide?audience=teacher` HTTP 200; OpenAPI espone le
nuove rotte; API riservate senza identità HTTP 401. Quattro worker backend
avviati, nessun traceback e zero restart dei due container. Le due prove browser
italiane di assegnazione e filtro sono passate anche sul frontend di produzione
locale, sempre con fixture API. Il browser pubblico raggiunge correttamente
`auth.ai4educ.org/login`; accesso SSO autenticato non verificato. Le richieste
Python senza browser ricevono Cloudflare 1010, non un errore applicativo.
Indice CounselorBot ricostruito dopo l’aggiornamento del Markdown: 292 passaggi,
19 fonti, controllo di aggiornamento positivo.
