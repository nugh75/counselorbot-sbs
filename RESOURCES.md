<!-- ai4educ:resource-library -->
# Risorse del progetto

Risorse assegnate dalla Libreria della Console AI4Educ.
Per integrare una risorsa, consulta la sorgente, i requisiti e le istruzioni riportate sotto.
Verifica prima le convenzioni del progetto, le dipendenze e la compatibilità della versione.
Le risorse sono riferimenti: il codice non è stato copiato, installato o eseguito.
I percorsi host potrebbero non essere accessibili dal container: usa il repository indicato
o richiedi accesso alla sorgente. Non presumere che un percorso host esista nel workspace.
Questo file è generato: modifica le schede in Console e usa Aggiorna istruzioni.

## Lettore vocale sincronizzato (TD_daniele)

Lettore con controlli audio, sintesi progressiva ed evidenziazione parola per parola. Sorgente Svelte verificata e ricetta per adattarla a React/Next.js in CounselorBot. Il porting React non è ancora implementato.

- ID: 562f840c-917c-4231-b708-073eeb095dbd
- Tipo: component
- Stato di valutazione: evaluating
- Sorgente: https://github.com/nugh75/TD_daniele/tree/be44ce5d70c49babcc45bb1dd3506569e0dd858c
- Versione / riferimento: TD_daniele be44ce5d70c49babcc45bb1dd3506569e0dd858c; ricetta 1 (2026-09-10)
- Tecnologie: Svelte 5, TypeScript, HTMLAudioElement, SSE, FastAPI, edge-tts; destinazione React 19 / Next.js 16
- Licenza: Codice del progetto TD_daniele; licenza generale non individuata nei file ispezionati.
- Documentazione: https://github.com/nugh75/ai4educ-console/blob/c6368d69153af533e18a62cd2025050562116351/docs/resources/td-daniele-voice-reader.md

### File e sottocartelle di riferimento

web/src/schermate/LettoreEditor.svelte
web/src/lib/componenti/TestoSincronizzato.svelte
web/src/lib/stores/player.svelte.ts
web/src/lib/voce/codaAudio.ts
web/src/lib/voce/streamVoce.ts
web/src/lib/voce/citazioni.ts
05_Script/leggi_voce.py
05_Script/app/routers/voce.py

### Requisiti

Accesso alla sorgente GitHub o al checkout /home/nugh75/TD_daniele. Adattamento Svelte → React richiesto. CounselorBot ha già edge-tts, ma /api/tts restituisce solo MP3: aggiungere tempi WordBoundary e consegna progressiva mantenendo voci, lingue e pulizia del testo. Motori TTS locali e backend editoriale della tesi non necessari. Dettagli e controlli nella ricetta.

### Come integrare

# Lettore vocale sincronizzato — TD_daniele

Prima risorsa della Libreria della Console, assegnata alla cartella
`counselorbot-sbs`. Questa scheda permette di reperire il lettore originale e
adattarlo: non è ancora un pacchetto React installabile. Stato **Da valutare**
per il riuso in CounselorBot; versione della ricetta **1**, verificata il 10 settembre 2026.

## Funzionalità da conservare

- Riproduzione, pausa, ripresa e navigazione tra segmenti/paragrafi.
- Avvio della riproduzione mentre i segmenti successivi vengono sintetizzati.
- Evidenziazione della parola pronunciata e scorrimento del testo.
- Stati distinti di generazione, attesa dell'audio e riproduzione, con errori leggibili.
- Arresto e pulizia delle risorse quando cambia il contenuto o il lettore viene chiuso.

Editor Markdown, versioni dell'articolo, monitoraggio dei file, note e modali
bibliografiche appartengono all'applicazione TD_daniele. Non sono dipendenze
necessarie del lettore. Il riconoscimento delle citazioni è riutilizzabile
se il contenuto di destinazione le contiene.

## Dove prendere la sorgente

