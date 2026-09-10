# Lettore audio e pronuncia

Il pulsante **Lettore audio** (cuffie nella barra superiore) è disponibile per
tutti, anche nella guida pubblica. **Ascolta pagina** legge il testo visibile
della pagina corrente; non include moduli, bozze, navigazione, pannelli nascosti
o trascrizioni delle chat. Le risposte di Bussola e della chat guidata hanno il
proprio pulsante **Ascolta**. Aprire il lettore lascia montata l'attività e
conserva i messaggi non ancora inviati. Il pannello è fluttuante: non riduce la larghezza della pagina e non
blocca clic, scrittura o invio dei messaggi. Si può spostare trascinando
il titolo con mouse o touch, oppure usando le frecce quando il titolo ha
il focus. Rimane entro lo schermo anche dopo un ridimensionamento. **Riduci lettore**
lascia l'audio attivo e mostra una barra con pausa/ripresa, espansione e chiusura;
Ascolta apre direttamente questa barra compatta su desktop e telefono.

Il pannello offre pausa/ripresa, arresto, segmento precedente/successivo,
chiusura ed Escape quando il focus è nel lettore. Navigazione, cambio lingua,
cambio contenuto e chiusura interrompono richieste e audio. Il testo originale
della pagina o della conversazione non viene modificato né duplicato nel pannello.
Il passaggio in lettura è evidenziato direttamente nel testo originale. Un
doppio clic su una parola avvia una nuova lettura da quella parola: continua
nei paragrafi successivi della pagina oppure fino alla fine della risposta
selezionata nella chat. Le selezioni in moduli, bozze, pulsanti o link non
avviano la lettura. Su dispositivi touch rimane disponibile il pulsante Ascolta.
L'evidenziazione usa intervalli DOM, senza sostituire i nodi di testo di React
né spostare automaticamente lo scorrimento mentre si scrive.

## Motori e voci

- **Edge · servizio online** usa il servizio di sintesi di Microsoft tramite
  `edge-tts`. Conserva gli eventi reali `WordBoundary` nel protocollo audio.
- **Piper · server locale** usa esclusivamente il servizio Docker `piper` sul
  server di CounselorBot. Durante la sintesi non richiede una connessione
  esterna e non ripiega su Edge in caso di errore. Questa integrazione non
  produce tempi delle singole parole. Entrambi i motori evidenziano il
  passaggio originale nella pagina, anche quando la pronuncia lo trasforma.

Voce e motore sono salvati nel browser per lingua e counselor
(`cb_voice_it_counselor_2`, ecc.; `cb_voice_it` per chi non ha un counselor).
La preferenza è disponibile a tutti i ruoli, senza privilegi amministrativi;
non è sincronizzata fra dispositivi. Le vecchie preferenze globali conservano
il motore, ma non impongono a tutti i counselor la stessa voce personale.
Una scelta esplicita prevale sul profilo soltanto per quel counselor e lingua.

La modalità automatica usa il counselor della risposta oppure quello mostrato
nell'intestazione quando si legge una pagina o si prova una pronuncia. Edge
conserva la sua `voice_mapping`; Piper sceglie una voce dello stesso genere
vocale nella lingua richiesta. `backend/voice_profiles.json` conserva una
copia dei metadati `Gender` del catalogo Edge (10 settembre 2026) e gli
abbinamenti Piper, così la scelta locale non richiede chiamate a Microsoft.
I profili configurati distinguono, per esempio, Sara/Ava da Marco/Giuseppe;
il codice non deduce il genere dalla desinenza di un nome. Se un counselor
non ha un profilo vocale noto, resta la voce predefinita della lingua.

Piper include dodici voci, femminili e maschili in tutte le sei lingue:

| Lingua | Femminile | Maschile |
| --- | --- | --- |
| Italiano | Paola | Riccardo |
| Inglese | Lessac | HFC male |
| Spagnolo | Sharvard, speaker F (1) | Davefx |
| Francese | Siwis | UPMC, speaker Pierre (1) |
| Tedesco | Kerstin | Thorsten |
| Svedese | Lisa | NST |

