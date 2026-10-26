# CounselorBot Docente: guida per il PC

Questa guida riguarda l'app desktop **sperimentale** del docente, profilo
`teacher-pc`. Non occorrono Docker, Python o un server scolastico per installare
il bundle. Servono un PC acceso e una connessione per il tunnel o i provider AI
esterni. Il modello locale è un programma separato.

**Stato della Fase 1:** i bundle CI servono alle prove. Il pulsante «Apri nel
browser» apre il sito locale, ma non completa ancora l'accesso docente tramite
link monouso. Mancano le pagine «Accesso locale», «Unisciti» e gestione dispositivi.
L'abbinamento è implementato nelle API e nei test, non è ancora un percorso
utilizzabile dal docente. Prima di lezioni o dati reali occorre completare questi
passaggi e la [checklist di accettazione](desktop-teacher-tests.md).

## 1. Scaricare e verificare l'installer

1. Aprire il repository [CounselorBot](https://github.com/nugh75/counselorbot-sbs),
   **Actions → desktop-teacher**. Scegliere una build verde del commit concordato
   con chi segue la sperimentazione; annotare commit, data e numero della build.
   Per scaricare gli artifact può essere necessario accedere a GitHub.
2. Scaricare ed estrarre lo ZIP adatto al PC:

   | PC | Artifact | Installer |
   |---|---|---|
   | Mac con chip Apple, macOS 13 o successivo | `teacher-macos-arm64` | `.dmg` |
   | Mac Intel, macOS 13 o successivo | `teacher-macos-x64` | `.dmg` |
   | Windows x64 | `teacher-windows-x64` | `.exe` NSIS, per il proprio utente |
   | Linux x64 compatibile con Ubuntu 22.04 | `teacher-linux-x64` | `.deb` |

   Su Mac il chip è indicato in **menu Apple → Informazioni su questo Mac**.
   Ogni installer ha accanto il file con lo stesso nome più `.sha256`.
   Windows ARM e distribuzioni Linux diverse non sono certificati da questa matrice.
3. Confrontare il checksum **prima di aprire** l'installer. Eseguire nella cartella
   estratta, sostituendo i nomi degli esempi con quelli scaricati.

   Mac (Terminale):
   ```sh
   shasum -a 256 -c "CounselorBot Docente_0.1.1_aarch64.dmg.sha256"
   ```
   Linux (Terminale):
   ```sh
   sha256sum -c "CounselorBot Docente_0.1.1_amd64.deb.sha256"
   ```
   Windows (PowerShell):
   ```powershell
   $installer = "CounselorBot Docente_0.1.1_x64-setup.exe"
   $expected = ((Get-Content -LiteralPath "$installer.sha256" -Raw).Trim() -split '\s+')[0]
   $actual = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash
   if ($actual -ine $expected) { throw "Checksum diverso: non installare" }
   "Checksum SHA-256 verificato"
   ```

   Mac/Linux devono mostrare `OK`; Windows deve mostrare il messaggio di verifica.
   Se il confronto fallisce, non installare: riscaricare dalla stessa build e
   segnalare il problema. Il checksum controlla l'integrità del download; non
   sostituisce la verifica della provenienza o la firma dell'aggiornamento.

## 2. Installare e avviare

- **Mac:** aprire il DMG, trascinare **CounselorBot Docente** in Applicazioni,
  espellere il DMG e aprire l'app da Applicazioni. I bundle CI possono essere privi
  di firma Apple/notarizzazione: se macOS blocca l'apertura, chiedere al referente
  di verificare build e provenienza prima di autorizzarla nelle impostazioni del
  sistema. Non disattivare globalmente le protezioni.
- **Windows:** aprire l'installer `.exe`, confermare la cartella proposta per il
  proprio utente e avviare dal menu Start. In caso di blocco SmartScreen chiedere
  al referente di verificare la build; la firma dell'updater non è una firma Authenticode.
- **Linux:** aprire il `.deb` con il gestore pacchetti. L'installazione può richiedere
  l'intervento dell'amministratore. Il comando equivalente, da eseguire personalmente
  con il nome effettivo del file, è `sudo apt install ./nome-installer.deb`.
  Avviare **CounselorBot Docente** dal menu applicazioni, nella propria sessione
  grafica. Per salvare chiavi serve un portachiavi Secret Service/D-Bus sbloccato.

Al primo avvio attendere **Pronto**: la preparazione dei servizi può richiedere
fino a circa tre minuti. Gli avvii successivi hanno un'attesa di circa un minuto.
Il pannello mostra backend, frontend, tunnel e cartella dati. Il tunnel resta
spento finché non viene configurato/avviato. Le porte locali sono scelte dall'app:
non occorre aprire porte del router. Non avviare due istanze sullo stesso profilo.
Usare **Esci** per arrestare tutti i servizi.

**Apri nel browser** usa l'indirizzo locale `http://127.0.0.1:…`. Se compare un
utente anonimo o manca l'accesso docente, è il limite di integrazione indicato
all'inizio: non usare l'accesso server ai4auth né condividere credenziali per aggirarlo.

## 3. Configurare le chiavi AI

Aprire **Chiavi API** nel pannello desktop. Inserire la chiave del proprio provider,
quindi **Salva nel portachiavi**. macOS usa Keychain, Windows Credential Manager,
Linux Secret Service. Il valore salvato non viene mostrato. Nessun `.env` è richiesto.

**Testa connessione** verifica la chiave inserita o già salvata senza generare
risposte AI; non verifica saldo o accesso a ogni modello e non salva la bozza.
Dopo il test reinserire la chiave per salvarla. Se un provider non dispone di test,
il pannello lo indica. Usare **Applica e riavvia servizi** dopo salvataggi o rimozioni,
fuori da una conversazione: interrompe le richieste in corso. Una rimozione diventa
effettiva nel backend dopo questo riavvio o alla prossima apertura.

Se il portachiavi è bloccato, sbloccarlo nella sessione di sistema e usare
**Aggiorna stato**. Non copiare le chiavi in file o nella diagnostica. Le voci
OpenCode e Privacy KEK sono riservate e non attivano queste funzioni. Dettagli:
[chiavi API](desktop-api-keys.md).

## 4. Collegare il PC alla rete degli studenti

### Prova rapida

Selezionare **Tunnel temporaneo rapido → Avvia Quick Tunnel**. Attendere
l'indirizzo `https://….trycloudflare.com`; usare **Copia link** o il QR del pannello
per una prova con dati inventati. Alla chiusura il tunnel cade; al successivo
avvio l'URL può cambiare. È un servizio temporaneo con limiti: il pannello avverte
**Solo per prove**. Il QR del pannello apre il sito, non abbina lo studente a una classe.
**Ferma Tunnel** interrompe l'accesso pubblico.

### Indirizzo stabile per le lezioni, dopo il completamento del percorso locale

Occorrono un dominio gestito su Cloudflare e un tunnel nominativo del docente o
della scuola. Il referente configura in Cloudflare Zero Trust il tunnel e il
relativo hostname pubblico, diretto al frontend locale. La porta effettiva si
legge nell'URL locale del pannello e va controllata dopo un'eventuale collisione.

Selezionare **Tunnel stabile nominativo**, inserire dominio e token del tunnel,
usare **Verifica parametri → Salva configurazione → Avvia Tunnel nominativo**.
La verifica controlla il formato: non prova DNS, permessi o raggiungibilità.
Verificare l'URL da un secondo dispositivo prima di distribuirlo.
Il token Cloudflare è distinto dalle chiavi AI: il codice attuale lo salva tra
le credenziali locali e nella configurazione del guscio; non è una voce del
portachiavi API. Proteggere tutta la cartella dati e non inviarla all'assistenza.

Se manca il token, il codice ripiega sul tunnel rapido: controllare che l'URL
pubblicato sia proprio il dominio stabile atteso. Il dominio da solo non basta.
Cambiare token o configurazione può interrompere le connessioni.

## 5. Abbinamento studenti: contratto disponibile, pagine ancora da completare

Il percorso previsto è: il docente crea una classe, genera il link di abbinamento
`/unisciti#k=…`, lo studente sceglie uno pseudonimo e conserva il codice personale
mostrato una sola volta. Non serve un'email. Il codice classe dura sette giorni;
un nuovo codice revoca il precedente, senza espellere chi è già abbinato.
Gli pseudonimi duplicati ricevono un numero. Il codice personale di 12 caratteri
consente il recupero su un altro dispositivo; non va condiviso con la classe.

Il backend supporta approvazione facoltativa, revoca del dispositivo e rigenerazione
del codice personale. Uno studente in attesa non ha accesso fino all'approvazione.
Troppi tentativi sono bloccati temporaneamente. **Queste operazioni oggi si provano
con i test delle API**, elencati nella [procedura di verifica](desktop-teacher-tests.md):
la GUI docente e la pagina studente non sono ancora disponibili nei bundle.

## 6. Usare un modello sul proprio PC

Installare e avviare separatamente Ollama o un server compatibile OpenAI
(ad esempio llama.cpp o LM Studio), con un modello già scaricato. Il bundle
CounselorBot non include né avvia il modello. Scegliere un modello adeguato alla
memoria disponibile e provarlo con una conversazione inventata.

Quando l'accesso docente sarà collegato, in **Amministrazione → Configurazione**
il selettore locale consente di rilevare il server, scegliere il provider
Ollama/llama.cpp e il modello, oppure indicare un URL personalizzato. Sul PC
usare loopback, per esempio `http://127.0.0.1:11434` (Ollama) o
`http://127.0.0.1:8080/v1` (compatibile OpenAI, porta del proprio server).
Un server locale senza autenticazione non richiede una chiave; per un endpoint
protetto la chiave `LLAMACPP_API_KEY` è una configurazione tecnica separata,
non una voce del pannello API desktop attuale. Chiedere al referente di predisporla.

Un provider chiamato «locale» può puntare a un altro computer: il gateway considera
fidato automaticamente solo loopback e gli host dichiarati dal referente.
Usare un modello locale non elimina altre uscite come tunnel o lettore Edge.
Vedere [P6](../privacy/p6-gateway.md) e il [profilo DPIA L2](../privacy/desktop-teacher-dpia.md).

## 7. Aggiornamenti, copia di sicurezza e ritorno alla versione precedente

In **Aggiornamenti applicazione**, scegliere **Stabile** (normalmente) o **Beta**
(sperimentale), poi **Verifica aggiornamenti**. **Aggiorna ora (con backup preventivo)**
crea e verifica uno snapshot SQLite prima dell'installazione. Se il backup fallisce,
l'aggiornamento si ferma. Non aggiornare durante una lezione.

La CI attuale produce installer e manifest come artifact; non li pubblica ancora
nelle Release. L'updater richiede pacchetti firmati e manifest pubblicati dal
responsabile del rilascio. Un artifact CI o un checksum non abilita da solo
l'aggiornamento automatico. In assenza di un rilascio valido, concordare la
reinstallazione manuale di un bundle verificato. Non creare file `.env` per questo.

La cartella dati è mostrata nel pannello. Percorsi ordinari:

| Sistema | Radice dati |
|---|---|
| macOS | `~/Library/Application Support/org.ai4educ.counselorbot.teacher/` |
| Windows | `%LOCALAPPDATA%\org.ai4educ.counselorbot.teacher\` |
| Linux | `~/.local/share/org.ai4educ.counselorbot.teacher/` (o base XDG configurata) |

`db/counselorbot.sqlite3` contiene il database, `backups/` gli snapshot automatici,
`uploads/` i file, `memory/` e `rag/` memorie e indici, `config/` la configurazione,
`credentials/` credenziali locali. Le chiavi API nel portachiavi OS sono separate.
Lo snapshot automatico conserva normalmente gli ultimi sette backup del database:
**non comprende allegati, portachiavi o tutti i file del profilo**.

Prima di una reinstallazione:

1. Usare **Esci**, attendere la fine dei servizi e far controllare al referente
   che nessun processo acceda alla cartella.
2. Copiare **tutta** la cartella dati in una destinazione protetta; conservare
   separatamente le chiavi e l'eventuale materiale di recupero Privacy Layer.
   Non inviare la copia per email e non usarla su due PC contemporaneamente.
3. Per tornare indietro, installare il bundle precedente verificato e ripristinare
   una copia dati compatibile fatta prima dell'aggiornamento. Un database già
   migrato potrebbe non funzionare con una versione precedente.
4. Per ripristinare il solo SQLite, chiedere al referente di seguire
   [backup e ripristino](sqlite-backups.md), con app e connessioni ferme,
   `DATABASE_URL` verso il database corretto e `COUNSELORBOT_BACKUP_DIR` verso
   `backups/`. L'helper conserva prima uno snapshot di sicurezza. Non sostituire
   a caldo il database e non cancellare manualmente WAL/SHM.
5. Riaprire e controllare classi, allegati e accesso prima di riprendere le attività.

## 8. Tenere il PC disponibile

Con app pronta e tunnel attivo, macOS e Windows impediscono la sospensione
inattiva del sistema. Questo non garantisce continuità se si chiude il coperchio,
si spegne il PC o manca la rete. Linux non ha inibizione automatica in questa fase:
configurare personalmente la sospensione nelle impostazioni energia. Collegare
l'alimentatore; bloccare lo schermo quando ci si allontana.

Se il PC è offline, chi ha già aperto il sito può vedere **Il docente è offline**,
con controllo ogni dieci secondi e **Riprova**. Un primo accesso a tunnel caduto può
mostrare l'errore Cloudflare. Non è disponibile un'app studente offline in Fase 1.

## 9. Risolvere i problemi

| Problema | Cosa fare |
|---|---|
| Preparazione troppo lunga / servizio in errore | Attendere il limite, usare **Esci**, riaprire una volta; controllare spazio disco, portachiavi e permessi della cartella. Esportare diagnostica se persiste. |
| App già aperta / cartella bloccata | Cercare la finestra esistente; non eliminare file di lock mentre i servizi sono attivi. |
| Versione backend diversa dal guscio | Il tunnel viene bloccato: reinstallare un bundle completo della stessa build, conservando i dati. |
| Accesso docente o pagina Unisciti assenti | Limite attuale del bundle: attendere l'integrazione, senza aggirare l'autenticazione. |
| Chiave rifiutata / limite richieste | Controllare provider e permessi; distinguere 401/403 da 429; aggiornare lo stato e applicare le modifiche. |
| Dominio stabile non raggiungibile | Controllare token, DNS, servizio locale e porta con il referente; «Verifica parametri» non è una prova di rete. |
| Modello locale non trovato | Avviare il server del modello, verificare URL/porta e modello scaricato; il bundle non installa il modello. |
| Backup o aggiornamento fallito | Liberare spazio e verificare permessi; non forzare l'aggiornamento senza backup. Richiedere un ripristino assistito. |
| Disconnessione studenti | Controllare PC, rete e tunnel; se l'URL rapido è cambiato, condividere quello nuovo solo per le prove. |

**Esporta diagnostica** funziona anche a backend fermo: lo ZIP esclude database,
credenziali e testo libero dei log. Controllare comunque il file prima di inviarlo;
non allegare il profilo completo. Vedere [P13](../privacy/p13-logs-diagnostica.md).
Prompt Lab, Telegram, OpenCode, helper ChatGPT, Piper e sincronizzazione Console
sono esclusi dal profilo docente. Le funzioni della piattaforma web non sono tutte
presenti nel desktop. Riferimenti tecnici: [guscio](desktop-teacher-shell.md),
[piano desktop](../architecture/desktop-apps-plan.md), [privacy](../privacy/README.md).
