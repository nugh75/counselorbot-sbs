# Heartbeat SSE (F1-11)

Lo [spike F0-03](../architecture/spikes/f0-03-tunnel-sse.md) ha misurato un
taglio del quick tunnel dopo circa 60 secondi senza byte, anche prima delle
intestazioni. Non ha misurato il tunnel nominativo: non attribuire a entrambi
una soglia universale di 60 secondi o uno stesso codice HTTP 524.

## Contratto

`backend/sse.py::heartbeat` avvolge tutti gli stream SSE del backend:

| Rotta POST backend | Generatore | Primo evento |
|---|---|---|
| `/chat/stream` | sincrono | sessione e conversazione |
| `/site-chat/stream` | sincrono | sessione e conversazione |
| `/tts/stream` | asincrono | segmenti e voce (`init`) |
| `/opencode/workspace/{key}/chat` | asincrono | sessione |

- Ogni **15 secondi di silenzio** invia il commento esatto `: ping\n\n`.
  Gli eventi applicativi riavviano il conteggio: nessun ping aggiuntivo serve
  mentre arrivano token, ragionamento o audio.
- Starlette invia intestazioni e primo evento prima della chiamata streaming
  al provider, della ricerca RAG dell'Assistente o della sintesi vocale.
  L'helper copre anche le attese dopo l'ultimo token e prima di `done`.
  `prepare_chat_turn` resta sincrono in `chat_stream`, prima della risposta:
  conserva gli status HTTP 409/502 e non è coperto dal timer degli heartbeat,
  anche quando la preparazione richiede una sintesi LLM.
- Mantiene un solo `next`/`anext` pendente, senza coda o letture anticipate.
  Il timeout del ping non cancella e non riavvia l'operazione pendente.
  I generatori sincroni lavorano in thread, lasciando libero l'event loop.
- Alla disconnessione cancella/chiude i generatori asincroni. Un `next`
  sincrono già in corso non può essere interrotto in sicurezza: termina secondo
  i timeout del provider, poi il generatore viene chiuso senza leggerlo ancora.
  L'Assistente usa una sessione DB propria, con il contesto di identità
  copiato dalla richiesta, chiusa con il generatore anche in questo caso.
- Accessi, preparazione della chat e validazione HTTP restano prima dello
  stream: gli errori HTTP 409/502 e i codici sicuri mantengono il contratto
  precedente. La chat conserva la preparazione originale.
- `Cache-Control` include `no-transform`; `X-Accel-Buffering: no` evita il
  buffering di nginx. I proxy Next inoltrano il corpo senza consumarlo.

Per ogni nuova rotta SSE: usare l'helper e inviare un primo evento prima di
qualsiasi operazione lenta. Usare **POST + fetch/ReadableStream**, mai
GET/EventSource: lo spike ha osservato il buffering di GET sul quick tunnel.
I consumer `chat-stream.ts` e `voice-reader.ts` ignorano già i commenti;
test con frame frammentati verificano che i ping non producano JSON, testo,
audio o una falsa conclusione dello stream. Nessuna modifica ai parser.
I download PDF e l'audio binario di `/tts` non sono SSE e restano esclusi.

## Verifica automatica e locale

```bash
TEST_DB=sqlite ~/.pyenv/versions/3.11.9/bin/python -m pytest backend/tests/test_sse_heartbeat.py
cd frontend
node --test --experimental-strip-types src/lib/chat-stream.test.ts src/lib/voice-reader.test.ts src/lib/stream-proxy.test.ts
```

Per una misura con timer reali, verificare che la porta **8791** sia libera
(`ss -ltn` su Linux, `lsof -nP -iTCP:8791 -sTCP:LISTEN` su macOS), poi:

```bash
python -m scripts.spikes.sse_heartbeat_probe serve
# In un altro terminale:
python -m scripts.spikes.sse_heartbeat_probe check http://127.0.0.1:8791
```

La fixture espone solo due stream sintetici su `127.0.0.1`; non avvia l'app,
non usa database, credenziali, dati personali o LLM. Entrambi aspettano 75 s
tra `init` e `done`, uno in un thread e uno con `await`. Il checker li legge
in parallelo e richiede intestazioni/primo evento entro 10 s, almeno quattro
ping, intervalli inferiori a 25 s e chiusura completa oltre 60 s. Si arresta
la fixture con Ctrl+C; nessun dato da ripulire, nessuna procedura sudo.

## Regressione quick tunnel, solo manuale

Actions → **SSE quick tunnel regression** → **Run workflow**
(`.github/workflows/sse-tunnel.yml`, solo `workflow_dispatch`). Il job usa
Python 3.11 e `cloudflared 2026.3.0` (versione dello spike), espone solo la
fixture e verifica anche la presenza di `Cf-Ray`. Pubblica tempi e log
sintetici come artifact, poi chiude tunnel e server con una trap.
Non richiede login Cloudflare o segreti e non espone l'applicazione.
Un errore di disponibilità del servizio esterno fa fallire il job e va
distinto da una regressione dell'helper nei test pytest.

Riproduzione manuale contro Cloudflare, con la fixture già avviata:

```bash
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8791
# Usare l'URL temporaneo stampato da cloudflared:
python -m scripts.spikes.sse_heartbeat_probe check https://NOME.trycloudflare.com --require-cloudflare
```

Chiudere anche `cloudflared` con Ctrl+C. Il tunnel nominativo e il conteggio
delle richieste dell'app reale restano rispettivamente a F1-10 e F1-09.

## Packaging

Il Dockerfile backend copia già `backend/*.py`, quindi include l'helper senza
nuove dipendenze. Per validare senza riavviare la produzione:
`docker build -f backend/Dockerfile -t counselorbot-f1-11-sse-test .`.
Il frontend cambia solo nei test, senza codice runtime da ricostruire.

## Misure eseguite il 24 ottobre 2026

Entrambi gli stream della fixture usano l'helper reale senza eventi applicativi
per 75 secondi; i client li leggono contemporaneamente.

| Percorso | Intestazioni | Durata | Ping | Intervallo massimo |
|---|---:|---:|---:|---:|
| Locale, sincrono | 0,73 s | 75,87 s | 4 | 15,09 s |
| Locale, asincrono | 0,73 s | 75,80 s | 4 | 15,08 s |
| Quick tunnel, sincrono | 1,80 s | 76,82 s | 4 | 15,10 s |
| Quick tunnel, asincrono | 1,79 s | 76,80 s | 4 | 15,09 s |

Verifica Cloudflare con `Cf-Ray` richiesto; fixture e tunnel chiusi al termine.
È stato eseguito l'equivalente locale del job, non un run GitHub Actions.
Test mirati: 142 backend (Python 3.11/SQLite), tre smoke chat con Postgres
isolato, 34 parser/proxy frontend (Node 22), 16 SSE nell'immagine ricostruita
(Python 3.10). Le fixture legacy SQLite/RAG e l'anomalia della raccolta smoke
combinata restano fuori dal task e sono registrate nel Diario.
