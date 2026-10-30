# Messaggi da microfono e file audio

Nella chat guidata e nella Bussola il pulsante **Inserisci audio**, accanto
alla casella del messaggio, apre due possibilità: **Registra dal microfono**
e **Carica file audio**. **Ferma e trascrivi** termina la registrazione.
La trascrizione viene aggiunta alla bozza esistente e può essere corretta
prima di premere Invia.

Nei **tre puntini → Opzioni della conversazione**, la casella **Invia subito
dopo la trascrizione** abilita l'invio automatico per entrambe le modalità.
È inizialmente disattivata. Quando attiva, invia una sola volta il testo
trascritto insieme all'eventuale bozza già scritta. La scelta è condivisa
fra chat guidata e Bussola e resta nel browser (`cb_audio_auto_send`), senza
sincronizzazione fra dispositivi.

## Conversazione vocale con chat visibile

**Tre puntini → Conversazione vocale** attiva i turni parlati nella chat
guidata e nella Bussola. La conversazione completa resta visibile e scorrevole:
ogni messaggio trascritto e ogni risposta del counselor vi compaiono normalmente.
Al posto della casella di scrittura rimane solo il pulsante principale.
Stato, istruzioni e comandi secondari si trovano nei **tre puntini**.

1. **Premi per parlare** attiva il microfono.
2. **Ferma e invia** termina la registrazione, la trascrive e invia il messaggio
   insieme all'eventuale bozza già presente.
3. La risposta viene letta man mano che il counselor la scrive: la lettura parte
   dalla prima frase conclusa e prosegue con le successive, senza attendere il
   testo completo. Il microfono rimane spento durante l'ascolto e alla fine
   della risposta: per un nuovo turno si preme di nuovo.

**Interrompi e parla** arresta l'ascolto e avvia una nuova registrazione.
Nei **tre puntini** sono disponibili pausa, ripresa e riascolto, senza inviare di nuovo il messaggio.
Se il browser blocca la riproduzione automatica, **Riprendi** la avvia con un clic.
Il menu si apre automaticamente in caso di errore per mostrare il problema
e gli eventuali comandi di recupero.
Voce, motore, lingua, profilo del counselor e correzioni della pronuncia sono
gli stessi del lettore audio. Il riconoscimento resta locale; la risposta
usa Piper oppure il servizio online Edge secondo la preferenza del lettore.

**Tre puntini → Torna a scrivere**, oppure Escape dal pulsante vocale, interrompe audio,
microfono e trascrizione in corso. Un messaggio già inviato prosegue nella chat,
ma la sua risposta tardiva non avvia l'audio. Cambiare lingua, counselor o
sessione interrompe l'attività audio; il microfono richiede sempre un nuovo clic.
Escape dentro il menu chiude solo il menu, lasciando attiva la modalità vocale.
Anche **Ascolta** su un messaggio arresta un'eventuale registrazione prima di
avviare il lettore. I pulsanti dei passi e il comando **Continua** per una
risposta interrotta restano disponibili: la lettura attende il completamento
della risposta. La modalità vocale non modifica la preferenza di invio
immediato dei normali caricamenti e non si riattiva dopo aver ricaricato la pagina.

## Lingua

Nei **tre puntini → Opzioni della conversazione**, **Lingua del parlato** vale
per microfono e file audio ed è indipendente dalla lingua dell'interfaccia.
L'impostazione iniziale è **Riconoscimento automatico**: il modello riconosce
da solo la lingua parlata, quindi non serve cambiarla passando da una lingua
all'altra. Le sei lingue (italiano, inglese, spagnolo, francese, tedesco,
svedese) restano selezionabili: su registrazioni brevi o rumorose una lingua
scelta a mano è più affidabile del riconoscimento automatico. La scelta resta
nel browser (`cb_audio_language`), senza sincronizzazione fra dispositivi.
Il riconoscimento trascrive; non traduce. Il testo può contenere errori,
soprattutto con nomi propri, rumore o accenti: la modalità con revisione
permette di correggerli.

## Limiti e interruzioni

- Massimo **10 MiB e 3 minuti** per audio. Il microfono si ferma un secondo
  prima del limite, lasciando spazio alla coda della codifica del browser.
- File comuni supportati: WAV, MP3, M4A/MP4, OGG, WebM e FLAC. Il decoder
  controlla il contenuto, senza fidarsi dell'estensione.
