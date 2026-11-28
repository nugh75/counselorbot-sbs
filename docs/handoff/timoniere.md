# Handoff Timoniere — counselorbot-sbs

## Stato
Timoniere: t-timoniere-fj42 (claude opus, pane w3R:p1, workspace w3R). Ha sostituito t-timoniere-9ran, non più attivo.
Merge e deploy autonomi autorizzati dal proprietario (2026-11-28). Agente di servizio srv-deploy (opencode-go/glm-5.3-flash, tab "S: srv-deploy").

## Fatto (2026-11-28)
- #911 chiusa: PR #1046, #1048, #1049, #1050 mergiate (lotti 1, 2, 3a, 3b; agenti s1–s4 su DeepSeek V4.1 Flash). Goal 77780bbe → raggiunto.
- PR #1047: migrazione image_url prima delle letture ORM.
- Deploy via srv-deploy: backend (#1047), frontend (#1049, #1050); health 200.
- Installati journal-cli/j-cli-p/j-cli-a e le skill timoniere/subagente (install-journal-shortcuts.mjs con services.json Linux temporaneo).
- Goal 98a79996 «Residui Wave 1»: task 6e1035c4 (F31 link assegnazioni, agente s5-f31-link) e 4cf8b783 (#83 screenshot guida).

## Verifiche
- Ogni PR: CI verde e CLEAN; diff dei fix in src/ letto prima del merge.
- Deploy: curl / /docente /admin 200, /health 200, container Up.

## Prossimi passi
1. s5-f31-link → review, merge, deploy frontend.
2. Lanciare #83 screenshot (task 4cf8b783), poi chiedere al proprietario la prova con screen reader e chiudere #83.
3. Wave 2 (#1028–#1032): attendere le specifiche del nuovo strumento «Prepariamoci al futuro» (sostituisce il Consiglio orientativo).

## Blocchi e rischi
- Costi Claude 7d in WARNING: un agente economico alla volta.
- Notifiche dei subagenti verso il Timoniere: recipient_not_ready se occupato → leggere i pannelli.
- opencode.json del checkout principale modificato in locale per srv-deploy (glm-5.3-flash): non committarlo; originale salvato nello scratchpad.
