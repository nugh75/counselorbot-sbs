# Informativa e modulo per la ricerca — CounselorBot

> [!CAUTION]
> **Bozza tecnica, non consulenza legale.** Questo testo è stato preparato dal progetto CounselorBot per aiutare la
> scuola, l'università o l'ente di ricerca (artt. 13-14 e 89 GDPR). **Non** è un parere legale e **non** attesta la
> conformità al GDPR né alle regole deontologiche per la ricerca: decidere, adattare e approvare il testo spetta al
> **Titolare** con il **DPO** e, se previsto, al comitato etico. Le voci **[DA VALIDARE]** e
> **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** vanno decise prima di usare il documento. I riferimenti normativi non sono
> stati verificati sul testo ufficiale ([04 §Fonti](../04-decisioni-titolare-dpo.md#fonti-normative-e-stato-della-verifica)).

Versione: bozza 0.1 (2026-10-24). Decisione di riferimento: 04-D13.

---

## Parte A — Informativa

### A1. Chi fa la ricerca

- Titolare per la ricerca: **[DA COMPILARE DA PARTE DEL TITOLARE/DPO: università, dipartimento o scuola]**
  **[DA VALIDARE 04-D1: rapporto con il titolare del servizio educativo (contitolarità, comunicazione, …)]**
- DPO: **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**
- Responsabile scientifico: **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**
- Parere del comitato etico: **[DA VALIDARE 04-D13: necessario? estremi]**

### A2. Che cosa studiamo

**[DA COMPILARE DA PARTE DEL TITOLARE/DPO: titolo e obiettivi del progetto]**. Esempi di finalità tecnicamente
supportate: validazione psicometrica degli strumenti (QSA, ZTPI, …), studio dell'uso del tutor nell'orientamento.

### A3. Quali dati

| Dato | Fonte nel sistema | Usato? |
|---|---|---|
| Risposte e punteggi dei questionari | `validation_responses`, `questionnaire_results` | **[DA VALIDARE]** |
| Dati di contesto (età, genere, tipo di scuola, anno di corso) | `survey_responses`, dati della classe | **[DA VALIDARE: solo in fasce]** |
| Testi delle conversazioni o del taccuino | `logs`, `learner_profile_*` | **[DA VALIDARE]** — proposta: esclusi |
| Contatti per ricontattare il partecipante | `research_contacts` | solo se acconsenti separatamente **[DA VALIDARE]** |

Nome, username, email e altri identificativi diretti **non** entrano nel dataset consegnato ai ricercatori.

### A4. Come si protegge l'identità (art. 89)

**Oggi**: i dati di ricerca usano un codice `SBS-XXXX-XXXX` casuale, ma la tabella che lo collega allo username è in
chiaro nel database (`backend/anonymous_codes.py:20-52`). Chi ha accesso al database può quindi risalire alla persona.

**Proposto** (04-D13): codice derivato con HMAC e chiave dedicata alla ricerca, custodita separatamente dal team di
ricerca; dataset esportato senza identificativi diretti; pubblicazione solo di risultati aggregati. Anche così i dati
restano **pseudonimizzati, non anonimi**, e quindi dati personali (art. 4(5)).

Misure organizzative: impegno dei ricercatori a non reidentificare **[DA VALIDARE]**, soglia minima per le celle
pubblicate **[DA VALIDARE]**.

### A5. Base giuridica

**[DA VALIDARE 04-D3, D13]**: consenso (art. 6(1)(a) e, per dati di categorie particolari, art. 9(2)(a)) oppure altra
base con le garanzie dell'art. 89 e della normativa nazionale. Questo modulo serve solo se la base è il consenso.

### A6. Partecipazione volontaria

Partecipare è libero. Dire di no non cambia nulla nell'uso di CounselorBot, nei voti o nel rapporto con i docenti.
I docenti **[DA VALIDARE: non vengono informati di chi partecipa]**.

### A7. Quanto tempo

Dati pseudonimizzati: **[DA VALIDARE 04-D5]**. Dopo: anonimizzazione o cancellazione **[DA VALIDARE]**.

### A8. Diritti e ritiro

Accesso, rettifica, cancellazione, limitazione, opposizione (artt. 15-22, con i limiti dell'art. 89(2)
**[DA VALIDARE]**). Ritiro del consenso in ogni momento scrivendo a **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**: i
dati non ancora usati in analisi o pubblicazioni vengono tolti **[DA VALIDARE]**. Reclamo al Garante.

---

## Parte B — Modulo di consenso

Nome utente o codice: ____________________

Ho letto l'informativa (versione bozza 0.1). Nessuna casella è già spuntata.

| Scelta | Sì | No |
|---|---|---|
| 1. Partecipo alla ricerca con i dati della Parte A3 indicati come usati | ☐ | ☐ |
| 2. Accetto di essere ricontattato/a per studi successivi (contatto separato) | ☐ | ☐ |

Luogo e data: ____________________ Firma: ____________________

Per chi è minorenne — chi firma: **[DA VALIDARE 04-D7]**.
Genitore o tutore: ____________________ Firma: ____________________

### Nota tecnica per la registrazione (P9)

Finalità `research` **[DA VALIDARE: chiave]** con `requires_consent` se la base è il consenso; ogni scelta è un evento
in `privacy_events` con versione del documento e `subject_pid`. Finché la base resta `undefined` la finalità è
disattivata (02 §7.2).

---

*Bozza P16 — da adottare solo dopo la revisione del Titolare e del DPO.*
