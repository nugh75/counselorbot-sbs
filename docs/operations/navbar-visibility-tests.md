# Contratti di visibilità della navbar (P0)

Blocco P0 del piano [audit-navbar.md](audit-navbar.md) §8, milestone
«Navbar redesign (Oct 2026)». Solo test e fixture: **nessun cambiamento di
comportamento**. I test fotografano la barra globale di oggi; ogni PR successiva
(P1–P6) che cambia voci, etichette o ordine deve aggiornare il contratto in modo
esplicito, non per effetto collaterale.

## File

| File | Cosa verifica | Dove gira |
| --- | --- | --- |
| `frontend/tests/fixtures/navbar-contract.mjs` | Identità e accessi sintetici A/S/D/R/M (S senza classi, una classe, due classi, vista `all`), etichette italiane e nelle sei lingue scritte a mano, `expectedNavbar(profilo, larghezza)` con l'elenco ordinato dei controlli visibili in barra e nel menu | Condiviso |
| `frontend/src/lib/navbar-visibility.test.ts` | Matrice ruoli: i predicati di `roles.ts`, `isToolAllowed` e `classViewOptions` producono il contratto di ogni profilo; bordi 1023/1024 e 1279/1280; ogni voce raggiungibile in ogni fascia; Area docente/Amministrazione solo nel menu | `npm test` (Node 22) |
| `frontend/src/lib/navbar-terminology.test.ts` | Testi della barra (P1) scritti a mano nelle sei lingue: Assistente generico, «Area studente» uguale in navbar e pagine, badge strumento tradotto con ripiego sul nome del catalogo e sul codice degli strumenti dinamici | `npm test` (Node 22) |
| `backend/tests/test_navbar_area_guards.py` | HTTP 401/403/200 delle guardie dietro `/profilo`, `/docente`, `/admin` per A/S/D/R/M; marker docente/ricerca identici tra backend e `roles.ts` | pytest, nessun DB |
| `frontend/tests/navbar-visibility.test.mjs` | Navbar realmente renderizzata (Playwright): matrice 8 profili × 390/768/1023/1024/1279/1280/1440, link visibili e destinazioni, caricamento identità/accesso, errori API, riprese, sei lingue, tastiera, tema e movimento | Dev isolato :3149 |

Le etichette non sono lette dai dizionari: un cambio di testo deve comparire nel
diff del test. Per decisione dell'utente l'etichetta resta «Area studente»
(un docente può essere studente di un altro docente).

## Copertura browser

- **Visibilità**: per ogni profilo e larghezza, nomi accessibili dei controlli
  visibili (`checkVisibility`, non solo presenza nel DOM) in barra e nel menu a
  tre punti, nell'ordine reale; href delle voci (`/bussola`, `/assistente`,
  `/guide`, `/profilo`, `/docente`, `/admin`, `/questionario`, `/counselor`,
  logout, accesso admin con ritorno `/admin`); nessuno scroll orizzontale.
- **Pagina**: stesse voci su `/guide`, `/profilo`, `/docente`, `/questionario`;
  oggi nessun `aria-current` né landmark `<nav>` nella barra (N5).
- **Lingue**: IT/EN/ES/FR/DE/SV, `html.lang`, voci di ruolo per R e accesso
  anonimo, nessuna voce duplicata o privilegiata in più.
- **Caricamento**: con `/api/auth/me` in attesa solo brand (più utilità a
  ≥1280px) e nessun menu; con `/api/user/access` in attesa Bussola e Assistente
  nascoste, poi filtrate per classe.
- **Errori**: identità 500 o rete interrotta → barra anonima; accesso 500 o rete
  interrotta → tutti gli strumenti e nessun selettore vista (il server resta la
  guardia); elenco riprese 500 → «Riprova» in menu o popover, poi le righe.
- **Riprese**: sessioni congelate filtrate dagli strumenti della classe, link
  `/?frozen=…`, cancellazione per riga.
- **Vista classe**: cambio a «Tutti gli strumenti» con PUT e barra aggiornata
  senza ricaricare.
- **Tastiera**: skip link, brand, apertura del menu con Invio, Tab dentro il
  menu, Escape chiude e riporta il focus al trigger.
- **Preferenze**: tema scuro salvato e movimento ridotto dal sistema.
- **Screenshot**: opzionali con `NAVBAR_SCREENSHOTS=<cartella>`.

## Contratto N7: ripresa pQBL con classe che disattiva lo strumento

