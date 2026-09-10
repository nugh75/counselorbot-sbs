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
I controlli vocali prendono il posto della casella di scrittura, senza aprire
finestre sovrapposte o duplicare la trascrizione.

1. **Premi per parlare** attiva il microfono.
2. **Ferma e invia** termina la registrazione, la trascrive e invia il messaggio
   insieme all'eventuale bozza già presente.
3. La risposta completa viene letta automaticamente. Il microfono rimane spento
   durante l'ascolto e alla fine della risposta: per un nuovo turno si preme di nuovo.

**Interrompi e parla** arresta l'ascolto e avvia una nuova registrazione.
Sono disponibili pausa, ripresa e riascolto, senza inviare di nuovo il messaggio.
Se il browser blocca la riproduzione automatica, **Riprendi** la avvia con un clic.
Voce, motore, lingua, profilo del counselor e correzioni della pronuncia sono
gli stessi del lettore audio. Il riconoscimento resta locale; la risposta
usa Piper oppure il servizio online Edge secondo la preferenza del lettore.

**Torna a scrivere** (X), oppure Escape dai controlli vocali, interrompe audio,
microfono e trascrizione in corso. Un messaggio già inviato prosegue nella chat,
ma la sua risposta tardiva non avvia l'audio. Cambiare lingua, counselor o
sessione interrompe l'attività audio; il microfono richiede sempre un nuovo clic.
Anche **Ascolta** su un messaggio arresta un'eventuale registrazione prima di
avviare il lettore. I pulsanti dei passi e il comando **Continua** per una
risposta interrotta restano disponibili: la lettura attende il completamento
della risposta. La modalità vocale non modifica la preferenza di invio
immediato dei normali caricamenti e non si riattiva dopo aver ricaricato la pagina.

## Lingua

L'interfaccia e il riconoscimento usano la lingua selezionata nell'applicazione:
italiano, inglese, spagnolo, francese, tedesco o svedese. Il riconoscimento
trascrive; non traduce. Se la lingua parlata è diversa, selezionarla prima
di registrare. Il testo può contenere errori, soprattutto con nomi propri,
rumore o accenti: la modalità con revisione permette di correggerli.

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
obbligatori e restituisce `{ "text": "...", "language": "it" }`.
La route sostituisce il nome originale del file con `recording` e inoltra
l'audio esclusivamente a `http://transcription:8000/transcribe`.

Il servizio Docker `transcription` esegue
[faster-whisper](https://github.com/SYSTRAN/faster-whisper) 1.2.1 con
CTranslate2 4.8.2 e il modello multilingue
[Systran/faster-whisper-small, revisione 536b066](https://huggingface.co/Systran/faster-whisper-small/tree/536b0662742c02347bc0e980a01041f333bce120).
Il Dockerfile include il modello durante la build; durante l'uso non scarica
modelli, non contatta fornitori esterni e non usa chiavi API. PyAV decodifica
e ricampiona a mono 16 kHz, controllando anche la durata decodificata.
La sintesi vocale del lettore è un servizio distinto.

La trascrizione usa CPU int8, quattro thread, una richiesta alla volta e
VAD per escludere il silenzio. Il container dispone di quattro CPU e 2 GiB
di memoria, filesystem in sola lettura e `/tmp` temporanea. Non espone porte
sull'host. `GET /health` risponde quando il modello è caricato.

Audio e file temporanei servono solo alla richiesta: l'applicazione non li
archivia in database o volumi, né registra il loro contenuto nei log. La
trascrizione diventa un normale messaggio di chat solo quando viene inviata,
manualmente o tramite l'opzione automatica; da quel momento segue la
configurazione e la conservazione della conversazione.

Gli errori restituiscono `detail`: `empty`/`invalid_audio` (400),
`too_large`/`too_long` (413), lingua non supportata (422), `busy` (503),
`unavailable` (502/503) o `timeout` (504, attesa backend massima 180 secondi).
Una richiesta anonima riceve 401. Non sono esposti dettagli interni del servizio.

## Avvio e verifica

```bash
docker compose up -d --build --no-deps transcription backend frontend
docker compose ps transcription backend frontend
docker compose exec transcription python -c "import urllib.request; print(urllib.request.urlopen('http://localhost:8000/health').read().decode())"
```

La prima build richiede accesso al modello e alle dipendenze; l'inferenza è
locale. La latenza dipende dalla durata e dal carico della CPU. Su questo
host, tre brevi campioni sintetici italiani, inglesi e svedesi di circa
2–3 secondi hanno richiesto circa 1–1,3 secondi con modello già caricato.
Sono prove funzionali, non una stima garantita per registrazioni lunghe
né una valutazione dell'accuratezza del riconoscimento.

Test mirati:

- `backend/tests/test_audio_input.py`: autenticazione, limiti, lingua,
  inoltro esclusivamente locale ed errori del servizio.
- `services/transcription/test_server.py`: decodifica, durata massima,
  parametri del modello e rilascio della risorsa di inferenza.
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