Repository: <https://github.com/nugh75/TD_daniele>.
Snapshot fissato: `be44ce5d70c49babcc45bb1dd3506569e0dd858c`.
[Apri la sorgente a questa revisione](https://github.com/nugh75/TD_daniele/tree/be44ce5d70c49babcc45bb1dd3506569e0dd858c).
Checkout locale consultato: `/home/nugh75/TD_daniele`.

Per una copia isolata, scegliere una directory nuova, accessibile dal proprio
ambiente, e sostituire `<directory-nuova>` prima di eseguire:

```bash
git clone --no-checkout https://github.com/nugh75/TD_daniele.git <directory-nuova>
git -C <directory-nuova> checkout --detach be44ce5d70c49babcc45bb1dd3506569e0dd858c
```

Non cambiare il checkout di lavoro di TD_daniele per recuperare la risorsa.
Da un container il percorso host potrebbe non essere visibile: usare il clone
o un mount già disponibile. L'accesso al repository richiede le autorizzazioni
GitHub dell'utente. Non è stata individuata una licenza generale nei file
ispezionati: non presentare il codice come una libreria pubblica con licenza MIT.

| File nella sorgente | Cosa contiene / come riusarlo |
|---|---|
| `web/src/schermate/LettoreEditor.svelte` | Riferimento per controlli, avvio e pulizia; separare lettura e funzioni editoriali. |
| `web/src/lib/componenti/TestoSincronizzato.svelte` | Evidenziazione, paragrafi e scorrimento; riscrivere il rendering in React. |
| `web/src/lib/stores/player.svelte.ts` | Tipi e stato del lettore; sostituire le rune Svelte e il singleton con stato per istanza. |
| `web/src/lib/voce/codaAudio.ts` | Coda `HTMLAudioElement`, precaricamento, buffer e ricerca della parola tramite `currentTime`; disaccoppiare dallo store. |
| `web/src/lib/voce/streamVoce.ts` | Eventi SSE, interruzione e normalizzazione dei tempi; sostituire selezione/file e trasporto applicativo. |
| `web/src/lib/voce/citazioni.ts` | Tokenizzazione TypeScript e citazioni Pandoc, senza dipendenza da Svelte. |
| `05_Script/leggi_voce.py` | `dividi_in_chunk`, pulizia del testo, pronuncia e `sintetizza_chunk_con_tempi`. |
| `05_Script/app/routers/voce.py` | Contratto SSE originale e consegna audio; separare la sintesi dall'accesso ai file della tesi. |
| `05_Script/app/core/voce.py` | Gestione audio temporanei e voci dell'applicazione originale. |
| `web/src/tests/{tempiParole,stream,citazioni,sorveglianzaFile}.test.ts` | Test di riferimento; quelli del monitoraggio file non riguardano il lettore portabile. |

## Requisiti e compatibilità

La sorgente usa Svelte 5, TypeScript, Tailwind 3, FastAPI ed `edge-tts`
(`7.2.8` nel suo `requirements.txt`). CounselorBot usa React 19, Next.js 16,
Tailwind 4 e FastAPI; ha già `edge-tts`. Verificare la versione effettivamente
installata e la disponibilità di `boundary="WordBoundary"` prima del porting.
Non copiare interi `package.json` o `requirements.txt` della tesi.

Il lettore richiede API audio del browser. Creare `Audio` e avviare gli effetti
solo nel client di Next.js, dopo un gesto dell'utente; gestire il rifiuto di
`audio.play()`. I motori locali di TD_daniele sono opzionali e usano un sidecar:
`05_Script/app/core/voce_locale.py` e `05_Script/tts_sidecar.py`. Non servono
alla prima integrazione, che può mantenere il motore già presente in CounselorBot.

## Contratto audio da preservare

Il flusso originale `GET /api/stream_voce` emette eventi SSE JSON con `type`:

| Evento | Campi rilevanti |
|---|---|
| `init` | `session_id`, `total_chunks`, `total_chars` |
| `chunk` | `index`, `text`, `paragraph_id`, `element_id`, `is_paragraph_start`, `is_heading`, `heading_level`, `words`, `audio_url` |
| `chunk_error` | `index`, `message` |
| `done` | Fine della generazione; non coincide necessariamente con fine riproduzione. |
| `error` | Errore della generazione. |

`words` nella sorgente contiene tuple `[parola, inizio, fine]`, con tempi in
**secondi relativi all'audio del segmento**, normalizzate nel client in
`{ word, start, end }`. `sintetizza_chunk_con_tempi` richiede a `edge-tts`
gli eventi `WordBoundary` e converte offset e durata dividendoli per `1e7`.
L'evidenziazione deve usare questi tempi reali.

Il testo visualizzato deve corrispondere al testo sintetizzato: pulizia Markdown,
citazioni, acronimi e normalizzazione della pronuncia possono alterare i token.
Mantenere un testo parlato canonico oppure una mappatura esplicita verso il testo
visualizzato; verificare l'allineamento con esempi reali.

Il protocollo originale accetta file e numeri di riga e produce URL con un
percorso temporaneo del server. Sono dettagli della tesi: nella destinazione
usare testo oppure identificativi autorizzati di contenuto, blocchi stabili e
risorse audio con identificativi opachi. Non esporre accesso arbitrario a file.

## Come integrarlo in CounselorBot, quando richiesto

1. Leggere `CONTEXT.md`, `AGENTS.md`, `RESOURCES.md` e le convenzioni frontend
   della destinazione. Scegliere con l'utente il punto dell'interfaccia in cui
   montare il lettore. L'attuale pulsante vocale nella chat guidata è un punto
   di integrazione già esistente, non una decisione vincolante della scheda.
2. Consultare `frontend/src/components/qsa/GuidedChatInterface.tsx`, in particolare
   `handlePlayTTS`: oggi chiama `POST /api/tts`, attende un Blob MP3 e lo riproduce
   con `Audio`. Consultare anche `backend/routes/chat.py` (`/tts`) e
   `backend/api_models.py` (`TTSRequest`). Il backend raccoglie attualmente i byte
   audio prima della risposta e non restituisce i tempi delle parole.
3. Adattare il nucleo audio TypeScript della sorgente a un modulo indipendente
   dal framework e creare un componente React client con stato per istanza.
   Una collocazione possibile è `frontend/src/components/voice-reader/`:
   questi file non sono ancora presenti. Passare contenuto, voce, callback ed
   eventi audio tramite un'interfaccia esplicita, evitando import dallo store
   Svelte, dalla selezione file e dall'editor TD_daniele.
4. Estendere il servizio TTS con un contratto per segmenti e tempi, mantenendo
   compatibili i consumatori di `/api/tts` (ad esempio tramite un nuovo endpoint).
   Recuperare `WordBoundary` come nella sorgente e inviare audio e tempi appena
   disponibili. Per un endpoint POST autenticato usare il trasporto streaming
   compatibile con l'applicazione, ad esempio `fetch` con cancellazione, oppure
   separare creazione sessione e ricezione SSE. `EventSource` nativo non invia
   body POST né header arbitrari: non copiarne l'uso senza adattarlo.
5. Conservare `counselor_id`, le associazioni voce/lingua del counselor e le sei
   lingue già gestite nella chat. Conservare `strip_for_speech` di
   `backend/diagram_blocks.py` e la pulizia Markdown: non leggere codice dei
   diagrammi. Applicare autenticazione e autorizzazione coerenti col progetto
   anche alla consegna dei segmenti audio e prevederne la pulizia temporanea.
6. Collegare evidenziazione e scorrimento al tempo dell'audio corrente.
   Gestire i segmenti per `index` stabile, senza assumere che coincida con la
   posizione nell'array: testare arrivi fuori ordine e segmenti falliti.
   Una disconnessione prima di `done` deve restare distinguibile da una
   conclusione regolare. Separare generazione completata e ascolto completato.
7. Alla chiusura, al cambio contenuto o all'avvio di un'altra lettura:
   annullare le richieste, fermare audio e animazioni, rimuovere listener e
   revocare eventuali Blob URL. Ignorare risposte tardive di sessioni precedenti.
   Prevedere controlli da tastiera, etichette accessibili, tema chiaro/scuro e
   scorrimento compatibile con le preferenze di movimento ridotto.
8. Eseguire i controlli sotto; solo dopo una prova reale nella destinazione
   aggiornare lo stato della scheda e rigenerare le istruzioni dalla Console.

## Verifiche e stato attuale

Verificato il 10 settembre 2026 sulla sorgente: `npm test --prefix web`,
**20 test passati in 4 file**. Il codice delle directory `web` e `05_Script/app`
e dei file `05_Script/leggi_voce.py` e `05_Script/tts_sidecar.py` del checkout
consultato non differiva dallo snapshot fissato. Le prove non comprendono
una nuova sintesi audio dal vivo o un porting React.

Prima di considerare l'adattamento pronto:

- Testare normalizzazione dei tempi, testo/citazioni e pronuncia; includere
  i casi di pulizia dei diagrammi e le lingue effettivamente supportate.
- Testare pausa/ripresa, cambio contenuto, arrivo fuori ordine, errore del
  primo segmento, attesa del successivo, disconnessione e fine audio dopo `done`.
- Verificare che `play()` rifiutato non mostri falsamente lo stato di riproduzione.
- Eseguire i test TTS della destinazione, inclusi
  `backend/tests/test_tts_chunking.py`, e i controlli frontend previsti dal progetto.
- Verificare nel browser desktop e mobile sincronizzazione, controlli,
  accessibilità, temi e assenza di audio residuo dopo navigazione; provare
  contenuti brevi e lunghi e le diverse voci/lingue.
- Ricostruire i servizi modificati secondo le istruzioni del progetto solo
  durante l'effettiva integrazione e verificarne il funzionamento.

Questa registrazione distribuisce sorgenti e istruzioni nella cartella
CounselorBot. Il suo lettore attuale resta quello esistente fino al porting.

Revisione scheda: d5261e2f-d40f-47b2-a2ee-52932601d217
