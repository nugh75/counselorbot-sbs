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

[DA COMPLETARE da S14 senza sostituire i risultati S13]

S13 pubblica la primaria senza PR parziale. S14 deve partire dal suo HEAD remoto
esatto e aprire l'unica PR finale con entrambi i commit. Merge e deploy non sono
autorizzati; il goal rimane aperto fino al merge utente.
