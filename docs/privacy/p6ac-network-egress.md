# P6a-c — perimetri di uscita rapidi

Task `4d2e0973-0b46-4c43-84df-527c4297d544`, agente `s52-p6ac-codex`.

## Comportamento

- `vision_service.call` e `AIService.call_vision` rifiutano immagini esterne
  **prima** di risolvere chiavi, creare client o chiamare il detector. La redazione
  del solo prompt non protegge una scansione. I provider esterni restano
  selezionabili per compatibilità delle configurazioni, ma non possono ricevere
  immagini. Il consenso persistente P9 non esiste ancora: nessun flag o parametro
  client abilita un'eccezione.
- QSA e pQBL verificano anche gli URL delle chiamate OCR dirette. Tentano Ollama
  fidato e il ripiego di visione configurato (solo Ollama fidato); senza modello
  locale utilizzabile restituiscono un messaggio nelle sei lingue. I PDF pQBL con
  testo nativo continuano a funzionare senza OCR.
- `privacy.policy.is_trusted_local(url)` ammette HTTP(S), loopback IPv4/IPv6 e
  `localhost`, oppure host esatti nelle due liste ambiente sotto. Rifiuta URL
  malformati, userinfo, schemi diversi, host con escape, wildcard impliciti.
  LAN, Docker, nomi contenenti «ollama» e sottodomini di localhost sono esterni
  se non dichiarati. Non effettua richieste DNS e non risolve/pinna gli IP:
  l'operatore è responsabile di DNS e servizi inclusi nella lista (gateway P6).
- `_anonymize_external` usa l'URL effettivo per Ollama e llama.cpp. Su host non
  fidati filtra messaggio, sistema e cronologia anche con `external_pii_redact=false`.
  Se è richiesto NER ma l'URL del detector Ollama non è fidato, blocca prima
  dell'invio dei testi originali; con NER disabilitato usa le regole deterministiche.
- `/tts/stream` e `/tts/voices` accettano `engine=auto` (default API): un probe
  di due secondi senza testo verifica il Piper fidato, altrimenti sceglie Edge.
  Le richieste esplicite `edge`/`piper` e le preferenze già inviate dal menu web
  sono rispettate. Piper esplicito non disponibile produce un errore, senza
  ripiego remoto del testo. Il profilo `teacher-pc` conserva il vincolo F1-07:
  Piper escluso; `auto` usa Edge filtrato.
- Edge riceve `pii.redact_always(..., fail_closed=True)`: filtro obbligatorio
  indipendente dai flag chat/log, dopo la pronuncia e **prima** della segmentazione
  (un identificativo non può sfuggire dividendosi fra chunk). Anche la sintesi
  diretta filtra. Segmenti SSE e parole seguono il testo letto. Un guasto ferma
  la richiesta con 503 o il chunk con `chunk_error`, senza testo nelle eccezioni.
- OCR, vision, detector NER e Piper disabilitano proxy da ambiente e redirect
  automatici per non spostare contenuti verso una destinazione diversa.

## Configurazione operatore

```dotenv
# Host esatti, separati da virgole o spazi, senza schema, porta, path o wildcard.
# Solo se questi servizi appartengono al perimetro fidato dell'installazione:
PRIVACY_LOCAL_HOSTS=piper,host.docker.internal
TRUSTED_LOCAL_HOSTS=
PIPER_URL=http://piper:8000
```

Le due liste sono additive; vuote significano solo loopback. Non copiare un host
remoto nella lista per aggirare il blocco: dichiararlo significa includerlo nel
perimetro di trattamento locale. Non ci sono modifiche DB o migrazioni.
Con Compose entrambe le installazioni leggono `.env` del backend: aggiungere i
soli host gestiti e ricreare il backend nel normale deploy. `.env.example` contiene
l'esempio Docker, senza modificare `.env` o dati di produzione.

## Verifiche

```bash
~/.pyenv/versions/3.11.9/bin/python -m pytest backend/tests/test_privacy_p6ac_egress.py
TEST_DB=sqlite ~/.pyenv/versions/3.11.9/bin/python -m pytest \
  backend/tests/test_privacy_p6ac_egress.py backend/tests/test_qsa_vision_fallback.py \
  backend/tests/test_pqbl_vision_ocr.py backend/tests/test_voice_reader.py \
  backend/tests/test_teacher_profile.py backend/tests/test_external_privacy.py \
  backend/tests/test_pii_external.py backend/tests/test_privacy_core.py
make guidance-refresh
make guidance-check
docker build -f backend/Dockerfile -t counselorbot-privacy-p6ac:local .
docker run --rm --network none -e TEST_DB=sqlite counselorbot-privacy-p6ac:local \
  python -m pytest backend/tests/test_privacy_p6ac_egress.py -q --disable-warnings
```

Prima esecuzione: 57 test P6a-c e 350 test di regressione superati (Python 3.11.9).
I test bloccano socket/trasporti reali e ispezionano richieste sintetiche; non
contattano provider, non usano dati reali e non richiedono Postgres. Risultati
finali, guidance e Docker registrati nell'handoff del branch.
Guida `/guide` e relative chiavi nelle sei lingue revisionate: raccomandano già
PDF con testo selezionabile, nessun cambiamento di navigazione o layout; messaggi
OCR aggiornati nel backend. Nessuna schermata nuova e nessuna cattura da aggiornare.

## Limiti

La redazione Edge è quella deterministica esistente: riconosce contatti e codici,
non tutti i nomi, luoghi, scuole o dati sanitari in prosa. Il motore P4 non viene
collegato qui: gateway unico, verifica residui, consenso e protezioni complete
restano P6/P9. Queste correzioni non attestano anonimato o conformità GDPR.
Gli altri punti di uscita (per esempio il vecchio `/chat/tts`) restano oggetto
del gateway P6; questo blocco riguarda il lettore progressivo `/tts`.
Nessun deploy o comando sudo richiesto per questa sessione; nessun servizio dev
avviato. L'immagine è costruita e verificata con un tag isolato.
