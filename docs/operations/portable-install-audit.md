# Audit prima dell'installazione portabile

Audit statico della sorgente upstream `nugh75/counselorbot-sbs`, commit
`4c627565`, svolto prima dell'installazione. Destinazione: Docker su macOS,
dominio `counselorbot.labform.net`, autenticazione collegata alla Console.
Ollama non è installato. Il provider AI verrà indicato dall'operatore;
questo audit non autorizza copia di chiavi o modifica della protezione dei dati.

La directory iniziale è stata conservata nel ramo
`chore/install-counselorbot-portable`. Le modifiche di installazione sono nel
ramo `feature/portable-labform-install`. Non rimuovere volumi o dati esistenti.

## Risultati

| Area | Evidenza nella sorgente | Impatto e intervento |
| --- | --- | --- |
| Compose upstream | `docker-compose.yml`: reti esterne `proxy-network`, `ai4educ-console_default`; mount `/var/lib/cloudflared-agent`, `/home/nugh75/.cache/ai4educ-opencode` | Il file dipende dall'ambiente Linux originale. Usare il Compose portabile autonomo, con volumi nominati e rete Console configurabile. |
| PostgreSQL | Versione 15; `5435:5432` upstream; backend esegue `create_all` all'import di `backend/main.py` | Mantenere il DB interno, aggiungere readiness del DB e avviare il backend soltanto dopo. Un worker evita seeding simultaneo nella prima installazione. |
| DNS del database sulla rete condivisa | Al primo avvio il nome generico `postgres` risolveva al PostgreSQL della Console, su un'altra rete del backend; le credenziali distinte hanno impedito l'accesso | La connessione usa ora l'alias dedicato `counselorbot-portable-postgres` sulla sola rete privata. Risoluzione verificata sul database dell'app; nessun dato della Console modificato. |
| Bootstrap | `backend/main.py`: migrazioni e seed idempotenti di config, strumenti, counselor | Nessun dump di produzione necessario per un'installazione nuova. Il seed locale `admin/admin123` non è un login: l'identità arriva da forward-auth. |
| Login | `backend/auth.py`: header `Remote-*` accettati solo con segreto condiviso valido, altrimenti verifica cookie presso `AI4AUTH_VERIFY_URL` | Appartenere alla rete Console non prova l'autenticazione. La Console portabile dispone di ai4auth: usare verifica cookie compatibile, registrazione del dominio e verifica di `/api/auth/me`. |
| Ruoli | `ADMIN_GROUPS`/`ADMIN_GROUP`, gruppo globale `admins`; marker docente e ricercatore | La Console deve restituire gruppi coerenti. Provare accesso amministrativo e rifiuto di header identità falsificati. |
| Chiavi AI | `backend/api_secrets.py`: chiavi di sistema soltanto dall'ambiente | Non vengono recuperate automaticamente dalla Console e non devono essere copiate da altri servizi. Attendere la scelta del provider e un'assegnazione esplicita della chiave. |
| Chat cloud | `backend/ai_service.py`, seed `backend/main.py`: redazione esterna attiva, NER locale attivo, fallback `block` | Senza Ollama la politica predefinita blocca le chiamate cloud. Mantenerla finché l'operatore sceglie provider e politica; non impostare automaticamente `basic` o `send_raw`. |
| Embedding/RAG | `AIService.embed_texts` usa esclusivamente Ollama | I corpus RAG che richiedono embedding non funzionano senza servizio Ollama raggiungibile. L'assistente piattaforma può usare il documento live; la memoria conversazionale ripiega sulla ricerca per parole. |
| OCR profili | `backend/qsa_extractor.py`: Ollama, poi fallback OpenRouter | Il fallback invia la prima pagina direttamente a OpenRouter, con modello preview hardcoded. Non è filtrato dal percorso AIService; non considerarlo disponibile né attivarlo implicitamente. Inserimento manuale dei punteggi resta disponibile. |
| Audio | `services/transcription/Dockerfile`: tre modelli Whisper scaricati in build; Piper: dodici voci | Lo stack portabile iniziale esclude questi servizi. Trascrizione locale e Piper richiedono installazione dedicata e risorse adeguate. Edge TTS dipende dalla rete. |
| Traduzioni counselor | `backend/counselor_i18n.py`: Ollama best-effort | Disabilitare i tentativi automatici nella configurazione senza Ollama; le descrizioni disponibili restano utilizzabili. |
| Thread guard | `backend/thread_guard_seed.py`: preset Ollama, attivazione predefinita `false` | Lasciarlo disattivato; non renderlo un prerequisito della chat. |
| OpenCode e prompt lab | Socket/workspace del runtime Linux e modello Ollama; Compose prompt lab separato | Non inclusi nell'installazione portabile iniziale. Richiedono un runtime dedicato e configurazione verificata. |
| Sync amministratori | `backend/admin_sync.py`: `AI4AUTH_ADMIN_TOKEN` | Sincronizzazione best-effort dei contatti ricerca, distinta dal login. Senza endpoint e token compatibili, disabilitarla. |
| Test | `backend/tests/test_smoke.py` importa `backend.main` prima dell'override DB | Eseguire i test con `DATABASE_URL` già puntato a un DB separato. I benchmark Ollama/OpenRouter effettuano chiamate reali. |
| Dipendenze frontend | Audit npm produzione del lockfile iniziale: 9 vulnerabilità, di cui 3 critical, 4 high e 2 moderate; Next.js iniziale `16.1.3` | Correggere le dipendenze vulnerabili prima della pubblicazione e ripetere audit, lint e build. La versione suggerita dall'audit per Next.js è `16.3.8`; registrare l'esito finale nel handoff. |

