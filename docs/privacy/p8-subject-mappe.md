# P8 — Identificativi pseudonimi e mappe cifrate dei segnaposto

Stato: **implementato, non ancora collegato alle chat** (2026-10-24). Progetto in [02-progettazione](02-progettazione.md)
§3.3 e §4.1; usa le chiavi di [P5](p5-crittografia-chiavi.md) e il motore di [P4](p4-pseudonimizzazione.md). Il motore
resta senza store su database finché il gateway AI (P6) non lo collega con una sessione per richiesta. Gli eventi privacy
(`privacy_events`, `record_privacy_event`) della riga P8 di [03-piano-blocchi](03-piano-blocchi.md) restano da fare.

## 1. Moduli

| File | Contenuto |
|---|---|
| `backend/privacy/subject.py` | `subject_pid(ring, username)`, `is_subject_pid`, `blind_index`/`normalize` (da `crypto`), senza ORM all'import |
| `backend/privacy/map_store.py` | `SqlAlchemyMapStore`: il `MapStore` di P4 su `privacy_pseudonym_maps` |
| `backend/privacy/pseudonymization.py` | `ScopeMap.subject_pid`; `PseudonymizationEngine(subject_pid_of=...)` |
| `backend/models.py` | tabella `privacy_pseudonym_maps` |

## 2. `subject_pid` e indici ciechi

- `subject_pid = base32(HMAC-SHA-256(K_pid, username)[:16])`: 128 bit, RFC 4648 base32 **minuscolo** senza padding,
  26 caratteri di `a-z2-7` (niente `0`/`1`/`8`/`9`). P8 ha portato `crypto.subject_pid` al minuscolo (P5 produceva il
  maiuscolo; nessun valore era ancora memorizzato).
- `K_pid` è la radice `pid` a id fisso di `privacy_keys`: deterministico con la stessa KEK, non invertibile senza `K_pid`.
  Lo username si usa così com'è (chiave interna); vuoto o non stringa ⇒ `PolicyBlocked`.
- `blind_index(K_idx, valore) = HMAC-SHA-256(K_idx, NFKC+trim+casefold(valore))`; `K_idx[campo]` via `KeyRing.blind_index`.

## 3. Tabella `privacy_pseudonym_maps`

| Colonna | Tipo | Note |
|---|---|---|
| `id` | intero, PK autoincrementale | parte dell'AAD |
| `scope_id` | `String(255)`, indice | conversazione; unico con `placeholder` |
| `subject_pid` | `String(32)`, indice | interessato a cui appartiene la mappa |
| `placeholder` | `String(64)` | es. `[PERSONA_1]` |
| `original_value_encrypted` | `Text` | `v1.<key_id>.…`, DEK `mapping`, AAD `privacy_pseudonym_maps.original_value_encrypted:<id>:<subject_pid>` |
| `category` | `String(32)` | `person`, `school`, `email`… |
| `locale` | `String(16)` | lingua delle etichette dei nuovi segnaposto dopo un riavvio |
| `mapping_ref` | `String(64)` | riferimento opaco della mappa, stabile fra turni |
| `created_at` | `UTCDateTime` | |

`locale` e `mapping_ref` si aggiungono alle colonne dell'incarico: senza, la mappa riletta dopo un riavvio non saprebbe
in che lingua numerare i segnaposto nuovi né restituire lo stesso `mapping_ref`. Nessuna colonna contiene PII in chiaro.

## 4. Comportamento

- Una riga per segnaposto; le righe si aggiungono soltanto. `get` ricostruisce la `ScopeMap` (chiavi normalizzate dai
  valori decifrati, contatori dal numero più alto per etichetta); `delete` (`engine.forget`) cancella lo scope.
- Lo store entra nella transazione del chiamante come `KeyRing`: `put` fa flush, il chiamante fa commit.
- Una mappa appartiene a un solo interessato: lo scope di un altro `subject_pid`, un contesto senza `subject` o una
  mappa senza `subject_pid` valido ⇒ `PolicyBlocked`. Lotto fallito o senza segnaposto ⇒ nessuna riga.
- Valore spostato su un'altra riga o interessato ⇒ `IntegrityError`; KEK sbagliata ⇒ `KeyUnavailable`.
- Due processi che scrivono lo stesso segnaposto dello stesso scope: il vincolo unico fa fallire il secondo
  (`PrivacyError`, savepoint annullato); il turno va ripetuto.

Collegamento (P6): `store = SqlAlchemyMapStore(db)`, `PseudonymizationEngine(detector, store=store,
subject_pid_of=store.ring.subject_pid)`, con `PrivacyContext.subject` = username del proprietario della conversazione.

## 5. Test

`backend/tests/test_privacy_p8_subject_maps.py` (`TEST_DB=sqlite|postgres`): determinismo e formato di `subject_pid`,
username vuoti, indici ciechi, coerenza fra turni e dopo il riavvio del motore, solo ciphertext `v1.<mapping>.` nel DB,
AAD legata a riga e interessato, KEK sbagliata, isolamento e cancellazione degli scope, scope di un altro interessato,
lotti falliti o vuoti, scrittore concorrente, persistenza dopo commit.
