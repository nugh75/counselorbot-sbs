# P5 — Crittografia a riposo e gestione delle chiavi

Stato: **implementato, nessuna colonna ancora cifrata** (2026-10-24), blocco P5 di [03-piano-blocchi](03-piano-blocchi.md).
Progetto in [02-progettazione](02-progettazione.md) §4 e §9.6. Le colonne cifrate arrivano con P11, le chiavi Fernet
esistenti passano alle DEK con P12, `decrypt_authorized` si collega all'autorizzazione con P7.

## 1. Moduli

| File | Contenuto |
|---|---|
| `backend/privacy/crypto.py` | primitive pure, senza I/O: `seal`/`open_sealed` (AES-256-GCM), `field_aad`, `key_id_of`, `derive_key` (HKDF-SHA-256), `subject_pid`, `blind_index`, `normalize` |
| `backend/privacy/keys.py` | `load_kek` (fornitore di KEK), `KeyRing` (DEK per finalità, rotazione, riavvolgimento della KEK, `encrypt`/`decrypt` di campo, `subject_pid`, `blind_index`), kit di recupero |
| `backend/models.py` | tabella `privacy_keys(key_id, purpose, wrapped_key, created_at, retired_at)` |
| `backend/auth.py` | parametri Argon2id espliciti |

`backend/privacy/__init__.py` non importa `crypto` né `keys`: il nucleo resta senza ORM all'import.

## 2. Formato e AAD

- Valore memorizzato (`Text` portabile su SQLite e PostgreSQL): `v1.<key_id>.<base64url(nonce‖ciphertext‖tag)>`,
  nonce casuale di 12 byte per ogni cifratura (`os.urandom`), tag di 16 byte.
- AAD obbligatoria: `<tabella>.<colonna>:<id riga>:<subject_pid>`. Tabella e colonna solo `[a-z0-9_]`, id riga non
  vuoto, `subject_pid` senza `:`: la stringa non è ambigua. Un valore copiato su un'altra riga, colonna o interessato
  non si decifra.
- Errori (fail-closed, solo codice i18n, nessun contenuto): AAD diversa, valore manomesso, formato o versione errati ⇒
  `IntegrityError`; chiave assente, corta, sconosciuta, con KEK diversa o con involucro corrotto ⇒ `KeyUnavailable`.

## 3. Chiavi

| Chiave | Dove | Uso |
|---|---|---|
| KEK (`K_root`) | solo ambiente: `PRIVACY_KEK` o `PRIVACY_KEK_FILE` (base64url, 32 byte; una sola delle due) | avvolge le chiavi di `privacy_keys`, mai nel DB |
| DEK `content`, `mapping`, `credentials`, `research` | `privacy_keys`, avvolte dalla KEK | cifratura per finalità; una DEK non decifra valori di un'altra finalità (`IntegrityError`) |
| `K_pid` (`purpose='pid'`, id fisso) | `privacy_keys` | `subject_pid = base32(HMAC-SHA-256(K_pid, username)[:16])` minuscolo, 26 caratteri (P8) |
| radice `index` (id fisso) | `privacy_keys` | `K_idx[campo] = HKDF(radice, "idx:<campo>")`; `blind_index = HMAC-SHA-256(K_idx[campo], NFKC+trim+casefold(valore))` |

- **L1**: la KEK sta nell'ambiente del server (o in un file montato come segreto). **L2**: il guscio desktop la legge
  dal portachiavi del sistema (F1-08) e la passa al backend come `PRIVACY_KEK`; P5 non scrive codice del guscio.
- Ogni involucro è legato da AAD a `key_id` e finalità della propria riga: spostarlo su un'altra riga ⇒ `KeyUnavailable`.
  L'id dell'involucro è un'impronta HKDF della KEK, non segreta, che distingue una KEK sbagliata da un involucro corrotto.
- Le chiavi create entrano nella transazione del chiamante (che fa commit insieme ai dati). `pid` e `index` hanno id
  fisso: se due processi le creano insieme vince la prima, l'altro la rilegge (savepoint).
- **Rotazione DEK** (`KeyRing.rotate`): ritira la DEK attiva e ne crea una nuova; i valori vecchi restano leggibili.
  Da fare prima di 2^32 cifrature per chiave. `pid` e `index` non ruotano (cambierebbero tutti gli identificativi).
- **Rotazione KEK** (`KeyRing.rewrap`): riavvolge tutte le chiavi con la nuova KEK; i valori cifrati non cambiano.
- **Kit di recupero** (`export_recovery_kit`/`open_recovery_kit`): KEK sigillata con AES-256-GCM sotto una chiave
  derivata dalla passphrase con Argon2id (m=64 MiB, t=3, p=4, sale di 16 byte), JSON. Passphrase sbagliata o kit
  alterato ⇒ `IntegrityError`. Va creato e verificato prima del primo riempimento di P11 (02 §9.6).

## 4. Password

`passlib` 1.7.4 usava già Argon2id con m=65536 KiB, t=3, p=4 (verificato sull'hash: `$argon2id$v=19$m=65536,t=3,p=4$`):
è la seconda raccomandazione di RFC 9106 e supera il minimo OWASP (m=19 MiB, t=2, p=1). I parametri ora sono espliciti
in `auth.pwd_context`; con `deprecated="auto"` un hash con parametri diversi risulta da aggiornare (`needs_update`).
`pwd_context` serve solo al seed dell'admin locale. Le password di istituto e dei consigli di classe usano bcrypt
(`models.get_password_hash`), fuori da questo blocco.

## 5. Test

`backend/tests/test_privacy_p5_crypto.py`: andata/ritorno e formato, AAD di altra riga/colonna/tabella/interessato,
manomissione di nonce/ciphertext/tag, formati malformati, nonce unici su 10⁵ cifrature, KEK assente/corrotta/doppia,
chiave sconosciuta, KEK sbagliata, involucro corrotto o spostato, separazione delle finalità, rotazione e riavvolgimento,
corsa sulla creazione di `K_pid`, indici ciechi per campo, kit di recupero, parametri Argon2id. I test di DB usano
`artifact_session` e girano con `TEST_DB=sqlite` e `TEST_DB=postgres`.
