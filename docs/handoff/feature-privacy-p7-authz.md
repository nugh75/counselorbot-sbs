# Handoff vivo — feature/privacy-p7-authz

Agente `s69-p7-authz` (Gemini 3.8 Flash High, tier T2), task `a9704847-5a92-4431-a4d7-c4a0151813b2`.
Branch: `feature/privacy-p7-authz` su worktree `/Volumes/sviluppo/progetti/Counselorbot-worktrees/feature-privacy-p7-authz`.

## Stato
**Completato**. Pronto per PR e revisione.

## Fatto
1. **Modelli SQLAlchemy (`backend/models.py`)**:
   - Aggiunte classi solo in coda senza toccare colonne esistenti:
     - `TeacherStudentGrant` (`teacher_student_grants`) con basi ammesse (`institutional_assignment`, `organizational_authorization`, `consent`, `student_share`).
     - `PrivacyBreakGlass` (`privacy_break_glass`) con motivo, durata, validità temporale e revoca.
     - `PrivacyEventRecord` (`privacy_events`) per audit log fail-closed degli eventi privacy (nessun dato in chiaro, solo PIDs e metadati minimi).
2. **Migrazione portabile (`backend/migrations/20261025_teacher_student_grants.py`)**:
   - DDL compatibile PostgreSQL con advisory lock `2026102501` e indici; compatibile SQLite via `create_all`.
   - `backfill_grants`: riempimento idempotente dei grant per proprietari e co-docenti da `group_memberships` con validità dall'iscrizione dello studente e categorie `['result', 'conversation', 'notes']`.
   - Registrazione della migrazione in `backend/main.py`.
3. **Motore di autorizzazione (`backend/privacy/authz.py`)**:
   - `authorize_data_access`: implementazione completa della matrice §5.2 per studente (self-access), admin (vista pseudonimizzata o break-glass su L1; locale su dev/desktop), e docente (richiede grant attivo, ambito per classe, periodo e categoria).
   - `check_teacher_student_access`: helper centralizzato che valida l'accesso ed emette 404 (non 403) per prevenire information leakage/IDOR.
   - Sincronizzazione dinamica e revoca immediata dei grant su modifiche a `GroupMembership` e `GroupShare`.
   - Isolamento tra istituti scolastici con verifica su `InstitutionTeacher`.
4. **Audit eventi privacy (`backend/privacy/events.py`)**:
   - `record_privacy_event` fail-closed: registra audit event garantendo assenza di PII e username in chiaro.
5. **Endpoint di Break-Glass (`backend/routes/privacy.py`)**:
   - `POST /privacy/break-glass`: creazione autorizzazione straordinaria con motivo (>= 10 caratteri), durata (<= 24h) e registrazione fail-closed dell'evento privacy `break_glass`.
   - `POST /privacy/break-glass/{id}/revoke`: revoca anticipata immediata con evento `grant_revoked`.
6. **Aggiornamento rotte e risoluzione lacune G5 e G6**:
   - `backend/routes/groups.py`:
     - Risoluzione G5: `get_group_students` maschera `learner_profile` / taccuino a `None` salvo consenso esplicito; filtra i risultati ad esclusivo ambito della classe.
     - Protezione IDOR e isolamento istituto in `_require_student_result`, `get_group_student_conversation`, `get_class_noticing`, `generate_class_noticing`, `list_teacher_notes`, `create_group_share`, `delete_group_share`, `leave_group`.
   - `backend/routes/admin.py`: pseudonimizzazione di username ed email su `/admin/logs` e rotte derivate su L1 salvo break-glass attivo.
   - `backend/routes/survey.py`: pseudonimizzazione di username su `/admin/questionnaire-results` su L1 salvo break-glass attivo.
7. **Documentazione**:
   - Creata `docs/privacy/p7-autorizzazioni.md`.
   - Aggiornato `HANDOFF.md`.

## Verifiche e Test
- **Test P7 (`backend/tests/test_privacy_p7_authz.py`)**: 8 passed su 8, 0 fallimenti:
  - Idempotenza backfill grant.
  - Accesso studente ai propri dati.
  - Verifica grant docente attivo, scaduto, revocato e fuori periodo (404).
  - Isolamento istituti (404 per docenti di altro istituto).
  - Mascheramento taccuino studente in elenco classe (G5).
  - Condivisione co-docente e revoca immediata.
  - Revoca immediata all'uscita dello studente dal gruppo.
  - Flusso completo di break-glass (richiesta, evento di audit, decifratura temporanea, revoca e ripristino pseudonimizzazione).
- **Test esistenti correlati**:
  - `test_teacher_class_compilations.py`, `test_teacher_result_detail.py`, `test_teacher_noticing.py`: 35 passed, 0 fallimenti.
  - `test_privacy_core.py`, `test_sqlite_create_all.py`: 171 passed, 0 fallimenti.
  - `test_privacy_p8_subject_maps.py`: 23 passed, 0 fallimenti.
- Nessuna nuova regressione introdotta rispetto alla baseline.

## Bug non registrati
Nessuno.

## Prossimi passi
1. `make guidance-refresh` e `make guidance-check`.
2. Commit atomici convenzionali.
3. Push branch `feature/privacy-p7-authz` e apertura Pull Request su GitHub collegata al progetto e all'issue.
4. Notifica journal ed esecuzione auto-chiusura task.
