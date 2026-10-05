# Consegna differenziazione prompt CR1–CR4
Data: 2026-10-05

Worktree dedicato `/tmp/counselorbot-prompt-differentiation-1005`, branch
`feature/prompt-differentiation`, base `origin/main` 005cf2c.
Requisiti confermati completati: conteggi stimati, livelli configurabili e
assegnazioni manuali, editor varianti brevi scritte dall'amministratore,
confronto ripetibile con Prompt Lab. Nessuna attivazione o modifica DB operativo.

Resoconto: [HANDOFF](HANDOFF.md).
Configurazione: [guida](docs/operations/model-context-levels.md).
Prove, benchmark e limiti: [verifica](docs/operations/model-context-levels-validation.md).
CR4: 144 prove sintetiche locali, token −9,13%, nessun miglioramento qualità.
Il confronto automatico non sostituisce la revisione educativa umana.

Bug tutti LOCAL nel Diario (not-linked), nessuna issue pubblicata a mano.
Bug non registrati: nessuno; il precedente EROFS è stato superato e compact
è registrato con prova e corretto in commit 8902e96.

PR a main, nessun merge/deploy/sudo/.env. Notifica richiesta best-effort subito
dopo la creazione della PR. Dev e container propri di verifica fermati alla
consegna; le immagini locali restano disponibili.
