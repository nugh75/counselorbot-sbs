# Handoff: revisione dell’Area personale e Orientamento
Data: 2026-09-23 | Sessione precedente: piano UX, categorie istituto e rilascio

## Objective
Rivedere l’Area personale con interventi gerarchici, uno alla volta, mantenendo
l’autonomia dello studente e le immagini già disponibili. Completare il piano
`docs/plans/2026-09-23-area-personale-audit-piano-ux.md` senza applicare in blocco
le proposte ancora da validare. Questo è l’handoff da usare per questa attività;
il precedente `HANDOFF.md`, non tracciato, riguarda un altro lavoro ed è preservato.

## Progress
- [x] 0.1: nomi e cinque gruppi dell’Area personale approvati.
- [x] 0.2: ingresso `/profilo` realizzato, 17 destinazioni, immagini esistenti.
- [x] 0.3: pilota `/profilo/orientamento`; solo ritorno a sinistra «Area personale»,
  poi immagine/titolo/descrizione. «Vai a…» a destra rimosso su richiesta esplicita.
- [x] 0.3.2.1: amministratore associa/revoca docenti all’istituto; API e pannello.
- [x] 0.3.2.2: `/docente/orientamento`, categorie condivise, ordine, archivio,
  ripristino, revisioni e protezione delle bozze. Commit `cb46764`.
- [x] 0.3.2.3: docenti assegnano più categorie a contatti/appuntamenti pubblicati;
  studenti filtrano per istituto, con risorse nazionali separate. Commit `64ecff4`.
- [x] Backend e frontend ricostruiti e distribuiti il 23/09 alle 20:51 Europe/Rome
  con `docker compose up -d --no-deps backend frontend`, su richiesta dell’utente.
- [x] Guida e 12 screenshot aggiornati nelle sei lingue; Markdown funzionalità e
  manifest allineati. RAG CounselorBot ricostruito: 292 passaggi, 19 fonti, corrente.
- [x] Verifiche: 61 test backend; 34 browser sulla build Docker con API simulate;
  TypeScript, ESLint mirato, parità lingue e `make guidance-check` superati.
- [x] Produzione locale: le due pagine Orientamento e la Guida restituiscono 200;
  nuove API in OpenAPI, senza identità rispondono 401. Quattro worker avviati,
  nessun traceback, zero restart. Due casi browser italiani passati sul container
  di produzione con fixture. Browser pubblico raggiunge il login SSO.
- [ ] Login pubblico con account reale e prova operativa con docenti/istituto:
  non eseguiti. Non confondere fixture browser con verifica SSO autenticata.

### Lavoro restante (piano §6)
- [ ] Completare 0.3/lotto 2 sulle altre sottopagine, una per volta: testata unica,
  ritorno certo, immagine esistente, azione principale dove utile. La variante
  senza «Vai a…» sostituisce gli schemi storici contrari ancora presenti nel piano.
- [ ] Lotto 1A: bozze/uscita/errori e conflitti in Libretto, Portfolio, Obiettivi,
  strumenti visuali e calendario. Le guardie delle categorie non coprono tali pagine.
- [ ] Lotto 1B: errori con riprova, uscita dai gruppi confermata, testo pQBL.
- [ ] Lotto 3A: Obiettivi e collegamenti; creare senza compilare tutto il bilancio,
  aprire attività precise e collegare senza perdere bozze.
- [ ] Lotto 3B: Libretto, Taccuino, Portfolio, Risultati/Cambiamenti; una pagina
  alla volta, conservando versioni, visibilità e significato dei dati.
- [ ] Lotto 4: Carte, Confronto, Calendario, Flashcard, Tavolo e altri strumenti;
  distinguere lettura/modifica e assicurare alternative al trascinamento su mobile.
- [ ] Lotto 5A: Assegnazioni, Classi, Telegram; rendere chiari destinatari,
  restituzioni, contenuti effettivamente condivisi ed errori. Orientamento è ora
  avanzato, ma ciò non chiude automaticamente tutto il lotto.
- [ ] Lotto 5B: estensioni API (lavoro già svolto, inviti, bozze Tavolo) richiedono
  decisioni separate; non implementarle come conseguenza delle approvazioni passate.
- [ ] Verifica con persone/scenari reali del piano §7, dopo ciascun intervento.

- [x] 24/09: la sessione successiva (redesign /assistente, commit `57aee4f`→`af24ce2`)
  è completata; vedi `assistente-ui-handoff.md`. Nessun lavoro nuovo su questa linea.
- [ ] 24/09: 0.3 lotto 2 ripreso su **Obiettivi**, pagina scelta dall’utente.
  Schema ASCII presentato in chat, **in attesa di approvazione dello schema**.
  Prima/di pari passo con la testata va chiusa F06 su questa pagina (la sotto-form
  di azione dentro GoalDetail non entra nella guardia bozza: testo perso senza
  conferma cliccando «Area personale»).

**Ripresa consigliata:** dopo l’approvazione dello schema ASCII di `/profilo/obiettivi`,
implementare `PersonalAreaHeader slug="obiettivi"` + guardia F06, una pagina alla
volta come nel pilota Orientamento. Non ripartire dalle categorie. Il «Vai a…» resta
rimosso (decisione utente del 23/09, pilota Orientamento).

## Problems Encountered
Nessun blocco tecnico aperto sul rilascio. Le richieste Python al dominio pubblico
ricevono Cloudflare 1010; il browser normale arriva invece a `auth.ai4educ.org/login`.
La preview precedente su 3108/3109 e relativo tunnel usa dati sintetici: non è prova
di produzione; verificare se i processi sono ancora attivi prima di riutilizzarla.

## Resolutions
- Una vecchia suite importava `backend.main` creando tabelle nel DB del servizio:
  le due tabelle di associazione risultavano vuote; corretto il test per confinare
  anche l’import al DB dedicato. Nessun contenuto reale creato o riclassificato.
- Revisioni comuni all’istituto proteggono categorie, ordine e assegnazioni;
  lock e confronto `updated_at` proteggono dalle modifiche amministrative ai contenuti.
- Associazioni archiviate preservate; lettura/scrittura verificano l’istituto del
  contenuto e della categoria. Spostare un contenuto non trasferisce le categorie.
- Protezione bozze: `use-category-draft-guard.ts`, Navigation API e ripiego history
  verificati. Un solo editor aperto tra categorie e assegnazioni.

## Decision Log
- L’istituto decide i nomi; nessuna tassonomia precompilata attribuita a Pellerey/Savickas.
- Solo l’amministratore associa i docenti; né Taccuino né classi conferiscono quel diritto.
- Docenti gestiscono categorie/associazioni; non ricevono nuovi poteri sui contenuti o certificazioni.
- Filtri studente distinti dai bisogni globali della chat; nessun cambio automatico ai prompt.
- Risorse nazionali separate, categorie pertinenti e istituti distinguibili; nessuna traduzione automatica dei nomi.
- L’utente ha autorizzato il rilascio dei cambiamenti completati, non i lotti futuri in blocco.
- Branch: `feature/institution-teacher-membership`; continuare preservando modifiche estranee.
- Fonti operative: `CONTEXT.md`, `docs/design.md`, piano UX citato sopra,
  `docs/operations/institution-orientation-categories.md`; dopo cambi prodotto aggiornare
  `docs-counselorbot/funzionalita-counselorbot.md`, guide/catture, guidance-refresh/check.
- Diagnostica di questa sessione: `/tmp/counselorbot-personal-preview/assignments-*.log`.
