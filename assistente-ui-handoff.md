# Handoff: Redesign interfaccia Assistente (/assistente) + settaggi conversazione
Data: 2026-09-24 | Sessione precedente: revisione UI assistente su richiesta utente

## Objective
Interfaccia /assistente pulita, senza elementi tagliati o sovrapposti, sidebar
nascosta di default e una sola schermata di settaggio nel percorso guidato
(scelta modalità + impostazioni conversazione insieme). Il ramo è
`feature/institution-teacher-membership`; i commit di questa sessione partono
da `57aee4f` fino a `af24ce2` (includono il rilascio dell'Area personale).

## Progress
- [x] Composer assistente riscritto come card unica (input + ? + Formato +
      Lunghezza + invio dentro la stessa card), bordo completo, ~40px dal fondo
      finestra; sticky in fondo sotto 1024px con `-mb-12` che annulla il padding
      del main. Commit `57aee4f`, `84c8e59`.
- [x] Colonna sinistra: radio-list verticali (Base di conoscenza + Argomenti,
      quest'ultima espansa solo sul topic selezionato). Nuova chiave i18n
      `assistant.topic.label` ×6. Commit `84c8e59`.
- [x] Sidebar nascosta di default (desktop e mobile) con toggle ☰ accanto al
      titolo; persiste in `localStorage` (`cb_assistente_sidebar`). Commit `c7afd3b`.
- [x] Contorni focus sovrapposti eliminati: la regola globale `:focus-visible`
      disegnava un secondo outline dentro la card (Firefox tratta i campi di
      testo come sempre focus-visible). Fix: `.assistente-composer
      textarea:focus-visible { outline: none }` + tolto `ring-2` dalla card.
      Commit `83425bb`.
- [x] Opzione "Tabella" rimossa dal selettore formato su tutte le chat; solo
      Discorsivo + Puntato. Preferenza `table` salvata coerces a standard
      (`use-response-format.ts`). Commit `b8de9e4`.
- [x] Verificato con test backend diretto (container): il formato bullets viene
      applicato dal modello anche con il prompt di produzione e la persona Clio.
- [x] Scelta modalità chat fusa nella scheda "Impostazioni della conversazione"
      (`ChatSettingsCard`): sezione modalità + remember checkbox in cima,
      selettori una volta sola, Start disabilitato finché la modalità non è
      scelta. La scheda a parte resta SOLO per gli strumenti agent-only
      (Savickas, Eventi, Obiettivi, IDEA) che entrano in interazione senza
      passare da chat-settings. Commit `af24ce2`.
- [x] Container frontend ricostruito e distribuito dopo ogni step;
      207/207 test unitari, 25/25 test account-onboarding, i18n 2919 ×6.

## Problems Encountered
- Il test `test:account` si aspetta una preview server su porta 3107
  (ACCOUNT_BASE_URL): non attiva. Eseguire con
  `ACCOUNT_BASE_URL=http://127.0.0.1:3000 npm run test:account` (API simulate
  da Playwright, container frontend).
- L'utente visualizza il dominio pubblico `counselobot-sbs.ai4educ.org` da
  Firefox a zoom 90%: cache aggressiva, ha visto build stale più volte. Alla
  ripresa chiedere hard refresh (Cmd+Shift+R) prima di qualunque diagnosi.
- Il login pubblico SSO con account reale resta da verificare (da handoff
  precedente `area-personale-handoff.md`).

## Resolutions
- Il "taglio" della textarea percepito più volte era la somma di: riserva
  inferiore insufficiente, composer flottante in filetti separati e tre
  contorni di focus sovrapposti (bordo card + ring + outline globale). La card
  unica + l'azzeramento dell'outline risolvono insieme.
- `handleStartInteraction` applica la modalità scelta nella scheda tramite la
  stessa `chooseExperience()`, con guard `experiencePrefForInstrument(...)==null`
  per non sovrascrivere una preferenza già memorizzata da una sessione passata.
- `beginInteraction` ora usa `setExperience((current) => pref ?? current)`:
  mantiene la scelta fatta in scheda quando la preferenza non è memorizzata.

## Decision Log
- Solo Discorsivo + Puntato: la variante tabella non era rispettata in modo
  affidabile dal modello (testato: rispondeva con elenchi numerati).
- Sidebar nascosta di default (desktop e mobile): scelta esplicita dell'utente;
  persistenza in localStorage, non in account preferences.
- Indicatore di focus del composer delegato alla sola card (cambio colore
  bordo): l'anello globale resta per il resto dell'app (a11y).
- Scelta modalità fusa nelle impostazioni; flusso agent-only preservato così
  com'è per non modificare i loro step esistenti.
- Tema: la palette `indigo-*` è rimappata al petrol (#155e63) in tutto il sito
  (globals.css @theme) — i colori indaco negli screenshot sono "corretti".
- Test account: la preferenza modalità per gli agent-only si consolida al click
  (come prima), per il flusso standard si consolida su "Inizia la conversa".
- File operativi di questa sessione: `assistente-ui-handoff.md` (questo);
  gli handoff `HANDOFF.md` (22/09) e `area-personale-handoff.md` riguardano
  altri lavori e vanno preservati.

## Ripresa consigliata
1. Chiedere all'utente conferma visiva dopo hard refresh su Firefox.
2. Se restano difetti di layout: cattura intera finestra (non ritagliata) e
   confronto con le misure headless in `/tmp/assistente-v*.png`.
3. Proseguire poi con l'handoff `area-personale-handoff.md` (verifica rilascio
   SSO reale + ripresa piano 0.3 su Obiettivi con schema ASCII).
