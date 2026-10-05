# Abbonamento personale ChatGPT

Flusso ufficiale **Sign in with ChatGPT (SIWC)** per inferenza diretta con
Responses API, verificato sui documenti OpenAI il 3 ottobre 2026. Non richiede
un agente Codex. Chat e memoria restano in CounselorBot; OpenAI elabora i
messaggi inviati. `openai_chatgpt` è distinto da `openai` con API key e costi API.

## Ammissibilità e stato

La funzione è **spenta per impostazione predefinita**. L’anteprima descrive
strumenti open source locali e VM personali con trasferimento protetto dei
token. Non estende automaticamente l’ammissibilità a un servizio remoto
condiviso da una scuola/università. Verificare il percorso autorizzato da OpenAI
per l’installazione concreta prima di un pilota con persone reali. Questo codice
implementa `dynamic_agent_client` per strumenti open source; non implementa
la registrazione di partner per servizi ospitati.

I documenti attuali descrivono piani personali Plus/Pro ammessi all’anteprima:
non promettere accesso a Business, Enterprise o Edu senza verifica. Il repository
non contiene un file LICENSE: il proprietario deve scegliere/pubblicare la
licenza prima della distribuzione che richiede ammissibilità open source.
Questa modifica non sceglie una licenza per lui.

Nessun account OpenAI reale è stato collegato durante lo sviluppo. Prima
dell’uso verificare con un account ammesso: accesso iniziale, catalogo modelli,
risposta reale, rinnovo, revoca e ricollegamento. I test automatici usano JWT
firmati di prova, PostgreSQL isolato e risposte simulate; non dimostrano quota
disponibile o ammissibilità del server presso OpenAI.

## Attivazione dalla pagina Amministrazione

Dopo il normale aggiornamento dell’applicazione, un amministratore apre
**Amministrazione → Configurazione → Generale → Collegamento ChatGPT** e preme
**Abilita collegamento ChatGPT**. Non deve generare chiavi, modificare `.env`
o eseguire comandi. Il server prepara la protezione delle credenziali e salva
la scelta nel database. La modifica vale per le nuove richieste immediatamente,
senza riavvio. **Apri il tuo collegamento ChatGPT** porta a `/profilo/chatgpt`:
ogni utente collega e attiva il proprio account, separatamente dal controllo
amministrativo.

**Disabilita collegamento ChatGPT** blocca nuove associazioni e richieste
personali, mantenendo le registrazioni e le credenziali cifrate. Le nuove
richieste usano il modello dell’installazione per scelta dell’amministratore.
La voce, i badge e la sezione della Guida vengono nascosti; le pagine dirette
rimandano alla rispettiva area personale. Riabilitare riusa la stessa chiave,
gli stessi account e la preferenza salvata. L’endpoint di scollegamento resta
accessibile al proprietario autenticato, anche con la funzione disabilitata.

Solo gli amministratori reali possono leggere o modificare il controllo.
Ricercatori, studenti e anteprime di ruolo non possono attivarlo. Le API dedicate
sono GET/PUT `/admin/chatgpt/settings`; il PUT richiede il normale header anti-CSRF
CounselorBot. Chiave e token non vengono restituiti al browser. Le chiavi
`chatgpt_*` sono escluse dalla configurazione generica e non sono scrivibili da
`/admin/config`, per impedire bypass del controllo dedicato e cambi dell’host ID.

## Chiave persistente e backup del server

Alla prima attivazione, se non è già fornita una chiave dall’operatore, il backend
crea una chiave Fernet in `chatgpt_credentials/credential.key`, accanto alla
cartella `backend`. La directory è privata (0700), il file è 0600; creazione e
pubblicazione atomica impediscono a worker concorrenti di usare chiavi diverse.
La chiave è esclusa da Git e dal contesto Docker e non entra nelle immagini.
In Docker Compose il volume dedicato `chatgpt_credentials` è già montato su
`/app/chatgpt_credentials` e sopravvive a riavvii e sostituzioni dei container.
In sviluppo nativo la directory resta nella copia locale; conservarla quando
si aggiorna o si sposta l’installazione.

