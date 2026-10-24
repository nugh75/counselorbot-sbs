# Privacy Layer — Fase 2: progettazione

Stato: **proposta da validare** (2026-10-24). Si basa sull'analisi [01](01-analisi.md) (sigle L1–L4, lacune G1–G13).
Nessuna di queste misure, da sola, rende il trattamento conforme: le scelte giuridiche sono in [04](04-decisioni-titolare-dpo.md).

Principi di progetto, dal brief e dal codice:

1. **Un solo Privacy Layer, nel backend Python.** L1, L2 e (in Fase 2, opzione A del piano desktop) L3 eseguono lo
   stesso backend: un pacchetto `backend/privacy/` serve tutti e tre senza nuovi servizi né linguaggi.
2. **Riuso**: `pii.py` (regex con checksum), `pii_ner.py` (interfaccia NER), `credential_storage.py` (gestione file di
   chiave), `request_origin.py` (fail-closed), il portachiavi di F1-08, il backup di F1-05j.
3. **Fail-closed** su ogni incertezza: filtro non disponibile, autorizzazione non determinabile, chiave assente,
   base giuridica non configurata ⇒ nessuna uscita, errore visibile.
4. **Compatibilità Postgres/SQLite** per ogni tabella nuova (ADR-0003 §6).

---

## 1. Confini di fiducia

```
 Studente (browser, Fase 1)          Studente (app L3, Fase 2)
        │ HTTPS                             │ backend locale + Privacy Layer locale
        ▼                                   │ SQLite cifrato, chiave nel portachiavi
 ┌──────────────┐  TB1 Cloudflare edge      │ sync a eventi (minimizzati, TLS)
 │ Cloudflare    │  (termina TLS: vede il    ▼
 │ tunnel        │   contenuto in chiaro)  ┌──────────────────────────────────────────┐
 └──────┬───────┘                          │ L2 PC docente / L1 server                 │
        ▼ TB2 L4 Next (firma origine)      │  L4 Next ─► backend ─► Privacy Layer      │
                                            │                 │        │              │
                                            │   TB3 DB/file   ▼        ▼ TB4 Gateway AI │
                                            │   (cifratura    DB     (unico punto di    │
                                            │    a riposo)           uscita, fail-closed)│
                                            └───────────────────────────────┬──────────┘
                                                                            ▼ TB5
                                     provider esterni (OpenAI, Anthropic, …, Edge TTS, Telegram)
                                     modelli locali (Ollama/llamacpp **su host di fiducia**)
```

| Confine | Chi è dentro | Regola |
|---|---|---|
| TB1 Cloudflare | Cloudflare (sub-responsabile, vede il traffico in chiaro) | nessun dato oltre a quello che il browser invia; da indicare in informativa (04-D7) |
| TB2 L4 → backend | frontend Next | identità e origine solo con segreti condivisi (già così); nessuna logica di autorizzazione nel frontend |
| TB3 persistenza | backend | contenuti personali cifrati campo per campo (§4); amministratore tecnico senza chiavi di lettura (§5.3) |
| TB4 gateway | backend | ogni byte verso modelli o servizi esterni passa da `AIGateway` (§6) |
| TB5 «locale» | host in elenco esplicito | locale = host su loopback o in `privacy_local_hosts`, **non** il nome del provider (corregge G3) |

**Limite dichiarato di Fase 1**: lo studente usa il browser, quindi il rilevamento PII avviene su L2 (PC del docente) o
L1, non sul dispositivo dello studente. Il requisito «PII offline sul dispositivo» è pienamente soddisfatto solo con L3.

## 2. Terminologia (usata in tutto il codice)

| Termine | Significato qui | Reversibile | Esempio |
|---|---|---|---|
| **Mascheramento** | sostituzione distruttiva per log e diagnostica | no | `pii.redact` → `[EMAIL]` |
| **Pseudonimizzazione** | sostituzione con segnaposto e mappa separata e protetta | sì, solo con autorizzazione | `Giulia Rossi` → `[PERSONA_1]` |
| **Generalizzazione** | sostituzione con una categoria più ampia, utile al compito | no | `liceo Volta di Roma` → `un liceo scientifico di una grande città` |
| **Cifratura** | protezione a riposo di un valore recuperabile | sì, con la chiave | AES-256-GCM |
| **Anonimizzazione** | non obiettivo del sistema: nessun componente la dichiara | — | — |

