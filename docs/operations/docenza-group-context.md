# Contesto classi della chat docenza (OBIETTIVO_DOCENZA)

Contratto stabile per chi lavora sulla chat Obiettivi del docente. Corregge i
difetti registrati nel Diario `b06f03a8`, `e0929d44`, `9a8571fc` (solo locale)
e `caa98bfa`. Nessuna nuova tabella, dipendenza, permesso o migrazione: lo
snapshot congelato è JSON e i vecchi snapshot restano leggibili.

## Contratto

| Punto | Regola | Codice |
| --- | --- | --- |
| Turno | `ChatRequest.group_ids` viaggia a ogni turno (apertura, follow-up, domande, sintesi) solo per OBIETTIVO_DOCENZA. | `GuidedChatInterface.tsx` |
| Snapshot | `group_ids` (interi positivi, senza doppioni) è salvato in `FrozenSessionCreate` e restituito da `FrozenSessionDetail`; assente → `[]`. Cambiare la selezione basta a far ripartire l'autosalvataggio. | `schemas.py`, `routes/frozen_sessions.py`, `auto-freeze.ts` |
| Ripresa | Si usa la selezione salvata con quella sessione (anche vuota). Uno snapshot precedente a questo campo riprende **senza** classi. Una chat nuova parte dalla preferenza del browser (`cb-docenza-group-ids`), visibile nella barra prima di scrivere. | `lib/docenza-groups.ts` |
| Accesso | Gli id non sono un permesso. A ogni turno `visible_group_for_teacher` accetta solo classi **attive** di cui l'utente è proprietario o co-docente (`GroupShare`, confrontato in minuscolo come viene salvato). Anche l'amministratore: nessun accesso globale. Revoca e disattivazione valgono al turno successivo; ciò che è già nella cronologia non viene cancellato. | `teacher_context.py` |
| Elenco | La barra legge `/admin/groups?own=true`: proprie o condivise anche per l'admin, le stesse che il builder accetta. Senza `own` l'elenco di gestione resta invariato. | `routes/groups.py`, `group_visibility.py`, `DocenzaClassBar.tsx` |
| Taccuino | Le classi entrano solo con il taccuino docente, che è anche il default della docenza; restano fuori con `student`, `practice`, `none`. L'avviso della barra segue la stessa regola (default = classi incluse) e, per chi non è docente, il default effettivo. | `chat_logic.py`, `docenza-groups.ts` |
| Componente profilo | Con il componente `profile` spento (configurazione per passo) non entrano né il taccuino docente né le classi; in prova esce il taccuino simulato, restano l'avviso `[SIMULATION]` e i punteggi della sessione, come nel ramo studente. | `chat_logic.py` |
| Privacy | Descrizione e metodologie della classe sono dati contestuali, non istruzioni né prove di difficoltà o prestazioni. `TeacherNote` non entra mai. Lo studente riceve `[CONTESTO CLASSE]` solo dalle proprie classi attive con `context_visible_to_students`. | `teacher_context.py` |

Fuori ambito qui: prompt, focus e progressione essenziale della chat Obiettivi
(blocco successivo), selezione classi resa obbligatoria o spostata prima del
primo turno.

## Verifica

Solo su PostgreSQL effimero e rete Docker interna, senza dati reali:

```sh
docker network create --internal counselorbot-goal-context-s5
docker run -d --name counselorbot-goal-context-s5-postgres \
  --network counselorbot-goal-context-s5 --network-alias postgres \
  --tmpfs /var/lib/postgresql/data -e POSTGRES_HOST_AUTH_METHOD=trust \
  mirror.gcr.io/library/postgres:15
docker run --rm --network counselorbot-goal-context-s5 \
  -e DATABASE_URL=postgresql://postgres@postgres:5432/counselorbot_test \
  -e PYTHON_DOTENV_DISABLED=1 -e COUNSELOR_TRANSLATE_DISABLED=1 -e ADMIN_SYNC_DISABLED=1 \
  <immagine backend di test> \
  python -m pytest -q --disable-warnings backend/tests/test_docenza_group_context.py
```

Le suite che leggono la documentazione (`test_practice_notebooks.py`,
`test_class_access.py`) richiedono anche `docs/` e `docs-counselorbot/`
montati in sola lettura in `/app`, oltre ai due mount QPCC già noti.

Frontend: `npm test` (include `src/lib/docenza-groups.test.ts` e
`src/lib/auto-freeze.test.ts`), `npm run lint`, `npm run build`.

Casi coperti: selezione presente, assente, multipla e svuotata; classe estranea,
inattiva, inesistente e revocata; snapshot vecchio; isolamento tra sessioni;
default/teacher/student/none/practice; componente profilo spento; admin,
proprietario e co-docente (anche con maiuscole nel nome utente); note
individuali escluse. Opt-in studente e classi attive restano coperti da
`test_teacher_context.py` e `test_practice_notebooks.py`.