Deciso in P0: se la classe (o l'unione delle classi) disattiva `pqbl`, la voce
«Riprendi · Studiare da un PDF» **non** compare nella barra, come già accade
per sessioni congelate e chat locali di strumenti disattivati. Proseguire è una
scrittura che il server rifiuta (`require_tool(…, "pqbl")` su risposte e test
finale). Il progresso locale **non** si cancella e `/profilo/pqbl` resta
raggiungibile in lettura dall'Area studente.

Il test `pQBL resume is hidden when the class turns pQBL off (N7)` descrive il
contratto ed è marcato `todo` per non bloccare la suite: la correzione è una
piccola PR `fix` separata, prima di P4/P5. Evidenza di sorgente:
`frontend/src/lib/use-resume-entries.ts:89` restituisce il progresso pQBL senza
`isToolAllowed`. Bug Diario `df1e9edb-bfb9-49fa-a1fe-18a7de9c2051`, ancora
**sospetto**: la corsa browser che lo riproduce non si è conclusa in P0 (server
dev fermato per memoria scarsa). Il caso anonimo (progresso locale visibile
anche senza login) non è deciso qui.

## Come lanciarli

Unit e backend, dalla radice del worktree:

```bash
cd frontend && npm test          # include navbar-visibility.test.ts (Node 22)
python3 -m pytest backend/tests/test_navbar_area_guards.py -q
```

Il test backend richiede le dipendenze del backend (Python ≥3.10). Senza un
ambiente locale si può usare l'immagine backend già costruita, offline e in sola
lettura, senza toccare i container in esecuzione:

```bash
docker run --rm --network none --entrypoint python -v "$PWD":/src:ro -w /src \
  -e PYTHONDONTWRITEBYTECODE=1 counselorbot-portable-counselorbot-backend:latest \
  -m pytest backend/tests/test_navbar_area_guards.py -p no:cacheprovider -q
```

Browser, in dev isolato (nessun backend, DB, SSO o provider; tutte le `/api`
intercettate nel browser, traffico esterno bloccato):

```bash
# controllare che 3149 sia libera; lo script si ferma se è occupata
bash scripts/dev-navbar-tests.sh
# in un altro terminale
cd frontend && node --test tests/navbar-visibility.test.mjs
# opzionale: NAVBAR_SCREENSHOTS=/tmp/navbar node --test tests/navbar-visibility.test.mjs
```

Variabili: `NAVBAR_BASE_URL` (default `http://127.0.0.1:3149`),
`CHROMIUM_PATH` per un Chromium di sistema, `NAVBAR_SETTLE_MS` (default 45000) per l'attesa di ogni stato. La prima compilazione di `/guide`
e delle altre pagine può richiedere minuti: la suite usa timeout lunghi.
Arresto: Ctrl-C nel terminale dello script. Da SSH:
`ssh -N -L 3149:127.0.0.1:3149 <utente>@<server>`, poi
`http://localhost:3149/guide` (senza le fixture del test non c'è backend).

## Limiti

- La CI di GitHub esegue solo i controlli di documentazione: né i test Node né
  Playwright girano in CI. La matrice ruoli è quindi anche nel test unitario;
  la suite browser va lanciata a mano prima di ogni PR navbar.
- Il test unitario replica la composizione di `Header.tsx` (righe 56–95) finché
  P3 non la centralizza; la suite browser verifica il render reale.
- Le fixture non certificano gli URL ai4auth/Console dell'installazione né i
  gruppi reali; le guardie per strumento (`require_tool`) sono coperte dai test
  backend esistenti di `class_access` con PostgreSQL di test.
- Zoom 200%, nomi lunghi DE/FR e misure di overflow restano a P4/P5.

## Esito della sessione P0 (16 ottobre 2026)

- `npm test` 514/514 (Node 22), incluso `navbar-visibility.test.ts` 12/12.
- `test_navbar_area_guards.py` 6/6 nel container usa-e-getta descritto sopra.
- Browser: la matrice di visibilità ha passato 55 casi su 56 al primo giro; il
  caso S2 a 768px è scaduto in attesa dell'idratazione (15s), da cui l'attesa
  portata a 45s. I test non di matrice (pagine, lingue, caricamento, errori,
  riprese, N7, tastiera, preferenze) **non hanno un esito**: la corsa è stata
  interrotta insieme al server dev per memoria scarsa sulla macchina. Vanno
  rilanciati con la procedura sopra prima di togliere la PR dalla bozza.
