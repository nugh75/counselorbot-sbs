# ADR-0002 — Contratti della Fase 1 desktop

- Stato: **Accettato** (2026-10-24). Contratti **congelati**: i compiti 🔒 del piano (F1-02, F1-06, F1-13)
  li implementano così come sono; una modifica richiede un nuovo ADR.
- Collegati: #209 (auth intercambiabile), #208 (ruoli), #211, #214; [ADR-0001](0001-installation-profiles-and-desktop-packaging.md),
  [ADR-0003](0003-dual-database-postgres-sqlite.md)
- Versione dei contratti: **`desktop_contract = 1`**

## Contesto

F0-01 ha mostrato che guscio e backend funzionano, ma ha lasciato aperti: variabili di percorso (B5), health,
log, e il **backend che resta acceso quando il guscio viene ucciso** (verificato su macOS). Il piano (§3.5) descrive
l'abbinamento degli studenti solo a grandi linee e #209 chiede un fornitore di identità locale. Le decisioni
provvisorie dell'utente: studenti con **pseudonimi**, tunnel stabile sul dominio del docente, quick tunnel solo per prove.

---

## 1. Cartella dati utente

### 1.1 Radice

Il guscio usa `app_local_data_dir()` di Tauri (dati **locali**, non *roaming*: un database non deve viaggiare
con i profili roaming di Windows). Identificatori del bundle, **immutabili** (cambiarli fa perdere i dati):

| App | Identificatore | macOS | Windows | Linux |
|---|---|---|---|---|
| docente | `org.ai4educ.counselorbot.teacher` | `~/Library/Application Support/org.ai4educ.counselorbot.teacher` | `%LOCALAPPDATA%\org.ai4educ.counselorbot.teacher` | `${XDG_DATA_HOME:-~/.local/share}/org.ai4educ.counselorbot.teacher` |
| studente (Fase 2) | `org.ai4educ.counselorbot.student` | idem con `.student` | idem | idem |

Il codice non scrive mai nella cartella del programma (sola lettura in `.app`, `/usr/lib`, `Program Files`).

### 1.2 Contenuto (layout 1)

```
<radice>/
├── layout.json              {"layout": 1, "app": "teacher", "created_with": "X.Y.Z"}
├── db/counselorbot.sqlite3  (+ -wal, -shm)          DATABASE_URL
├── uploads/                                         DATA_DIR
│   ├── portfolio/  tavolo/  tavolo-images/  idea-sources/  qsa/  pqbl/
├── rag/index/                                       RAG_INDEX_DIR
├── rag/collections/                                 RAG_DYNAMIC_COLLECTIONS_DIR
├── memory/sessions/                                 SESSION_MEMORY_DIR
├── memory/strategy_memory.json                      STRATEGY_MEMORY_FILE
├── credentials/                                     PERSONAL_API_CREDENTIALS_DIR (chiave Fernet, permessi 0600)
├── logs/                    shell.log, backend.log, frontend.log, cloudflared.log
├── backups/                 <AAAAMMGG-HHMMSS>-v<X.Y.Z>.sqlite3
├── run/                     shell.lock, sidecars.json (PID e porte correnti)
└── config/shell.json        preferenze non segrete: modalità tunnel, nome tunnel, porta frontend, canale updater
```

- Le chiavi API **non** stanno qui: portachiavi di sistema (Keychain, Credential Manager, Secret Service), passate
  al backend come variabili d'ambiente (contratto attuale di `backend/api_secrets.py`, nessuna modifica).
- Cartella creata dal guscio con l'utente normale (mai da un processo elevato) e permessi solo-utente (0700 su Unix).
- `layout.json` cambia numero solo con una migrazione del layout eseguita dal guscio prima di avviare i sidecar.
- I documenti di sola lettura spediti con l'app (`knowledge/`, `docs-counselorbot/`, prompt) restano nelle risorse
  del bundle: `COUNSELORBOT_DOCS_DIR`, `RAG_DOCS_DIR` puntano lì.

## 2. Interfaccia guscio ↔ sidecar

Sidecar della Fase 1: **backend**, **frontend**, **cloudflared**. Nessun Postgres (ADR-0003).

### 2.1 Avvio e ambiente

