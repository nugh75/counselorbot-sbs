# Categorie di Orientamento dell’istituto

Decisione: l’istituto sceglie le proprie categorie, gestite dai suoi docenti.
L’amministratore associa i docenti all’istituto. La lista proposta in precedenza
non è un vocabolario obbligatorio; nessuna categoria viene aggiunta automaticamente.

## Primo passo: associazioni verificate

Implementate le API, i controlli sul server e la scheda amministrativa approvata:
**Amministrazione → Referenti ed eventi → Istituti → Docenti dell’istituto**.
La scheda contiene account docente, «Associa», elenco e «Revoca»; carica l’elenco
all’apertura, consente di riprovare un caricamento fallito e conserva i dati
quando una modifica non riesce. Il configuratore delle categorie sarà il passo
successivo. Il frontend di produzione non espone ancora queste funzioni.

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

1. Categorie condivise per istituto, gestite dai docenti abilitati.
2. Associazione delle categorie ai contenuti e filtri della directory studente.

Le categorie editoriali dell’istituto resteranno distinte dal vocabolario globale
dei bisogni usato per recuperare contatti in chat. Le modifiche non devono
riclassificare automaticamente i dati esistenti o concedere ai docenti poteri di
certificazione sui contenuti.

La verifica browser `frontend/tests/institution-teachers.test.mjs` usa API
simulate: sette test, con associazione/revoca nelle sei lingue, 320/390/1440 px,
errori di caricamento e scrittura, e assenza dei controlli per il ricercatore.
La guida pubblica studente/docente è stata rivista: il nuovo pannello è riservato
agli amministratori e non cambia quei flussi. Il configuratore delle categorie
non viene anticipato nella guida.