I dati pseudonimizzati restano dati personali (GDPR art. 4(5); EDPB Guidelines 01/2025, vedi 04 §Fonti).

## 3. Contratti del Privacy Layer

Pacchetto `backend/privacy/`, Python tipizzato. Nomi Python (`snake_case`) per le operazioni concettuali del brief.

### 3.1 Tipi comuni (`backend/privacy/types.py`)

```python
Category = Literal["person", "email", "phone", "address", "city", "region", "school", "organization",
                   "fiscal_code", "iban", "id_document", "student_id", "birth_date", "date", "url", "ip",
                   "social", "health", "art9_other", "combination"]
Action = Literal["replace", "generalize", "keep", "block"]

@dataclass(frozen=True)
class Principal:                 # chi chiede
    username: str; role: Literal["student", "teacher", "researcher", "admin", "system"]
    auth_provider: str; origin: Literal["local", "tunnel"]; session_id: str | None

@dataclass(frozen=True)
class PrivacyContext:            # perché e per chi
    principal: Principal
    subject: str | None          # username dell'interessato (None = contenuto non personale)
    purpose: str                 # chiave di `privacy_purposes` (§7), es. "guided_chat", "teacher_noticing"
    scope_id: str                # ambito dei segnaposto: id conversazione (mai globale)
    locale: str

@dataclass(frozen=True)
class Span:
    start: int; end: int; category: Category; text_hash: str   # mai il testo nei log
    detector: Literal["rules", "gazetteer", "ml"]; score: float
```

### 3.2 Operazioni

| Operazione | Firma | Errori | Note |
|---|---|---|---|
| `detect_pii` | `(text: str, ctx: PrivacyContext) -> list[Span]` | `DetectorUnavailable` | regole + elenco nomi noti + modello ML (§3.4); unione degli span, vince il più lungo |
| `pseudonymize` | `(texts: Sequence[str], ctx, policy: CategoryPolicy) -> PseudonymizedBatch` | `DetectorUnavailable`, `PolicyBlocked(category)`, `ResidualPII` | applica azioni per categoria, poi **verifica residui** (secondo passaggio di rilevamento sul risultato) |
| `restore_authorized` | `(text: str, ctx) -> str` | `AccessDenied` | ripristina solo se `ctx.principal` può vedere `ctx.subject` in chiaro (studente stesso, docente autorizzato) |
| `encrypt_sensitive` | `(value: bytes, field: FieldRef) -> SealedValue` | `KeyUnavailable` | AES-256-GCM, AAD = `FieldRef` (§4.2) |
| `decrypt_authorized` | `(sealed: SealedValue, field: FieldRef, ctx) -> bytes` | `AccessDenied`, `KeyUnavailable`, `IntegrityError` | chiama `authorize_data_access` prima della chiave |
| `authorize_data_access` | `(principal, action: DataAction, resource: ResourceRef, purpose: str) -> Decision` | — (ritorna `Decision(allowed, reason_code, grant_id)`) | unico decisore (§5); usato da rotte e da `decrypt_authorized` |
| `record_privacy_event` | `(event: PrivacyEvent) -> None` | `AuditUnavailable` (fail-closed per eventi obbligatori) | §7.3; nessun contenuto, solo riferimenti pseudonimi |

`PseudonymizedBatch`: `texts: list[str]`, `mapping_ref: str` (id della mappa cifrata), `report: dict[Category, int]`
(conteggi, mai valori). La mappa **non** esce mai dal backend e non entra nei log.

Gerarchia errori (`backend/privacy/errors.py`): `PrivacyError` ← `DetectorUnavailable`, `PolicyBlocked`, `ResidualPII`,
`AccessDenied`, `KeyUnavailable`, `IntegrityError`, `AuditUnavailable`, `PurposeDisabled`. Ognuno ha un `code` i18n
(`privacy.errors.*`) come oggi `AIError(code=...)` (`backend/ai_service.py:57-62`). Le rotte li traducono in 403/409/503
senza testo dell'utente nel corpo.