Il backup deve conservare sia il database sia questo archivio protetto, con
accesso limitato e copie coerenti. Non cancellare il volume. Se la chiave manca
ma il database contiene account già collegati, il pannello richiede di
ripristinarla dal backup: non ne genera una nuova che renderebbe i token
illeggibili. Anche una chiave presente ma non valida impedisce l’attivazione e
non viene sostituita. Un percorso non scrivibile mostra un errore senza salvare
l’attivazione. Il recupero del backup resta un’operazione dell’amministratore
del server; non è una nuova configurazione richiesta agli utenti.

Gli operatori che già usano un gestore di segreti possono continuare a fornire
`CHATGPT_CREDENTIAL_KEY_FILE` oppure `CHATGPT_CREDENTIAL_KEY`: hanno precedenza
sulla chiave automatica, incluso in caso di errore, e non vengono rigenerati.
`CHATGPT_CREDENTIALS_DIR` permette di scegliere un’altra directory persistente
per la chiave automatica. Non modificare questa scelta dopo aver collegato
account senza trasferire anche la chiave esistente.

La scelta `Config.chatgpt_enabled` salvata dal pannello prevale su
`CHATGPT_ENABLED`. La variabile resta solo una configurazione iniziale per
installazioni senza una scelta amministrativa salvata; il valore iniziale
predefinito è `false`. Disattivare dal pannello funziona anche con una chiave
mancante o una variabile iniziale `true`.

Lo startup aggiunge `chatgpt_connections` e `chatgpt_links` al database PostgreSQL;
i prompt e i dati esistenti non vengono sovrascritti. L’autenticazione resta
ai4auth. Il normale aggiornamento Docker deve ricostruire le immagini e applicare
il nuovo montaggio persistente; questa modifica non effettua deploy. Lo strumento
grafico macOS viene distribuito separatamente dall'immagine Linux. L'alternativa
CLI Python è inclusa nel backend e usa Python 3.10+ sul computer dell’utente.

## Collegamento grafico sul Mac dell’utente

Il percorso principale usa **CounselorBot ChatGPT**, un'app nativa per macOS
12 o successivo, con un unico ZIP per Mac Intel e Apple Silicon. L'utente non
deve installare Python né aprire il Terminale. L'app va aperta sul computer
in cui usa il browser, anche quando CounselorBot gira su un server remoto.

1. Accedere a CounselorBot e aprire **Area personale → Il tuo abbonamento ChatGPT**
   (`/profilo/chatgpt`), oppure la stessa voce nell’Area docenti (`/docente/chatgpt`).
2. Premere **Collega ChatGPT**, quindi **Scarica l’assistente grafico per macOS**.
   Aprire `CounselorBot-ChatGPT.zip` nel Finder e aprire l'app estratta.
3. Nell'app verificare **Indirizzo di CounselorBot**, per questa installazione
   `https://counselorbot.labform.net`. Copiare il codice dalla pagina e incollarlo
   nel campo **Codice di associazione CounselorBot**; premere **Collega con ChatGPT**.
   Il codice scade in 10 minuti: non salvarlo in file e non incollare token OpenAI.
4. Completare l’accesso ufficiale nel browser. Il callback è
   `http://127.0.0.1:<porta>/auth/callback`, sul computer dell’utente.
5. Tornare a CounselorBot, scegliere un modello disponibile per l’account e
   premere **Usa il mio abbonamento**. Il solo collegamento non abilita il piano.

L'archivio si scarica da `GET /api/chatgpt/helper/macos`: richiede la sessione
Console del proprietario e rifiuta le anteprime di ruolo. Il download è un
attachment `application/zip` con `Cache-Control: no-store`. Quando il pacchetto
non è disponibile, lo status personale riporta `macos_helper_available=false`,
il download risponde 404 e la pagina mostra l'alternativa manuale.

