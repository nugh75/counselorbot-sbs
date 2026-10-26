# Inviti studenti desktop — 26 ottobre 2026

- Branch: `fix/desktop-macos-startup`, secondo fix della stessa sessione.
- Sintomo: lo studente apre «Invito al gruppo» e riceve «Invito non valido o
  scaduto», anche con un codice classe valido, perché non ha una sessione locale.
- Causa: `ClassOverviewTab` mostrava sia la scheda web `/gruppo?g=…` sia il
  pannello di abbinamento locale. `/groups/join` richiede un utente autenticato;
  il desktop deve invece creare l'identità con `/unisciti#k=…`.
- Modifica: con `isLocalAuth()` il pannello di abbinamento sostituisce l'invito
  web, nella stessa posizione della panoramica. Con ai4auth resta l'invito web.
- Soluzione nei bundle precedenti: Classi → Apri classe → Panoramica → Accesso
  dal tunnel docente → Genera nuovo link, poi approva i dispositivi in attesa.
- Regressioni browser: invito web/codice assenti in locale; sezione pairing
  assente con ai4auth e URL web conservato; il link generato contiene il percorso
  `/unisciti#k=…`. Suite esistente completa con API simulate su porta 3170.
- Validazioni: 9/9 test browser su immagine Docker isolata (`LOCAL_PAIRING_BASE_URL=http://127.0.0.1:3171`),
  build frontend completa con TypeScript, ESLint (zero errori, un warning preesistente
  `updatedGroup` non usato), `make guidance-refresh`/`guidance-check` e diff pulito.
  La prima prova browser è stata rilanciata dopo che il server era pronto.
- Nessuna API, schema o migrazione dei dati modificata. Docker ricostruito
  separatamente per verifica, senza riavviare servizi di produzione.
