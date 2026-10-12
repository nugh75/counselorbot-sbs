# Diario della sperimentazione / Experimentation journal

Cronologia delle attività di validazione e dei contatti di ricerca di CounselorBot,
sintetizzata da: [`../diario.md`](../diario.md), [`../comunicazioni/`](../comunicazioni/),
[`../../rebranding-compassbot-feedback-email.md`](../../rebranding-compassbot-feedback-email.md),
presentazioni KTH e git log / PR. Dettagli completi restano nei documenti citati.

---

## Versione italiana (cronologica)

### 30 maggio 2026 — Validazione metodologica e contatti KTH / Spagna

- **Dettagli psicometrici e manuale operativo**: redatti
  [`dettagli-validazione-questionari.md`](../../validazione/dettagli-validazione-questionari.md)
  (QSA, QSAr, ZTPI, QPCS, QPCC, QAP) e
  [`manuale-operativo-validazione.md`](../../validazione/manuale-operativo-validazione.md)
  (procedura di validazione QSAr in inglese per studenti KTH in 6 passi).
  Fonte: [`../diario.md`](../diario.md).
- **Contatto docente spagnola (validazione QSA)**: ricevuto il messaggio
  con revisione delle traduzioni spagnole dei questionari; preparata bozza di
  risposta in spagnolo che propone CounselorBot come piattaforma di validazione,
  con link e account di prova. Scheda:
  [`contatto-begona-qsa-es-2026-05-30.md`](../comunicazioni/contatto-begona-qsa-es-2026-05-30.md)
  (testo integrale nel repo privato).
- **Contatto docente KTH (proposta validazione)**: scritta la mail di proposta
  [`mail-olle.md`](../comunicazioni/mail-olle.md) (validazione QSA in inglese ed
  eventuale svedese + attività con CounselorBot e studenti KTH) e la traduzione
  [`mail-olle-en.md`](../comunicazioni/mail-olle-en.md). Le credenziali di prova
  citate nelle mail non sono riportate qui (testi integrali nel repo privato).

### 1 settembre 2026 — Presentazione KTH EECS

- Talk di max 40 minuti al dipartimento EECS (discorso in inglese, preparazione
  in italiano): CounselorBot come "harness" intorno al modello, ponte tra
  tradizione pedagogica italiana (Pellerey, Roma Tre) e infrastruttura LLM, con
  richiesta pratica di una sede per la validazione svedese del QSAr.
  Copione: [`presentazione-kth-eecs-2026-09-01.md`](../../presentazione-kth-eecs-2026-09-01.md).
  La presentazione richiama il contatto di maggio con il docente KTH (vedi mail sopra).

### 9 settembre 2026 — Presentazione KTH (IT + EN)

- Copione italiano (11 slide, 35–40 min) e gemello inglese: percorso personale,
  contesto Roma Tre/Ostiense, tre domande di ricerca (D1–D3) e invito ai colleghi
  a collaborare alla validazione.
  Copioni: [`presentazione-kth-2026-09-09-it.md`](../../presentazione-kth-2026-09-09-it.md),
  [`presentation-kth-2026-09-09-en.md`](../../presentation-kth-2026-09-09-en.md).

### Settembre–ottobre 2026 (date dai commit) — Feedback e rebranding

- **Ringraziamento a un tester**: mail di ringraziamento per test e suggerimenti,
  con elenco dei fix applicati (traduzioni questionario, Compass+Notebook,
  autosave, mappa IDEA, pulsante Start); sul nome si resta in riflessione.
  Scheda: [`mail-sebastian-en.md`](../comunicazioni/mail-sebastian-en.md)
  (testo integrale nel repo privato).
- **Proposta di rebranding CompassBot**: bozza di mail che propone il nome
  "CompassBot" (metafora bussola/timonieri) per superare la connotazione
  terapeutica di "CounselorBot", con backup HelmsBot/NorthBot/LumenBot.
  Documento: [`rebranding-compassbot-feedback-email.md`](../../rebranding-compassbot-feedback-email.md).

