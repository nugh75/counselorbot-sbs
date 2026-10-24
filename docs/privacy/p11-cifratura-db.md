# P11 — cifratura a riposo dei contenuti nel database

Progetto in [02-progettazione](02-progettazione.md) §4.2 e §9; chiavi in [p5-crittografia-chiavi](p5-crittografia-chiavi.md).
Codice: `backend/privacy/field_crypto.py`, `backend/privacy/encrypted_types.py`.

## 1. Interruttore

`PRIVACY_DB_ENCRYPTION=on` (default spento, 02 §9.4) fa scrivere cifrati i contenuti sotto elencati; serve la KEK
(`PRIVACY_KEK`/`PRIVACY_KEK_FILE`). **La lettura decifra sempre**: un valore che non è un token
`v1.<key_id>.<base64url(nonce‖ciphertext‖tag)>` è restituito così com'è, quindi i record precedenti restano
leggibili e si può tornare a scrivere in chiaro rimettendo l'interruttore a spento. Un token che non si apre (chiave
mancante, valore alterato o copiato su un altro campo) solleva `PrivacyError`, senza contenuto nel messaggio.

All'avvio, con l'interruttore acceso, il lifespan crea le chiavi `content` e `index` fuori da transazioni di
scrittura (su SQLite una creazione tardiva sotto un lock di scrittura andrebbe in timeout).

## 2. Cosa è cifrato

| Dato | Colonna / file | Come |
|---|---|---|
| Note del docente | `teacher_notes.text` | `EncryptedText` |
| Riferimento Idea | `idea_references.text` | `EncryptedText` |
| Riflessioni del profilo dello studente | `learner_profile_reflections.note` | `EncryptedText` |
| Contenuto delle chat nei log | chiavi `user_input`, `effective_user_input`, `bot_response`, `reasoning`, `scores_context`, `envelope` di `logs.details` | `EncryptedLogDetails` (JSON invariato, valori cifrati come testo JSON) |
| Email nei log | `logs.email` | `EncryptedText` + `logs.email_idx` (indice cieco) |
| Memoria di sessione | `session_memory/<id>.md` | file intero, un solo token |

Le altre chiavi di `logs.details` restano in chiaro di proposito: molte query filtrano per percorso JSON
(`credential_source`, `item_id`, `conversation_id`, …). Il tipo non cambia lo schema: colonne `Text`/`JSON`.

## 3. Formato e AAD

DEK `content` (AES-256-GCM, `KeyRing`). AAD `<tabella>.<colonna>:*:` per le colonne (un tipo SQLAlchemy non vede la
riga, quindi non c'è id riga né `subject_pid`: un valore copiato su un'altra colonna non si apre, uno copiato su un'altra
riga della stessa colonna sì); `logs.details` usa la colonna `details_<chiave>`; i file usano `session_memory.file:<id sessione>`.
L'AAD legato alla riga e all'interessato arriva con il percorso `decrypt_authorized` (P7).

## 4. Indice cieco di `logs.email`

Con l'interruttore acceso, un listener `before_insert`/`before_update` di `models.Log` calcola
`email_idx = HMAC-SHA-256(K_idx["logs.email"], normalizza(email))` (base64url). La ricerca è
`Log.email_idx == field_crypto.blind_index("logs.email", valore)`; la colonna `email` non si interroga più.
Migrazione `20261024_log_email_blind_index` (Postgres; SQLite la ottiene da `create_all`): solo aggiunta, nullable.

## 5. Limiti e passi successivi

- **Nessun riempimento dei record esistenti**: restano in chiaro finché non vengono riscritti. Il job a lotti
  idempotente con kit di recupero verificato (02 §9.3 e §9.6) e lo svuotamento in una release successiva sono ancora da fare.
- **`email_idx` solo per le righe scritte con l'interruttore acceso.**
- Le chiavi sono in cache per processo: dopo `KeyRing.rotate("content")` serve `field_crypto.reset()` (riavvio); i valori
  vecchi restano leggibili perché la chiave ritirata resta nel `KeyRing`.
- Non coperti: le cache degli embedding della memoria (solo vettori), `OrientationSession.notebook_draft`, `PortfolioItem`,
  `StudentBooklet` e le altre colonne di testo libero; vanno aggiunti con lo stesso tipo dopo aver controllato le query.
- Un testo in chiaro che per caso ha la forma `v1.<id>.<base64url>` (senza spazi) verrebbe letto come token.

## 6. Test

`TEST_DB=sqlite|postgres pytest backend/tests/test_privacy_p11_db_encryption.py`: dato grezzo `v1.content-…` e mai il
testo, lettura ORM in chiaro, record in chiaro ancora leggibili, interruttore spento, chiavi `details` in chiaro filtrabili,
indice cieco, file di memoria cifrato e non spostabile, chiave sbagliata ⇒ errore.
