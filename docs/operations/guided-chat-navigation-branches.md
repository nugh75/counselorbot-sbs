# Navigazione dei passi e rami di approfondimento

## Audit e piano prima del codice — 20 ottobre 2026

Base: merge verificato della PR #414 (`5e14001a`). Il proprietario ha scelto
**tutti i passi selezionabili, rispettando il patto iniziale**.

Stato rilevato:

- Il percorso laterale rende i passi come `div`, non come comandi. Considera
  conclusi tutti i passi precedenti all'indice attivo: un salto renderebbe falsa
  questa indicazione. Indietro elimina la memoria delle visite e rigenera.
- Messaggi e memoria sono una sola sequenza; i rami di IDEA hanno una gestione
  propria. Il congelamento salva messaggi e fase, senza checkpoint di rientro,
  bozze o approfondimenti. Un ramo richiede quindi stato e isolamento reali.
- Il percorso comune `prepare_chat_turn` serve sincrono, SSE e audit; i segnali
  privati vengono già separati dal testo. I turni finali possono registrare il
  completamento di un piano: un approfondimento non deve generare quella prova.

Piano:

1. Comandi accessibili nel percorso, anche nella finestra mobile. Selezionare un
   punto cambia il contesto; un punto già aperto non viene rigenerato. Saltare
   non completa i punti intermedi. Il patto resta un prerequisito esplicito.
2. Aprire un ramo dopo la scelta di approfondire, mediante segnale del counselor
   riconosciuto solo da client che supportano la funzione; offrire anche apertura
   esplicita con titolo. Un livello di rami, senza annidamento ricorsivo.
3. Mostrare titolo, passo di provenienza e «Torna al percorso». Conservare fase,
   bozza e posizione di lettura del genitore; salvare separatamente la bozza del
   ramo. Il rientro non avanza e non rigenera il passo. I rami restano riapribili.
4. Isolare la cronologia del ramo da altri approfondimenti; conservare contesto
   precedente del genitore e trascrizione integrale. Niente avanzamento o prove
   di completamento durante un ramo. I client precedenti conservano il dialogo
   in linea. Nessuna migrazione dei prompt personalizzati o dello schema DB.
5. Estendere lo snapshot JSON con checkpoint e identificatori dei messaggi;
   ripristinare sessioni nuove e precedenti, comprese bozze e ramo attivo.
6. Test di navigazione, patto, ripresa, sincrono/SSE, isolamento e completamento;
   verifica browser desktop/mobile, sei lingue, guida, documentazione, build
   isolate e PR. Nessun rilascio operativo prima della revisione.

Struttura prevista:

```text
Percorso                         Approfondimento: iniziare lo studio
  1. Profilo                     Dal passo: Organizzazione
  2. Organizzazione              [Torna a Organizzazione]
     ↳ Iniziare lo studio        Conversazione dedicata
  3. Motivazione
```

Il titolo automatico usa il passo di provenienza; l'apertura manuale permette un
titolo specifico. I segnali si applicano soltanto a una risposta completata.
I test con risposte simulate verificano stato e protocollo, senza attestare la
naturalezza o l'affidabilità di un modello effettivo.

## Implementazione

- `GuidedChatInterface`: passi come pulsanti accessibili, stato visitato distinto
  da completato, patto prerequisito anche per la freccia avanti, ritorno senza
  rigenerazione. Navigazione mobile nello stesso pannello Percorso.
- Rami con titolo, origine, trascrizione e bozza proprie, pulsante di rientro,
  checkpoint della fase e della lettura. Apertura manuale dalle opzioni oppure
  automatica dopo il consenso e una risposta completata. Nessun annidamento.
  In IDEA l’elenco dei rami facoltativi resta distinto dalla mappa; il ramo
  non sposta il fuoco della mappa. Il follow-up virtuale della sintesi QSA
  conserva la sintesi come punto visibile di ritorno.
- Protocollo runtime condiviso da sincrono, SSE e audit: capability
  `supports_explorations`, contesto `exploration`, segnali privati
  `APRI_APPROFONDIMENTO` e `TORNA_AL_PERCORSO`, metadati open/stay/return.
  I client precedenti conservano il comportamento in linea. Un ramo attivo
  non esegue la consegna del passo genitore né la sua sintesi; lo strumento
  autorizzato del passo prevale sulle dichiarazioni del client.
- La memoria conserva separatamente il checkpoint e la coda del ramo: fino
  a 12 turni / 6000 caratteri per ciascuna conversazione, più il checkpoint
  del genitore. Un approfondimento lungo non espelle la domanda del percorso.
  I log conservano la cronologia integrale con metadati del ramo; la sintesi
  del percorso può recuperare le evidenze della sessione. Nessun avanzamento,
  contatore di scambi del genitore, completamento del piano operativo o modifica
  alla mappa IDEA deriva dal ramo; bozze Obiettivo/Libretto escluse.