### Ottobre 2026 (date dai commit/PR) — Sviluppo recente rilevante per la sperimentazione

- Catalogo strumenti confluito nelle attività e nei percorsi, route `/strumenti`,
  suggerimenti e banner di ripresa chat (PR #233–#239).
- Ruolo counsellor stabile nei prompt delle chat guidate (PR #228); scelta dei
  modelli personali dalla lista del provider (PR #227).
  Fonte: `git log --oneline`, `gh pr list` (verificare numeri sul repo remoto).

---

## English version (chronological)

### 30 May 2026 — Methodological validation and KTH / Spain contacts

- **Psychometric details and operational manual**: drafted
  [`dettagli-validazione-questionari.md`](../../validazione/dettagli-validazione-questionari.md)
  (QSA, QSAr, ZTPI, QPCS, QPCC, QAP) and
  [`manuale-operativo-validazione.md`](../../validazione/manuale-operativo-validazione.md)
  (6-step QSAr validation procedure in English for KTH students).
  Source: [`../diario.md`](../diario.md).
- **Contact Spanish lecturer (QSA validation)**: received message
  with the review of the Spanish questionnaire translations; prepared a Spanish
  reply draft proposing CounselorBot as the validation platform, with link and
  trial account. Sheet:
  [`contatto-begona-qsa-es-2026-05-30.md`](../comunicazioni/contatto-begona-qsa-es-2026-05-30.md)
  (full text in the private repo).
- **Contact KTH lecturer (validation proposal)**: wrote the proposal email
  [`mail-olle.md`](../comunicazioni/mail-olle.md) (QSA validation in English and
  possibly Swedish + CounselorBot activity with KTH students) and its translation
  [`mail-olle-en.md`](../comunicazioni/mail-olle-en.md). Trial credentials quoted
  in the emails are not repeated here (full texts in the private repo).

### 1 September 2026 — KTH EECS presentation

- Max-40-minute talk at the EECS department (speech in English, preparation in
  Italian): CounselorBot as a "harness" around the model, a bridge between the
  Italian pedagogical tradition (Pellerey, Roma Tre) and LLM infrastructure, with
  a practical ask for a home for the Swedish QSAr validation.
  Script: [`presentazione-kth-eecs-2026-09-01.md`](../../presentazione-kth-eecs-2026-09-01.md).
  The talk recalls the May contact with the KTH lecturer (see emails above).

### 9 September 2026 — KTH presentation (IT + EN)

- Italian script (11 slides, 35–40 min) and English twin: personal journey,
  Roma Tre / Ostiense context, three research questions (D1–D3) and an invitation
  to colleagues to join the validation effort.
  Scripts: [`presentazione-kth-2026-09-09-it.md`](../../presentazione-kth-2026-09-09-it.md),
  [`presentation-kth-2026-09-09-en.md`](../../presentation-kth-2026-09-09-en.md).

### September–October 2026 (dates from commits) — Feedback and rebranding

- **Thank-you to a tester**: thank-you email for testing and suggestions,
  listing the applied fixes (questionnaire translations, Compass+Notebook,
  autosave, IDEA map, Start button); the name decision is still open.
  Sheet: [`mail-sebastian-en.md`](../comunicazioni/mail-sebastian-en.md)
  (full text in the private repo).
- **CompassBot rebranding proposal**: email draft proposing the name
  "CompassBot" (compass/helmsmen metaphor) to move past the therapeutic reading
  of "CounselorBot", with HelmsBot/NorthBot/LumenBot as backups.
  Document: [`rebranding-compassbot-feedback-email.md`](../../rebranding-compassbot-feedback-email.md).

### October 2026 (dates from commits/PRs) — Recent development relevant to the experimentation

- Tool catalog merged into activities and paths, `/strumenti` route,
  suggestions and chat-resume banners (PRs #233–#239).
- Stable counsellor role in guided-chat prompts (PR #228); personal model
  selection from the provider list (PR #227).
  Source: `git log --oneline`, `gh pr list` (verify numbers on the remote repo).
