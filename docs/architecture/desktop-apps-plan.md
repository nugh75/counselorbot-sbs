# Piano: app desktop per docente e studente

Stato: **Fase 0 chiusa, contratti congelati** negli ADR [0001](adr/0001-installation-profiles-and-desktop-packaging.md),
[0002](adr/0002-desktop-phase-1-contracts.md), [0003](adr/0003-dual-database-postgres-sqlite.md) (F0-04, 2026-10-24).
Prima stesura: 2026-10-23, `main` @ `a92bb430`. Epic #499 e milestone «Desktop apps» su GitHub.

> **Decisione dell'utente del 24/10 — doppio database.** Server e portable restano su Postgres; le app desktop
> (docente e studente) usano **SQLite**; il backend è compatibile con entrambi, con test su tutti e due in CI.
> Sostituisce il Postgres incorporato (D4, §3.3): dettagli in [ADR-0003](adr/0003-dual-database-postgres-sqlite.md).
> Le altre decisioni provvisorie dell'utente (firma, pilota, tunnel, pseudonimi, release, esclusioni, piattaforme) sono in §9.

Le sezioni 1–2 sono pensate per chi non è tecnico; dalla 3 in poi il piano entra nei dettagli.

---

## 1. Sintesi e decisioni consigliate

**Cosa si vuole.** Oggi CounselorBot gira su un server (o sul Mac della Console) con Docker.
L'obiettivo è che un docente scarichi **un'app**, la apra con un clic e abbia sul proprio PC
tutto CounselorBot: dati, backend e le proprie chiavi API (o un modello locale). Gli studenti
si collegano a quell'app attraverso un tunnel Cloudflare gratuito e un codice/QR con chiave.

- **Fase 1 — app docente.** Avvio in un clic, tunnel, codice e QR di connessione. Gli studenti
  usano il **browser** (nessuna installazione).
- **Fase 2 — app studente.** App nativa con modalità **offline** che si **sincronizza** con
  l'app docente quando il docente è raggiungibile.
- **Vincoli.** Mac, Windows, Linux; release delle app agganciate a quelle del progetto madre
  (stesso repository, stessa versione, build automatica in CI); docente e studente possono
  usare un **LLM locale** (Ollama, LM Studio, qualunque server compatibile OpenAI).

### Decisioni consigliate (in breve)

