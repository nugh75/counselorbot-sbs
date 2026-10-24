# Informativa per il personale docente — CounselorBot

> [!CAUTION]
> **Bozza tecnica, non consulenza legale.** Questo testo è stato preparato dal progetto CounselorBot per aiutare la
> scuola o l'università a scrivere la propria informativa (artt. 12-14 GDPR) e le istruzioni per chi è autorizzato al
> trattamento (art. 29 GDPR). **Non** è un parere legale e **non** attesta la conformità al GDPR: decidere, adattare e
> approvare il testo spetta al **Titolare** con il **DPO**. Le voci **[DA VALIDARE]** e
> **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** vanno decise prima di usare il documento. I riferimenti normativi non sono
> stati verificati sul testo ufficiale ([04 §Fonti](../04-decisioni-titolare-dpo.md#fonti-normative-e-stato-della-verifica)).

Versione: bozza 0.1 (2026-10-24). Parte A: i dati del docente. Parte B: istruzioni sui dati degli studenti.

---

## Parte A — Trattamento dei dati del docente

### A1. Titolare e DPO

- Titolare: **[DA COMPILARE DA PARTE DEL TITOLARE/DPO: istituto, sede, CF, PEC, rappresentante legale]**
  **[DA VALIDARE 04-D1: con l'app desktop il titolare potrebbe essere la scuola o il docente stesso]**
- DPO: **[DA COMPILARE DA PARTE DEL TITOLARE/DPO: nome, email, PEC]**

### A2. Dati trattati

| Categoria | Contenuto | Dove (riferimento tecnico) |
|---|---|---|
| Identità e ruolo | username, nome visualizzato, email, gruppi di appartenenza da cui deriva il ruolo | `users`, `user_display_names`; ruoli da ai4auth (L1) o dal profilo locale (L2) |
| Credenziali | hash Argon2id della password; sessioni locali come hash SHA-256 | `backend/auth.py`; ADR-0002 §3.2 |
| Attività didattica | classi, condivisioni fra docenti, piani di somministrazione, note e messaggi agli studenti, compiti | `student_groups`, `group_shares`, `teacher_notes`, … |
| Credenziali di servizio (se le inserisce) | chiavi API personali e collegamento ChatGPT, cifrati con Fernet; su L2 chiavi nel portachiavi del sistema | `personal_api_connections`, `chatgpt_connections`; F1-08 |
| Uso dell'AI | richieste di osservazioni di classe e sintesi, con i dati degli studenti che contengono | 01 §5-6 |
| Dati tecnici | log applicativi e di errore | **[DA VALIDARE: un registro delle consultazioni dei dati degli studenti non esiste ancora (P8)]** |

### A3. Finalità e basi giuridiche

| Finalità | Base giuridica |
|---|---|
| Account e uso degli strumenti didattici | **[DA VALIDARE 04-D3]** |
| Gestione delle classi, somministrazioni, orientamento | **[DA VALIDARE 04-D3]** |
| Sicurezza, tracciabilità degli accessi ai dati degli studenti | **[DA VALIDARE 04-D3]** |
| Collegamento personale a ChatGPT o a chiavi API proprie (facoltativo) | **[DA VALIDARE 04-D3]** |

### A4. Destinatari

Personale tecnico autorizzato; responsabili del trattamento (art. 28): hosting del server, Cloudflare (tunnel su L2,
vede il traffico in chiaro), fornitori di AI scelti dall'istituto, Microsoft (lettura vocale Edge), Telegram (se usato),
OpenAI (se il docente collega il proprio account ChatGPT). Elenco e contratti: **[DA COMPILARE DA PARTE DEL TITOLARE/DPO, 04-D2]**.
Trasferimenti extra-UE: **[DA VALIDARE 04-D10]**.

### A5. Conservazione

Account e attribuzioni di classe: **[DA VALIDARE 04-D5]**. Registri di audit: **[DA VALIDARE 04-D5]**. Dettagli in [06](06-politica-conservazione-cancellazione.md).

### A6. Diritti

Accesso, rettifica, cancellazione, limitazione, opposizione, portabilità dove applicabile (artt. 15-22 GDPR), reclamo
al Garante. Richieste a **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**; termine di risposta **[DA VALIDARE: un mese, art. 12(3)]**.

---

## Parte B — Istruzioni per il trattamento dei dati degli studenti

Designazione come persona autorizzata (art. 29 GDPR, art. 2-quaterdecies del Codice): **[DA VALIDARE: atto, data,
ambito]**. Le istruzioni seguenti sono una proposta tecnica.

### B1. Cosa il sistema le mostra oggi

| Dato dello studente | Oggi (codice al 2026-10-24) | Regola proposta (P7, 04-D6) |
|---|---|---|
| Risultati dei questionari | **tutti** i risultati di uno studente membro di una sua classe, anche prodotti fuori dalla classe (01 §9, G5) | solo quelli legati alla classe e al periodo di iscrizione |
| Trascrizioni delle chat sui risultati | idem | idem, se la categoria è nel grant |
| Taccuino (`learner_profile`) | l'ultima versione, nell'elenco degli studenti della classe (`backend/routes/groups.py:827`) | solo se lo studente lo condivide ([04](04-consenso-condivisione-docente.md)) |
| Osservazioni di classe con AI | i risultati di tutti i membri, con username, al modello scelto | dati pseudonimizzati anche verso modelli locali |

Finché P7 non è attivo, la limitazione all'ambito necessario resta **una regola di comportamento**, non un vincolo tecnico.

### B2. Istruzioni proposte

1. Consultare solo i dati degli studenti delle proprie classi e solo per finalità didattiche e di orientamento.
2. Non leggere il taccuino o i lavori personali senza una ragione didattica **[DA VALIDARE 04-D6]**.
3. Non esportare dati degli studenti su supporti o servizi non autorizzati dall'istituto
   **[DA COMPILARE DA PARTE DEL TITOLARE/DPO: elenco dei canali ammessi]**.
4. Nelle richieste libere all'AI non inserire nomi, dati di contatto o informazioni sulla salute degli studenti: il
   filtro verso i provider esterni non è infallibile, e verso i modelli locali il testo arriva senza filtro.
5. Usare solo i provider di AI approvati dall'istituto **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**.
6. Telegram: inviare solo messaggi minimi, senza risultati o valutazioni **[DA VALIDARE]**.
7. Segnalare subito ogni sospetta violazione (vedi B4).

### B3. Se usa l'app desktop docente (profilo `teacher-pc`, L2)

Sul suo PC gira un intero server per la classe: database SQLite, backend, frontend e tunnel Cloudflare. Lei ne è
l'amministratore locale (ADR-0002 §3.3). Proposte di misure minime **[DA VALIDARE 04-D1, D12, D14]**:

1. **Cifratura del disco** attiva (FileVault, BitLocker o LUKS): i backup locali `backups/*.sqlite3` non sono cifrati
   dall'applicazione.
2. Account del sistema operativo personale, con password e blocco automatico dello schermo
   (**[DA VALIDARE: tempo massimo]**).
3. Non condividere il token del tunnel nominativo né le chiavi del portachiavi.
4. Chiudere il tunnel quando la lezione è finita.
5. Custodire il **kit di recupero delle chiavi** come indicato dall'istituto **[DA VALIDARE 04-D14]**: senza kit, una
   chiave persa rende illeggibili i dati cifrati.
6. Aggiornare l'app quando richiesto.

### B4. Smarrimento, furto o accesso sospetto

Avvisare **[DA COMPILARE DA PARTE DEL TITOLARE/DPO: referente e recapito]** entro **[DA VALIDARE 04-D12: termine interno]**
dalla scoperta, secondo la [procedura di data breach](07-procedura-data-breach.md).

---

*Bozza P16 — da adottare solo dopo la revisione del Titolare e del DPO.*
