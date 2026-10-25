# Bollettino periodico di monitoraggio (timer launchd)

`scripts/bollettino-counselorbot.sh` produce ogni mezz'ora un bollettino di stato
del progetto: stato dei container Docker, `/health` del backend, disco, PR
aperte, ultime release, agenti Herdr e handoff aggiornati. Il file
`scripts/launchd/org.consoleplatform.bollettino.plist` è il timer launchd che lo
esegue su macOS.

Lo script è **in sola lettura**: non scrive nel repository, nel database o nei
container, non riavvia nulla e non stampa segreti (solo nomi di container, stato,
numeri di PR, titoli e URL). Non chiama nessun modello: non consuma quota e
continua a funzionare anche se le TUI degli agenti si chiudono o vengono
riavviate.

## Cosa produce

- `$BOL_STATE/latest.md` — l'ultimo bollettino completo, sovrascritto a ogni
  esecuzione (scrittura atomica su file temporaneo e `mv`).
- `$BOL_STATE/YYYY-MM-DD.log` — append di tutte le esecuzioni della giornata.
- `$BOL_STATE/seen-prs.txt` — numeri di PR già visti, per la sezione «NOVITÀ».
- `$BOL_STATE/out.log` e `$BOL_STATE/err.log` — stdout/stderr lanciati da
  launchd.

Il percorso predefinito è `~/.local/state/bollettino`.

Le sette sezioni del bollettino sono: 1. Docker, 2. Backend health, 3. Disco,
4. PR aperte, 5. Release, 6. Agenti, 7. Handoff aggiornati.

## Prova manuale

Prima di installare il timer, verificare che lo script funzioni e che macOS
consenta la lettura del repository (vedi «Limiti e rischi noti»):

```sh
BOL_STATE=/tmp/boltest ./scripts/bollettino-counselorbot.sh && cat /tmp/boltest/latest.md
```

Lo script non stampa nulla su stdout: l'output sta in `latest.md`, così una pane
con `tail -F` non mostra righe duplicate. Su un volume esterno un giro completo
può richiedere 1–2 minuti (l'ultimo file compare solo a fine esecuzione, perché
`latest.md` viene scritto in modo atomico).

## Installazione del timer

1. Copiare lo script e renderlo eseguibile:

   ```sh
   mkdir -p ~/.local/bin ~/.local/state/bollettino
   cp scripts/bollettino-counselorbot.sh ~/.local/bin/
   chmod +x ~/.local/bin/bollettino-counselorbot.sh
   ```

2. Sostituire `__HOME__` nel plist con il percorso reale dell'utente: launchd
   **non** espande `$HOME` né le variabili d'ambiente.

   ```sh
   sed "s|__HOME__|$HOME|g" scripts/launchd/org.consoleplatform.bollettino.plist \
     > ~/Library/LaunchAgents/org.consoleplatform.bollettino.plist
   ```

3. Caricare il timer (esegue subito un giro grazie a `RunAtLoad`):

   ```sh
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/org.consoleplatform.bollettino.plist
   ```

4. Verificare che sia registrato e che l'ultima esecuzione sia andata a buon
   fine:

   ```sh
   launchctl print gui/$(id -u)/org.consoleplatform.bollettino
   cat ~/.local/state/bollettino/latest.md
   ```

Il timer scatta a ogni ora al minuto `0` e al minuto `30` (`StartCalendarInterval`
con due voci `Minute`). Per rileggere il plist dopo una modifica:

```sh
launchctl bootout gui/$(id -u)/org.consoleplatform.bollettino
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/org.consoleplatform.bollettino.plist
```

## Disinstallazione

```sh
launchctl bootout gui/$(id -u)/org.consoleplatform.bollettino
rm ~/Library/LaunchAgents/org.consoleplatform.bollettino.plist
rm ~/.local/bin/bollettino-counselorbot.sh
```

I dati in `~/.local/state/bollettino` restano finché non vengono cancellati a
mano.

## Vedere il bollettino in una pane Herdr

Aprire una tab nuova ed eseguire:

```sh
tail -F ~/.local/state/bollettino/latest.md
```

Non usare `herdr pane send-text` verso una TUI OpenCode: il testo verrebbe
iniettato nel prompt dell'agente come se fosse stato digitato. La pane deve
limitarsi a mostrare il file.

## Limiti e rischi noti

- **Ambiente minimale di launchd**: nessun `.zshrc` viene letto. Lo script fissa
  un `PATH` esplicito (`/opt/homebrew/bin` in testa su Apple Silicon) e il plist
  dichiara lo stesso `PATH` in `EnvironmentVariables`. Se `docker`, `gh` o `herdr`
  stanno altrove, aggiungere la directory al `PATH` nello script oppure usare
  `BOL_GH_REPO` e gli altri override.
- **TCC su volumi esterni**: se il repository sta su `/Volumes/...`, macOS può
  bloccare l'accesso ai file per il processo lanciato da launchd (permesso
  «Accesso al disco completo» non concesso a `/bin/zsh`). Prima di fidarsi del
  timer eseguire un giro manuale e controllare che le sezioni 7 e i percorsi
  degli handoff non siano vuoti per errore di permessi. In caso di blocco
  concedere l'accesso al disco per il terminale/`zsh` in *Impostazioni di
  Sistema → Privacy e sicurezza*.
- **Nessun LLM coinvolto**: il bollettino è deterministico, non consuma quota e
  sopravvive alla chiusura delle TUI. Non riassume, non interpreta e non decide.
- **Solo stato puntuale**: lo script fotografa la situazione all'istante. Non
  rileva «stalli» di agenti (un agente fermo da ore appare `idle` come uno
  appena avviato) e non conserva una storia diversa dal log giornaliero.
- **Timestamp del checkout**: in un worktree appena creato tutti gli handoff
  hanno mtime recente, quindi la sezione 7 può elencare file non realmente
  modificati nelle ultime due ore. L'elenco è limitato a 10 righe.
- **Costi e dipendenze**: `gh` deve essere autenticato per l'utente che esegue il
  timer; senza rete o senza login le sezioni 4 e 5 riportano l'errore di `gh`.

## Variabili d'ambiente di override

| Variabile | Predefinito | Uso |
| --- | --- | --- |
| `BOL_REPO` | `/Volumes/sviluppo/progetti/Counselorbot` | checkout principale da cui leggere `docs/handoff`; i worktree sono cercati in `<BOL_REPO>-worktrees` |
| `BOL_STATE` | `$HOME/.local/state/bollettino` | cartella di `latest.md`, log e `seen-prs.txt` |
| `BOL_GH_REPO` | `nugh75/counselorbot-sbs` | repository per PR e release |
| `BOL_HEALTH_URL` | `http://127.0.0.1:8087/health` | endpoint di health del backend |

Esempio per una prova isolata senza toccare lo stato reale:

```sh
BOL_STATE=/tmp/boltest BOL_GH_REPO=nugh75/counselorbot-sbs ./scripts/bollettino-counselorbot.sh
```

## Verifiche

```sh
zsh -n scripts/bollettino-counselorbot.sh
plutil -lint scripts/launchd/org.consoleplatform.bollettino.plist
```
