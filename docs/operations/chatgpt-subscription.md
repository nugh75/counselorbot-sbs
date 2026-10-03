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

## Configurazione del backend

Lo startup aggiunge `chatgpt_connections` e `chatgpt_links` al database PostgreSQL.
I prompt e i dati esistenti non vengono sovrascritti. L’autenticazione resta
quella di ai4auth. Generare una chiave Fernet **una sola volta**, fuori Git:

```bash
umask 077
backend/.venv/bin/python -c 'from cryptography.fernet import Fernet; from pathlib import Path; Path("/percorso/protetto/chatgpt.key").open("xb").write(Fernet.generate_key())'
```

Configurare l’ambiente del backend:

```dotenv
CHATGPT_ENABLED=true
CHATGPT_CREDENTIAL_KEY_FILE=/percorso/protetto/chatgpt.key
```

In alternativa usare `CHATGPT_CREDENTIAL_KEY` nel gestore di segreti. Il file
ha precedenza. In Docker montarlo in sola lettura e usare il percorso interno
al container: non copiarlo nell’immagine e non committarlo. Conservare un backup
protetto della chiave separatamente dal database; cambiarla rende illeggibili
i collegamenti e richiede ripristino o ricollegamento.

Ricostruire/riavviare backend e frontend con il normale aggiornamento eseguito
dall’operatore. Questa modifica non effettua deploy. Non servono API key OpenAI.
Lo strumento scaricabile è incluso nell’immagine backend e usa solo la libreria
standard di Python 3.10+ sul computer dell’utente.

## Collegamento sul computer dell’utente

1. Accedere a CounselorBot e aprire **Area personale → Il tuo abbonamento ChatGPT**.
2. Premere **Collega ChatGPT**, scaricare `chatgpt-connect.py` ed eseguire il comando
   mostrato sul proprio computer, con Python 3.10 o successivo.
3. Inserire il codice al prompt del terminale: scade in 10 minuti; non passarlo
   negli argomenti del comando o salvarlo in file.
4. Completare l’accesso ufficiale nel browser. Il callback è
   `http://127.0.0.1:<porta>/auth/callback`, sul computer dell’utente.
5. Tornare a CounselorBot, scegliere un modello disponibile per l’account e
   premere **Usa il mio abbonamento**. Il solo collegamento non abilita il piano.

Il codice associa il trasferimento a un utente già autenticato. Lo strumento
non sceglie uno username, mantiene i token solo in memoria e rifiuta redirect
HTTP durante il trasferimento e callback con state errato. Le credenziali
viaggiano su HTTPS o su un tunnel localhost; non passano al browser di
CounselorBot o a localStorage. Il backend verifica firme, issuer, audience,
nonce, identità di ritorno, client registrato e permessi di inferenza. PKCE,
state, nonce e identificatore opaco della VM fanno parte del flusso OAuth.

Se il proxy richiede un ulteriore login, lo strumento non ha quei cookie.
Avviare il collegamento nell’interfaccia già autenticata e usare un tunnel
verso **Next locale**, senza il proxy di autenticazione, per il comando:

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

## Isolamento, scelta e quota

Una connessione per username ai4auth e una registrazione per account verificato.
Il modello personale precede il preset del counselor nelle richieste native
autenticate, nella Bussola, nelle sintesi e nel pQBL del proprietario del PDF.
Consultare un altro studente usa l’identità del richiedente, non il collegamento
di quello studente. Profili demo e processi di sistema senza utente non usano
abbonamenti personali.

ChatGPT non ha ripieghi ad altri provider. Anche se la funzione viene disattivata
mentre una preferenza personale è salvata, la richiesta si ferma finché la
persona non sceglie **Usa il modello dell’installazione**. Non si inventano
contatori o orari di reset; la quota si consulta su ChatGPT. I nomi dei modelli
non vengono usati per stimare costi con il listino API.

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