I metadati e i file restano fissati alla revisione del
[catalogo Piper](https://huggingface.co/rhasspy/piper-voices/blob/1162a9173d0ce503555aed757976b7a9912eae4c/voices.json).
Il manifest conserva `gender` e, per i modelli con più parlanti,
`default_speaker_id`: la sintesi deve passarlo a `SynthesisConfig`.
Lessac usa la voce di Catherine Byers, documentata dal
[progetto Blizzard](https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/).
Kerstin è documentata nel [dataset originale](https://github.com/rhasspy/dataset-voice-kerstin).
Il selettore indica genere vocale e lingua. **Prova voce** e le prove di
pronuncia usano lo stesso profilo della lettura.

## Correzioni della pronuncia

Aprire **Correzione della pronuncia**, cercare un termine, modificarlo oppure
inserire una nuova coppia **Parola, nome o sigla → Leggi come** e premere
**Salva correzione**. **Prova pronuncia** permette di ascoltare una grafia
prima di salvarla. **Testo di prova** e **Ascolta il testo corretto** applicano
le regole salvate a una frase completa. La casella **Applica le correzioni**
permette di confrontare la lettura con e senza dizionario. Le singole regole
possono essere eliminate.

Il dizionario iniziale è una copia integrale, byte per byte, di
`TD_daniele/05_Script/dizionario_pronunce.json` al commit
`be44ce5d70c49babcc45bb1dd3506569e0dd858c`, uguale al checkout sorgente verificato
il 10 settembre 2026: **80 regole italiane e 49 inglesi**, comprese le
correzioni degli accenti (`domini → domìni`, `mediano → mèdiano`), nomi e sigle.
La copia è `frontend/src/lib/voice-pronunciation-defaults.json`.
SHA-256: `7f71a3408a2c51062b07567164cb4b3054b30fb9ffd3eb1d3d66d0f761ad186e`.
Le altre quattro lingue iniziano senza regole; l'utente può aggiungerle.

Le modifiche sono personali e salvate per lingua in questo browser
(`cb_pronunciation_it`, ecc.), senza alterare il dizionario sorgente di
TD_daniele. Si applicano a entrambi i motori e a tutti i punti di lettura.
Il server pulisce Markdown, link, citazioni Pandoc e diagrammi, applica le
correzioni e divide il risultato in segmenti. Il primo contiene al massimo
180 caratteri, preferendo una frase completa e poi uno spazio fra parole;
i successivi mantengono il limite di 700 caratteri. L'audio del primo segmento
parte appena disponibile, mentre il server prepara i successivi. Il testo
parlato canonico resta nel protocollo; la pagina mantiene la grafia originale.
Le sostituzioni usano parole/termini interi, privilegiano quelli più lunghi e
avvengono in un solo passaggio. Le sigle tutte maiuscole fino a quattro
caratteri distinguono le maiuscole (`AI` non modifica la preposizione `ai`).
Le altre regole ignorano la differenza fra maiuscole e minuscole.

## Contratto e distribuzione

- `GET /tts/voices?engine=edge|piper`: catalogo del motore; Edge ha una cache
  in memoria di un'ora, Piper espone soltanto le voci installate. Ogni voce
  include `id`, `name`, `locale` e `gender` (`female` o `male`).
- `POST /tts/stream`: `text`, `language`, `engine`, `voice`, `counselor_id`
  facoltativo, `voice_override`, `pronunciations: [{term, spoken}]` e
  `plain_text` (default false). Il frontend usa `plain_text: true` per il
  testo già estratto dal DOM: non va interpretato di nuovo come Markdown.
  Massimo 120.000 caratteri, anche dopo le sostituzioni, e 200 regole.
- SSE: `init` contiene tutti i segmenti con `index`, `paragraph_id`, `text`;
  `chunk` contiene audio Base64, MIME e tempi `[parola, inizio, fine]` in secondi;
  `chunk_error` segnala il segmento fallito; `done` chiude la generazione.
  La fine della generazione non è la fine della riproduzione. Una connessione
  chiusa senza `done` è un errore esplicito.
- `/api/tts/stream` ha una route Next dedicata che evita il buffering del
  rewrite e inoltra autenticazione e cancellazione. L'accesso segue la
  stessa politica di autenticazione al proxy del precedente `/tts`.
- Audio e testo non sono salvati sul server: niente file temporanei, URL
  pubblici o record di conversazione creati per la lettura. Gli URL Blob
  del browser vengono revocati all'arresto. `/tts` MP3 resta compatibile.

Il servizio Piper è separato per isolare le dipendenze: `piper-tts==1.8.0`,
CPU, due thread ONNX, cache massima di due modelli, limite di due CPU e 2 GiB,
filesystem in sola lettura. Non pubblica porte sull'host. I modelli vengono
scaricati **durante la build**, verificati con i checksum del catalogo e
incorporati nell'immagine insieme alle rispettive `MODEL_CARD`.
`services/piper/voices.json` fissa il catalogo al commit Hugging Face
`1162a9173d0ce503555aed757976b7a9912eae4c`.
Piper è distribuito dal progetto OHF-Voice con licenza GPL-3.0; le schede dei
modelli conservano separatamente le indicazioni dei rispettivi dataset.

```bash
docker compose up -d --build --no-deps piper backend frontend
docker compose ps piper backend frontend
docker exec counselorbot_backend python -m pytest backend/tests/test_voice_reader.py
docker exec counselorbot_backend python -m backend.tests.test_tts_chunking
docker run --rm --network none -v "$PWD/services/piper/test_server.py:/app/test_server.py:ro" counselorbot-10-step-piper python test_server.py
cd frontend
npm test
npm run lint
VOICE_LIVE=1 node --test tests/voice-reader.test.mjs
node --test --experimental-strip-types --test-name-pattern='one kebab and direct per-response audio' tests/visual-tools.test.mjs
```

Le prove browser usano identità e conversazioni sintetiche. `VOICE_LIVE=1`
abilita anche la riproduzione WAV reale di Piper attraverso il proxy Next;
`VOICE_BASE_URL` permette di cambiare frontend. Le altre prove simulano il
trasporto/audio per verificare in modo deterministico errori e concorrenza.
Sono state verificate anche la sintesi Edge nelle sei lingue e le sette voci
Piper in un container con `--network none`.

## Provenienza

Il porting del lettore segue `RESOURCES.md`, la ricetta della Libreria Console
e `codaAudio.ts`, `streamVoce.ts`, `Pronuncia.svelte`, `leggi_voce.py` nello
snapshot TD_daniele indicato. Non richiede l'editor o i file della tesi.
Il catalogo Console e i suoi file generati restano separati da questa
documentazione dell'integrazione.

- [Piper, API Python](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/API_PYTHON.md)
- [Piper, allineamenti sperimentali](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/ALIGNMENTS.md)
- [edge-tts, WordBoundary](https://github.com/rany2/edge-tts/blob/master/src/edge_tts/communicate.py)
