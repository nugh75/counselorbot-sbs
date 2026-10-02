# Gestione Classi: validazione S13 e successiva S14

## S13 — layout e contratto editor

Worktree `s13-class-layout-1002`, branch `refactor/teacher-class-groups-layout`,
base `af26ef9d691e67e312c0f28028fde51849ec4051` (PR34, con PR33 antenata).
ASCII esterno approvato dall'utente con «ok» il 2026-10-02, dopo la proposta
di pagina e popup. L'utente ha confermato separatamente «Conserva il salvataggio
attuale»: fascia/istituto al cambio, Salva/Annulla del futuro popup per il contesto.
Schema: `/home/nugh75/counselorbot-sbs-worktrees/handoffs/s13-class-layout-1002-ascii.md`.

La creazione precede l'elenco. Ogni classe/gruppo parte aperto; il toggle nativo
a pulsante espone `aria-expanded` e `aria-controls`, funziona con Enter/Spazio
e nasconde il corpo con `hidden`, mantenendolo montato. I campi del contesto
sono visibili senza una seconda apertura. Seguono inviti, condivisioni,
partecipanti, assegnazioni e azioni esistenti. Stato/errori/retry rimangono
fuori dal corpo collassabile. Un retry riuscito riporta il focus al toggle
se la scheda è chiusa, oppure al Salva se è aperta.

Nome/scuola sono in sola lettura dopo la creazione. Il payload POST resta
`{name, school, school_level, institution_id}`; PUT immediati separati per
`{school_level}` e `{institution_id}`; Salva contesto invia soltanto
`{description, methodologies, context_visible_to_students}` con trim/null.
Nessun nuovo endpoint, trasferimento al notebook/chat, autosave dei testi,
migrazione o cambiamento delle autorizzazioni. Notebook A/B/C rimangono invariati.

### Exports per S14

- `class-group-types.ts`: `StudentGroup`, `parseClassGroups(unknown)`. La verifica
  del payload conserva il contratto esistente di elenco array.
- `class-group-texts.ts`: `classGroupTexts`, testi esistenti nelle sei lingue.
- `useClassGroupEditors(groups, reloadGroups)`: un solo proprietario delle bozze
  per ID, baseline e operazioni PUT. `reloadGroups` richiede una rilettura della
  lista; non deve chiudere popup o avviare mutazioni. Può essere il `reload`
  di `useTeacherResource`. Non serve renderlo stabile: il controller conserva
  il callback aggiornato in un ref.
- Risultato: `states[id]` con `draft`, `baseline`, `dirty`, `busy`, `saved`,
  `failed`; aggregati `dirty`, `busy`, `forbidden`; `change(id, patch)`,
  `discard(id)`, `save(id)`, `setLevel(id, value)`, `setInstitution(id, value)`,
  `retry(id)`. I metodi di scrittura restituiscono `Promise<boolean>`; false
  comprende errore, abort, identità cambiata o operazione bloccata.
- `ClassContextDraft`: stringhe `description`, `methodologies`, boolean `visible`.
  Il controller converte `visible` nella chiave server esistente.
- `ClassGroupEditor({group, institutions, editors, disabled?, showStatus?,
  idPrefix?})`: stessi cinque controlli della pagina, Salva e stato opzionale.
  `idPrefix` default `group`, per evitare ID duplicati nel futuro popup.
  `disabled` blocca scritture/selezioni, ma consente nuove modifiche al contesto
  caricato durante un PUT; `editors.forbidden` impedisce la compilazione.
- `ClassGroupEditorStatus({groupId, editors, disabled?, onRetrySuccess?})`:
  dirty/busy/success/error e retry. La pagina lo colloca nell'intestazione e passa
  `showStatus=false` all'editor. Il popup può usare lo stato interno dell'editor
  o comporlo separatamente; `onRetrySuccess` è opzionale per il recupero focus.

Il chiamante mantiene lettura/loading/errore/vuoto e guard di ruolo con
`useTeacherResource` e il gate docente già esistenti; passa solo gruppi visibili.
Il controller blocca doppio PUT per ID, abortisce all'unmount/rimozione del gruppo,
invalida gli esiti se cambia l'anteprima account e nasconde i dati su PUT401/403.
`dirty` confronta la bozza con la baseline effettiva, incluso il ritorno ai valori
salvati. Il successo non cancella testo scritto durante il PUT. Un GET precedente
al PUT non ripristina un contesto vecchio: viene conservato lo snapshot e richiesta
una rilettura fresca. Non ci sono revisioni server o protezione cross-browser:
una lettura fresca divergente può rappresentare un aggiornamento di altro autore.