L'app è firmata ad hoc, senza Developer ID né notarizzazione Apple. Gatekeeper
può impedirne la prima apertura. Dopo aver verificato la provenienza dal proprio
sito CounselorBot, l'eventuale autorizzazione riguarda questa app e si esegue
solo dall'interfaccia di macOS: **Impostazioni di Sistema → Privacy e Sicurezza
→ Apri comunque**, seguendo le conferme; su macOS 12 il pannello è
**Preferenze di Sistema → Sicurezza e Privacy → Generali**. Se l'organizzazione
impedisce l'autorizzazione, rivolgersi al suo amministratore. La procedura non
richiede comandi per disabilitare Gatekeeper o rimuovere la quarantena. Vedere
la [guida Apple per aprire app scaricate](https://support.apple.com/it-it/102445).

Il codice associa il trasferimento a un utente già autenticato. Lo strumento
non sceglie uno username, mantiene i token solo in memoria e rifiuta redirect
HTTP durante il trasferimento e callback con state errato. Le credenziali
viaggiano su HTTPS o su un tunnel localhost; non passano al browser di
CounselorBot o a localStorage. Il backend verifica firme, issuer, audience,
nonce, identità di ritorno, client registrato e permessi di inferenza. PKCE,
state, nonce e identificatore opaco della VM fanno parte del flusso OAuth.

## Alternativa CLI e proxy di associazione

La sezione manuale della pagina permette di scaricare `chatgpt-connect.py` e
usare il comando mostrato, con Python 3.10 o successivo. Anche questo helper
va eseguito sul computer dell'utente, con il browser, fuori dai container e
dal terminale del server. Il codice viene richiesto interattivamente: non
aggiungerlo agli argomenti del comando.

Nella configurazione portabile **non serve un tunnel SSH**. Il proxy lascia
passare soltanto tre percorsi esatti per l'associazione, autenticati dal backend
con il codice temporaneo nell'header `Authorization: Bearer ...`:

- `GET /api/chatgpt/link/parameters`;
- `POST /api/chatgpt/link/registration`;
- `POST /api/chatgpt/link/complete`.

Questi percorsi non richiedono il cookie SSO che l'app locale non possiede.
Non autorizzano le altre API: pagina personale, generazione del codice,
preferenze e download macOS mantengono la sessione Console. Le eccezioni sono
esatte, limitano i metodi e la dimensione del body, rimuovono cookie/header
identità forniti dal client e applicano `no-store`. Codice assente, invalido o
scaduto non concede il trasferimento. Il template è
`infrastructure/portable/nginx-counselorbot.conf.template`; dopo un suo
aggiornamento, riapplicarlo con `scripts/register-portable-console.mjs`.

Su installazioni diverse il proxy potrebbe ancora richiedere un login anche
ai tre percorsi di associazione. Se non viene adattato con queste eccezioni,
avviare il collegamento nell'interfaccia autenticata e usare un tunnel verso
**Next locale**, senza il proxy di autenticazione, per l'alternativa CLI:

```bash
# Next dev sul server: 127.0.0.1:3107; tunnel dal computer dell’utente.
ssh -N -L 3107:127.0.0.1:3107 <utente>@<server>
# Secondo terminale, cartella del file scaricato:
python3 chatgpt-connect.py --server http://localhost:3107
```

In produzione la porta di destinazione può essere quella del frontend interno
(es. 3000): adattarla all’installazione. Il tunnel permette solo l’associazione
con il codice temporaneo, non sostituisce l’autenticazione alle altre API.
In Codespaces usare l’inoltro locale di VS Code verso il frontend; non rendere
pubblico un Codespace privato per trasferire credenziali. Eseguire lo strumento
sul computer dell’utente, anche quando il sito è remoto.

## Preparazione del pacchetto macOS da parte dell'operatore

Su un Mac con strumenti Xcode/Command Line Tools e SDK macOS, eseguire:

```bash
bash scripts/build-chatgpt-macos.sh
```

Lo script esegue i test del protocollo, compila le versioni `arm64` e `x86_64`
con target minimo macOS 12, le unisce in un'app universale, applica/verifica
la firma ad hoc e genera `dist/chatgpt-macos/CounselorBot-ChatGPT.zip` con
checksum SHA-256. Una distribuzione notarizzata richiede un distinto processo
con certificato Developer ID e notarizzazione Apple; la build locale non lo
esegue. Conservare solo sorgenti e script in Git: ZIP, app e altri binari di
`dist` restano artefatti locali esclusi dal repository.

Il Compose portabile monta `./dist/chatgpt-macos:/app/chatgpt-macos:ro` e
imposta `CHATGPT_MACOS_HELPER_DIR=/app/chatgpt-macos`. Il backend cerca soltanto
`CounselorBot-ChatGPT.zip` in quella directory, controllando che sia un file.
L'override della directory è una scelta dell'operatore, non un parametro del
download. Senza override usa `dist/chatgpt-macos` nella radice del checkout.
Non copiare il pacchetto macOS nel Dockerfile: un clone o una build Linux può
avviare normalmente CounselorBot senza produrre questo artefatto e riporta
la disponibilità a `false` finché manca il ZIP.

Dopo l'introduzione del mount, ricreare il backend con il Compose portabile.
I successivi aggiornamenti del ZIP sono visibili tramite il bind readonly
senza ricostruire l'immagine Linux. Il link autenticato della pagina personale
serve il pacchetto dalla directory montata, senza esporre percorsi locali.

## Isolamento, scelta e quota

Una connessione per username ai4auth e una registrazione per account verificato.
Il modello personale precede il preset del counselor nelle richieste native
autenticate, nella Bussola, nelle sintesi e nel pQBL del proprietario del PDF.
Consultare un altro studente usa l’identità del richiedente, non il collegamento
di quello studente. Profili demo e processi di sistema senza utente non usano
abbonamenti personali.

Una richiesta ChatGPT attiva non ripiega su API personali, API di sistema o
modelli locali in caso di errore o quota esaurita. L’esplicita disattivazione
amministrativa seleziona invece il modello dell’installazione per le nuove
richieste. Un override operativo `CHATGPT_ENABLED=false` senza una scelta
amministrativa conserva il precedente comportamento di blocco della preferenza.
Non si inventano contatori o orari di reset; la quota si consulta su ChatGPT.
I nomi dei modelli non vengono usati per stimare costi con il listino API.

Attivare **Usa il mio abbonamento** disattiva la preferenza delle API personali,
e viceversa. Entrambe le credenziali restano conservate. I due pannelli applicano
la scelta con un lock condiviso per account, anche nei salvataggi simultanei.

**Scollega** elimina sempre i token locali e tenta la revoca OpenAI. Se la revoca
non è confermata, controllare anche le connessioni nelle impostazioni ChatGPT.
La registrazione resta per ricollegare lo stesso account. Per usarne un altro,
azzerarla con il pulsante dedicato dopo aver scollegato il primo.

## Rinnovo e ripristino

La chiave cifrante e `Config.chatgpt_host_id` devono restare stabili. La registrazione
conserva anche il client ID pubblico prima dello scambio del codice: se
lo scambio fallisce, un nuovo accesso riusa la registrazione senza attivare
un grant non verificato. Il rinnovo usa un lock PostgreSQL e sostituisce access token, refresh token rotante,
permessi e scadenza insieme. Una sessione separata evita di committare scritture
pendenti di chat/punteggi. Il limite `earliest_refresh_at` viene rispettato.

Solo i codici espliciti di refresh invalidato/scaduto cancellano il grant e
richiedono nuovo accesso; problemi di rete/servizio conservano i token.
`invalid_client` richiede verifica della registrazione/configurazione, senza
cancellazione automatica. Una chiave cifrante errata non è trattata come account
scaduto. Dopo un ripristino mantenere coerenti chiave e identificatore di host.

## Compatibilità

| Funzione | Modalità personale |
| --- | --- |
| Questionari, Bussola, Assistente | Responses, istruzioni + cronologia disponibile, streaming, `store: false` |
| Sintesi, diagrammi, tavolo, domande pQBL | Stesso servizio AI personale; nessun token trasferito ad agenti |
| RAG / embeddings | Servizio locale/configurato; nessun embedding OAuth |
| OCR/parser di importazione QSA | Configurazione dell’installazione separata dal collegamento personale |
| OpenCode / terminale | Bloccati con preferenza personale attiva; scegliere il modello dell’installazione |
| Audio, Files API, strumenti OpenAI ospitati | Nessuna nuova capacità OAuth aggiunta |
| Anteprima prompt | Struttura Responses senza token, prima del filtro PII; nessuna inferenza nella simulazione |

Non inviare `temperature`, `max_output_tokens`, `previous_response_id`,
`conversation` o parametri Chat Completions. La storia disponibile viene
inviata a ogni turno. Solo `response.completed` completa un turno: EOF,
`response.failed` e `response.incomplete` non salvano una risposta come riuscita.
Le istruzioni restano in inglese; UI/errori hanno sei lingue. Il filtro PII
esistente continua ad applicarsi. `store: false` non equivale a zero retention
o a policy identiche alle API fatturate: verificare i termini del piano concreto.

## Fonti ufficiali

- [Overview](https://developers.openai.com/siwc/token-sharing-open-source)
- [Accesso, PKCE, rinnovo](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
- [Modelli e inferenza](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)
- [VM self-hosted](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms)
- [Limiti dell’anteprima](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)
- [Token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference)
- [Errori e recovery](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)
