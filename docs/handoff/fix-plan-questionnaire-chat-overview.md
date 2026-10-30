# Handoff — fix/plan-questionnaire-chat-overview

Agente: s16-plan-opus · Issue #684 · Milestone «Class path templates, step types and meetings»

## Bug
«Dal piano alla chat dei questionari non si vede il prospetto iniziale». Il
prospetto è il passo 4 PROFILO del percorso normale (`app/page.tsx`,
`step === 'dashboard'` → `ProfileVisualization` + «Continua»): scheda del
questionario, punti di forza/aree di crescita, filtri per area, barre per fattore.

## Causa
L’analisi del piano (`ResultsDeepDiveFlow`, montata da `PlanActivityFlow` e da
`/approfondimento`) avvia o seleziona la sessione e monta subito
`GuidedChatInterface`: il passo PROFILO non esiste in quel flusso. Non è una
regressione di una singola PR: il flusso è nato così (ace5bdd6) e #650
(c0b0eab3, apertura diretta delle chat dei piani) ha tolto la pagina di avvio
senza aggiungere il prospetto.

## Correzione
`ResultsDeepDiveFlow`: se la sessione è nuova (nessuno snapshot congelato) e ha
punteggi, mostra `ProfileVisualization` con `ForwardButton` «Continua»
(`dashboard.ready.btn`); il clic monta la chat. Configurazione da
`getQuestionnaire(questionnaire_type)`.

Ripresa: con snapshot (pausa) il prospetto è saltato, come `/?frozen=` della home
che va dritto a `interaction`. Le chat autonome (`PlanStandaloneChat`, nessun
punteggio) non cambiano. Documentato in `docs/operations/plan-activity-flow.md`.

## Test
`frontend/tests/plan-questionnaire-chats.test.mjs`: nuovo caso «a new plan
analysis shows the profile step before the chat and resume skips it»; i casi che
aprono una nuova analisi cliccano «Continua» prima della chat.
Server fixture: `scripts/dev-plan-questionnaire-tests.sh` (porta 3159, backend
chiuso). Nessun Postgres, deploy, sudo o dato reale.

## Stato
Vedi PR collegata a #684.
