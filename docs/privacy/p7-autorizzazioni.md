# P7 — Autorizzazioni docente-studente e amministratore tecnico

Stato: **implementato** (2026-10-25). Progetto in [02-progettazione](02-progettazione.md) §5.2 e §5.3;
risoluzione delle lacune G5 (accesso indebito del docente al taccuino e a risultati fuori classe) e G6
(amministratore tecnico con lettura in chiaro senza break-glass né audit).

## 1. Moduli e tabelle

| File / Tabella | Ruolo |
|---|---|
| `backend/privacy/authz.py` | Motore di autorizzazione (`authorize_data_access`, `check_teacher_student_access`, sync e revoca grant, controlli di ambito) |
| `backend/privacy/events.py` | Registrazione fail-closed degli eventi privacy (`record_privacy_event`, audit trail) |
| `backend/routes/privacy.py` | Endpoint REST `POST /privacy/break-glass` e `POST /privacy/break-glass/{id}/revoke` |
| `backend/models.py` | Modelli SQLAlchemy `TeacherStudentGrant`, `PrivacyBreakGlass`, `PrivacyEventRecord` |
| `backend/migrations/20261025_teacher_student_grants.py` | Migrazione DDL portabile PostgreSQL/SQLite e backfill automatico da `group_memberships` |
| `backend/routes/groups.py` | Applicazione controlli IDOR, isolamento istituti e mascheramento taccuino (G5) sulle rotte classe |
| `backend/routes/admin.py` | Pseudonimizzazione automatica dei log per admin L1 salvo break-glass attivo |
| `backend/routes/survey.py` | Pseudonimizzazione dei risultati questionario per admin L1 salvo break-glass attivo |

## 2. Modello autorizzativo docente-studente (`TeacherStudentGrant`)

La tabella `teacher_student_grants` traccia formalmente i titoli di accesso del docente ai dati di ogni studente della classe:

| Colonna | Tipo | Descrizione |
|---|---|---|
| `id` | `Integer`, PK | Identificativo univoco |
| `teacher_username` | `String(255)`, indice | Username del docente titolare o co-docente delegato |
| `student_username` | `String(255)`, indice | Username dello studente iscritto |
| `group_id` | `Integer`, FK `student_groups.id` | Classe o gruppo di appartenenza |
| `basis` | `String(64)` | Base giuridica: `institutional_assignment`, `organizational_authorization`, `consent`, `student_share` |
| `categories` | `JSON` | Categorie ammesse (default: `['result', 'conversation', 'notes']`) |
| `purposes` | `JSON` | Finalità autorizzate (es. `['teaching', 'orientation']`) |
| `valid_from` | `UTCDateTime` | Inizio validità (dalla data di iscrizione dello studente al gruppo) |
| `valid_until` | `UTCDateTime` | Scadenza opzionale (es. fine anno scolastico) |
| `revoked_at` | `UTCDateTime` | Timestamp revoca immediata |
| `revoked_by` | `String(255)` | Chi ha revocato l'autorizzazione |

### Risoluzione Lacuna G5 (Ambito e Taccuino)
- **Taccuino privato**: la categoria `notebook` (e il `learner_profile` dello studente) **non** è inclusa nei grant di default (`institutional_assignment`). Nell'endpoint `/admin/groups/{group_id}/students`, il campo `learner_profile` è mascherato a `None` a meno che non esista un consenso o grant esplicito per la categoria `notebook`.
- **Ambito temporale**: il docente non può consultare risultati o sessioni registrate prima che lo studente entrasse nella classe (`resource_created_at < valid_from`).
- **Ambito di classe**: verificato tramite `is_resource_in_group_scope`: questionari svolti in altre classi o contesti autonomi non sono visibili al docente.
- **Protezione IDOR**: qualsiasi richiesta fuori ambito (docente non autorizzato, altra classe o altro istituto) risponde con HTTP `404 Not Found` (non 403), per non rivelare l'esistenza di risorse altrui.

### Ciclo di vita dei grant
1. **Backfill e Iscrizione**: all'attivazione della migrazione o all'iscrizione di uno studente (`ensure_membership`), vengono generati grant attivi per il proprietario del gruppo e per tutti i co-docenti in `group_shares`.
2. **Condivisione classe**: quando il proprietario aggiunge un co-docente (`POST /admin/groups/{id}/shares`), vengono sincronizzati i grant per tutti gli studenti attualmente iscritti.
3. **Revoca per rimozione condivisione**: alla cancellazione della condivisione (`DELETE /admin/groups/{id}/shares/{share_id}`), tutti i grant del co-docente per quella classe vengono immediatamente revocati (`revoked_at = now`). L'accesso restituisce subito 404.
4. **Revoca per uscita studente**: quando uno studente lascia la classe (`DELETE /user/groups/{membership_id}`), i grant di tutti i docenti per quello studente nella classe vengono immediatamente revocati.

## 3. Amministratore tecnico e Break-Glass su L1

In conformità con [02-progettazione](02-progettazione.md) §5.3 (risoluzione lacuna G6):

### Vista pseudonimizzata
Sul server di produzione L1 (`is_l1() == True`), l'amministratore tecnico non consulta contenuti in chiaro per finalità di configurazione:
- In `GET /admin/questionnaire-results`, `username` è sostituito da un identificativo pseudonimo deterministico (`safe_subject_pid(db, username)`).
- In `GET /admin/logs`, `username` è pseudonimizzato e l'email è azzerata (`None`).

### Procedura di Break-Glass
Per finalità di assistenza tecnica urgente o indagine su malfunzionamenti:
- `POST /privacy/break-glass`:
  - Richiede `subject_username`, `resource_kind` (es. `result`, `log` o `*`), `resource_id` (opzionale o `*`), `reason` (minimo 10 caratteri) e `duration_hours` (tra 0.1 e 24 ore).
  - Registra obbligatoriamente un evento privacy `break_glass` con `actor_pid`, `subject_pid` e target anonimizzato. **Se la registrazione dell'evento fallisce, l'autorizzazione viene negata (fail-closed)**.
  - Finché il break-glass è attivo (`now <= valid_until` e `revoked_at IS NULL`), le rotte di amministrazione restituiscono i dati in chiaro per quello specifico soggetto/risorsa.
- `POST /privacy/break-glass/{id}/revoke`:
  - Consente la revoca anticipata della sessione eccezionale da parte dell'amministratore.
  - Registra l'evento privacy `grant_revoked` (`purpose='break_glass'`).
  - Le viste di log e risultati tornano immediatamente alla visualizzazione pseudonimizzata.

## 4. Test e verifica

La suite dedicata `backend/tests/test_privacy_p7_authz.py` copre:
1. Idempotenza del backfill dei grant su database SQLite/Postgres.
2. Autorizzazione studente sui propri dati.
3. Autorizzazione docente con grant attivo e blocco 404 per docenti non assegnati.
4. Esclusione categoria taccuino/learner profile (G5) e risultati pregressi fuori periodo.
5. Isolamento tra istituti scolastici (`InstitutionTeacher` mismatch ⇒ 404).
6. Mascheramento del learner profile nella lista studenti della classe.
7. Ciclo di vita della condivisione con co-docenti e protezione IDOR.
8. Revoca immediata all'uscita dello studente dal gruppo.
9. Flusso completo di break-glass: validazione motivo, registrazione evento di audit, decifratura/vista in chiaro temporanea, revoca e ripristino pseudonimizzazione.