- Il microfono richiede HTTPS (oppure localhost), il permesso dell'utente e
  un browser con `MediaRecorder`. Senza microfono rimane il caricamento file.
- **Annulla**, Escape, chiusura del menu, cambio lingua, cambio sessione/fase
  o uscita dalla pagina interrompono la richiesta e rilasciano il microfono.
  Una risposta tardiva non modifica la bozza e non invia messaggi. Una
  trascrizione già iniziata sul server può terminare anche dopo l'annullamento.
- L'avvio della registrazione arresta il lettore audio, per non registrare
  la voce del counselor. L'invio manuale è disabilitato durante la registrazione
  e la trascrizione.
- Audio vuoto o senza parlato riconosciuto non viene inviato. Gli errori
  temporanei permettono di riprovare la trascrizione del medesimo audio.
  Se il testo supera il limite del messaggio, rimane disponibile nel menu
  per accorciarlo: non viene troncato né inviato automaticamente.

## Servizio locale e API

`POST /api/audio/transcribe` (frontend) → `POST /audio/transcribe` (backend)
richiede una sessione autenticata. Riceve multipart con `audio` e `language`
(`auto` oppure una delle sei lingue; `auto` è il valore predefinito) e
restituisce `{ "text": "...", "language": "it", "model": "large-v3-turbo" }`,
dove `language` è la lingua riconosciuta. `GET /audio/models`, riservato agli
amministratori, elenca i modelli disponibili per motore, il motore e il modello attivi.
La route sostituisce il nome originale del file con `recording` e inoltra
l'audio esclusivamente a `http://transcription:8000/transcribe`.