| Variabile (al backend) | Valore |
|---|---|
| `COUNSELORBOT_PROFILE` | `teacher-pc` (attiva le esclusioni di ADR-0001 e il fornitore locale) |
| `AUTH_PROVIDER` | `local` |
| `DATABASE_URL` | `sqlite:///<radice>/db/counselorbot.sqlite3` |
| percorsi del §1.2 | sempre impostati, anche se il default sembra adatto (F0-01 B5) |
| `HOST` / `PORT` | `127.0.0.1` / porta scelta dal guscio |
| `COUNSELORBOT_SHELL_SECRET` | 32 byte casuali per avvio (base64url), solo in memoria |
| `COUNSELORBOT_PUBLIC_ORIGIN` | origine pubblica del tunnel (`https://…`), aggiornata con riavvio del backend quando cambia |
| `OLLAMA_PRELOAD` | `false` |
| chiavi API | dal portachiavi |

- **Porte**: il guscio sceglie una porta libera su `127.0.0.1` (bind sulla porta 0, chiusura, passaggio al figlio;
  fino a 3 tentativi se il figlio esce con codice 4). La porta del **frontend** è salvata in `config/shell.json`
  e riusata se libera (segnalibro stabile per il docente); quella del backend cambia a ogni avvio.
- **Ordine**: backend → (health ok) → frontend con `BACKEND_ORIGIN=http://127.0.0.1:<porta backend>` (`frontend/src/lib/backend-origin.ts`) →
  (health ok) → cloudflared verso il frontend.
- uvicorn con **1 worker** (necessario anche per i lock in processo di ADR-0003 §4.2).

### 2.2 Health

- Backend: **`GET /health`** (nuova rotta, F1-02) → `200 {"status":"ok","version":"X.Y.Z","desktop_contract":1,"db":"sqlite"|"postgresql"}`.
  uvicorn accetta connessioni solo dopo il lifespan, quindi 200 = migrazioni e seed finiti.
  Nessun dato personale, nessuna autenticazione richiesta.
- Frontend: `GET /` con risposta < 500.
- cloudflared: URL letto dal suo log (quick tunnel) o nome configurato (nominativo); metriche su `--metrics 127.0.0.1:<porta>` facoltative.
- Attese: sondaggio ogni 250 ms; **timeout 180 s al primo avvio** (import 25 s su Mac non firmato + seed SQLite 5–8 s
  misurato in ADR-0003, + margine per antivirus Windows), 60 s ai successivi. Durante l'attesa il pannello mostra «Preparazione…».
- Il guscio confronta `version` e `desktop_contract` con i propri: se diversi, mostra errore e non pubblica il tunnel.

### 2.3 Log

- stdout e stderr di ogni sidecar vanno **su file** in `logs/` (mai su pipe lette dal guscio: su Windows una pipe
  ereditata può bloccare il guscio, F0-02 §6). Rotazione a cura del guscio all'avvio: 5 file da 10 MB.
- I log non contengono segreti: niente chiavi API, `COUNSELORBOT_SHELL_SECRET`, token di sessione o chiavi di abbinamento.
- «Esporta diagnostica» nel pannello: zip di `logs/` + `layout.json` + versione, senza database.

### 2.4 Arresto (anche quando il guscio viene ucciso)

Tre difese, tutte obbligatorie:

1. **Pipe di vita su stdin** (tutti i sistemi): il guscio avvia ogni sidecar che controlla (backend, frontend) con
   stdin collegato a una pipe che tiene aperta e non scrive mai. Il sidecar ha un thread che legge stdin:
   a **EOF** avvia l'arresto pulito (uvicorn `should_exit`, Node `server.close()`), e dopo 10 s esce comunque.
   Quando il guscio muore per qualsiasi motivo (crash, SIGKILL, «Termina processo») il sistema chiude la pipe:
   è il caso che F0-01 ha visto fallire. Per il frontend serve un piccolo avvio `server-wrapper.js` attorno a `server.js` standalone.
2. **Windows: Job Object** con `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`: tutti i sidecar (anche `cloudflared`, che non
   possiamo modificare) vengono chiusi dal sistema quando il guscio termina. Processi avviati con `CREATE_NO_WINDOW`.
   Linux: `prctl(PR_SET_PDEATHSIG, SIGTERM)` nel figlio come rinforzo.