## Piano derivato dall'audit

1. Conservare il checkout iniziale e lavorare sul ramo dedicato.
2. Preparare `docker-compose.portable.yml` autonomo: PostgreSQL interno con
   healthcheck, backend a un worker, frontend sulla rete Console, storage
   persistente, nessun mount Linux del precedente operatore.
3. Generare credenziali DB private e lasciare vuote le chiavi AI. Configurare
   host pubblico `counselorbot.labform.net` e adapter auth verso la Console;
   non modificare la politica privacy predefinita.
4. Costruire e avviare lo stack. Verificare bootstrap, stato dei servizi,
   log e pagine. Questa fase verifica l'applicazione web, non le capacità AI.
5. Registrare il servizio nella Console, instradare il dominio sul frontend
   e verificare TLS, identità, ruoli e protezione del backend. Le eventuali
   porte debug devono restare su loopback.
6. Quando l'operatore indica il provider, configurare soltanto le credenziali
   autorizzate, il modello e la politica privacy scelta esplicitamente.
   Collaudare chat e streaming prima di dichiarare disponibile l'AI.
7. Eseguire i controlli pertinenti, completare documentazione e handoff,
   creare commit e push del ramo. Aprire la PR soltanto alla fine; il merge
   rimane all'operatore.

La procedura concreta e i criteri di accettazione sono in
[portable-installation.md](portable-installation.md). Non servono comandi
`sudo` per questo stack Docker e il collegamento tramite Console.

## Infrastruttura Console rilevata

L'ispezione dell'ambiente Console ha confermato l'alias `ai4auth` sulla
rete `console-platform_default`, endpoint interno
`http://ai4auth:9091/api/verify` e cookie con dominio `.labform.net`.
Il dominio CounselorBot può usare il tunnel wildcard Console già esistente.
La registrazione prevista aggiunge il virtual host e la regola nella matrice
accessi, con gruppi `admins`, `studenti`, `viewer` se presenti nella Console.
Questi rilievi infrastrutturali non sostituiscono il collaudo end-to-end
di login e autorizzazione dopo la pubblicazione.

Durante la preparazione, il pull di immagini Docker ha incontrato un
errore di instradamento IPv6 (`no route`). Il pull tramite `mirror.gcr.io`
è riuscito senza riavviare la Console. La configurazione portabile offre
override delle immagini di base per applicare questo rimedio temporaneo.
Annotare nel handoff l'esito della build completa; il problema di rete
non prova un malfunzionamento del codice applicativo.

## Correzione dipendenze prima della pubblicazione