Il servizio Docker `transcription` esegue
[faster-whisper](https://github.com/SYSTRAN/faster-whisper) 1.2.1 con
CTranslate2 4.8.2 e tre modelli multilingue inclusi nell'immagine:

| id | provenienza | uso |
| --- | --- | --- |
| `small` | [Systran/faster-whisper-small, rev. 536b066](https://huggingface.co/Systran/faster-whisper-small/tree/536b0662742c02347bc0e980a01041f333bce120) | veloce, meno preciso sui termini tecnici |
| `large-v3-turbo` | [deepdml/faster-whisper-large-v3-turbo-ct2, rev. 4df90f7](https://huggingface.co/deepdml/faster-whisper-large-v3-turbo-ct2/tree/4df90f75321148c3a29a9e2351b7ddf8f5b115a8) | predefinito: qualità alta, tempi vicini a `small` |
| `large-v3` | [Systran/faster-whisper-large-v3, rev. edaa852](https://huggingface.co/Systran/faster-whisper-large-v3/tree/edaa852ec7e145841d8ffdb056a99866b5f0a478) | qualità massima, nettamente più lento su CPU |

Motore e modello si scelgono dalla console di amministrazione, scheda
**Trascrizione audio** (gruppo Voce e audio), che elenca i modelli presenti
nell'immagine, quali sono già in memoria e, per ciascuno, una riga su qualità,
RAM e CPU indicative. Le scelte sono le chiavi di configurazione
`transcription_engine` (`faster-whisper` predefinito, oppure `whisper.cpp`) e
`transcription_model`. Un motore sconosciuto ricade su `faster-whisper`; un
modello che il motore non ha ricade sul predefinito di quel motore
(`large-v3-turbo` per faster-whisper, `small` per whisper.cpp), senza
interrompere il servizio. Con faster-whisper un modello si carica al primo uso
e resta residente.

### Motore whisper.cpp

Per CPU deboli il servizio include anche
[whisper.cpp](https://github.com/ggml-org/whisper.cpp) v1.9.5 (commit
`d1be6fd`), compilato nell'immagine come binario statico `whisper-cli`
(senza OpenMP, ottimizzato per la CPU dell'host di build), con modelli
quantizzati ggml da
[ggerganov/whisper.cpp, rev. 5359861](https://huggingface.co/ggerganov/whisper.cpp/tree/5359861c739e955e79d9a303bcbc70fb988958b1),
verificati con SHA-256 durante la build:

| id | file | peso | RAM indicativa |
| --- | --- | --- | --- |
| `base` | `ggml-base-q5_1.bin` | 60 MB | ~0,3 GB, il più leggero, meno preciso |
| `small` | `ggml-small-q5_1.bin` | 190 MB | ~0,6 GB, predefinito del motore |
| `large-v3-turbo` | `ggml-large-v3-turbo-q5_0.bin` | 574 MB | ~1,2 GB, qualità alta ma lento su CPU modeste |

Per faster-whisper i valori indicativi sono ~1 GB (`small`), ~2 GB
(`large-v3-turbo`) e ~3,5 GB (`large-v3`), più il modello `small` residente
per il riconoscimento della lingua.

Ogni richiesta scrive l'audio decodificato in un WAV temporaneo sotto `/tmp`,
avvia `whisper-cli` (beam 5, stesso glossario, otto thread al massimo) e legge
il risultato JSON; la cartella temporanea viene eliminata subito dopo. Nulla
resta in memoria fra una richiesta e l'altra: il modello viene mappato dal
disco a ogni uso. La lingua automatica è riconosciuta da whisper.cpp stesso;
non c'è filtro VAD (whisper.cpp lo richiederebbe come modello separato).
Contratto HTTP, limiti, coda e codici di errore sono gli stessi; un errore o un
timeout del binario (280 secondi) restituisce `unavailable`. I modelli
faster-whisper restano comunque precaricati all'avvio del servizio.

Il Dockerfile include i modelli durante la build; durante l'uso non scarica
modelli, non contatta fornitori esterni e non usa chiavi API. PyAV decodifica
e ricampiona a mono 16 kHz, controllando anche la durata decodificata.
La sintesi vocale del lettore è un servizio distinto.

La trascrizione usa CPU int8, otto thread per modello, `beam_size` 5, VAD per
escludere il silenzio e un `initial_prompt` con il lessico del progetto (QSA, QSAr, ZTPI,
QPCS, QPCC, QAP, Savickas e i termini del dominio nella lingua scelta): senza
quel contesto le sigle venivano trascritte come parole comuni. Con lingua
automatica il prompt si riduce alle sole sigle, per non influenzare il
riconoscimento della lingua. La lingua automatica viene riconosciuta dal modello
`small`, non da quello grande: su un modello grande il solo riconoscimento
costa quanto l'intera trascrizione. Sotto una probabilità di 0,7 la scelta
torna al modello che trascrive. Due richieste vengono servite in parallelo e
le altre attendono in coda fino a 90 secondi prima di ricevere `busy`; la
decodifica dell'audio avviene fuori dalla coda. Thread e worker restano
contenuti perché ogni modello residente tiene i propri pool in attesa attiva,
che sottraggono CPU a quello che sta trascrivendo. Il container dispone di
trentadue CPU e 8 GiB di memoria, filesystem in sola lettura e `/tmp` temporanea. Non
espone porte sull'host. `GET /health` risponde quando almeno un modello è
caricato e `GET /models` elenca i modelli inclusi.

Audio e file temporanei servono solo alla richiesta: l'applicazione non li
archivia in database o volumi, né registra il loro contenuto nei log. La
trascrizione diventa un normale messaggio di chat solo quando viene inviata,
manualmente o tramite l'opzione automatica; da quel momento segue la
configurazione e la conservazione della conversazione.

Gli errori restituiscono `detail`: `empty`/`invalid_audio` (400),
`too_large`/`too_long` (413), lingua non supportata (422), `busy` (503),
`unavailable` (502/503) o `timeout` (504, attesa backend massima 300 secondi).
Una richiesta anonima riceve 401. Non sono esposti dettagli interni del servizio.

### Deploy portabile (Mac da 8 GB)

`docker-compose.portable.yml` include il servizio `transcription` (immagine
`counselorbot-transcription:latest`, alias di rete `transcription`), con
**4 CPU e 3 GB di memoria** al posto delle 32 CPU e 8 GiB del Compose
principale. Il backend parte dopo di lui (`depends_on`, `service_started`).
I modelli sono inclusi nell'immagine: nessun volume né cache da creare.

Con 3 GB usare **whisper.cpp `base` o `small`**, oppure **faster-whisper
`small`**; non `large-v3` (~3,5 GB) e, con faster-whisper, nemmeno
`large-v3-turbo` (~2 GB più `small` residente per la lingua).

Il Compose portabile imposta `TRANSCRIPTION_PRELOAD_MODEL=small`: all'avvio
resta in memoria solo `small` (~0,5-1 GB) più il rilevatore di lingua, che è
lo stesso `small`. Senza la variabile il servizio precarica `large-v3-turbo`
(valore predefinito, invariato in `docker-compose.yml`); `none` non precarica
nulla oltre al rilevatore. Un modello caricato resta residente: su questo Mac
in Amministrazione va scelto **whisper.cpp `base` o `small`** oppure
**faster-whisper `small`**; scegliere `large-v3-turbo` o `large-v3` con
faster-whisper lo carica e supera il limite di 3 GB (controllare
`docker inspect --format '{{.State.OOMKilled}}'`).

Ricostruzione dopo una modifica al servizio o al backend:

```bash
docker compose --env-file .env -f docker-compose.portable.yml up -d --build --no-deps transcription counselorbot-backend
```

## Avvio e verifica

```bash
docker compose up -d --build --no-deps transcription backend frontend
docker compose ps transcription backend frontend
docker compose exec transcription python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/health').read().decode())"
```

La prima build richiede accesso ai modelli e alle dipendenze; l'inferenza è
locale. La latenza dipende dalla durata e dal carico della CPU. Su questo
host, con `large-v3-turbo` già caricato e campioni sintetici italiani:

| audio | lingua indicata | lingua automatica |
| --- | --- | --- |
| 5 secondi | ~3,1 s | ~3,7 s |
| 15 secondi | ~3,6 s | ~4,4 s |

Il costo quasi fisso è la finestra da 30 secondi dell'encoder; il
riconoscimento automatico aggiunge il passaggio sul modello piccolo.
Con un campione italiano di 3,4 secondi (voce sintetica macOS), lingua
indicata, container di prova con 8 CPU su un host già carico: whisper.cpp
`base` ~3,4 s, `small` ~12 s, `large-v3-turbo` ~34 s; faster-whisper `small`
~10 s. Tutti hanno trascritto la frase correttamente (`base` ha perso
l'apostrofo). Su CPU ampie whisper.cpp non è più veloce: il suo vantaggio è la
memoria (nessun modello residente, file quantizzati più piccoli) e `base` per
le macchine più deboli. Immagine: +827 MB di strati (modelli ggml 824 MB,
binario 2,7 MB).

Sono prove funzionali, non una stima garantita per registrazioni lunghe
né una valutazione dell'accuratezza del riconoscimento. Il glossario ha
corretto, sugli stessi campioni, le sigle che il modello piccolo senza
prompt restituiva come parole comuni («QSA» come «questa»).

Test mirati:

- `backend/tests/test_audio_input.py`: autenticazione, limiti, lingua,
  inoltro esclusivamente locale ed errori del servizio.
- `services/transcription/test_server.py`: decodifica, durata massima,
  parametri del modello, rilascio della risorsa di inferenza e chiamata a
  `whisper-cli` (simulata). La classe `BundledEngineTests` trascrive davvero un
  WAV breve con entrambi i motori e gira solo dentro l'immagine, dove binario e
  modelli sono inclusi; altrove viene saltata. `TRANSCRIPTION_SAMPLE_WAV` e
  `TRANSCRIPTION_SAMPLE_WORD` indicano un campione parlato e una parola attesa.
- Da `frontend/`: `node --test tests/admin-transcription-engine.test.mjs`
  verifica la scelta di motore e modello in amministrazione contro un frontend
  su 127.0.0.1:3163 (`TRANSCRIPTION_ENGINE_BASE_URL` per cambiarlo).
- Da `frontend/`: `node --test tests/audio-input.test.mjs` verifica
  revisione, invio immediato, persistenza della preferenza, annullamento,
  errori, turni vocali con testo visibile, completamento delle risposte,
  riproduzione bloccata e controlli su schermi stretti contro un frontend su localhost:3108.
  `AUDIO_INPUT_BASE_URL` può indicare un altro frontend.
- La prova facoltativa `AUDIO_INPUT_LIVE=1` richiede un WAV sintetico
  `/tmp/audio-input-it.wav` contenente «Vorrei organizzare…» e un servizio
  di trascrizione di prova su localhost:3111. Usa il vero `MediaRecorder`
  Chromium, il vero riconoscimento locale e una risposta vocale Piper attraverso
  il proxy Next `/api/tts/stream`; autenticazione e risposte della chat restano
  simulate, senza scrivere conversazioni reali.
