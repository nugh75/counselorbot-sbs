# Spike F0-03 — Tunnel Cloudflare e SSE

Compito F0-03 del piano [`desktop-apps-plan.md`](../desktop-apps-plan.md) (epic #499).
Data delle misure: 23–24 ottobre 2026. Esito: **lo streaming della chat funziona sul quick tunnel**;
il vero limite è un **taglio a ~60 s senza byte**. F1-11 cambia di conseguenza (§5).

## 1. Come è stato misurato

- **Server di prova** `scripts/spikes/f0-03-sse-probe.mjs` (Node, nessuna dipendenza), solo su `127.0.0.1:8790`.
  Imita la rotta della chat: risposta `text/event-stream` con le stesse intestazioni di
  `frontend/src/lib/stream-proxy.ts` (`Cache-Control: no-cache, no-transform`, `X-Accel-Buffering: no`).
  Rotte: `/stream` (token ogni N ms), `/delay-headers` (nessuna intestazione per S secondi),
  `/silent` (un evento, poi silenzio con heartbeat `: ping` opzionale), `/hold` (richiesta tenuta aperta), `/stats` (picco di concorrenza visto dall'origine).
- **Client**: lo stesso script (registra l'istante di arrivo di ogni evento: se arrivano tutti insieme la risposta è bufferizzata) e `curl` con timestamp per riga.
- **Tunnel**: `cloudflared 2026.3.0` (Homebrew, macOS arm64), `cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8790`.
  Protocollo predefinito QUIC (edge `fco01`); ripetuto con `--protocol http2` (edge `mrs01`): **stessi risultati**.
- Client e server sulla stessa macchina, ma il traffico passa dall'edge Cloudflare (`cf-ray` presente).
  Nessun backend né dato reale di CounselorBot esposto; produzione non toccata. I tunnel sono stati chiusi alla fine.
- GitHub Actions non è servito: `cloudflared` era già installato.

Riproduzione:

```bash
node scripts/spikes/f0-03-sse-probe.mjs server 8790 &
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8790   # stampa https://<nome>.trycloudflare.com
U=https://<nome>.trycloudflare.com
node scripts/spikes/f0-03-sse-probe.mjs stream $U n=40 method=POST
node scripts/spikes/f0-03-sse-probe.mjs stream $U n=40 method=GET
node scripts/spikes/f0-03-sse-probe.mjs delay  $U s=75
node scripts/spikes/f0-03-sse-probe.mjs silent $U s=130 hb=15
```

## 2. Risultati — quick tunnel (`trycloudflare.com`)

### 2.1 Streaming SSE

| Prova | Esito | Dato |
|---|---|---|
| `POST` SSE, 40 token ogni 100 ms (×3) | **streaming reale** | primo evento a 0,38–0,67 s, ultimo a ~4,5 s, distribuzione 4,0–4,1 s (come in locale) |
| `POST` SSE, 20 token ogni 1 s | **streaming reale** | distribuzione 20,0 s |
| `POST` con `Accept-Encoding: gzip` | streaming reale | nessuna differenza |
| `GET` SSE (stile `EventSource`), 40 token | **bufferizzato** | intestazioni a 0,5 s, tutti gli eventi insieme alla fine (distribuzione 1 ms) |
| `GET` con `Accept: text/event-stream`, gzip o no | bufferizzato | come sopra |
| `GET` / `POST` con `Content-Type: application/x-ndjson` | `GET` bufferizzato, `POST` in streaming | il buffering dipende dal **metodo**, non dal tipo di contenuto |

La frase di Cloudflare «il quick tunnel non supporta SSE» corrisponde, in pratica, al **buffering delle risposte `GET`**.
Le rotte di streaming di CounselorBot sono **tutte `POST`** (`frontend/src/app/api/{chat,site-chat,tts}/stream/route.ts`,
lette con `fetch` + `ReadableStream`; nessun `EventSource` nel frontend): **la chat scorre token per token anche sul quick tunnel**.
Il comportamento non è documentato e può cambiare: va ricontrollato a ogni aggiornamento di `cloudflared` (test in F1-09).

### 2.2 Comportamento a 60–100 s

| Prova | Esito |
|---|---|
| Nessuna intestazione per 50 s | ok (200 a 50,5 s) |
| Nessuna intestazione per 75 / 90 / 110 s | **connessione chiusa a 60,3–60,5 s**, senza pagina 524: `curl` riceve «Empty reply» (HTTP/1.1) o errore di framing HTTP/2; il log di `cloudflared` dice `Incoming request ended abruptly: context canceled` |
| Intestazioni + 1 evento, poi silenzio 55 s | ok |
| Intestazioni + 1 evento, poi silenzio 75 / 130 s | **flusso troncato a 60,5 s** (`curl: (18) partial file`; `cloudflared`: `stream canceled by remote`) |
| Silenzio 130 s con heartbeat `: ping` ogni 15 s | ok, flusso completo a 130,5 s |
| Silenzio 200 s con heartbeat ogni 30 s | ok, flusso completo a 200,7 s |
| Silenzio 150 s con heartbeat ogni 45 s | ok, flusso completo a 150,6 s |
| Silenzio 150 s con heartbeat ogni 70 s | **troncato a 60,6 s**: la soglia è sul tempo tra due byte |
| Stesse prove in locale (`127.0.0.1`, 75 s) | ok: il taglio non dipende dal client |

Conclusione: sul quick tunnel la soglia non è 100 s ma **~60 s senza alcun byte**, sia prima delle intestazioni sia durante il corpo.
Un **heartbeat di commento SSE** (`: ping\n\n`) azzera il contatore; il limite totale della durata del flusso non è stato raggiunto (200 s ok).

### 2.3 Richieste parallele

| Prova (richieste tenute aperte) | Esito |
|---|---|
| 30 in parallelo, 5 s ciascuna (Node, HTTP/1.1, 30 connessioni) | 30 × 200 |
| 100 e 190 in parallelo (Node, una connessione TLS per richiesta) | 33–34 × 200, il resto `ETIMEDOUT` lato client: limite dell'apertura di molte connessioni TLS da una sola macchina, non un 429 |
| 100 / 190 / 250 in parallelo, 8 s ciascuna (`curl --http2 --parallel`, una connessione) | tutte 200; picco all'origine 105 / 139 / 137; tempo totale 14 / 27 / 76 s |
| 180 / 270 in parallelo, 10 s ciascuna (3 processi `curl`, 3 connessioni HTTP/2) | tutte 200; picco all'origine 130 / 128; tempo totale 29 / 86 s |

- **Nessun 429** fino a 270 richieste contemporanee: il tetto dichiarato di 200 non è stato visto, ma oltre ~130 richieste
  in volo l'origine non ne riceve di più e le altre **restano in coda** (latenza che cresce). Da una sola macchina non si
  può distinguere se la coda nasce dall'edge, da `cloudflared` (una sola connessione `ha-connections:1` nel quick tunnel) o dal client.
- **Per pagina**: le richieste del browser verso il tunnel viaggiano in HTTP/2 su una connessione per studente; quelle lente sono
  gli stream della chat (una per studente che scrive) mentre asset e API normali durano millisecondi. Con 30 studenti
  il carico di richieste *contemporanee* realistico è dell'ordine delle decine, lontano da 130–200.
  Il numero esatto di richieste per pagina va misurato sull'app vera (HAR del browser) in F1-09, quando il frontend girerà nel profilo PC docente.

## 3. Tunnel nominativo — non misurato

Richiede il login Cloudflare del docente (per il proprietario: account e dominio `labform.net`), che un agente non deve fare.
Procedura per misurarlo, da lanciare a mano dal proprietario:

```bash
cloudflared tunnel login                                   # browser: scegliere la zona labform.net
cloudflared tunnel create f0-03-spike
cloudflared tunnel route dns f0-03-spike f0-03-spike.labform.net
node scripts/spikes/f0-03-sse-probe.mjs server 8790 &
cloudflared tunnel --no-autoupdate run --url http://127.0.0.1:8790 f0-03-spike
U=https://f0-03-spike.labform.net
```

Da misurare con gli stessi comandi del §1 (in quest'ordine):

1. `stream $U method=POST` e `method=GET`: entrambi devono andare in streaming (il buffering di `GET` è atteso solo nel quick tunnel).
2. `delay $U s=90` e `s=110`: atteso **524 a ~100 s** (timeout del proxy Cloudflare) invece del taglio a 60 s.
3. `silent $U s=130` senza heartbeat e con `hb=15`/`hb=45`: verificare la soglia di inattività.
4. `burst $U count=250 hold=10000` con `curl --http2 --parallel` (§2.3): atteso nessun 429 e nessuna coda a ~130.

Alla fine: `cloudflared tunnel delete f0-03-spike` e rimuovere il record DNS `f0-03-spike` dal pannello Cloudflare.

## 4. Altre osservazioni

- Il backend della chat (`backend/routes/chat.py`, `generate()`) invia subito un primo evento con `session_id`, quindi le intestazioni
  arrivano presto; **non** invia heartbeat. Silenzi > 60 s sono realistici sul PC del docente: primo caricamento del modello
  locale (Ollama/LM Studio), ragionamento lungo prima del primo token, strumenti, lavoro dopo l'ultimo token prima di `done`.
- I parser del frontend ignorano le righe che non iniziano con `data:` (`frontend/src/lib/chat-stream.ts:101`,
  `frontend/src/lib/voice-reader.ts:37`): un commento `: ping` è **già compatibile**, nessuna modifica client necessaria.
- Il taglio arriva senza evento finale: il frontend lo vede come interruzione (la ripresa di `ChatContinuation` resta utile).
- Termini d'uso Cloudflare per uso continuativo del quick tunnel con studenti: non verificati in questo spike (resta aperto nel piano §3.4).

## 5. Conclusioni per F1-11

1. **Non serve un trasporto a polling/non-streaming automatico sul quick tunnel**: la chat (`POST`) è in streaming reale.
   F1-11 si riduce e cambia nome: «Heartbeat SSE e test di regressione del tunnel».
2. **Heartbeat obbligatorio** su tutte le risposte SSE del backend (`chat`, `site_chat`, `voice_reader`, ed eventuali nuove):
   commento `: ping\n\n` ogni **15 s** di silenzio (margine ampio sotto i 60 s misurati, sotto anche ai ~100 s del tunnel nominativo).
   Va bene per entrambi i tipi di tunnel e per nginx della Console.
3. **Intestazioni subito**: ogni rotta di streaming deve mandare intestazioni + primo evento prima di chiamare il modello
   (la chat già lo fa; da verificare `site_chat` e `voice_reader`).
4. **Mai `GET` per lo streaming** (niente `EventSource`): regola da scrivere in `CONTEXT.md` quando si implementa F1-11.
5. **Test automatico** in F1-09/F1-11: lo script di questo spike (o equivalente) eseguito contro un quick tunnel in CI
   (job manuale `workflow_dispatch`, non su ogni push) per accorgersi se Cloudflare cambia il comportamento.
6. Il messaggio «prova subito» del piano (§3.4, punto 1) non deve più dire «risposte tutte insieme»: i limiti da dichiarare sono
   URL che cambia, nessuna garanzia, uso «di prova» secondo Cloudflare.
7. Tunnel nominativo: misurare con il §3 prima di chiudere F1-10; se conferma 524 a 100 s, l'heartbeat del punto 2 basta.