3. **Pulizia al riavvio**: `run/sidecars.json` registra PID, nome eseguibile e ora di avvio. Al lancio successivo il
   guscio termina i processi rimasti **solo se** PID, nome e ora di avvio coincidono (mai PID riciclati da altri programmi).
   Copre `cloudflared` su macOS/Linux.

Arresto normale (finestra chiusa / «Esci»): SIGTERM (Unix) o chiusura della pipe (Windows) → attesa 10 s → kill.
Ordine inverso: cloudflared → frontend → backend. Istanza unica: plugin single-instance di Tauri + `run/shell.lock`.

### 2.5 Codici di uscita del backend

| Codice | Significato | Il guscio |
|---|---|---|
| 0 | arresto richiesto | — |
| 3 | cartella dati o database inutilizzabile (permessi, disco pieno, `PRAGMA integrity_check` fallito) | mostra errore, propone il ripristino dall'ultimo backup |
| 4 | porta occupata | riprova con un'altra porta (max 3) |
| altro | crash | riavvia fino a 3 volte in 5 minuti, poi errore con «Esporta diagnostica» |

### 2.6 Rotte interne

`/internal/*` serve solo al guscio: risponde **solo** se la richiesta arriva da loopback, non porta nessuna intestazione
`Cf-*`, `X-Forwarded-*`, e presenta `X-CounselorBot-Shell-Secret` uguale a `COUNSELORBOT_SHELL_SECRET`
(confronto a tempo costante). Il rewrite di Next (`/api/:path*` → backend, `frontend/next.config.ts:39-46`) inoltrerebbe
`/api/internal/*`: il frontend lo **blocca** con 404 e il backend lo rifiuta comunque per le intestazioni `X-Forwarded-*` (test in F1-02).

## 3. Identità locale (fornitore `local`, parte di #209)

### 3.1 Interfaccia

