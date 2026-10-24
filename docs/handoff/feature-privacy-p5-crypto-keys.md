# Handoff vivo — feature/privacy-p5-crypto-keys

Agente `s51-p5-opus`, task `893b9d78-d1d7-4dc8-87fb-497089510ea2`, issue #556.

## Stato
Implementazione completa, PR aperta su `main`; in attesa di CI (Postgres + SQLite) e merge.

## Fatto
- `backend/privacy/crypto.py`: AES-256-GCM, `v1.<key_id>.<b64>`, AAD per campo, HKDF, `subject_pid`, indici ciechi.
- `backend/privacy/keys.py`: KEK da `PRIVACY_KEK`/`_FILE`, `KeyRing` (DEK per finalità in `privacy_keys`,
  rotazione, rewrap KEK, `pid`/`index` a id fisso), kit di recupero Argon2id.
- `backend/models.py`: tabella `privacy_keys`; `backend/auth.py`: Argon2id m=64 MiB t=3 p=4 espliciti.
- Doc: `docs/privacy/p5-crittografia-chiavi.md`, 02 §4.3, README privacy, funzionalità, `.env.example`.

## Verifiche
- `TEST_DB=sqlite` Py 3.11.9: P5 37 pass; con core/P4/schema/utc/db_compat 256 pass, 3 skip.
- `ruff --select F,E9` pulito, `make guidance-check` verde.
- Postgres locale non eseguito (già due Postgres di test di altri agenti attivi): copre la CI `backend-db.yml`.

## Prossimi passi
- P7 collega `decrypt_authorized`; P11 usa `KeyRing` per le colonne cifrate e crea il kit prima del riempimento.
- P12: Fernet → DEK `credentials`. P8: `subject_pid` via `KeyRing.subject_pid`.

## Blocchi e rischi
- KEK persa senza kit = dati persi. `policy.encrypt_sensitive` resta stub fail-closed finché P11 non lo collega.
