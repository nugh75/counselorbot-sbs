# CounselorBot Docente: guida per il PC

Questa guida riguarda l'app desktop **sperimentale** del docente, profilo
`teacher-pc`. Non occorrono Docker, Python o un server scolastico per installare
il bundle. Servono un PC acceso e una connessione per il tunnel o i provider AI
esterni. Il modello locale è un programma separato.

**Stato della Fase 1:** i bundle CI servono alle prove. L'accesso locale del
docente è collegato (link monouso del guscio verso `/accesso-locale`) e le
pagine di abbinamento sono operative: `/unisciti` per lo studente e la gestione
dispositivi per il docente. Restano da validare il flusso su un dispositivo
reale con tunnel attivo e la pubblicazione degli artifact nelle Release. Prima
di lezioni o dati reali completare la [checklist di
accettazione](desktop-teacher-tests.md).

**Database attuale e futuro:** i bundle disponibili, inclusa `v0.1.1`, usano ancora SQLite e le
procedure di questa guida. È stata decisa la migrazione a PostgreSQL 15 con conversione conservativa
e backup ripristinabili, ma **non è ancora inclusa in un installer**. Non esiste ancora un pulsante
o un comando da eseguire; il contratto target è in [Upgrade desktop a PostgreSQL](postgresql-desktop-upgrade.md).

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

**Apri nel browser** usa l'indirizzo locale `http://127.0.0.1:…` e l'accesso
docente passa dal link monouso del guscio. Se compare un utente anonimo, usare
**Apri nel browser** dal pannello per ottenere un nuovo link; non usare
l'accesso server ai4auth né condividere credenziali.

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

### Link temporaneo Cloudflare Quick Tunnel

Selezionare **Tunnel temporaneo rapido → Avvia Quick Tunnel** e attendere
l’indirizzo `https://….trycloudflare.com`. L’app desktop usa autenticazione
locale indipendente: non servono Console portable, account ai4educ o domini.
Il PC e il tunnel devono restare accesi durante l’accesso degli studenti.
L’indirizzo cambia quando il tunnel viene riavviato.

Il QR e **Copia link** del pannello identificano il tunnel: il link che abbina
uno studente si genera invece nella classe, come descritto sotto.
**Ferma Tunnel** interrompe l’accesso pubblico. Le prove di questa release
usano dati inventati finché i gate di accettazione non saranno completati.

La predisposizione ai tunnel con dominio/token resta nel codice ma è inattiva:
il pannello non propone tale modalità e non la avvia da vecchie configurazioni.

## 5. Abbinamento studenti

Il percorso è: il docente crea una classe e genera il link di abbinamento
`/unisciti#k=…`, lo studente sceglie uno pseudonimo e conserva il codice
personale mostrato una sola volta. Non serve un'email. Il codice classe dura
sette giorni; un nuovo codice revoca il precedente, senza espellere chi è già
abbinato. Gli pseudonimi duplicati ricevono un numero. Il codice personale di
12 caratteri consente il recupero su un altro dispositivo; non va condiviso con
la classe.

**Dove si genera il link (docente):** in **Classi → Apri classe → Panoramica**,
sezione **Accesso dal tunnel docente**. Il link è utilizzabile solo con un
tunnel attivo: se manca l'indirizzo pubblico, la pagina lo avvisa e va generato
un nuovo link dopo l'avvio del tunnel. L’approvazione del docente è selezionata per impostazione predefinita;
il docente può modificare questa scelta e il numero massimo di utilizzi. La stessa sezione elenca i dispositivi
della classe; **Gestisci tutti i dispositivi** apre `/docente/dispositivi`.

**Cosa vede lo studente (`/unisciti`):** il link precompila il codice, che non
rimane nella cronologia del browser; bastano pseudonimo e, facoltativo, il nome
del dispositivo. Al successo la pagina mostra lo pseudonimo assegnato, lo stato
(attivo o in attesa di approvazione) e il **codice personale**, visibile una
sola volta con la conferma «Ho salvato il codice personale». Chi torna su
`/unisciti` con una sessione attiva vede la sessione invece di un nuovo
abbinamento. Con il codice personale si recupera la sessione, anche dopo un
cambio di indirizzo del tunnel.

