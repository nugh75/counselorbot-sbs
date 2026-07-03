# Telegram: accesso di gruppo e ruolo docente

> **Stato:** implementato (fasi 1-5, branch `feature/telegram-bot`, 2026-07-03).
> Il docente accede da `/docente`; serve il gruppo ai4auth `docenti` (o marker
> teacher/educator/professor) e l'associazione al piano (creatore del piano o
> research_contact con la sua email/username).
> **Data:** 2026-07-03
> **Prerequisito:** bot Telegram base attivo (vedi `telegram-chatbot-counselorbot.md`).

## Decisioni prese (Daniele, 2026-07-03)

1. **Identità studente**: niente pseudonimi creati dal bot. Dal bot si arriva al
   **login ai4auth** (che include l'accesso ospite anonimo, attivo di default:
   `/login/anonymous`, gruppo studente). Dopo il login lo studente riceve il
   codice e lo manda al bot. L'anonimato è quello gestito da ai4auth.
2. **Docente**: può vedere profili e punteggi, vedere le conversazioni,
   annotare i profili, mandare messaggi agli studenti via bot.
3. **Modello dati**: si estendono i **piani di somministrazione**
   (`administration_plans` + `research_contacts`), nessuna nuova entità "classe".

## Flusso studente (senza attrito, con login vero)

1. Docente/admin crea un piano di somministrazione (già esistente) e ottiene,
   oltre a QR/link web, un **deep link Telegram**:
   `https://t.me/counselorsbs_bot?start=g_<token-piano>`.
2. Lo studente clicca → il bot riceve `/start g_<token>` → risponde con un
   bottone URL verso `https://counselorbot-sbs.ai4educ.org/telegram-link?g=<token>`.
3. ai4auth intercetta: lo studente si logga (account vero **o ospite anonimo**).
4. La pagina `/telegram-link` (autenticata) chiama `POST /telegram/link-code`,
   mostra il codice e un bottone "Torna al bot" con deep link
   `https://t.me/counselorsbs_bot?start=l_<codice>`.
5. Il bot riceve `/start l_<codice>` → consuma il codice (flusso `/link`
   esistente) → account collegato. Se nello stato c'era un `g_<token>` pendente,
   iscrive lo studente al piano.
6. Da quel momento i `QuestionnaireResult` creati via Telegram portano
   `administration_plan_id`/`research_contact_id` del piano (campi già esistenti).

Lo studente non digita mai nulla: due tap (login + torna al bot).

## Ruolo docente

- **Permessi**: i piani guadagnano un owner docente. Il gruppo ai4auth
  `docenti` accede alle route dei propri piani (stesso pattern dei
  ricercatori con `research_contacts`).
- **Dashboard** (pagina web, nuova sezione): per ogni piano del docente,
  elenco studenti iscritti con:
  - profili e punteggi (da `questionnaire_results` filtrati per plan_id);
  - learner model;
  - transcript delle conversazioni (da `logs` per session_id) — con
    informativa esplicita agli studenti nella pagina di ingresso del gruppo;
  - note del docente.
- **Note**: nuova tabella `teacher_notes(plan_id, username, author, text,
  visible_to_student, created_at)`.
- **Messaggi via bot**: endpoint docente che invia `sendMessage` a uno studente
  del proprio piano collegato a Telegram. Ogni invio loggato.
- **Web-first (Daniele, 2026-07-03)**: l'interazione docente↔studente vive
  anche nella web app, non solo su Telegram. Il docente lavora sempre dalla
  web app; lo studente riceve note/messaggi sia nel proprio profilo web sia
  via bot (se collegato). Telegram è un canale in più, non l'unico.

## Fasi

| Fase | Contenuto | Note |
|---|---|---|
| 1 | Deep link `/start` con payload (`g_`/`l_`) + pagina `/telegram-link` con auto-generazione codice | Utile subito anche per il singolo studente |
| 2 | Token di gruppo sul piano + iscrizione al piano via bot + tagging risultati | Riusa administration_plans |
| 3 | Permessi docente sui piani + dashboard sola lettura (profili, punteggi, learner model) | Gruppo `docenti` |
| 4 | Transcript nella dashboard + note docente | Informativa privacy nella pagina gruppo |
| 5 | Messaggi docente→studente via bot | Log invii |

## Punti aperti

- Ospite anonimo: la sessione è monouso — se lo studente perde la sessione,
  perde lo storico web ma il collegamento Telegram resta (il bot continua a
  funzionare con lo username ospite). Da spiegare nella pagina di ingresso.
- Cosa vede lo studente delle note docente (`visible_to_student`): default no.