| # | Tema | Raccomandazione | Alternative scartate (perché) |
|---|------|-----------------|-------------------------------|
| D1 | Contenitore dell'app | **Tauri v2** come guscio leggero che avvia dei *sidecar* (programmi inclusi): backend Python, server Next.js, `cloudflared` (confermato da F0-01) | **Electron**: valido (Node incluso, utile a Next.js), ma +~100 MB per app e due motori da aggiornare; resta il piano B se WebKitGTK su Linux dà problemi. **Docker Desktop + launcher**: richiede installazione pesante, diritti di amministratore e virtualizzazione: contrario all'«un clic». |
| D2 | Backend | Lo stesso FastAPI della madre, impacchettato con **PyInstaller** (modalità *onedir*) per ogni sistema, come già fatto per l'helper ChatGPT | Riscrivere il backend: fuori discussione. Nuitka: più lento da compilare, nessun vantaggio dimostrato qui. |
| D3 | Frontend | Il build **standalone** di Next.js già prodotto oggi, eseguito da un runtime Node incluso | **Export statico** servito da FastAPI: elimina Node ma richiede di rifare 12 route dinamiche e 4 route API (vedi §3.2): da valutare dopo. |
| D4 | Database | **SQLite** nelle app desktop, **Postgres 15** su server e portable; backend unico compatibile con entrambi, CI su entrambi (decisione dell'utente del 24/10, [ADR-0003](adr/0003-dual-database-postgres-sqlite.md)) | **Postgres incorporato**: fattibile (spike F0-02), ma +22–110 MB per piattaforma e gestione di `initdb`/`pg_ctl`/`pg_upgrade`; scartato dall'utente. |
| D5 | Tunnel | **Tunnel nominativo Cloudflare** (gratuito, con un account Cloudflare) come modalità consigliata; **quick tunnel** (`trycloudflare.com`) come modalità «prova subito» con limiti dichiarati | Solo quick tunnel: Cloudflare lo dichiara per test, senza garanzie e **senza Server-Sent Events**, che la chat usa per lo streaming (§3.4). ngrok/Tailscale Funnel: altri account e limiti, fuori dal vincolo «Cloudflare». |
| D6 | Accesso studenti | **Codice di classe + QR** che contiene URL e **chiave di abbinamento**; ogni studente riceve poi un **token personale** revocabile; login locale gestito dall'app docente | Chiave unica condivisa per tutti: non revocabile per singolo studente. ai4auth: richiede la Console, che sul PC del docente non c'è. |
| D7 | LLM locale | Un **provider «OpenAI-compatibile personalizzato»** (URL + chiave facoltativa) accanto a Ollama, con rilevamento automatico di Ollama (`:11434`) e LM Studio (`:1234`) | Un provider dedicato per ogni server locale: duplicazione inutile, LM Studio/vLLM/llama.cpp parlano tutti `/v1/chat/completions`. |
| D8 | App studente (Fase 2) | **Tauri v2** con UI ridotta e **SQLite locale cifrato**; sincronizzazione a **registro di eventi** (append-only) verso l'app docente | Copia completa dell'app docente sul PC studente: espone prompt, dati di altri studenti e chiavi. |
| D9 | Release | **Stesso tag** della madre (`vX.Y.Z`) → workflow GitHub Actions con matrice mac/win/linux → asset nella stessa GitHub Release; aggiornamento con l'updater firmato di Tauri | Repository separato per le app: rompe il legame di versione richiesto. |
| D10 | Firma | Partire **non firmati** con istruzioni (come già deciso per gli helper, #135); preparare la pipeline perché firmi **solo se** trova le credenziali; decisione su costi rinviata all'utente | Comprare subito certificati: decisione di spesa che spetta all'utente (#135 la blocca esplicitamente). |

**Stima complessiva (indicativa, lavoro di agenti + revisione dell'utente):**
Fase 0 (spike e contratti) ~1 settimana (chiusa); **Fase 1 ~6–8 settimane** (era 5–7: la compatibilità SQLite, F1-05a..j, vale ~19 giorni di lavoro in buona parte parallelo); **Fase 2 ~5–8 settimane** (F2-02 si riduce).
Le stime sono larghe perché il packaging cross-platform si scopre solo provando sulle tre piattaforme.

---

## 2. Cosa c'è già e si può riusare

### 2.1 Lo stack portabile

`docker-compose.portable.yml` è già quasi una «app per una macchina»:

| Pezzo | Dove | Cosa ci dice per il desktop |
|------|------|------------------------------|
| Postgres 15 | `docker-compose.portable.yml:6-23` | DB interno, un solo volume `postgres_data`: sul desktop è **sostituito da SQLite** (ADR-0003). |
| Piper (sintesi vocale) | `docker-compose.portable.yml:25-43` | Servizio separato, 2 GB di RAM massimi: in Fase 1 **opzionale** (l'audio ha già altri motori, es. `edge-tts` in `backend/requirements.txt`). |
| Backend FastAPI | `docker-compose.portable.yml:45-103` | Un solo worker (`:51`), `OLLAMA_PRELOAD=false` (`:59`), `host.docker.internal` per raggiungere un Ollama sull'host (`:77`). Tutte le cartelle dati sono variabili d'ambiente (`:62-72`): basta puntarle alla cartella dati dell'app. |
| Frontend Next.js | `docker-compose.portable.yml:105-137` | Build di produzione `standalone` (`frontend/next.config.ts:6`, `frontend/Dockerfile` stadio `runner`). |
| Pubblicazione | `docs/operations/portable-installation.md:105-133` | Oggi passa dal **tunnel wildcard della Console** e da nginx della Console (`scripts/register-portable-console.mjs`): sul PC del docente non ci sono, quindi l'app deve avviare il proprio `cloudflared`. |
| Autenticazione | `backend/auth.py:83-114` | Identità da header `Remote-*` fidati (segreto condiviso `FORWARD_AUTH_SHARED_SECRET`, `:24`) **oppure** verifica del cookie ai4auth. Sul desktop serve un terzo fornitore: login locale (#209). L'iniezione di identità di `frontend/src/proxy.ts` vale solo in sviluppo. |
| Richiesta API | `frontend/next.config.ts:37-46`, `frontend/src/app/api/chat/stream/route.ts` | Next fa da proxy verso il backend; lo streaming della chat (SSE) passa da route dedicate perché il rewrite bufferizza. |

**ai4auth** è pertinente solo al profilo Console: per il desktop serve l'interfaccia
di autenticazione intercambiabile prevista da #209.

### 2.2 Dipendenze native del backend

`backend/Dockerfile:12-14` installa `poppler-utils` (PDF → immagini), `graphviz` (diagrammi),
`tesseract-ocr-ita/eng` (OCR dei PDF RAG). Il codice già degrada se `dot` manca
(`backend/diagram_render.py:877`, `:901`). Sul desktop vanno **inclusi** o resi
**facoltativi con messaggio chiaro** (compito F1-04). Esito: [`desktop-native-deps.md`](desktop-native-deps.md).

### 2.3 Provider LLM già supportati

- `AIService` (`backend/ai_service.py`) gestisce 13 provider (vedi `CONTEXT.md` §AI Providers).
- Provider compatibili OpenAI con URL fisso: `backend/ai_service.py:106-114` (groq, cerebras,
  deepseek, together, fireworks, deepinfra, omniroute). OpenRouter ha URL proprio (`:795`, `:1120-1122`).
- **Locali**: `LOCAL_PROVIDERS = {'ollama', 'llamacpp'}` (`:117`), esclusi dall'anonimizzazione verso l'esterno.
  - Ollama: API nativa `/api/chat`, URL da `OLLAMA_BASE_URL`/config `ollama_ip`, default `http://localhost:11434` (`:92`, `:1294`).
  - `llamacpp`: client OpenAI generico su `<url>/v1` (`:1335-1345`), URL da `LLAMACPP_BASE_URL` (`:97`).
    **Funziona già con LM Studio** (`http://localhost:1234/v1`) e con qualunque server OpenAI-compatibile,
    ma la chiave è fissa (`api_key="llamacpp"`, `:1345`): un server interno **con chiave** (vLLM, LiteLLM) non funziona.
  - Pannello admin: campi «Ollama IP Address» e «llama.cpp / llama-swap URL» (`frontend/src/components/admin/ConfigForm.tsx:670-671`).
- Embedding: `ollama`, `mistral`, `openrouter`, `none` (`backend/embedding_service.py:38`), default Ollama `qwen3-embedding:4b` (`:40`). BM25 è sempre attivo: la ricerca funziona anche senza embedding.
- Filtro dati personali con NER locale via Ollama (`backend/pii_ner.py:24`); senza Ollama si usa il filtro `basic` (`CONTEXT.md` Quick Reference, «Protezione dei provider esterni»).
- Chiavi API: **solo da variabili d'ambiente** (`backend/api_secrets.py:10-23`); l'admin vede solo se sono configurate. Le API personali per utente sono cifrate con Fernet e chiave in un volume (`backend/credential_storage.py`, `backend/personal_api.py:30-90`).

### 2.4 Database e migrazioni

- `backend/database.py:8`: default `sqlite:///./counselorbot.db`; produzione usa Postgres.
- Schema: 112 modelli in `backend/models.py`, 94 colonne `JSON` generiche (portabili).
- Migrazioni: **nessun Alembic**. `create_all` (`backend/main.py:206`) più migrazioni idempotenti a mano
  in `backend/main.py` (`_seed_and_migrate`, `:328`) e in 23 file `backend/migrations/*.py`.

### 2.5 Profili di installazione già pianificati (milestone «Installation profiles: teacher desktop and school server»)

| Issue | Contenuto | Relazione con questo piano |
|------|-----------|-----------------------------|
| #207 | ADR dei tre profili (Console, PC docente, server di scuola) e packaging; cita i limiti del quick tunnel | **Chiusa** da [ADR-0001](adr/0001-installation-profiles-and-desktop-packaging.md) (il server di scuola resta in #212) |
| #208 | Ruoli admin per profilo (sul PC docente il docente è admin) | Prerequisito di F1 (compito F1-07) |
| #209 | Auth intercambiabile: ai4auth / locale / istituto | Prerequisito di F1 (F1-06) |
| #210 | Installer: `.env` locale, chiavi API locali, avvio, health check | Sostituita dall'app Tauri (F1-02, F1-08) |
| #211 | `cloudflared` automatico, URL pubblico, messaggio da condividere | F1-09 |
| #212 | Server di scuola senza Console | Fuori da questo piano, ma riusa auth e Postgres |
| #213 | Documentazione e test dell'app docente | F1-14 |
| #214 | Dominio personalizzato per link stabile | F1-10 (tunnel nominativo) |
| #135 | Firma degli helper Windows/macOS, **bloccata su decisione dell'utente** | Stessa decisione vale per le app (§6.3) |

### 2.6 Release e CI esistenti

- Workflow: `.github/workflows/chatgpt-windows-helper.yml` (PyInstaller su `windows-latest`, artefatto zip + sha256),
  `platform-guidance.yml`, `rag-retrieval.yml`, `release-drafter.yml`.
- `.github/release-drafter.yml:1-2`: tag `v$RESOLVED_VERSION`; esiste una sola bozza `v0.1.0`, **nessun tag pubblicato**.
  `frontend/package.json:3` è `0.1.0`. Il versioning della madre va quindi **avviato** (prerequisito di §6).
- `scripts/build-chatgpt-windows.sh:8`: decisione 2026-10-09, helper distribuiti **non firmati**.
- Licenza **AGPL-3.0** (`LICENSE`), repository pubblico: distribuire le app e servirle agli studenti via rete è compatibile, purché il link al sorgente resti visibile nell'app.

---

## 3. Fase 1 — App docente

### 3.1 Architettura

```
PC del docente
┌───────────────────────────────────────────────────────────────┐
│ App Tauri (guscio, ~10 MB)                                    │
│  pannello: Avvia/Ferma · stato · QR · chiavi API · LLM locale │
│   │ avvia e sorveglia i sidecar (porte su 127.0.0.1)          │
│   ├─ backend   (PyInstaller, uvicorn 1 worker)                │
│   ├─ frontend  (node + .next/standalone)                      │
│   └─ cloudflared (quick o named tunnel → frontend)            │
└───────────────────────────────────────────────────────────────┘
          ▲ HTTPS (Cloudflare)                ▲ http://127.0.0.1
   browser degli studenti                docente nella finestra dell'app
```

- Tutto ascolta solo su `127.0.0.1`; l'unica porta d'ingresso esterna è il tunnel (in uscita, nessuna porta aperta sul router).
- Il docente usa l'app nella finestra Tauri o nel proprio browser (`http://127.0.0.1:<porta>`), già autenticato come admin locale.
- Database: **SQLite** in un file della cartella dati (ADR-0003); nessun sidecar Postgres.
- Cartella dati: `app_local_data_dir()` di Tauri con identificatore `org.ai4educ.counselorbot.teacher` (macOS `~/Library/Application Support/…`, Windows `%LOCALAPPDATA%\…`, Linux `~/.local/share/…`). Lì: database SQLite, memoria sessioni, indici RAG, upload, chiavi cifrate, log, backup. Layout e variabili d'ambiente congelati in [ADR-0002 §1](adr/0002-desktop-phase-1-contracts.md).

### 3.2 Packaging cross-platform

| Criterio | Tauri v2 + sidecar | Electron + processi figli | Launcher + Docker |
|----------|--------------------|---------------------------|-------------------|
| Peso guscio | piccolo (usa la webview di sistema) | +Chromium e Node (~100 MB, stima) | piccolo, ma richiede Docker Desktop (GB) |
| Next.js standalone | serve un binario Node come sidecar | gira nel Node di Electron | nel container |
| Webview | WebView2 / WKWebView / WebKitGTK: rischio di differenze su Linux | Chromium uguale ovunque | browser di sistema |
| Sidecar | supporto nativo: `bundle.externalBin`, binari con suffisso *target triple* ([Tauri, Sidecar](https://v2.tauri.app/develop/sidecar/)) | `child_process`, gestione manuale | container |
| Updater | plugin ufficiale, firma obbligatoria, JSON statico su GitHub Releases ([Tauri, Updater](https://v2.tauri.app/plugin/updater/)) | `electron-updater` maturo | aggiornamento immagini |
| Diritti admin all'installazione | no (installer per utente possibili) | no | sì (Docker Desktop) |
| Competenze richieste | un po' di Rust nel guscio | solo JS/TS | shell |

**Raccomandazione: Tauri v2.** Il peso vero dell'app è backend + Postgres + Node (centinaia di MB in ogni caso),
quindi il vantaggio di Tauri non è la dimensione ma: sidecar e updater firmato «di serie», azione CI ufficiale
per build multipiattaforma, permessi espliciti. Il guscio contiene poca logica (avvio, sorveglianza, pannello):
Rust minimo. **Piano B: Electron**, se lo spike F0-01 mostra problemi gravi con WebKitGTK su Linux;
in quel caso la UI principale si apre comunque nel browser di sistema e la webview mostra solo il pannello.

**Backend con PyInstaller.** Stessa strada dell'helper ChatGPT (`scripts/build-chatgpt-windows.sh`), ma in modalità
*onedir* (avvio più rapido di *onefile*). Va incluso: `backend/prompts/`, `backend/*.json`, `backend/diagram_icons/`,
`knowledge/`, `docs-counselorbot/` (grounding), come fa oggi il `Dockerfile`. PyInstaller **non compila in modo incrociato**:
ogni sistema si compila sul proprio runner (`scripts/build-chatgpt-windows.sh:6-7`).
Da verificare nello spike: `pymupdf`, `numpy`, `cryptography`, `argon2-cffi` (estensioni native) su macOS arm64/x64 e Windows.

**Frontend.** Fase 1: `next build` → `.next/standalone` + `node` per piattaforma come sidecar. Nessuna modifica al codice.
Export statico (scartato per ora): 12 route dinamiche senza `generateStaticParams`
(es. `/docente/classi/[id]`, `/tavolo/[id]`, `/profilo/piani-operativi/[pathId]/[stepId]`), 4 route API
(`frontend/src/app/api/{chat,site-chat,tts}/stream`, `api/opencode/workspace/[key]/chat`), rewrite e redirect
in `frontend/next.config.ts` andrebbero tutti riportati in FastAPI.

**Variabili di build.** Fatto in F1-03: il frontend non incorpora più URL al build. `COUNSELORBOT_APP_URL`,
`COUNSELORBOT_AUTH_URL`, `COUNSELORBOT_PORTAL_URL`, `COUNSELORBOT_MANAGER_URL`, `COUNSELORBOT_PROJECT_ID` si leggono
all'avvio del server Next e arrivano al browser da `/runtime-config.js` (`frontend/src/lib/runtime-config.ts`), caricato
prima dell'idratazione; le chiamate API erano già relative (`/api`). La stessa build standalone serve Docker e desktop:
il guscio passa le variabili all'avvio del sidecar frontend (o le omette: valgono i default ai4educ).

### 3.3 Database: SQLite sul desktop, Postgres sui server

**Decisione dell'utente (24/10): doppio database** — [ADR-0003](adr/0003-dual-database-postgres-sqlite.md).
La prima stesura di questa sezione consigliava Postgres incorporato perché il backend usa costrutti Postgres
in molti punti; lo spike [F0-02](spikes/f0-02-embedded-postgres.md) ne ha dimostrato la fattibilità, ma l'utente ha scelto SQLite.

Misure su `main` @ `b69e591a` (ADR-0003 §1–§2):
- un database SQLite **nuovo** si crea già: `create_all` produce le 112 tabelle; il seed si ferma su 6 statement
  `ADD COLUMN IF NOT EXISTS` in 3 file e, con quelli neutralizzati, completa in 5–8 s;
- a runtime falliscono **5 advisory lock non protetti** e **1 `date_trunc`** (`routes/admin.py:659`);
- semantica da correggere: `DateTime(timezone=True)` (161 colonne) torna senza fuso, chiavi esterne spente di default,
  2 indici unici parziali senza `WHERE`, CHECK che cambiano tra versioni (aggiornamenti dei database esistenti);
- la suite di test è oggi solo Postgres: va resa indipendente dal dialetto, con CI su entrambi.

Il lavoro è diviso nei blocchi **F1-05a..j** (§8). Backup: copia consistente del file con l'API di backup di SQLite
(F1-05j), prima di ogni aggiornamento (F1-16).

### 3.4 Tunnel

**Quick tunnel (`cloudflared tunnel --url http://127.0.0.1:<porta>`)** — dalla documentazione Cloudflare
([TryCloudflare](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/)):
- non serve account né dominio;
- l'URL **cambia a ogni avvio** e smette di funzionare quando `cloudflared` si ferma;
- massimo **200 richieste contemporanee** (oltre: `429`);
- **non supporta Server-Sent Events**;
- nessuna garanzia di disponibilità; pensato «per test e sviluppo».

**Misurato in F0-03** ([report](spikes/f0-03-tunnel-sse.md)): le risposte SSE in `POST` (tutte quelle di CounselorBot)
scorrono in streaming reale; sono bufferizzate solo le `GET`. Il limite pratico è il **taglio a ~60 s senza byte**
(prima delle intestazioni o nel corpo): serve un heartbeat `: ping` ogni 15 s. Nessun 429 fino a 270 richieste contemporanee.
Il testo che segue è la stima precedente allo spike.

Conseguenze per CounselorBot: la chat, il sito-chat e la lettura vocale usano SSE
(`frontend/src/app/api/*/stream/route.ts`). **Con il quick tunnel lo streaming va considerato non funzionante**
finché lo spike F0-03 non lo misura. Per una classe di 30 il limite di 200 richieste è sufficiente,
ma ogni pagina fa più richieste parallele: va misurato. Condizioni d'uso (ToS) Cloudflare per uso
continuativo con studenti: **non verificato**, da leggere prima di consigliarlo per lezioni reali.

**Tunnel nominativo** (account Cloudflare gratuito + dominio gestito da Cloudflare DNS):
URL stabile (es. `prof-rossi.dominio.it`), nessun tetto di 200 richieste dichiarato; limiti di account:
1.000 tunnel e 25 repliche per tunnel ([Cloudflare One, limiti](https://developers.cloudflare.com/cloudflare-one/account-limits/)).
SSE attraverso il proxy Cloudflare: funziona secondo fonti non ufficiali, con un limite di circa 100 s
per ricevere le intestazioni della risposta e chiusura degli stream silenziosi: servono **heartbeat** SSE
(da verificare in F0-03; non trovata documentazione ufficiale specifica per i tunnel).

**Modello consigliato a due livelli:**
1. **«Prova subito»** — quick tunnel, nessuna configurazione, **solo per prove** (decisione dell'utente): link che cambia
   a ogni avvio, nessuna garanzia, uso «di prova» secondo Cloudflare. Lo streaming funziona (F0-03), con heartbeat (F1-11).
2. **«Classe stabile»** — tunnel nominativo: l'app guida il docente al login Cloudflare (`cloudflared tunnel login`)
   e crea tunnel + record DNS sul **dominio Cloudflare del docente** (decisione dell'utente su Q3; per il proprietario `labform.net`).
   Nessun servizio centrale del progetto.

Alternative non Cloudflare (ngrok, Tailscale Funnel, Pinggy): escluse dal vincolo, citate solo come piano C.

### 3.5 Chiave e abbinamento

Contratto congelato (API, tabelle, durate, limiti, codice personale per il rientro): [ADR-0002 §3–§4](adr/0002-desktop-phase-1-contracts.md).
Questa sezione resta come sintesi.

- **Codice di classe** = URL del tunnel + identificativo classe + **chiave di abbinamento** casuale (≥128 bit),
  mostrato come QR e come link `https://<tunnel>/unisciti#k=<chiave>` (la chiave nel frammento `#` non finisce nei log).
- Lo studente apre il link, sceglie nome/pseudonimo (o il docente pre-crea gli account), il backend scambia la chiave
  con un **token personale** (cookie `HttpOnly`, `Secure`, `SameSite=Lax`) e il dispositivo compare nell'elenco del docente.
- **Rotazione**: «Nuovo codice» invalida la chiave di abbinamento senza scollegare chi è già dentro;
  scadenza automatica (es. 7 giorni, configurabile). **Revoca**: per studente/dispositivo, immediata.
- **Rate limit**: tentativi di abbinamento e login per IP (header `CF-Connecting-IP`) e per classe;
  blocco temporaneo dopo N errori; nessun contatore che riveli se un nome esiste.
- **HTTPS**: garantito da Cloudflare fino al PC; tratto `cloudflared → 127.0.0.1` locale in chiaro (accettabile).
- Il token sostituisce gli header `Remote-*`: nuovo fornitore di identità in `backend/auth.py` (dipende da #209).
- Con il quick tunnel l'URL cambia: il QR va rigenerato a ogni avvio; i token restano validi (sono legati al backend, non all'URL),
  ma i cookie sono per dominio → lo studente deve riaprire il nuovo link (con il tunnel nominativo il problema sparisce).

### 3.6 PC del docente spento o in sospensione

- **Fase 1**: se il PC dorme, il tunnel cade e gli studenti vedono una pagina d'errore Cloudflare. Mitigazioni:
  l'app impedisce la sospensione **mentre una lezione è attiva** (API di sistema: `caffeinate`/IOKit su macOS,
  `SetThreadExecutionState` su Windows, inibizione systemd su Linux); avviso nel pannello; il frontend mostra
  «Il docente è offline» e conserva le bozze nel browser (oggi `ChatContinuation` riprende già le risposte interrotte, `CONTEXT.md` §Notes).
- Al risveglio: i sidecar ripartono se morti, il quick tunnel genera **un URL nuovo** (problema), il nominativo no.
- **Fase 2** risolve davvero il caso: l'app studente lavora offline e sincronizza dopo.

### 3.7 Ruoli e chiavi API sul PC del docente

- Profilo «teacher-pc»: il docente è anche admin (#208), ma le funzioni da laboratorio (Prompt Lab, impersonazione, OpenCode)
  restano nascoste di default.
- Chiavi API: inserite nel pannello Tauri e salvate nel **portachiavi del sistema** (Keychain, Credential Manager, Secret Service);
  il guscio le passa al backend come variabili d'ambiente all'avvio. Resta valido il contratto attuale
  «chiavi solo da ambiente» (`backend/api_secrets.py`): **nessuna modifica al backend**.

---

## 4. Fase 2 — App studente

### 4.1 Stack

- **Tauri v2** (stesso guscio, altra configurazione), UI ridotta: chat guidata, questionari, taccuino, tavolo, obiettivi.
  Non include pannelli docente/admin.
- Due possibilità per il motore locale:
  - **A (consigliata)**: stesso backend Python in modalità «studente», con **SQLite** e solo le tabelle dello studente.
    Riusa prompt e logica di chat; il backend è già compatibile SQLite dopo F1-05a..j (ADR-0003), F2-02 sceglie il sottoinsieme.
  - **B**: logica in TypeScript/Rust: riscrittura dei prompt e del flusso guidato → scartata.
- Dati locali **cifrati** (SQLCipher o cifratura a livello di file con chiave nel portachiavi del sistema).

### 4.2 Cosa resta dove

| Dato | PC studente | PC docente |
|------|-------------|------------|
| Conversazioni, taccuino, mappe, bozze | sì (originale) | copia **solo se** lo studente o la classe lo prevede (come oggi la visibilità al docente) |
| Risultati dei questionari | sì | sì (servono al docente) |
| Prompt, step guidati, skill, catalogo strategie/letture | copia in sola lettura, versionata | originale |
| Chiavi API del docente | **mai** | sì |
| Dati di altri studenti | **mai** | sì |
| Indici RAG | sottoinsieme (guida, framework) | completi |

### 4.3 Sincronizzazione

- **Registro di eventi append-only** per entità dello studente (id evento UUIDv7, autore, dispositivo, versione schema).
  Molte tabelle sono già append-only (`IdeaMapRevision`, `TavoloRevision`, `prompt_revisions`): il modello si adatta bene.
- Protocollo: `POST /sync/push` (eventi nuovi dello studente) e `GET /sync/pull?since=<cursore>` (contenuti docente: prompt,
  compiti, messaggi, impostazioni di classe). Idempotente per id evento. Compressione e cifratura TLS via tunnel.
- **Conflitti**: per costruzione rari, perché ogni entità ha un solo proprietario:
  dati dello studente → vince lo studente; contenuti del docente → vince il docente;
  revisioni (mappe, tavolo) → si accodano entrambe, la più recente diventa corrente e l'altra resta nella cronologia.
  Campi singoli modificabili da entrambi (es. stato di un compito) → *last-writer-wins* con orologio logico e registro visibile.
- **Contratto da congelare prima** di scrivere client e server (F2-01): formato eventi, versione schema, cursore, errori.

### 4.4 Offline e LLM lato studente

- Offline **senza LLM**: questionari, taccuino, tavolo, lettura dei materiali sincronizzati.
- Offline **con LLM locale** (Ollama/LM Studio sul PC dello studente): chat guidata completa. Requisiti in §5.3.
- Online senza LLM locale: la chat passa all'app docente (che usa le sue chiavi o il suo LLM locale).
- L'app studente **non** riceve mai le chiavi del docente: le chiamate remote passano sempre dal backend docente.

### 4.5 Aggiornamenti

- Stesso canale e stessa versione dell'app docente; l'app studente rifiuta di sincronizzare con un'app docente
  di versione di schema incompatibile e chiede l'aggiornamento (versione di protocollo separata da quella dell'app).

---

## 5. LLM locali per docente e studente

### 5.1 Rilevamento e configurazione

- All'avvio e dal pannello «Modello»: prova `GET http://127.0.0.1:11434/v1/models` (Ollama,
  [doc Ollama](https://docs.ollama.com/api/openai-compatibility)) e `GET http://127.0.0.1:1234/v1/models` (LM Studio,
  [doc LM Studio](https://lmstudio.ai/docs/developer/openai-compat)); mostra i modelli trovati.
- Campo «Server compatibile OpenAI» per qualunque altro server (vLLM, LiteLLM, llama-server, server di scuola): URL + chiave facoltativa.
- **Modifica minima al backend** (F1-12): rendere configurabile la chiave del provider `llamacpp` (oggi fissa a `"llamacpp"`,
  `backend/ai_service.py:804`, `:1345`, `:1656`) e rinominarlo in interfaccia «Server locale / compatibile OpenAI». Tutto il resto
  (Ollama, `LOCAL_PROVIDERS`, preset) esiste già.
- Per un docente con app desktop, un Ollama su `localhost` è raggiunto direttamente (niente `host.docker.internal`).

### 5.2 Fallback

Ordine configurabile per preset: LLM locale → API remota del docente → messaggio «nessun modello disponibile».
Il backend ha già preset e riserva di sistema (`CONTEXT.md` Quick Reference, «Ricerca modelli … nei preset»);
va aggiunto il controllo di raggiungibilità del server locale con timeout breve, per non far aspettare 120 s
(`ai_timeout_seconds`).

### 5.3 Requisiti hardware indicativi (non misurati su CounselorBot)

| Uso | Modello indicativo | RAM/VRAM minima | Note |
|-----|--------------------|-----------------|------|
| Studente, PC comune | 3–4 B parametri quantizzati (es. famiglia Qwen3 4B, Gemma 3 4B) | 8 GB RAM | lento su CPU; italiano accettabile da verificare |
| Docente, uso personale | 7–9 B quantizzati | 16 GB RAM o Mac Apple Silicon 16 GB | qualità più vicina alle API |
| Docente che serve una classe | 14 B+ o API remota | GPU 12–24 GB | un LLM locale serve **una richiesta alla volta**: 30 studenti in coda |
| Embedding RAG | `qwen3-embedding` (default attuale) | +1–3 GB | facoltativo: BM25 è sempre attivo |
| NER dati personali | modello Ollama attuale | +2–4 GB | senza: filtro `basic` |

Questi valori vanno confermati con il protocollo di benchmark esistente (`benchmarks/`, `BENCHMARK_QSA.md`) prima di consigliarli.

### 5.4 Impatto su prompt, skill e fonti

- I prompt sono lunghi (direttive, skill, contesto): esistono già i **livelli di contesto** Totale/Ristretto/Minimo per
  provider/modello (`docs/operations/model-context-levels.md`): i modelli locali piccoli vanno assegnati al livello Minimo.
- Ragionamento: `backend/reasoning_profiles.py` gestisce già `disable_thinking` per famiglie come qwen3.
- Diagrammi e blocchi JSON (mappa Idea, tavolo) richiedono output strutturato affidabile: con modelli piccoli aumentano
  gli errori; esiste già una riparazione del JSON non valido e un preset di riserva (`CONTEXT.md` §Core Concepts, «Diagram generation fallback»).
- Fonti esterne (`backend/web_lookup.py`) richiedono rete: offline non disponibili.

### 5.5 Differenze rispetto alle API remote

Privacy migliore (nessun dato esce dal PC), costo zero per richiesta, ma qualità e velocità inferiori,
contesto più corto, nessun parallelismo reale per una classe, consumo di batteria. Le API remote restano
la scelta per il docente che serve molti studenti contemporaneamente.

---

## 6. Release e CI

### 6.1 Versioning allineato alla madre

- Una sola versione `X.Y.Z` per repository: tag `vX.Y.Z` (già il formato di `.github/release-drafter.yml:1-2`).
- La versione è scritta in un unico punto (es. file `VERSION`) e propagata a `frontend/package.json`, `tauri.conf.json`
  delle due app e al backend (`/version`), con un controllo CI che ne verifica l'allineamento.
- Prerequisito: oggi non esiste alcun tag pubblicato (solo la bozza `v0.1.0`). Serve decidere il ritmo delle release (Q6).

### 6.2 Build matrix

Workflow `desktop-release.yml`, attivato da **pubblicazione della Release** (o tag `v*`) e manualmente:

| Runner | Target | Prodotti |
|--------|--------|----------|
| `macos-14` (arm64) | `aarch64-apple-darwin` | `.dmg`, `.app.tar.gz` (+ `.sig`) |
| `macos-15-intel` (x64; `macos-13` è in dismissione, F0-01) | `x86_64-apple-darwin` | idem (o binario universale) |
| `windows-latest` | `x86_64-pc-windows-msvc` | `.msi`/NSIS `.exe` (+ `.sig`) |
| `ubuntu-22.04` | `x86_64-unknown-linux-gnu` | `.AppImage`, `.deb` (+ `.sig`) |

Passi per ogni runner: build PyInstaller del backend → download binari Node e `cloudflared` per il target
(versioni fissate con checksum) → `next build` → `tauri build` (azione ufficiale `tauri-action`, che carica
gli asset e genera `latest.json` per l'updater). Smoke test: avvio headless (`--smoke`), `GET /health` sul backend (ADR-0002 §2.2), stop.
Su PR: solo build Linux + smoke test, per contenere i minuti di CI.

### 6.3 Firma e notarizzazione

| Piattaforma | Senza firma | Con firma | Costo (verificato) |
|-------------|-------------|-----------|---------------------|
| macOS | Gatekeeper blocca: «Apri» da Impostazioni → Privacy e sicurezza (già documentato per l'helper) | Developer ID + notarizzazione | Apple Developer Program **99 USD/anno** ([Apple](https://developer.apple.com/programs/whats-included/)). Esistono esenzioni per enti no-profit/educativi: **non verificato** se applicabili. |
| Windows | SmartScreen «App non riconosciuta» → «Ulteriori informazioni» → «Esegui comunque» | Azure Artifact Signing (ex Trusted Signing) oppure certificato OV/EV | Artifact Signing Basic **9,99 USD/mese**, ma disponibile solo a persone/organizzazioni di USA e Canada e a **organizzazioni** di UE/Regno Unito ([InfoWorld](https://www.infoworld.com/article/3715424/understanding-microsofts-trusted-signing-service.html), [devclass, 2026](https://www.devclass.com/security/2026/01/14/code-signing-windows-apps-may-be-easier-and-more-secure-with-new-azure-artifact-service/4079554)): per un privato in Italia **non disponibile**, per un'università sì. Certificati OV/EV: prezzi variabili, non verificati. |
| Linux | nessun blocco | firma facoltativa dei pacchetti | — |
| Updater Tauri | **firma sempre obbligatoria** (chiave propria, gratuita) | — | La chiave privata va nei segreti di GitHub Actions; se si perde non si possono più distribuire aggiornamenti ([Tauri](https://v2.tauri.app/plugin/updater/)). |

Raccomandazione: pipeline che firma **solo se** trova i segreti (come prevede #135), partenza non firmata,
decisione su Apple e Windows insieme a #135.

### 6.4 Auto-update e canali

- Updater Tauri con `latest.json` sulle GitHub Releases. Canali: **stabile** (Release pubblicate) e **beta**
  (pre-release), scelti nel pannello.
- Prima di applicare un aggiornamento: backup automatico del file SQLite (F1-05j); le migrazioni della madre girano all'avvio come oggi.
- Docente e studenti devono restare compatibili: versione di protocollo di sync separata (§4.5).

---

## 7. Privacy, sicurezza, rischi

### 7.1 Dati di minori e GDPR

- Il **titolare del trattamento** è la scuola (o il docente): il PC del docente diventa il luogo dei dati.
  Servono: informativa per famiglie/studenti, base giuridica, valutazione d'impatto (DPIA) per dati di minori e profili
  psicologici (QSA, ZTPI…), registro dei trattamenti. **Questo piano non sostituisce un parere del DPO della scuola.**
- Minimizzazione: pseudonimi di default per gli studenti; nessun dato identificativo obbligatorio.
- Conservazione: la ritenzione dei log esiste (`log_retention_days`, `backend/chat_logic.py:165`); va estesa a una
  politica «fine anno scolastico» con esportazione e cancellazione.
- Provider esterni: il filtro dati personali (`basic`/`local`) resta obbligatorio verso API remote; con LLM locale
  nessun dato lascia il PC.
- Cifratura a riposo: consigliare/verificare FileVault/BitLocker/LUKS sul PC del docente; cartella dati con permessi utente.

### 7.2 Superficie d'attacco

| Rischio | Mitigazione |
|---------|-------------|
| Il tunnel espone il PC del docente su Internet | solo il frontend è pubblicato; backend, Postgres, Ollama solo su `127.0.0.1`; nessuna porta aperta sul router |
| Rotte admin raggiungibili dal tunnel | le rotte admin/docente rispondono **solo** a richieste locali (`127.0.0.1` senza header Cloudflare) o a token docente; test 403 (#208) |
| Furto del codice di classe | scadenza, rotazione, approvazione manuale opzionale dei nuovi dispositivi, revoca |
| Forza bruta su abbinamento/login | rate limit per IP e classe, chiave ≥128 bit |
| Chiavi API rubate | portachiavi di sistema, mai su disco in chiaro, mai inviate agli studenti |
| Prompt injection dagli studenti verso strumenti locali | le funzioni con effetti (OpenCode, terminale, Prompt Lab) disattivate nel profilo teacher-pc |
| Aggiornamento malevolo | updater firmato, checksum dei binari inclusi, versioni fissate |
| PC del docente compromesso | fuori dal controllo dell'app: documentare buone pratiche, backup cifrati |
| Quick tunnel per lezioni reali | uso dichiarato «test» da Cloudflare, nessuna garanzia: consigliato solo per prove |

### 7.3 Rischi di progetto

- **Pacchettizzazione su tre sistemi** (librerie native Python, Node): ridotto dagli spike F0-01/F0-02 (build verdi sui 4 runner).
- **Doppio database**: ogni nuova migrazione o SQL della madre può rompere SQLite → CI su entrambi e controllo statico (ADR-0003 §5).
- **Deriva dalla madre**: ogni nuova dipendenza nativa o servizio Compose rompe il desktop → smoke test desktop in CI.
- **Peso dell'installer** (stima 300–500 MB): accettabile per il docente, pesante per lo studente → app studente senza Piper (nessuna delle due app include Postgres).
- **Supporto utenti** su PC eterogenei per un solo sviluppatore: limitare le piattaforme ufficiali (macOS 13+, Windows 10/11 x64, Ubuntu 22.04+).

---

## 8. Piano a compiti

Legenda tier: **T1** = meccanico/piccolo (modello veloce), **T2** = implementazione standard, **T3** = architettura,
sicurezza o multipiattaforma (modello più capace + revisione). Stime in giorni di lavoro effettivo.
🔒 = implementa un contratto congelato in un ADR (non si cambia senza un nuovo ADR). ∥ = parallelizzabile.
✅ = fatto.

### Fase 0 — Spike e contratti (chiusa)

| ID | Compito | Esito | Issue |
|----|---------|-------|-------|
| F0-01 ✅ | Spike Tauri + backend PyInstaller su mac/win/linux | [report](spikes/f0-01-tauri-pyinstaller.md): verde sui 4 runner; problemi `fcntl` (→ F1-18), percorsi (→ ADR-0002), processo orfano (→ ADR-0002 §2.4) | #509 |
| F0-02 ✅ | Spike Postgres incorporato | [report](spikes/f0-02-embedded-postgres.md): fattibile; **superato** dalla decisione SQLite (ADR-0003) | #502 |
| F0-03 ✅ | Spike tunnel e SSE | [report](spikes/f0-03-tunnel-sse.md): streaming `POST` ok sul quick tunnel, taglio a 60 s senza byte → heartbeat (F1-11). Resta aperta la misura sul tunnel nominativo (#505, serve il login del proprietario) | #505 |
| F0-04 ✅ | ADR e contratti | [ADR-0001](adr/0001-installation-profiles-and-desktop-packaging.md) (chiude #207), [ADR-0002](adr/0002-desktop-phase-1-contracts.md), [ADR-0003](adr/0003-dual-database-postgres-sqlite.md) | #514 |

### Fase 1 — App docente (~6–8 settimane)

| ID | Compito | Definition of Done | Stima | Dipende da | Tier |
|----|---------|--------------------|-------|------------|------|
| F1-01 ✅ | Versione unica nel repo | File `VERSION`, script di propagazione, check CI (#501) | 1 | — | T1 |
| F1-02 🔒 | Guscio Tauri: avvio/stop/sorveglianza sidecar | ADR-0002 §1–§2: cartella dati e `layout.json`, porte, `GET /health` nel backend, log su file con rotazione, pipe di vita su stdin (backend e `server-wrapper.js`), Job Object su Windows, lifeline `--lifeline` per `cloudflared` su macOS/Linux, pulizia PID al riavvio, codici di uscita, `/internal/*` protetto. Test: uccidere il guscio con SIGKILL / «Termina processo» non lascia processi sui 3 sistemi, `cloudflared` compreso (CI) | 5 | F0-04 | T3 |
| F1-03 ∥ | Frontend senza URL fissi al build | `NEXT_PUBLIC_APP_URL` e affini letti a runtime; build standalone identica per Docker e desktop; test | 2 | F0-04 | T2 |
| F1-04 ✅ | Dipendenze native | `pdf2image`/Poppler sostituiti da PyMuPDF; `dot` rilevato a runtime (`backend/native_deps.py`, `NATIVE_BIN_DIR`, `GET /capabilities`); matrice per piattaforma in [`desktop-native-deps.md`](desktop-native-deps.md) (#516) | 3 | F0-01 | T2 |
| F1-05a 🔒 ∥ | Compatibilità SQLite — fixture e CI a doppio DB | ADR-0003 §5: `artifact_database.py` indipendente dal dialetto (`TEST_DB=postgres|sqlite`, SQLite su file con i PRAGMA desktop), marcatore `postgres_only`, cricchetto `sqlite_known_failures.txt`, `scripts/check-sql-portability.py` con eccezioni, workflow `backend-db.yml` (solo PR su `backend/**` e manuale), regola test aggiornata in `CONTEXT.md`. Report del numero di test verdi su SQLite al punto di partenza | 3 | F0-04 | T3 |
| F1-05b ∥ | Compatibilità SQLite — motore | `backend/database.py`: WAL, `busy_timeout=5000`, `foreign_keys=ON`, `synchronous=NORMAL`; controllo SQLite ≥ 3.35 (uscita 3); `is_sqlite()`/`is_postgres()` in `backend/db_compat.py`; transazioni aperte dall'evento `begin`, **`BEGIN IMMEDIATE`** per le sessioni di scrittura (`get_db` su POST/PUT/PATCH/DELETE, `write_session()`) e deferred per le letture (ADR-0003 §4.3). Test: PRAGMA attivi, cascata `ondelete` su SQLite, versione, due scritture concorrenti read-then-write senza `SQLITE_BUSY` | 1,5 | F0-04 | T2 |
| F1-05c | Compatibilità SQLite — colonne idempotenti | `add_column_if_missing` in `db_compat.py`; sostituite le 49 righe `ADD COLUMN IF NOT EXISTS` (24 file), obbligatori i 6 punti dell'avvio (`personal_api.py:194`, `:196`; `counselor_identity.py:696-698`; `main.py:659`); default senza `::json`. Test: avvio su SQLite nuovo **due volte** sullo stesso file e su Postgres, zero errori non inghiottiti | 2 | F1-05a, F1-05b | T2 |
| F1-05d | Compatibilità SQLite — lock | `xact_lock(db, *parti)` (ADR-0003 §4.2): advisory lock con chiave `blake2b` su Postgres, lock in processo rilasciato a fine transazione su SQLite, rifiuto di SQLite con più worker; sostituite le 39 chiamate (38 file), inclusi i 5 punti non protetti e `hashtext`. Test di concorrenza a thread su entrambi i DB per assegnazioni, istituti, privacy esterna | 2 | F1-05a, F1-05b | T3 |
| F1-05e | Compatibilità SQLite — date e ore UTC | `UTCDateTime` (`TypeDecorator`, `impl = DateTime(timezone=True)`) al posto delle 161 `DateTime(timezone=True)` in `models.py`; test di andata e ritorno aware su entrambi e confronto con `datetime.now(timezone.utc)`; test che la DDL compilata per Postgres è identica a prima (`TIMESTAMP WITH TIME ZONE`, nessuna migrazione) | 1,5 | F1-05a | T2 |
| F1-05f | Compatibilità SQLite — SQL a runtime | ramo `strftime` per `routes/admin.py:659`; `sqlite_where` sugli indici parziali `models.py:2086`, `:2088`; `dialect_insert` per i 4 file con upsert. Test: costi per periodo su SQLite, riprenotazione di uno slot dopo l'annullamento, upsert concorrenti | 1,5 | F1-05a, F1-05e (stesso `models.py`) | T2 |
| F1-05g | Compatibilità SQLite — aggiornamenti dello schema | ADR-0003 §3: regola «migrazione doppia» in `CONTEXT.md`; `alembic` come libreria per `batch_alter_table` su SQLite; sincronizzazione dei CHECK all'avvio. Test: database SQLite creato con lo schema di una versione precedente (fixture) e aggiornato; CHECK di `class_path_steps` allineato dopo l'aggiornamento | 3 | F1-05c, F1-05e | T3 |
| F1-05h ✅ | Compatibilità SQLite — concorrenza e carico | [Benchmark e report](../operations/sqlite-load-concurrency.md): 30 stream sintetici concorrenti, salvataggi e manutenzione; zero lock exceptions, avanzamento letture e integrità verificati. Commit/close prima dello stream in chat, Assistente e voce; budget e credenziali con sessioni brevi. Regressioni delle rotte su successo, errore e disconnessione | 2 | F1-05d | T3 |
| F1-05i ∥ | Compatibilità SQLite — funzioni escluse dal profilo | `COUNSELORBOT_PROFILE=teacher-pc` disattiva Prompt Lab, Telegram, OpenCode, Console sync, helper ChatGPT, Piper (rotte 404, nessun avvio di worker); test per profilo | 1 | F0-04 | T2 |
| F1-05j | Compatibilità SQLite — backup e ripristino | backup consistente con l'API di backup di SQLite in `backups/`, `PRAGMA integrity_check`, ripristino guidato, conservazione degli ultimi N; test | 1,5 | F1-05b, F1-02 | T2 |
| F1-19 🔒 ∥ | Origine della richiesta (tunnel o locale) nel frontend | ADR-0002 §2.7: helper unico che decide `tunnel`/`local` dalle intestazioni `cf-*`, cancella le `X-CounselorBot-*` in arrivo e imposta origine, IP del client e segreto; usato in `frontend/src/proxy.ts` (rewrite `/api`), `stream-proxy.ts` e rotta TTS; backend fail-closed (assente o segreto errato ⇒ `tunnel`). Test: richiesta con `cf-connecting-ip` ⇒ `tunnel`; intestazioni contraffatte scartate; streaming e rewrite portano la stessa origine | 1,5 | F0-04 | T3 |
| F1-06 🔒 | Fornitore di identità locale (parte di #209) | ADR-0002 §3: `AUTH_PROVIDER`, `local_sessions`, link monouso del docente, sessione docente rifiutata dal tunnel; ai4auth invariato. Test per fornitore su entrambi i DB | 4 | F0-04, F1-05a, F1-19 | T3 |
| F1-07 | Ruoli profilo teacher-pc (#208) | Docente = admin, funzioni laboratorio nascoste, rotte admin solo locali; test 403 da tunnel | 2 | F1-06 | T2 |
| F1-08 | Pannello chiavi API e portachiavi | Inserimento/verifica chiavi, salvataggio sicuro, passaggio al backend come env; nessun segreto su disco | 2 | F1-02 | T2 |
| F1-09 | Quick tunnel automatico (#211) | Avvio/stop `cloudflared`, lettura URL, QR e messaggio «solo prove»; conteggio richieste per pagina (HAR, da F0-03) | 2 | F1-02 | T2 |
| F1-10 | Tunnel nominativo guidato (#214) | Login Cloudflare del docente, creazione tunnel e DNS sul suo dominio (`labform.net` per il proprietario), URL stabile salvato; misura di F0-03 §3 | 3 | F1-09 | T2 |
| F1-11 ✅ | Heartbeat SSE e test di regressione del tunnel | [Implementazione e verifiche](../operations/sse-heartbeat.md): `: ping` ogni 15 s su `chat`, `site_chat`, `voice_reader` e OpenCode; intestazioni prima del provider streaming (preparazione chat prima della risposta HTTP); job manuale `sse-tunnel.yml` contro un quick tunnel (F0-03 §5) | 1,5 | F0-03 | T2 |
| F1-12 ✅ | LLM locale: chiave facoltativa + rilevamento | (#504) | 2 | — | T2 |
| F1-13 🔒 | Abbinamento studenti | ADR-0002 §4: codici di classe, `pair`/`recover`, codice personale, pseudonimi senza enumerazione, approvazione, revoca, limiti; test di sicurezza su entrambi i DB | 4 | F1-06, F1-09 | T3 |
| F1-14 ✅ | Anti-sospensione e stato «docente offline» | Inibizione sospensione a lezione attiva (macOS IOKit, Windows `SetThreadExecutionState`; Linux non inibito in Fase 1); `offline.html` servita da un service worker agli studenti che hanno già aperto l'app, con nuovo controllo ogni 10 s (`desktop/teacher/src-tauri/src/sleep.rs`, `frontend/public/offline.*`). Chi apre il link per la prima volta mentre il tunnel è senza origine vede ancora l'errore Cloudflare | 2 | F1-02 | T2 |
| F1-15 | CI release desktop | Workflow matrice (`macos-14`, `macos-15-intel`, `windows-latest`, `ubuntu-22.04`), asset nella Release, `latest.json`, smoke test `--smoke` + `/health`; firma condizionale ai segreti | 4 | F1-01, F1-02 | T3 |
| F1-16 | Updater e backup pre-aggiornamento | Canali stabile/beta, backup automatico (F1-05j), rollback documentato | 2 | F1-15, F1-05j | T2 |
| F1-17 | Documentazione e test (#213) | Guida docente in `docs/operations/`, `funzionalita-counselorbot.md`, privacy/DPIA modello, smoke test | 3 | tutti | T2 |
| F1-18 ✅ | Lock di file portabile nel backend (`fcntl` non portabile su Windows) | `backend/file_lock.py`: `flock` su POSIX (semantica invariata), lock **esclusivo** del primo byte con `msvcrt` su Windows (nessun lock condiviso); usato in `rag_index.py` e `rag_reindex_job.py`; test di esclusione e concorrenza (`backend/tests/test_file_lock.py`); job CI `backend-windows.yml` su `windows-latest` che importa il backend (#513) | 1 | F0-01 | T2 |

**Cosa parte in parallelo dopo questo ADR**

- **Subito, in parallelo** (file diversi): F1-02 (guscio, `desktop/`), F1-03 (frontend),
  F1-05a (test e CI), F1-05b (`database.py`), F1-05i (profilo), F1-11 (rotte SSE), F1-19 (origine della richiesta, frontend). F1-04 (#516) e F1-18 (#513) sono già su `main`.
- **Dopo F1-05a + F1-05b**: F1-05c ∥ F1-05d ∥ F1-05e ∥ F1-06. F1-05f dopo F1-05e (stesso `models.py`).
- **Poi**: F1-05g (dopo c, e), F1-05h (dopo d), F1-05j (dopo b e F1-02); F1-07 e F1-13 dopo F1-06.
- **Percorsi critici**: sicurezza F1-05a + F1-19 → F1-06 → F1-13 → F1-07; guscio F1-02 → F1-09 → F1-13 → F1-15 → F1-16.
- Regola per tutti i compiti che toccano `backend/` da qui in avanti: ADR-0003 §6 (codice portabile, CI su entrambi i DB).

### Fase 2 — App studente (~5–8 settimane)

| ID | Compito | Definition of Done | Stima | Dipende da | Tier |
|----|---------|--------------------|-------|------------|------|
| F2-01 🔒 | Contratto di sincronizzazione | Documento + schema eventi, cursori, errori, versione di protocollo, regole di conflitto; revisione utente | 3 | Fase 1 | T3 |
| F2-02 | Sottoinsieme backend «studente» su SQLite | Modalità studente del backend (già compatibile SQLite dopo F1-05): solo tabelle e rotte dello studente; test di parità sulle stesse rotte | 4 | F2-01, F1-05a..j | T3 |
| F2-03 ∥ | Endpoint di sync sull'app docente | `push`/`pull` idempotenti, autorizzazione per token studente, test conflitti | 5 | F2-01 | T3 |
| F2-04 ∥ | Guscio Tauri studente + UI ridotta | Abbinamento tramite QR, chat, questionari, taccuino, tavolo; identificatore `org.ai4educ.counselorbot.student` (ADR-0002 §1) | 6 | F2-01 | T2 |
| F2-05 | Motore di sync client | Coda offline, ritentativi, indicatore stato, risoluzione conflitti visibile | 5 | F2-02, F2-03 | T3 |
| F2-06 ∥ | Cifratura dati locali | DB cifrato, chiave nel portachiavi, test di non leggibilità | 3 | F2-02 | T3 |
| F2-07 ∥ | LLM locale lato studente | Rilevamento, scelta modello, livello di contesto Minimo, fallback all'app docente | 3 | F2-04, F1-12 | T2 |
| F2-08 | Release e compatibilità di versione | App studente nella stessa matrice CI; rifiuto sync con versioni incompatibili | 2 | F1-15, F2-05 | T2 |
| F2-09 | Documentazione e prove con una classe pilota | Guida studente, prova offline→online, report | 3 | tutti | T2 |

---

## 9. Domande aperte per l'utente

Decisioni **provvisorie** dell'utente (24/10), valide finché non dice altro:

| Domanda | Decisione provvisoria |
|---|---|
| Q1 — Chi usa la Fase 1? | pilota = il proprietario stesso |
| Q2 — Firma delle app | **non firmate** su Apple e Windows; firma condizionale a segreti futuri |
| Q3 — Dominio per il tunnel stabile | account/dominio Cloudflare **del docente** (per il proprietario `labform.net`) |
| Q4 — Quick tunnel per lezioni reali | **solo per prove** |
| Q5 — Account studenti | **pseudonimi** (rientro con codice personale, ADR-0002 §4.2) |
| Q6 — Ritmo delle release della madre | su richiesta del proprietario; ogni release produce anche le app |
| Q7 — Funzioni escluse dal desktop | Telegram, OpenCode, Prompt Lab, Piper, helper ChatGPT, Console sync esclusi dalla Fase 1 |
| Q8 — Piattaforme minime | macOS 13+ arm64/x64, Windows 10/11 x64, Ubuntu 22.04+ |
| — Database | doppio: Postgres server/portable, SQLite desktop (ADR-0003) |
| — LLM locale | Ollama, LM Studio o server OpenAI-compatibile, per docente e studente (studente: Fase 2) |
| — Agenti di sviluppo | solo Anthropic/Claude Code |

Ancora aperte:

1. **Q9 — Dati sul PC del docente**: la scuola accetta che i dati degli studenti stiano sul PC personale del docente? Serve un parere del DPO prima di un pilota con classi reali.
2. **Q10 — Fase 2: cosa vede il docente** delle conversazioni fatte offline dallo studente: tutto, solo i risultati, o ciò che lo studente decide di condividere?

---

## Verifiche e limiti di questo documento

- Conteggi e riferimenti `file:riga` delle sezioni 1–7 ricavati da `main` @ `a92bb430` con `grep`; quelli di §3.3 e §8 (F1-05a..j, F1-18) da `main` @ `b69e591a` (ADR-0003 §1); i conteggi includono commenti e righe protette da controlli di dialetto, quindi sono una stima del lavoro, non un elenco di errori.
- Verificato su fonti ufficiali: limiti del quick tunnel (Cloudflare), limiti account tunnel (Cloudflare One), sidecar e updater Tauri, endpoint OpenAI-compatibili di Ollama e LM Studio, prezzo Apple Developer Program.
- Da fonti giornalistiche (non ufficiali): prezzi e disponibilità geografica di Azure Artifact Signing.
- **Non verificato**: comportamento reale di SSE su tunnel nominativo (solo fonti non ufficiali), condizioni d'uso Cloudflare per uso continuativo del quick tunnel, esenzioni Apple per enti educativi, prezzi dei certificati Windows OV/EV, dimensioni effettive dell'installer, requisiti hardware dei modelli locali su CounselorBot. Gli spike F0-01..F0-03 ne hanno chiuso una parte (vedi i report); restano aperti SSE sul tunnel nominativo (#505), ToS del quick tunnel, esenzioni Apple, prezzi OV/EV, requisiti hardware dei modelli locali.