Next.js e `eslint-config-next` sono stati aggiornati da `16.1.3` a
`16.3.8`, nello stesso major. Plotly richiede invece il passaggio dal
major 3 a `4.1.1`, con `plotly.js` ora dipendenza diretta e
`plotly.js-dist-min` allineato alla stessa versione disponibile nel registry.
Il [changelog ufficiale](https://raw.githubusercontent.com/plotly/plotly.js/master/CHANGELOG.md)
documenta in `4.1.1` l'aggiornamento MapLibre che corregge la vulnerabilità.

Un override del solo MapLibre nel vecchio Plotly non avrebbe corretto
il codice incorporato nel bundle precompilato caricato da `react-plotly.js`.
Non è stato usato questo workaround. Il nuovo major Plotly richiede Node 22,
in linea con l'immagine frontend portabile.

La sorgente applicativa usa Plotly soltanto in `SurveyViewer`: grafici
`violin` con box, media, punti e colori esadecimali. Le rimozioni Mapbox,
MathJax 2 e i cambiamenti dei colori HSV riportati nel changelog non
coinvolgono questi parametri. Il successivo collaudo browser, descritto
sotto, verifica il rendering e il ridimensionamento dei grafici realmente
usati dall'applicazione.

Il successivo collaudo browser ha verificato il bundle installato con tre
risposte sintetiche intercettate solo nel browser: dieci grafici violin,
punti, media e box presenti, ridimensionamento da desktop `1440×1000` a
mobile `390×844`, nessun overflow orizzontale e zero errori JavaScript.
Tutte le API amministrative erano fixture, con mutazioni negate: nessun
dato di esempio è stato inserito nel database dell'applicazione.

`npm audit --omit=dev` dopo l'aggiornamento e `npm audit fix` senza
`--force` rileva **zero vulnerabilità nelle dipendenze di produzione**,
contro le nove iniziali. L'audit completo conserva cinque segnalazioni
high nella catena esclusivamente di sviluppo
`eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`.
L'advisory di `braces` indica tutte le versioni come coinvolte; npm propone
il downgrade incompatibile di `eslint-config-next` al major 14. Non è
stato applicato, né sono stati introdotti override per nascondere il rilievo.
Questi tool non sono copiati nel runtime standalone, ma il rischio
residuo dei tool di sviluppo resta da monitorare.

Il controllo i18n passa: 2947 chiavi in sei lingue. Il lint completo
riporta un errore e 44 warning; l'errore è
`react-hooks/set-state-in-effect` in `NewDeckDialog.tsx`, sul codice già
presente nel commit upstream. Non è stato modificato il dialogo durante
l'installazione. Il primo controllo TypeScript diretto dal checkout trova
soltanto dichiarazioni mancanti per immagini PNG: `next-env.d.ts` viene
generato da Next durante build o sviluppo e non è presente nel checkout
iniziale. Le immagini esistono; la build Next rimane il controllo completo
di compilazione e generazione delle dichiarazioni.
Il controllo `tsc --noEmit --incremental false` con tipi espliciti
`node,react,react-dom,next/image-types/global` passa, senza creare o
modificare file nel checkout.
Il lint mirato a `auth-urls.ts`, al suo test, `auth.ts` e `ConfigForm.tsx`
passa con zero errori e due warning in `ConfigForm.tsx` (navigazione tramite
`window.location.href` e dipendenza di un effect). Il layout non è cambiato.

## Audit dei pacchetti Python installati

`pip freeze` del backend installato contiene 94 pacchetti. L'audit è stato
eseguito con `pip-audit` in un virtualenv temporaneo separato; nessun tool
è stato installato nel backend. L'output segnala due entry duplicate per
una sola vulnerabilità distinta in `ecdsa==0.19.2`, transitiva di
`python-jose[cryptography]`: CVE-2024-23342, severity high 7.4, senza
versione corretta disponibile.

L'[advisory del manutentore](https://github.com/tlsfuzzer/python-ecdsa/security/advisories/GHSA-wj6h-64fc-37mp)
riguarda il timing di firma P-256, generazione chiavi ed ECDH; la verifica
delle firme è esclusa. Nel backend il provider EC selezionato da jose è
`cryptography_backend`; l'utilizzo applicativo osservato di JWT riguarda
la verifica RS256 delle connessioni ChatGPT opzionali. Non è stato
identificato un percorso applicativo che esegua le operazioni ECDSA
vulnerabili. Il pacchetto resta presente e il rilievo è conservato, senza
ignorarlo nell'audit o dichiararlo corretto.

## Collaudo browser del frontend compilato

Collaudo su container temporaneo di validazione a `127.0.0.1:3109`, usando
la stessa immagine applicativa compilata e l'utente runtime `nextjs`.
Il checkout macOS aveva directory `public` con permessi 0700: la copia
nel Dockerfile deve assegnare ownership a `nextjs`. Questa correzione
permette la lettura degli asset senza eseguire il frontend come root.

- Homepage reale anonima: pagina di accesso caricata e link verso
  `auth.labform.net` compilato correttamente.
- Guida reale: pagina caricata, immagini visibili decodificate, nessun
  errore di lettura degli asset. Due GET alle impostazioni personali
  ricevono 401 da anonimo, senza crash della pagina.
- Amministrazione con identità e risposte survey sintetiche intercettate
  nel solo browser: dieci grafici violin, ciascuno con box, linea della
  media e tre punti, senza errori JavaScript.
- Resize da 1440×1000 a 390×844: larghezza dei grafici da 241,75 a 343 px,
  altezza 185 px; larghezza del documento mobile pari a 390 px.
- Tutte le API del collaudo amministrativo sono fixture; metodi diversi
  da GET e richieste esterne sono bloccati. Nessun tentativo di mutazione
  e nessun dato di produzione letto o scritto.

Le schermate locali sono in `output/playwright/`, escluse dal commit.
La sessione browser dedicata è stata chiusa al termine. Il collaudo con
identità simulata verifica UI e Plotly, non autentica un utente reale
tramite Console; quel controllo resta parte della pubblicazione finale.

## Limiti dell'audit

Questo documento distingue l'esame statico iniziale dalle successive
verifiche infrastrutturali e delle dipendenze riportate sopra. Non certifica
DNS, TLS, autenticazione effettiva, disponibilità dei modelli o build:
riportare gli esiti dell'installazione e le verifiche runtime nel handoff.
Nessuna chiave, password, cookie o dump di produzione appartiene a questo
documento o alla cronologia Git.