### 3.3 Segnaposto e mappe

- Formato verso il modello: `[PERSONA_1]`, `[SCUOLA_1]`, `[CITTÀ_1]` (etichette localizzate per lingua della sessione),
  più leggibili per il modello di `[[PII:NOME:1]]` attuale. Se il testo dell'utente contiene già una stringa con forma di
  segnaposto, viene neutralizzata prima (evita collisioni e iniezioni nel ripristino).
- **Coerenza**: la numerazione vive in una mappa per `scope_id` (conversazione), persistita in `privacy_pseudonym_maps`
  cifrata (§4). Stesso valore ⇒ stesso segnaposto per tutta la conversazione (corregge G11).
- **Non collegabilità**: contatori per conversazione, nessun hash del valore nel segnaposto ⇒ `[PERSONA_1]` di due
  studenti non è correlabile.
- Ripristino in streaming: si riusa `pii_ner.StreamRestorer` (`backend/pii_ner.py:207`).
- Conservazione della mappa = conservazione della conversazione (04-D5); cancellata con essa.

### 3.4 Motore PII locale: scelta

| Opzione | Licenza (verifica) | Dimensione | Piattaforme | Pro | Contro |
|---|---|---|---|---|---|
| **Regole** (`pii.py` esistente) | progetto (AGPL-3.0) | trascurabile | tutte | deterministico, checksum su CF/IBAN/P.IVA/carte, già in produzione | non trova nomi, scuole, luoghi |
| **Elenco nomi noti** (gazetteer: pseudonimi e nomi della classe, docenti, `institutions.name`) | — | trascurabile | tutte | richiamo altissimo sulle persone del contesto scolastico, offline | solo nomi già noti al sistema |
| **GLiNER multi PII** ONNX (`urchade/gliner_multi_pii-v1`, Apache-2.0 sulla scheda del modello; export `onnx-community/gliner_multi_pii-v1` int8 ~349 MB, licenza dell'export **non confermata**; alternativa `knowledgator/gliner-pii-base-v1.0`, Apache-2.0, ONNX uint8 197 MB, lingue non elencate) | da confermare anche per il modello di base `gliner_multi-v2.1` | 200–350 MB | onnxruntime (MIT) ha ruote per macOS arm64/x64, Windows x64, Linux x64 — **da verificare con PyInstaller** | NER a etichette libere, offline, multilingue (italiano dichiarato da fonti secondarie) | peso nell'installer, recall italiana da misurare, tokenizer da includere |
| **Presidio** (`data-privacy-stack/presidio`, MIT) | MIT | analyzer piccolo; con spaCy `it_core_news_lg` ~centinaia di MB | Python ovunque | riconoscitori IT pronti (`IT_FISCAL_CODE`, `IT_VAT_CODE`, `IT_IDENTITY_CARD`, `IT_PASSPORT`, `IT_DRIVER_LICENSE`) | duplica `pii.py`; NER spaCy generico; un framework in più |
| **NER generativo via Ollama** (attuale `pii_ner.py`) | dipende dal modello (`qwen3:0.6b`) | Ollama + modello | richiede Ollama installato | già integrato | non disponibile su PC studente senza Ollama; un LLM può omettere entità senza segnalarlo |

**Raccomandazione (conservativa)**: tre strati sempre attivi — **regole** (`pii.py`, esteso con i riconoscitori IT
mancanti ispirandosi a Presidio, senza adottarlo come dipendenza) + **gazetteer** + **GLiNER ONNX** in-process via
`onnxruntime`. Il NER via Ollama resta come ripiego configurabile, non come difesa principale. La scelta finale fra i due
modelli GLiNER (o il mantenimento di Ollama) **dipende dalla misura** sul corpus sintetico (blocco P3): soglia proposta di
accettazione recall ≥ 0,95 su `person` e `school`, nessuna regressione sulle categorie a regole. Se GLiNER non supera la
soglia o non si impacchetta sui 4 runner, si resta su regole + gazetteer + Ollama e lo si dichiara come rischio residuo.

### 3.5 Politiche per categoria (configurabili, default proposti)

| Categoria | Verso modello esterno | Verso modello locale | Nei log |
|---|---|---|---|
| person, email, phone, address, fiscal_code, iban, id_document, student_id, ip, social | replace | keep | mask |
| birth_date | generalize (età in anni) | keep | mask |
| city, region | generalize (es. «una città del Centro Italia») se l'orientamento ne ha bisogno, altrimenti replace | keep | mask |
| school, organization | generalize (tipo di scuola, indirizzo di studi) | keep | mask |
| health, art9_other | **block** (errore e invito a riformulare) — da validare (04-D4) | keep | mask |
| combination (≥3 quasi-identificatori nello stesso testo) | replace del più specifico + avviso | keep | mask |

La politica è dati (tabella `privacy_category_policies`), non codice; il default è quello più restrittivo.

## 4. Pseudonimi, HMAC, cifratura, password

### 4.1 Identificativi

- Interessati: si mantiene `username` come chiave interna (cambiarla tocca 100+ tabelle). Verso log, eventi e ricerca si
  usa un **ID pseudonimo** `subject_pid = HMAC-SHA-256(K_pid, username)` troncato a 128 bit, base32. Rigenerabile solo con `K_pid`.
- Ricerca deterministica di valori cifrati (es. email): **indice cieco** `HMAC-SHA-256(K_idx[campo], normalizza(valore))`.
- Codici di ricerca (`anonymous_research_codes`): la tabella di corrispondenza va cifrata o sostituita da HMAC con chiave
  della finalità ricerca, tenuta separata (04-D3).

### 4.2 Cifratura dei campi

- Algoritmo: **AES-256-GCM** (`cryptography.hazmat.primitives.ciphers.aead.AESGCM`), nonce casuale 96 bit per cifratura
  (limite pratico: rotazione della DEK prima di 2^32 cifrature per chiave).
- Formato memorizzato (`Text` portabile): `v1.<key_id>.<base64url(nonce‖ciphertext‖tag)>`.
- AAD: `"<tabella>.<colonna>:<id riga>:<subject_pid>"` ⇒ un valore copiato su un'altra riga non si decifra.
- Gerarchia: **KEK** (chiave radice) protegge le **DEK** per finalità (`content`, `mapping`, `credentials`, `research`);
  le DEK cifrate stanno in `privacy_keys(key_id, purpose, wrapped_key, created_at, retired_at)`.
- Tipo SQLAlchemy `EncryptedText` (TypeDecorator) usato solo dove serve; la decifratura passa da `decrypt_authorized`.
- File (memoria di sessione, upload sensibili): stessa DEK `content`, cifratura in blocco del file.

### 4.3 Password

Argon2id con parametri espliciti (oggi `CryptContext(schemes=["argon2"])`, `backend/auth.py:35`: tipo e parametri effettivi
**da verificare** nel blocco P5) e rehash al login se i parametri cambiano (`deprecated="auto"` lo consente già).

### 4.4 Chiavi separate

| Chiave | Uso | Mai insieme a |
|---|---|---|
| `K_root` (KEK) | cifra le DEK | il database |
| `K_pid` | ID pseudonimi | `K_idx`, DEK |
| `K_idx[campo]` | indici ciechi | DEK |
| DEK `content`, `mapping`, `credentials`, `research` | cifratura per finalità | fra loro |

## 5. Autorizzazioni

### 5.1 Modello

`authorize_data_access` decide su **ruolo + relazione + attributi**:

```
DataAction  = read_clear | read_pseudonymized | export | send_to_ai | modify | delete
ResourceRef = (kind: result|conversation|notebook|portfolio|note|map|reference, subject, owner_group?, created_at)
```

Nuova tabella **`teacher_student_grants`** (sostituisce l'inferenza «membro della classe ⇒ tutto visibile»):

| Colonna | Significato |
|---|---|
| `id`, `teacher_username`, `student_username`, `group_id` | relazione |
| `basis` | `institutional_assignment` \| `organizational_authorization` \| `consent` \| `student_share` (enumerazione chiusa; nessuna «liberatoria» generica) |
| `categories` JSON | tipi di risorsa ammessi (default proposto: risultati e trascrizioni **prodotti dentro la classe**) |
| `purposes` JSON | es. `teaching`, `orientation` |
| `valid_from`, `valid_until`, `revoked_at`, `revoked_by` | durata e revoca |
| `consent_event_id` | riferimento all'evento (§7) quando la base è il consenso |

Regola di ambito che corregge G5: una risorsa è visibile al docente solo se `created_at` cade nel periodo di un grant attivo
**e** la risorsa è collegata alla classe (piano di somministrazione, percorso, compito della classe) oppure lo studente
l'ha condivisa esplicitamente. Le rotte `routes/groups.py:731-854` passano da `authorize_data_access`; la decisione è
sempre lato backend e torna 404 (non 403) per risorse fuori ambito, per non rivelarne l'esistenza.

**Vedere ≠ inviare all'AI**: `send_to_ai` è un'azione distinta; il docente che chiede un'analisi (osservazioni di classe,
sintesi) passa dal gateway con `purpose="teacher_noticing"` e i dati pseudonimizzati anche verso modelli locali se la
politica della finalità lo chiede.

### 5.2 Matrice ruoli (default proposto, da validare 04-D6)

| Risorsa / azione | Studente (sé) | Docente con grant | Docente senza grant | Ricercatore | Admin tecnico | Break-glass |
|---|---|---|---|---|---|---|
| propri dati in chiaro | ✔ | — | — | — | — | — |
| risultati dello studente | ✔ | ✔ (ambito grant) | ✘ | solo pseudonimizzati, finalità ricerca attiva | ✘ | ✔ con motivo, durata, evento |
| conversazioni | ✔ | ✔ se categoria nel grant | ✘ | ✘ salvo protocollo | ✘ | ✔ idem |
| taccuino, portfolio, mappe | ✔ | solo se condivisi | ✘ | ✘ | ✘ | ✔ idem |
| invio all'AI | ✔ (via gateway) | ✔ se `send_to_ai` nel grant | ✘ | ✘ | ✘ | ✘ |
| esporta/cancella | ✔ (diritti) | ✘ | ✘ | ✘ | esegue su richiesta registrata | — |
| configurazione, prompt, provider | ✘ | su L2 ✔ (è admin locale) | — | — | ✔ | — |

### 5.3 Amministratore tecnico e break-glass

- Su L1 l'admin configura ma **non** legge contenuti: le rotte admin che oggi mostrano log e risultati ricevono la vista
  pseudonimizzata (`read_pseudonymized`).
- Break-glass: `POST /privacy/break-glass` con motivo, risorsa, durata massima (es. 24 h), evento obbligatorio; revisione
  successiva da parte del titolare (04-D6). Se l'evento non si registra, l'accesso è negato.
- Su L2 il docente è admin (ADR-0002 §3.3): la separazione admin/contenuti non si applica al suo PC, ma l'accesso ai dati
  degli studenti resta legato ai grant.

## 6. Gateway AI unico

### 6.1 Forma

`backend/privacy/gateway.py`:

```python
class AIGateway:
    def send(self, request: AIRequest, ctx: PrivacyContext) -> AIResponse | Iterator[AIChunk]
@dataclass
class AIRequest:
    kind: Literal["chat", "chat_stream", "summary", "vision", "embedding", "tts", "transcription", "ocr", "notify"]
    target: Target                      # provider + modello + host risolto
    texts: list[str]; images: list[bytes] = (); audio: bytes | None = None
    attachments_context: list[str] = () # RAG, documenti, cronologia: tutti filtrati
```

Passi, nell'ordine (ogni passo fail-closed):

1. `purpose` attiva e con base giuridica configurata (§7.2) — altrimenti `PurposeDisabled`.
2. `authorize_data_access(principal, send_to_ai, subject, purpose)`.
3. Classificazione del target: **locale** se l'host risolto è loopback o in `privacy_local_hosts`; altrimenti esterno.
4. Esterno ⇒ `pseudonymize` su testi, system prompt, cronologia, contesto RAG e documenti; `ResidualPII` blocca.
   Immagini e audio verso un esterno: **bloccati** di default (corregge G1); ammessi solo dopo OCR/trascrizione locale e
   filtro del testo, oppure con politica esplicita della finalità (04-D9).
5. Chiamata al provider con credenziali del backend (mai sul client), TLS verificato, timeout e limiti esistenti.
6. Risposta: `restore_authorized` se il destinatario può vedere i valori; nessun contenuto in log (solo conteggi per categoria).
7. `record_privacy_event("ai_transmission", target, purpose, categories_count)`.

### 6.2 Migrazione dei punti di uscita (01 §5)

| # | Oggi | Domani |
|---|---|---|
| 1-4 | `AIService._attempt_input` → `_anonymize_external` | `AIService` resta la facciata dei provider; `_anonymize_external` diventa una chiamata al gateway |
| 5 | `vision_service.call` | `kind="vision"`, immagini bloccate verso esterni |
| 6-7 | `qsa_extractor._ollama_post`, `pqbl_generator._local_ollama_ocr` | `kind="ocr"`, controllo «locale» per host |
| 8 | `pii_ner` → Ollama | interno al Privacy Layer; host obbligatoriamente locale |
| 9 | `embedding_service` | `kind="embedding"`, politica attuale mantenuta |
| 11 | `voice_reader` → Edge TTS | `kind="tts"`: Piper locale preferito; Edge solo su testo pseudonimizzato o con scelta del titolare (04-D9) |
| 15 | `telegram_bot` | `kind="notify"`, solo contenuti minimi |

**Nessun bypass**: test statico in CI (`backend/tests/test_ai_egress_guard.py`) che fallisce se `OpenAI(`, `anthropic.Anthropic(`,
`genai.Client(`, `Mistral(`, `edge_tts.Communicate(`, `httpx`/`requests` verso `/api/chat|/api/generate|/api/embed` compaiono
fuori da un elenco chiuso di moduli del gateway. Test E2E con trasporto HTTP che nega tutto tranne un provider finto e
verifica che nel corpo non compaiano valori del corpus sintetico.

`external_pii_redact=false` (G12) viene rimosso come opzione di produzione; resta solo per test con provider finto.

## 7. Informative, consensi, finalità

### 7.1 Tabelle (tutte append-only salvo `privacy_purposes`)

| Tabella | Colonne principali |
|---|---|
| `privacy_documents` | `id`, `kind` (`notice_student`, `notice_teacher`, `notice_ai`, `terms`, `consent_sharing`, `consent_research`), `version` (semver), `locale`, `content_hash` (SHA-256), `body_ref`, `published_at`, `requires_new_consent` (bool, deciso dal titolare) |
| `privacy_purposes` | `key`, `description_i18n`, `legal_basis` (**`undefined`** finché il titolare non la imposta), `requires_consent`, `active`, `retention_policy_key` |
| `privacy_events` | `id` (UUIDv7), `subject_pid`, `actor_pid`, `actor_role`, `event_type` (`notice_viewed`, `consent_given`, `consent_refused`, `consent_withdrawn`, `grant_created`, `grant_revoked`, `data_accessed`, `ai_transmission`, `break_glass`, `export`, `erasure`), `document_kind`, `document_version`, `purpose`, `choice`, `valid_until`, `created_at`, `device_ref` |

Lo stato corrente del consenso si deriva dall'ultimo evento per (`subject_pid`, `purpose`). Nessun testo libero, nessun nome.

### 7.2 Regole

- **Presa visione ≠ consenso**: `notice_viewed` non abilita nulla da solo.
- Una finalità con `legal_basis = undefined` è **disattivata**: le funzioni che ne dipendono rispondono `PurposeDisabled`.
- Consenso solo per finalità con `requires_consent`; caselle mai preselezionate; un rifiuto disattiva solo quella finalità.
- Nuova versione di un documento: nuovo consenso solo se `requires_new_consent` (decisione del titolare), altrimenti solo nuova presa visione.
- I consensi attuali lato client (01 §10) diventano eventi registrati.

### 7.3 UI

Sezione «Privacy» al primo avvio e nelle impostazioni, per studente (L3 e browser) e docente (L2): informativa, condizioni,
informativa AI, finalità con interruttori separati, condivisioni attive con il docente (con revoca), cronologia delle proprie
scelte. Testi localizzati e in versione per minori (04-D8). Nessun testo giuridico è scritto dagli agenti come definitivo.

## 8. Threat model sintetico

| Minaccia | Livello | Contromisura progettata | Residuo |
|---|---|---|---|
| Furto credenziali docente | L1/L2 | sessioni revocabili (ADR-0002), sessione docente rifiutata dal tunnel, audit accessi | PC del docente compromesso |
| Accesso trasversale fra studenti/classi/istituti (IDOR) | L1/L2 | `authorize_data_access` unico, 404 fuori ambito, test di isolamento | rotte nuove non migrate: guardia di test |
| Escalation via marcatori di gruppo (`staff`) | L1 | ruoli da elenco esplicito per installazione (04-D6) | dipende da ai4auth |
| Estrazione chiavi dal client | L2/L3 | KEK nel portachiavi del sistema, mai su disco in chiaro, DEK in memoria | malware con i privilegi dell'utente |
| Compromissione DB o backup | L1/L2 | cifratura per campo, backup cifrati con chiave separata | metadati (date, conteggi) in chiaro |
| Fuga via log/telemetria/errori | tutti | eventi senza contenuto, mascheramento fail-closed, `error_type` soltanto | log di terze parti (Cloudflare) |
| Esfiltrazione via prompt o tool | gateway | pseudonimizzazione, residui, `send_to_ai` autorizzato | testo identificante non rilevato (falsi negativi) |
| Prompt injection in documenti/RAG | gateway | contesto dichiarato non fidato (già per `IdeaReference`), segnaposto neutralizzati, nessun tool con effetti in teacher-pc | modelli che seguono istruzioni iniettate |
| Provider che conserva o addestra | TB5 | minimizzazione + condizioni contrattuali (04-D10) | dipende dal contratto |
| Cloudflare vede il traffico | TB1 | informativa, tunnel nominativo, nessun dato oltre il necessario | strutturale |
| Perdita del dispositivo | L2/L3 | cifratura disco consigliata + DB cifrato (L3) + revoca sessioni | L2 senza cifratura del disco |
| Aggiornamento o modello PII manomesso | L2/L3 | updater firmato (F1-16), hash del modello ONNX fissato e verificato all'avvio | chiave dell'updater |
| Detector che fallisce in silenzio | gateway | `DetectorUnavailable` ⇒ blocco; verifica residui; metriche di recall in CI | falsi negativi del modello |

Riferimento metodologico: OWASP ASVS / OWASP Top 10 for LLM Applications (**non verificati** in questa sessione su fonte ufficiale).

## 9. Migrazione reversibile

1. **Solo aggiunte**: nuove tabelle e colonne nullable; nessuna colonna rimossa nella stessa release (ADR-0003 §6).
2. **Backup verificato prima** di ogni passo di dati: Postgres `pg_dump` (L1, procedura da documentare), SQLite con API di
   backup e `integrity_check` (F1-05j); un passo non parte se il backup non è leggibile.
3. **Doppia scrittura → riempimento → doppia lettura**: la colonna cifrata nasce accanto a quella in chiaro; un job
   idempotente e ripartibile la riempie a lotti; la lettura preferisce la cifrata e confronta in modalità verifica.
4. **Interruttore** per ogni passo (`privacy_migration_state` in `configs`), con ritorno alla lettura in chiaro.
5. **Svuotamento** della colonna in chiaro solo in una release successiva, dopo N giorni (04-D5) e con backup conservato
   secondo politica; poi rimozione in una terza release.
6. Chiavi: export della KEK in un **kit di recupero** protetto da passphrase (Argon2id + AES-256-GCM), creato prima del primo
   riempimento; senza kit verificato il job non parte (una chiave persa = dati persi).
7. Fernet esistente: le tre istanze passano a DEK separate leggendo con la chiave vecchia e riscrivendo con la nuova
   (stesso schema), mantenendo la vecchia in sola lettura fino a riscrittura completa.