S14 deve proteggere selezione e chiusura del dialogo con questi stati, includendo
tutti i PUT immediati in `busy`. `discard` agisce solo sul contesto locale e
non annulla fascia/istituto già salvati. Il controller non implementa dialogo,
selettore, focus trap o navigazione: queste sono responsabilità S14, con
il taccuino sottostante montato e le sue guard invariate. Nessuna creazione,
gestione membri o condivisione con colleghi fa parte dell'editor condiviso.

### Riproduzione isolata

Nessun backend, SSO o database viene avviato. Fixture browser anonime in memoria,
traffico esterno bloccato; upstream `http://127.0.0.1:9`. La porta 3133 deve
essere libera (`ss -ltn 'sport = :3133'`). Dalla root:

```bash
scripts/dev-teacher-class-management-tests.sh
# Altro terminale, nel frontend:
TEACHER_CLASSES_BASE_URL=http://127.0.0.1:3133 node --test tests/teacher-class-management.test.mjs
```

Arresto: Ctrl+C sul processo avviato; non usare un pkill generico che coinvolga
altri worktree. Il server senza fixture non costituisce una preview autenticata.
Tunnel opzionale: `ssh -N -L 3133:127.0.0.1:3133 <utente>@<server>`;
URL `http://localhost:3133`, con gli stessi limiti di isolamento/fixture.
Per la verifica finale arrestare il dev e usare il frontend compilato:

```bash
BACKEND_ORIGIN=http://127.0.0.1:9 NEXT_TELEMETRY_DISABLED=1 npm run build
cp -a public .next/standalone/public
cp -a .next/static .next/standalone/.next/static
PORT=3133 HOSTNAME=127.0.0.1 NEXT_TELEMETRY_DISABLED=1 node .next/standalone/server.js
```

Test pertinenti: Classi, S4 `teacher-loading-errors`, notebook A/B/C
`teacher-notebook-copy`/`teacher-notebook-links`, `teacher-area-home`;
unitari, TypeScript, i18n, ESLint mirato/globale, build, guidance e diff.
I due test S4 che prima aprivano «Contesto classe» ora attendono i campi già
visibili: tutte le asserzioni su conservazione bozze e payload sono mantenute.
Catture: `GUIDE_BASE_URL=http://127.0.0.1:3133 GUIDE_SCREENS=teacher-classes
node --experimental-strip-types scripts/capture-guide.mjs`, sei sole immagini
`teacher-groups`, senza scritture API. Guida e documento piattaforma aggiornati;
manifest registrato con `make guidance-refresh`/`make guidance-check`.

### Risultati tecnici S13

- Build compilata: 34/34 Classi, 57/57 S4, 18/18 notebook copy C/A,
  25/25 notebook links B/guard, smoke `teacher-area-home` riuscito.
- 236/236 unitari; controllo delle nuove immagini della guida 6/6; TypeScript e i18n riusciti; ESLint mirato senza errori/warning.
  Lint globale conserva 1 errore NewDeckDialog e 16 warning, identici alla baseline.
- Sei screenshot Classi aggiornati con pagina intera, comando di creazione e
  campi visibili. Ispezione visiva delle catture IT/DE; controlli browser nelle
  sei lingue a 320px e viewport/pixel scale equivalenti al 200%/400% di zoom.
- `make guidance-refresh`, `make guidance-check` e controllo `--base af26ef9`
  riusciti; `git diff --check` riuscito.
- Nell'esecuzione iniziale il test notebook copy si fermava su `networkidle`
  al 400%, con un GET pendente dell'ottimizzatore per `eventi.png` (illustrazione
  esistente). La fixture ora serve i byte reali di quella sola immagine:
  tutte le asserzioni di campi, ordine, gruppi, payload, focus e tastiera restano.
  Identica fixture verificata sull'app della base estratta in `/tmp/s13-abc-baseline`:
  18/18 riusciti, oltre ai 18/18 della candidata compilata. La pipeline immagine
  dell'app non è stata modificata; il test non certifica il suo ottimizzatore.
- Immagine di sola validazione: `counselorbot-frontend:s13-class-layout-1002-validation`.
  Nessun container avviato, deploy o sudo; ID `sha256:7d67618a395a8318411b116af79ad5393b614940d9dbf5bdabb64a11cd8e80ba`
  (138016630 byte), registrato anche nella consegna esterna con l'HEAD pubblicato. Dev S13 e server della baseline arrestati;
  eventuale standalone usato per i controlli conclusivi viene arrestato prima
  della pubblicazione.