- `AUTH_PROVIDER` ∈ {`ai4auth` (default: comportamento attuale, invariato), `local` (teacher-pc), `institute` (#212, futuro)}.
- Tutti i fornitori restituiscono lo **stesso dizionario** di oggi (`backend/auth.py`: `email`, `username`, `name`,
  `groups`, `is_admin`, `is_researcher`, `authenticated`) più `auth_provider`. Le rotte non cambiano.
- Con `local` le intestazioni `Remote-*` e la verifica ai4auth sono **disattivate** (nessun segreto di proxy accettato).

### 3.2 Sessioni

- Cookie **`cb_session`**: token opaco di 32 byte casuali (base64url); nel database solo lo **SHA-256**.
  `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` quando l'origine è `https` (tunnel); senza `Secure` su `http://127.0.0.1`.
- Tabella `local_sessions`: `id`, `token_hash` (unico), `username`, `kind` (`teacher`|`student`), `device_label`,
  `created_at`, `last_seen_at` (aggiornato al massimo una volta l'ora), `expires_at`, `revoked_at`.
  Controllo a ogni richiesta, **nessuna cache**: la revoca è immediata.
- Durata: docente 30 giorni; studente 180 giorni (un anno scolastico in due rinnovi), scadenza scorrevole.

### 3.3 Docente (admin locale)

- Nessuna password in Fase 1. Il guscio ottiene un **link monouso**: `POST /internal/local-auth/teacher-link`
  → `{token, expires_in: 60}`; apre `http://127.0.0.1:<frontend>/accesso-locale#t=<token>`; la pagina invia il token
  a `POST /api/local-auth/redeem` e riceve `cb_session` di tipo `teacher`. «Apri nel browser» del pannello ripete il giro.
- Identità: `username = "docente"`, `groups = ["docenti", "admins"]` → `is_admin = true` (#208: sul PC il docente è admin).
- **Difesa in profondità**: una sessione `teacher` presentata in una richiesta con intestazioni `Cf-*` (cioè arrivata
  dal tunnel) è trattata come anonima. Le rotte admin/docente non sono quindi mai usabili dal tunnel (test 403 in F1-07).

### 3.4 Studenti

- Identità: `username = "s-<10 caratteri base32>"` generato, immutabile; `name` = **pseudonimo** scelto dallo studente
  (modificabile dal docente); `groups = ["studenti"]`; nessuna email (stringa vuota).
- Membro della classe (`StudentGroup`) del codice usato.

## 4. Abbinamento e token degli studenti

### 4.1 Codice di classe

- Tabella `class_pairing_codes`: `id`, `group_id`, `key_hash` (SHA-256), `created_at`, `expires_at` (default **7 giorni**),
  `revoked_at`, `uses`, `max_uses` (facoltativo), `requires_approval` (default `false`).
- Chiave: **32 byte casuali** (256 bit, base64url). Link e QR: `https://<host del tunnel>/unisciti#k=<chiave>`.
  La chiave sta nel **frammento**: non arriva nei log di Cloudflare, `cloudflared`, Next o backend.
- «Nuovo codice» revoca il precedente; chi è già abbinato resta dentro.

### 4.2 API

Rotte del backend; dal browser si chiamano con il prefisso `/api` (rewrite di Next), es. `/api/local-auth/pair`.

| Metodo e rotta | Chi | Corpo / risposta | Errori |
|---|---|---|---|
| `POST /local-auth/pair` | chiunque | `{key, pseudonym, device_label?}` → `201 {username, pseudonym, group_id, status: "active"|"pending", personal_code}` + cookie | `400 invalid_payload`; `401 invalid_or_expired_code` (stessa risposta per chiave inesistente, scaduta o revocata); `429 rate_limited` + `Retry-After` |
| `POST /local-auth/recover` | chiunque | `{personal_code, device_label?}` → `200 {username, pseudonym}` + cookie | `401 invalid_code`; `429` |
| `POST /local-auth/redeem` | guscio/docente | `{token}` → `204` + cookie | `401` |
| `POST /local-auth/logout` | sessione | → `204`, revoca la sessione corrente | — |
| `GET /local-auth/devices` | docente | sessioni attive e in attesa per classe | `403` |
| `POST /local-auth/devices/{id}/approve` | docente | → `204` | `403`, `404` |
| `DELETE /local-auth/devices/{id}` | docente | revoca immediata | `403`, `404` |
| `POST /local-auth/students/{username}/personal-code` | docente | rigenera il codice personale → `{personal_code}` | `403`, `404` |
| `POST /local-auth/classes/{group_id}/pairing-code` | docente | nuovo codice → `{link, expires_at}` | `403`, `404` |

- **Pseudonimi**: mai un errore «nome già usato» (rivelerebbe chi c'è): se lo pseudonimo esiste nella classe si
  aggiunge un suffisso (`Luna` → `Luna 2`) e la risposta riporta quello assegnato.
- **Codice personale**: 12 caratteri base32 (60 bit), mostrato **una volta** all'abbinamento, salvato come hash.
  Serve a rientrare da un altro dispositivo o dopo il cambio di URL del quick tunnel (i cookie sono legati al dominio).
  Se perso, il docente lo rigenera.
- `status: "pending"` se `requires_approval`: l'identità esiste ma `authenticated = false` finché il docente non approva.

### 4.3 Limiti

- IP del client = `CF-Connecting-IP` (solo se la richiesta arriva dal tunnel), altrimenti l'indirizzo della connessione.
- `pair` e `recover`: 10 tentativi al minuto per IP, 60 al minuto per classe; dopo 10 errori consecutivi da un IP,
  blocco di 15 minuti. Contatori in memoria (1 worker): si azzerano al riavvio, accettabile.
- Nessun messaggio o tempo di risposta che distingua «classe inesistente», «codice scaduto», «codice revocato».

## 5. Conseguenze

- F1-02 implementa §1–§2, F1-06 §3, F1-13 §4; F1-07 aggiunge i test 403 dal tunnel.
- Le nuove tabelle (`local_sessions`, `class_pairing_codes`) nascono portabili Postgres/SQLite (regole di ADR-0003 §6).
- Le rotte `local-auth` esistono solo con `AUTH_PROVIDER=local`: il profilo Console non cambia.
- Il quick tunnel cambia URL a ogni avvio: QR rigenerato, studenti rientrano con il codice personale. Con il tunnel
  nominativo il problema non si pone.
