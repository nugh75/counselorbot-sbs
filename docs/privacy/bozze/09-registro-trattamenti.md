# Registro delle attività di trattamento — CounselorBot

> [!CAUTION]
> **Bozza tecnica, non consulenza legale.** Questo schema è stato preparato dal progetto CounselorBot per aiutare la
> scuola o l'università a compilare il registro delle attività di trattamento (art. 30 GDPR) e il registro dei flussi
> e delle categorie di dati (04 §Documenti). **Non** è un parere legale e **non** attesta la conformità al GDPR:
> compilare, adattare e approvare il registro spetta al **Titolare** con il **DPO**. Le voci **[DA VALIDARE]** e
> **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** vanno decise prima di usare il documento. I riferimenti normativi non sono
> stati verificati sul testo ufficiale ([04 §Fonti](../04-decisioni-titolare-dpo.md#fonti-normative-e-stato-della-verifica)).

Versione: bozza 0.1 (2026-10-24). Le colonne tecniche derivano da [01-analisi](../01-analisi.md) (`main` @ `2d47a5e6`).

---

## 1. Dati del Titolare (art. 30(1)(a))

- Titolare: **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** — **[DA VALIDARE 04-D1: per profilo di installazione]**
- Rappresentante legale: **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**
- Eventuali contitolari (es. università per la ricerca): **[DA VALIDARE]**
- DPO: **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**

## 2. Attività di trattamento

Per tutte le righe: base giuridica **[DA VALIDARE 04-D3]**, termini **[DA VALIDARE 04-D5]**, misure di sicurezza in
[10](10-misure-tecniche-organizzative.md).

| ID | Attività | Finalità | Interessati | Categorie di dati (tabelle) | Destinatari | Trasferimenti extra-UE |
|---|---|---|---|---|---|---|
| T1 | Account e accesso | autenticazione, ruoli | studenti, docenti, ricercatori, admin | username, hash password, nome, email (`users`, `user_display_names`, `institution_teachers`) | ai4auth (L1) **[DA VALIDARE: ruolo]** | no **[DA VALIDARE]** |
| T2 | Questionari e profili | servizio educativo, orientamento | studenti | risposte, punteggi, piani (`questionnaire_results`, `result_readings`, upload QSA) | docenti della classe | — |
| T3 | Chat guidata e orientamento con AI | servizio educativo | studenti | testi, cronologia, contesto (taccuino, punteggi) (`logs`, `orientation_sessions`, `frozen_sessions`, memoria di sessione) | provider di AI (filtrati se esterni), docenti per le trascrizioni | **[DA VALIDARE 04-D10]** |
| T4 | Taccuino, portfolio, lavori | servizio educativo | studenti | testo libero (`learner_profile_*`, `portfolio_items`, `personal_goals`, `tavoli`, `idea_*`) | docenti (oggi il taccuino; vedi [02 B1](02-informativa-docente.md)) | — |
| T5 | Gestione delle classi e note | coordinamento didattico | studenti, docenti | appartenenza, note, messaggi (`student_groups`, `group_memberships`, `group_shares`, `teacher_notes`) | docenti co-titolari della classe | — |
| T6 | Osservazioni di classe con AI | supporto al docente | studenti | risultati della classe con username | provider scelto dal docente | **[DA VALIDARE]** |
| T7 | Ricerca e validazione psicometrica | ricerca (art. 89) | studenti partecipanti | risposte, codici di ricerca, contatti (`validation_responses`, `anonymous_research_codes`, `research_contacts`) | ricercatori | **[DA VALIDARE]** |
| T8 | Questionario di gradimento | miglioramento del servizio | utenti | età, sesso, istruzione, istituto, paese, feedback (`survey_responses`) | — | — |
| T9 | Lettura vocale e trascrizione | accessibilità | utenti | testo da leggere, audio | Microsoft (Edge TTS, testo filtrato); servizio `transcription` interno | **[DA VALIDARE]** |
| T10 | Notifiche Telegram | comunicazione docente-studente | studenti, docenti | chat id, messaggi (`telegram_account_links`, `telegram_conversation_states`) | Telegram | **[DA VALIDARE]** |
| T11 | Credenziali di servizio dell'utente | uso di chiavi API o ChatGPT personali | docenti, utenti | chiavi e token cifrati (`personal_api_connections`, `chatgpt_connections`) | provider scelti dall'utente, OpenAI | **[DA VALIDARE]** |
| T12 | Sicurezza, log e diagnostica | sicurezza | tutti | log redatti, errori, (futuri) `privacy_events` | amministratori | — |
| T13 | Tunnel per l'app docente (L2) | accesso degli studenti al PC del docente | studenti, docenti | tutto il traffico web della classe | Cloudflare (termina il TLS) | **[DA VALIDARE]** |
| T14 | Backup | continuità | tutti | copia del database | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** | **[DA VALIDARE]** |

Categorie particolari (art. 9): possibili in T3, T4 e nei profili di T2 **[DA VALIDARE 04-D4]**.

## 3. Responsabili del trattamento (art. 28)

| Fornitore | Servizio | Attività | Contratto / DPA | Sede e garanzie |
|---|---|---|---|---|
| Hosting di L1 | server | tutte | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** | **[DA VALIDARE]** |
| Cloudflare | tunnel | T13 | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** | **[DA VALIDARE]** |
| Provider di AI abilitati (fino a 13 in `backend/ai_service.py`) | chat, riassunti, embedding | T3, T6 | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** | **[DA VALIDARE 04-D10]** |
| Microsoft | Edge TTS | T9 | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** | **[DA VALIDARE]** |
| Telegram | messaggi | T10 | **[DA VALIDARE: ruolo]** | **[DA VALIDARE]** |
| OpenAI (collegamento personale) | ChatGPT dell'utente | T11 | **[DA VALIDARE: ruolo]** | **[DA VALIDARE]** |
| ai4auth / ai4educ | identità | T1 | **[DA VALIDARE: ruolo]** | **[DA VALIDARE]** |

## 4. Flussi verso l'esterno (riepilogo tecnico)

Elenco completo con `file:riga` in [01 §5](../01-analisi.md#5-tutte-le-uscite-verso-modelli-e-servizi-esterni).

| Flusso | Dati | Protezione oggi |
|---|---|---|
| Chat, riassunti verso provider esterni | testo, cronologia, contesto | filtro regole + NER (non garantisce l'anonimato) |
| Chat verso modello locale fidato | idem | nessun filtro (host nel perimetro) |
| Immagini e OCR | scansioni | solo host locale fidato (P6a) |
| Edge TTS | testo letto | redazione distruttiva fail-closed (P6c) |
| Embedding | documenti pubblici, query | query filtrate, contenuti privati mai fuori |
| Telegram | messaggi | nessun filtro |
| Cloudflare | traffico web della classe | TLS fino all'edge di Cloudflare |
| Fonti esterne (Wikipedia, OpenAlex, …) | query ridotte | `redact_always` |

---

*Bozza P16 — da adottare solo dopo la revisione del Titolare e del DPO.*
