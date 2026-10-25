# Configurazione opencode di progetto

`opencode.json` nella radice del repository fissa il modello predefinito delle
TUI opencode aperte nel repo e in ogni worktree collegato:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "opencode-go/deepseek-v4.1-flash"
}
```

## Perché è versionato

- opencode v2.0.28 non accetta più la flag `-m` (bug `0ccc6602`): il modello
  predefinito deve stare nella configurazione, non sulla riga di comando.
- Prima il servizio opencode di background veniva avviato con
  `OPENCODE_CONFIG_CONTENT={"model":"opencode/deepseek-v4.1-flash-free"}`, che
  forzava il modello Free su tutte le TUI. Quel pin è stato rimosso: il servizio
  va lasciato senza `OPENCODE_CONFIG_CONTENT`.
- La config di progetto ha precedenza su quella globale (`~/.config/opencode`),
  quindi ogni worktree eredita il modello senza interventi manuali e i lanci
  herdr usano solo `-- --auto`.

## Come cambiare modello

Modificare `model` in `opencode.json` e committare: vale per il repo e per i
worktree al successivo avvio. In alternativa si può scegliere il modello dal
selettore della TUI per la sessione corrente, ma la scelta non è persistente e
torna al valore del file.

## Verifica

```bash
opencode debug config
```

L'output elenca le sorgenti di configurazione: quella di progetto deve risolvere
`opencode-go/deepseek-v4.1-flash` e non deve comparire `flash-free`.
