# Confine della descrizione dei questionari (#431)

## Audit e decisione prima dell'implementazione — 21 ottobre 2026

Riscontro statico, non riproduzione LLM: il contratto `profile` richiedeva
un invito personale e valeva solo all'ingresso; i chiarimenti tornavano ad
`area`. ZTPI non era incluso. I prompt specifici QSA/QSAr/ZTPI e gli incipit
dei suggerimenti anticipavano l'esperienza personale. I testi DB restano
autorevoli e non vanno riscritti all'avvio.

| Strumento | Descrizione e chiarimenti (tutti i turni) | Successivo momento personale esistente |
|---|---|---|
| QSA completo | `cognitive`, `affective` | `sl-elaboration` e successive aree |
| QSAr | `qsar-cognitive`, `qsar-affective` | `qsar-processing` e successive aree |
| ZTPI | `ztpi-t1`…`ztpi-t5`, `ztpi-btp` | fase fissa `questions` (Domande e Approfondimenti) |
| QPCS | `qpcs-profilo` | `qpcs-emozioni` e successive aree, dopo la presentazione secondo l'ordine salvato |
| QPCC | `qpcc-profilo` (anche alias storico `qpcc-factors`) | intervista `qpcc-comunicazione` e successive aree |
| QAP | `qap-profilo` | intervista `qap-preoccupazione` e successive aree |
| QSA essenziale | `qsa-essential-focus`: sola lettura del profilo | `qsa-essential-experience`: scelta facoltativa del focus, poi esperienza |

ZTPI: anche il confronto equilibrato è una lettura; non inventiamo un nuovo
passo fra i cinque fattori. Nessun invito personale o consiglio nella lettura
finale; il dialogo personale resta disponibile nella fase fissa successiva.
QSA essenziale: conserviamo i tre passi e i segnali esistenti. La scelta di una
priorità passa all'esperienza; dalla lettura si può proseguire senza scegliere
o raccontarsi. Gli Obiettivi essenziali restano invariati.

## Piano

1. Classificazione comune della fase per strumento, ID e modalità del passo,
   indipendente da entry, storia, ripresa o trasporto. Contratto descrittivo
   prioritario rispetto a prompt salvati, facilitazione, autointerrogazione,
   profondità e scelta. Lettura richiesta e chiarimenti ammessi; domande solo
   utili e facoltative, nessun quiz o domanda sistematica. Nessun taglio output.
2. Allineare default specifici e incipit. In lettura pubblica usare suggerimenti
   di comprensione nelle sei lingue anche con DB già popolati, conservando tutte
   le righe personalizzate nell'editor amministrativo. Nessuna classificazione
   semantica fragile di testi liberi e nessuna migrazione.
3. Registrare impronte dei default precedenti nell'allineamento di fabbrica già
   esistente: anteprima e conferma esplicite, hash di revisione e protezione dei
   testi admin, nessuna applicazione automatica e nessun accesso alla produzione.
4. Verificare envelope reali dei sei strumenti, due contratti, sei lingue e tre
   livelli: ingressi, più chiarimenti, ripresa, continuazione, sync/stream e
   Prompt Lab; mantenere personale nei passi successivi e regressioni narrative,
   inversioni, scale e M2. PostgreSQL effimero `counselorbot_test`, nessun LLM.
5. Aggiornare funzionalità, guida sei lingue, CONTEXT/HANDOFF e manifest;
   verifiche e immagini con tag isolati, poi commit/push/PR **DRAFT** (`prAutopilot=true`
   nel Diario). Mantenere la bozza fino alla revisione DeepSeek coordinata dal
   Timoniere: nessun `gh pr ready`, avvio autonomo del revisore, merge o deploy.