- Snapshot JSON con `guided_navigation`, checkpoint, patto, visite, rami e tag
  dei messaggi. Nessuna migrazione DB. Dopo la scadenza della memoria temporanea
  si ricostruisce la cronologia solo dallo snapshot del proprietario autenticato.
  Sessioni precedenti compatibili. Guida nelle sei lingue e immagini aggiornate.

## Verifiche e limiti

Risposte simulate, nessun LLM live o dato produttivo. Batteria iniziale di
708 test backend superati; seconda batteria mirata di 228 superati, parzialmente
sovrapposta (API dei rami, SSE, interruzioni, proprietà degli snapshot, audit,
IDEA, preferenze e chiusure dei passi). Cinque test puri ricontrollati localmente
sullo stato finale della memoria e del protocollo. Il test aggiunto al contatore
SQL e il caso aggiuntivo di strumento dichiarato diverso dall’origine non sono
stati rieseguiti su Postgres dopo l’indisponibilità di Docker Desktop.

Frontend: 600 unitari, sette nuovi casi browser (390/1440 px, patto, salti,
ritorno, bozze, riapertura, ripresa, segnale interrotto, IDEA e follow-up QSA),
sei regressioni essenziali/Obiettivo e acquisizione delle due immagini della
guida. TypeScript, lint mirato, i18n (3408 chiavi nelle sei lingue) e guidance.
La verifica visuale mobile conferma intestazione, ritorno e campo di scrittura
senza scorrimento orizzontale. L’apertura automatica dipende dal modello; il
comando manuale rende disponibile il ramo anche se il segnale manca.

La ripresa essenziale ha inizialmente rivelato un’inizializzazione duplicata in
React Strict Mode: risolta mantenendo lo scope di sessione tra i due effetti.
Un primo caricamento browser dopo la ricompilazione ha superato i 15 secondi
previsti dalla fixture; ripetuto a compilazione completata, supera la prova.

Build backend e frontend Docker completate il 20 ottobre 2026 dopo il ripristino
di Docker Desktop, precedute dalla pulizia della cache delle vecchie build e delle
immagini inutilizzate (circa 35 GB recuperati, immagini in uso e tag di ripristino
conservati). Il compose portabile ha ricreato `counselorbot-backend` e
`counselorbot-frontend`: entrambi sono healthy, il frontend su loopback :3108
risponde 200, `/auth/me` del backend risponde 200 e l'ingresso pubblico risponde
302 verso l'autenticazione. Il codice distribuito contiene il nuovo modulo
`backend/guided_explorations.py` e le stringhe della navigazione nei bundle
frontend. I volumi non sono stati toccati e le immagini
`rollback-before-dcedc209` restano disponibili per il ripristino.

Comandi principali ripetibili:

```sh
cd frontend
npm test
npx tsc --noEmit
npm run i18n:check
CHAT_PREFS_BASE_URL=http://127.0.0.1:3157 node --test tests/guided-navigation.test.mjs
CHAT_PREFS_BASE_URL=http://127.0.0.1:3157 node --test --test-name-pattern='QSA essential|failed essential|Obiettivo essential|Obiettivo complete|Obiettivo snapshot' tests/chat-preferences.test.mjs
```

I test TypeScript richiedono Node con supporto alla rimozione dei tipi (qui Node
26); il runner dell’app usa la versione compatibile con Next già installata.
Backend: `python -m pytest backend/tests/test_guided_explorations.py`, con
`DATABASE_URL` rivolto esclusivamente a Postgres di test e
`PYTHON_DOTENV_DISABLED=1 COUNSELOR_TRANSLATE_DISABLED=1 ADMIN_SYNC_DISABLED=1`.
Per i test effettuati in container è stato usato lo schema sintetico e reversibile
di `artifact_session`, nel solo database `counselorbot_test`.

Runner e limiti di accesso restano in `scripts/dev-guided-choice-tests.sh` e
`docs/operations/live-dev-environment.md` (:3157, backend disabilitato fuori dalle
fixture). Questi runner non eseguono deploy e non richiedono `sudo`. Il container
Postgres di validazione è stato riavviato e `counselorbot_test` ricreato per la
verifica finale: `test_guided_explorations.py`, `test_control_markers.py` e
`test_chat_preparation.py` danno 58 test superati, 1 saltato e il solo
`test_live_audit_fallback_receives_original_history` fallito, già riprodotto sulla
base. La suite backend completa su un unico database condiviso non è un confronto
valido: i file che richiedono il Postgres dedicato su 127.0.0.1:18650 e le fixture
che presuppongono stato pulito danno i fallimenti ambientali già noti, quindi la
verifica del rilascio usa la batteria mirata.