**Dispositivi (docente):** per ogni classe, pseudonimo, dispositivo, stato,
ultimo accesso; azioni **Approva** (per gli accessi in attesa), **Revoca
dispositivo** (con conferma, effetto immediato) e **Rigenera codice personale**
(il vecchio codice smette di valere, le sessioni aperte restano). Le rotte
rispondono solo dal PC del docente: dal tunnel la pagina segnala l'errore.

Errori e limiti: un codice inesistente, scaduto, revocato o esaurito dà sempre
lo stesso messaggio, senza dettagli; troppi tentativi sono bloccati con l'attesa
indicata. Se il tunnel è spento lo studente vede l'errore di rete e riprova
quando il docente lo riavvia.

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
| Abbinamento o dispositivi non raggiungibili | La sezione pairing esiste solo con il fornitore locale (`AUTH_PROVIDER=local`) e le rotte docenti rispondono solo dal PC: verificare il profilo `teacher-pc` e aprire la pagina dal browser locale. |
| Chiave rifiutata / limite richieste | Controllare provider e permessi; distinguere 401/403 da 429; aggiornare lo stato e applicare le modifiche. |
| Dominio stabile non raggiungibile | Controllare token, DNS, servizio locale e porta con il referente; «Verifica parametri» non è una prova di rete. |
| Modello locale non trovato | Avviare il server del modello, verificare URL/porta e modello scaricato; il bundle non installa il modello. |
| Backup o aggiornamento fallito | Liberare spazio e verificare permessi; non forzare l'aggiornamento senza backup. Richiedere un ripristino assistito. |
| Disconnessione studenti | Controllare PC, rete e tunnel; se l'URL rapido è cambiato, condividere quello nuovo solo per le prove. |

**Esporta diagnostica** funziona anche a backend fermo: lo ZIP esclude database,
credenziali e testo libero dei log. Controllare comunque il file prima di inviarlo;
non allegare il profilo completo. Vedere [P13](../privacy/p13-logs-diagnostica.md).

### Avvio bloccato dal vecchio profilo SQLite

La build PostgreSQL rifiuta un profilo SQLite/layout 1: la migrazione automatica
non è ancora collegata all'avvio. Il profilo resta intatto. Il guscio mostra
**Avvio non riuscito** con il motivo e il pulsante **Esci**; gli errori di
preparazione non devono produrre il crash macOS `SIGABRT`. Nei vecchi bundle
il report può mostrare soltanto `abort() called`: il comando seguente nel
Terminale mostra il messaggio originale:

```zsh
"/Applications/CounselorBot Docente.app/Contents/MacOS/counselorbot-teacher" 2>&1 | tail -80
```

Se servono classi, conversazioni o allegati esistenti, conservare il profilo e
usare il bundle precedente compatibile; il [contratto di migrazione](postgresql-desktop-upgrade.md)
non è ancora una procedura di import consegnata. Non cambiare manualmente
`layout.json`: il numero non converte il database.

Solo se si sceglie di iniziare con dati nuovi, a **app e servizi chiusi**, su
macOS spostare l'intero profilo in una cartella di conservazione, senza eliminarlo:

```zsh
profilo="$HOME/Library/Application Support/org.ai4educ.counselorbot.teacher"
copia="${profilo}.backup-$(date +%Y%m%d-%H%M%S)"
mv -n "$profilo" "$copia" &&
open "/Applications/CounselorBot Docente.app"
```

L'app crea un nuovo profilo PostgreSQL. Il vecchio profilo rimane nella cartella
`.backup-…`, con database, allegati, memoria e configurazione; non viene importato
nel nuovo. Il portachiavi OS resta separato. Per riusare il vecchio profilo,
chiudere app e servizi, conservare separatamente anche il nuovo profilo, rimettere
quello vecchio nel percorso originale e usare il bundle precedente compatibile.

Prompt Lab, Telegram, OpenCode, helper ChatGPT, Piper e sincronizzazione Console
sono esclusi dal profilo docente. Le funzioni della piattaforma web non sono tutte
presenti nel desktop. Riferimenti tecnici: [guscio](desktop-teacher-shell.md),
[piano desktop](../architecture/desktop-apps-plan.md), [privacy](../privacy/README.md).
