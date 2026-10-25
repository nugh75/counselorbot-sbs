# Handoff — chore/opencode-project-config

## Stato

Codice e PR **completi**. Chiusura Diario (notify, bug, task) **bloccata** da un
problema d'ambiente: il journal-cli di questa sessione non trova il progetto
`Counselorbot`.

## Fatto

- `opencode.json` versionato in radice con
  `"model": "opencode-go/deepseek-v4.1-flash"` (era untracked).
- `docs/operations/opencode-project-config.md`: nota operativa (scopo, perché è
  versionato, come cambiare modello, verifica).
- Commit `ae5522a4` — `chore: add project opencode config with the default model`.
- Branch pushato `chore/opencode-project-config` (base `origin/main` 63afde17).
- PR aperta: https://github.com/nugh75/counselorbot-sbs/pull/592 (aggiunta al
  project board "CounselorBot"). **Non unita**, come da istruzioni.

## Verifiche

Precondizione del punto 1: **superata**.

- `opencode --version` → `v2.0.28`.
- `opencode debug config` nel worktree → la sorgente di progetto
  (`./opencode.json`) risolve `opencode-go/deepseek-v4.1-flash`; nessuna
  occorrenza di `deepseek-v4.1-flash-free`.
- Nessuna variabile `OPENCODE_CONFIG_CONTENT` nell'ambiente della shell né nel
  servizio `opencode serve --service` (pid 3904, avviato 13:33:10 dopo il
  riavvio pulito).
- `~/.config/opencode/opencode.jsonc` contiene solo `$schema`, nessun modello;
  `grep flash-free` sulla config globale → nessun risultato.

Nota: alle 11:53 risulta ancora vivo un processo `opencode` (pid 25737)
precedente al riavvio; l'ambiente non è leggibile (`ps eww` non mostra
`OPENCODE_CONFIG_CONTENT`). Non incide sulla config risolta da `debug config`,
ma va chiuso se mostra ancora il modello Free.

## Blocchi

Il Diario non è raggiungibile da questa sessione:

- `journal-cli notify --repo Counselorbot ...` → `[timoniere] progetto
  "Counselorbot" senza cartella repo (/host-home/Counselorbot) — nessun segnale
  in viaggio`.
- `journal-cli update-bug Counselorbot 0ccc6602-... --triage risolto` →
  `NOT_REGISTERED {"code":"PROJECT_UNKNOWN","error":"Progetto non trovato:
  Counselorbot"}`.
- `journal-cli update-task Counselorbot 571ea5cc-... --state fatto` →
  `Progetto non trovato: Counselorbot`.
- `journal-cli list` → `{}` (store vuoto lato client).

Sembra che il runtime ConsoleHERDR di questa macchina non abbia il mapping/lo
store dei progetti (atteso `/host-home/Counselorbot`, inesistente qui).

## Prossimi passi

1. Rilanciare i tre comandi dal Timoniere o da un host con il Diario montato:
   - `notify --repo Counselorbot 'PR aperta: https://github.com/nugh75/counselorbot-sbs/pull/592 — chore: opencode project config'`
   - `update-bug Counselorbot 0ccc6602-9b79-4328-ab6a-31f7c8a52cb3 --agent-name s7-opencode-config --triage risolto --evidence '...'`
   - `update-task Counselorbot 571ea5cc-faed-46bd-88c5-d7b2db21033a --state fatto --agent-name s7-opencode-config`
2. Revisione e merge manuale della PR #592 (merge commit).
3. Dopo il merge: `git switch main && git pull --ff-only`, eliminare il branch.
