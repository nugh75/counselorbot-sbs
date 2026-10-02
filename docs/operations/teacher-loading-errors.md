# Errori di caricamento docente

Ambito: `GroupsPanel`, `TeacherNotebook`, `DocenzaClassBar`. Le letture usano
`useTeacherResource`, con stato locale al componente, senza cache persistente.
HTTP non riuscito, errore di rete e payload non valido sono errori; il successo
vuoto è `[]` per le classi e `null` o `data: {}` per il taccuino.

Il caricamento annuncia uno stato accessibile. L'errore annuncia un alert con
Riprova nelle sei lingue, senza dettagli del server. Ogni click avvia una sola
lettura e non ci sono retry automatici. La rilettura conserva i dati precedenti;
le bozze del contesto classe e del taccuino restano anche dopo il retry riuscito.
Aggiorna nel taccuino e nel selettore avvia una rilettura esplicita. Le classi
gestite vengono rilette dopo le modifiche già previste nel pannello.

La prima lettura fallita blocca compilazione/salvataggio del taccuino e creazione
dei gruppi. Il salvataggio del taccuino è esplicito, protegge da doppio invio e
conserva il testo scritto durante una richiesta. Un errore del selettore lascia
utilizzabile il composer e non cancella `group_ids`. Non cambiano semantica del
contesto notebook/default, consenso, condivisione, ownership o verifica server.

401/403 nascondono i dati riservati e seguono il guard docente esistente;
nel selettore l'avviso resta locale alla barra. Le richieste vengono annullate
allo smontaggio e le risposte di una vecchia anteprima account sono scartate.
Il cambio account/ruolo continua a ricaricare la pagina, secondo il flusso
esistente. Nessuna persistenza aggiuntiva di dati utente.

## Riproduzione e verifiche

Base: `e1e2b0da10d9b85ecc94958247eada20f3d2dba7` (PR29).
Test comportamentali al confine browser/HTTP, con fixture anonime e traffico
esterno bloccato. I primi tre test sono stati eseguiti prima dei rispettivi fix:
classi HTTP503 e chat HTTP503 mostravano il falso vuoto (`1 !== 0`);
taccuino con rete interrotta lasciava Salva abilitato (`false !== true`).
I log rosso/verde della sessione sono in `/tmp/s4-{groups,notebook,chat}-red.log`
e `/tmp/s4-three-green.log`; non sono artefatti durevoli della PR.

```bash
scripts/dev-teacher-loading-errors-tests.sh
# Un altro terminale, dal worktree:
cd frontend
node --test tests/teacher-loading-errors.test.mjs
DRAFTS_BASE_URL=http://127.0.0.1:3124 GOALS_BASE_URL=http://127.0.0.1:3124 \
  node --test --experimental-strip-types tests/draft-protection.test.mjs tests/goal-method-action.test.mjs
TEACHER_AREA_BASE_URL=http://127.0.0.1:3124 node tests/teacher-area-home.test.mjs
GUIDE_BASE_URL=http://127.0.0.1:3124 GUIDE_SCREENS=teacher-loading \
  node --experimental-strip-types scripts/capture-guide.mjs
```

Per la verifica finale usare il frontend compilato: nel server dev la
navigazione del taccuino può restare sospesa mentre la fixture trattiene una
lettura. Arrestare il dev su 3124, poi da `frontend/`:

```bash
BACKEND_ORIGIN=http://127.0.0.1:9 NEXT_TELEMETRY_DISABLED=1 npm run build
cp -a public .next/standalone/public
cp -a .next/static .next/standalone/.next/static
PORT=3124 HOSTNAME=127.0.0.1 NEXT_TELEMETRY_DISABLED=1 node .next/standalone/server.js
```

La suite resta sullo stesso URL locale e con tutte le API simulate. Arrestare
anche lo standalone con Ctrl+C alla fine. Nessun container viene avviato.

Le catture aggiornano solo Area docenti e gruppi nelle sei lingue (12 immagini),
con `null` come fixture del taccuino ancora non compilato. Nessuna scrittura API.
La guida e il documento funzionale descrivono il recupero; il manifest si registra
con `make guidance-refresh` e si controlla con `make guidance-check`.

La validazione Docker costruisce solo il tag separato
`counselorbot-sbs-s4-loading-errors:validation`; non avvia container o servizi.
I test non certificano backend/database, revoche live dell'identità, né release
in produzione. Lint globale NewDeckDialog e la vecchia suite guide-audiences
sono baseline note; non fanno parte del fix.

Deroga esplicita dell'utente: nessuna revisione cross-modello né altri agenti;
sono obbligatori test tecnici e revisione dei diff. Il task diario si chiude
soltanto dopo test verdi, commit/push e PR; il goal resta al Timoniere in attesa
del merge utente.