Baseline verificata prima dei cambi: build riuscita, 236 test unitari e 57 S4
riusciti; lint globale 1 errore `NewDeckDialog` e 16 warning; guide-audiences
0/6 per vecchi nomi dei link. Nessuno dei due difetti viene corretto qui.
Il test iniziale del nuovo layout è rosso sulla baseline perché il contesto è
nascosto. Le verifiche non rappresentano test UX umani né validazione della
produzione; non certificano backend/database o concorrenza tra browser.
Log locali di sessione in `/tmp/s13-*.log`, non artefatti durevoli della PR.

## S14 — popup e validazione combinata

Worktree `s14-class-popup-1002`, branch `feature/teacher-notebook-class-picker`.
HEAD iniziale pulito e remoto S13 esatto
`d1f3599c141a39573ca8b932e22b5e35dffc65b8`, ancestry verificata; main remoto
`af26ef9d691e67e312c0f28028fde51849ec4051`. Lo stack autorizzato conserva il
commit S13 senza cherry-pick, rebase, squash o amend. Popup ASCII già approvato,
con selettore inizialmente vuoto e nome/scuola in sola lettura.

### Implementazione e confini

`ClassGroupPicker` riusa `useTeacherResource`, `useClassGroupEditors` e
`ClassGroupEditor` S13. Non possiede copie dei valori/baseline, salvataggi o
permessi. GET `/api/admin/groups` e `/api/institutions`, stessi PUT parziali
S13, identici campi/trim/null. Il gate di ruolo del taccuino rimane quello della
pagina Classi; le letture sono locali alla singola apertura, senza cache account.
Nome, scuola/ente, proprietario e iscritti restano metadati in sola lettura.
Nessuna creazione/eliminazione, membri, trasferimento, grant o assegnazione.

Il solo ingresso Classi del taccuino diventa un pulsante `aria-haspopup=dialog`.
La pagina completa resta nella normale navigazione. Gli altri tre link B non
cambiano. Il popup non legge alcuna nota del taccuino e non modifica URL,
notebook_context/envelope, sessione, consenso/default o contesto chat.
I sei campi/ID/ordine e i limiti 600/1.200 A/C restano invariati; il taccuino è
sempre montato. Annulla e scarto riguardano solo la bozza contesto classe,
non fascia/istituto già salvati: testo esplicito in tutte le sei lingue.

Cambio classe, Annulla, X, Esc e sfondo controllano dirty/busy S13, compresi
PUT immediati delle tendine. La conferma offre Continua/Scarta e conserva
classe, testo, focus e selezione quando annullata. I dialoghi nativi rendono
inerte lo sfondo; il ciclo Tab esplicito impedisce il passaggio ai controlli
del browser. La chiusura restituisce il focus al chiamante. Il popup comunica
solo dirty/busy al taccuino: UNA guard di navigazione protegge entrambe le bozze,
senza sovrapporre marker di cronologia nei browser senza Navigation API.
Guard, API e controller condivisi non sono stati modificati.

Test di riproduzione ha dimostrato che due guard distinte causavano una
conferma del taccuino dopo lo scarto classe nel browser legacy (1/2 prima).
La singola guard risolve il caso (2/2 dopo), senza scartare/salvare le note
private; un test reale usa entrambe le bozze modificate. Altri test verificano
Back/beforeunload, PUT in-flight, modifica successiva all’invio, doppio invio,
errori e retry del contesto/delle tendine, identità cambiata durante un PUT,
ruolo cambiato tramite reload e GET tardivo di un popup già chiuso.

### Riproduzione e prove tecniche

Avvio `scripts/dev-teacher-class-picker-tests.sh`, solo frontend su
`127.0.0.1:3134` con upstream `127.0.0.1:9`, dopo verifica porta libera.
Fixture anonime in memoria, tutte le API intercettate, traffico esterno bloccato;
nessun backend, SSO, DB o container. Tunnel/stop/isolamento in
`live-dev-environment.md`. Per l’app compilata, da `frontend/`:

```bash
BACKEND_ORIGIN=http://127.0.0.1:9 NEXT_TELEMETRY_DISABLED=1 npm run build
cp -a public .next/standalone/public
cp -a .next/static .next/standalone/.next/static
PORT=3134 HOSTNAME=127.0.0.1 NEXT_TELEMETRY_DISABLED=1 node .next/standalone/server.js
# Altro terminale, frontend:
TEACHER_PICKER_BASE_URL=http://127.0.0.1:3134 TEACHER_CLASSES_BASE_URL=http://127.0.0.1:3134 TEACHER_ERRORS_BASE_URL=http://127.0.0.1:3134 TEACHER_AREA_BASE_URL=http://127.0.0.1:3134 node --test --experimental-strip-types --test-concurrency=2 tests/teacher-class-picker.test.mjs tests/teacher-class-management.test.mjs tests/teacher-loading-errors.test.mjs tests/teacher-notebook-copy.test.mjs tests/teacher-notebook-links.test.mjs tests/teacher-area-home.test.mjs
```

La fixture notebook continua a servire i byte reali di `eventi.png` come in S13,
senza togliere asserzioni o modificare il servizio immagini. Il test B sposta
le verifiche di navigazione/modifier/new-tab su Obiettivi personali, conservando
payload, focus, cronologia, ruolo e bozza. Classi è ora verificata come popup,
compreso il 403. A/C verifica un pulsante e tre link nello stesso ordine Tab,
con lo stesso Salva e payload di sei campi.

Catture: `GUIDE_BASE_URL=http://127.0.0.1:3134 GUIDE_SCREENS=teacher-class-picker
node --experimental-strip-types scripts/capture-guide.mjs`, sei lingue,
GET-only. I sei screenshot teacher-area sono stati rigenerati e risultano
identici; sei nuovi `teacher-class-picker.png`, immagini Classi S13 conservate.
La guida docente mostra entrambe le immagini della sezione taccuino.
Ispezione delle catture IT/DE e browser a 320px, viewport/scala equivalenti
al 200%/400%, inclusi nomi/scuole/proprietari lunghi e conferma da tastiera.
Nessun feedback UX umano raccolto o inventato.

**Risultati finali sulla candidata compilata:** 189/189 complessivi: 54/54
popup (incluse sei gallerie guide), 34/34 Classi S13, 57/57 S4, 18/18 copy
A/C, 25/25 rimandi B e smoke teacher-area-home. 236/236 unitari; TypeScript,
i18n (2.863 chiavi, sei lingue + tuple locali complete verificate nel browser),
ESLint di tutti i file toccati senza warning, build, guidance refresh/check/
--base af26ef9 e diff/staged-check riusciti. Screenshot finali rigenerati
sull’app compilata. Prima dell’ultima correzione la suite compilata era 185/185;
le quattro prove aggiuntive mantengono visibile la regressione legacy
scoperta e verificano tastiera/nomi molto lunghi, portando il totale a 189.

Confronto ripetuto con S13 copiata in `/tmp/s14-parent-app` (standalone) e
`/tmp/s14-parent-source` (sorgenti archiviati dal commit), senza scrivere negli
altri worktree. Il test nuovo di apertura popup è rosso su S13 perché manca
il pulsante; la candidata conserva la bozza e resta su `/docente`.
Lint globale identico dopo normalizzazione dei path: errore NewDeckDialog +
16 warning. `guide-audiences` resta 0/6 su base e candidata, stessi sei timeout
alla riga 32 sui vecchi nomi dei link; nessuno dei due difetti fuori scope
è stato corretto o mascherato. I nuovi test della guida decodificano e ingrandiscono
l’immagine popup nelle sei lingue e verificano il ritorno del focus.

Immagine solo validazione `counselorbot-frontend:s14-class-popup-1002-validation`,
comando `docker build --build-arg NEXT_PUBLIC_API_URL=http://127.0.0.1:9 -t
counselorbot-frontend:s14-class-popup-1002-validation frontend`.
ID finale `sha256:ff2ff32e3a441e297986b7e21db80885ae7e20e20c385d98c506b64ce2645cf9` (138634848 byte). Nessun container avviato/riavviato,
compose up, deploy, sudo o dati reali. I server propri :3134/:3136 sono arrestati
prima della pubblicazione. Log `/tmp/s14-*.log`, non artefatti durevoli della PR.

Limiti: fixture HTTP anonime non certificano backend, DB o SSO reale; nessuna
revisione server/concorrenza cross-browser introdotta. Il browser conserva
la responsabilità dell’avviso nativo beforeunload e di un’uscita cross-document
esplicitamente confermata. L’ottimizzatore immagini resta fuori dalla prova
notebook con l’intercettazione S13. Merge, deploy e blocco D non autorizzati.

S13 pubblica la primaria senza PR parziale. S14 deve partire dal suo HEAD remoto
esatto e aprire l'unica PR finale con entrambi i commit. Merge e deploy non sono
autorizzati; il goal rimane aperto fino al merge utente.
