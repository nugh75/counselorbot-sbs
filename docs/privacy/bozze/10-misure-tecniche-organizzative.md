# Misure tecniche e organizzative (art. 32) — CounselorBot

> [!CAUTION]
> **Bozza tecnica, non consulenza legale.** Questa descrizione è stata preparata dal progetto CounselorBot per aiutare
> la scuola o l'università a documentare le misure di sicurezza (art. 32 GDPR). **Non** è un parere legale e **non**
> attesta la conformità al GDPR: le misure tecniche da sole non la garantiscono. Valutare l'adeguatezza e adottare le
> misure spetta al **Titolare** con il **DPO**. Le voci **[DA VALIDARE]** e **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**
> vanno decise prima di usare il documento. I riferimenti normativi non sono stati verificati sul testo ufficiale
> ([04 §Fonti](../04-decisioni-titolare-dpo.md#fonti-normative-e-stato-della-verifica)).

Versione: bozza 0.1 (2026-10-24). Ogni misura indica lo stato sul codice di `main`: **attiva** (in uso), **pronta**
(implementata ma non collegata ai flussi), **progettata** (blocco da fare), **organizzativa** (dipende da persone e procedure).

---

## 1. Misure tecniche

### 1.1 Accesso e autenticazione

| Misura | Stato | Riferimento |
|---|---|---|
| Password con Argon2id (m=64 MiB, t=3, p=4), rehash automatico | attiva | `backend/auth.py`, [P5](../p5-crittografia-chiavi.md) §4 |
| L1: identità da ai4auth con segreto condiviso confrontato a tempo costante | attiva | `backend/auth.py:84-89` |
| L2: sessioni locali con token salvati come hash SHA-256, link monouso per il docente, codici personali per gli studenti | attiva | ADR-0002 §3-§4 |
| Origine della richiesta (`tunnel`/`local`) firmata dal frontend, fail-closed | attiva | `backend/request_origin.py` |
| Ruoli da elenco esplicito per installazione (oggi anche per sottostringa del nome del gruppo) | progettata | 02 §8, 04-D6 |

### 1.2 Autorizzazione

| Misura | Stato | Riferimento |
|---|---|---|
| Visibilità delle classi per proprietario e condivisione | attiva | `backend/group_visibility.py` |
| Grant docente-studente per classe e periodo, 404 fuori ambito | progettata (P7) | 02 §5 |
| Vista pseudonimizzata per l'amministratore tecnico, break-glass con evento | progettata (P7) | 02 §5.3 |
| Registro delle consultazioni (`privacy_events`) | progettata (P8 eventi) | 02 §7.1 |

### 1.3 Pseudonimizzazione e minimizzazione verso l'AI

| Misura | Stato | Riferimento |
|---|---|---|
| Filtro verso i provider esterni: regole con checksum + NER locale via Ollama | attiva | 01 §7 |
| «Locale» deciso dall'host (loopback o lista fidata), non dal nome del provider | attiva (P6b) | [p6ac](../p6ac-network-egress.md) |
| Immagini mai inviate a provider esterni | attiva (P6a) | idem |
| Edge TTS con testo redatto in modo distruttivo e fail-closed; Piper locale preferito | attiva (P6c) | idem |
| Embedding: contenuti privati mai fuori; OpenRouter con `data_collection: deny`, `zdr: true` | attiva | `backend/embedding_service.py:107` |
| Motore locale regole + gazetteer + GLiNER ONNX, segnaposto coerenti per conversazione | pronta (P4) | [p4](../p4-pseudonimizzazione.md) |
| Mappe dei segnaposto cifrate, `subject_pid` HMAC | pronta (P8) | [p8](../p8-subject-mappe.md) |
| Gateway AI unico fail-closed con verifica dei residui e test anti-bypass | progettata (P6) | 02 §6 |
| Blocco dei dati sulla salute verso esterni | progettata, **[DA VALIDARE 04-D4]** | 02 §3.5 |

### 1.4 Cifratura

| Misura | Stato | Riferimento |
|---|---|---|
| TLS verso i provider; tunnel Cloudflare per L2 (TLS fino all'edge) | attiva | 01 §1 |
| Credenziali dell'utente (chiavi API, token ChatGPT, password d'istituto) cifrate con Fernet | attiva | `backend/credential_storage.py` |
| L2: chiavi API nel portachiavi del sistema operativo | attiva (F1-08) | `docs/operations/desktop-api-keys.md` |
| Motore AES-256-GCM con AAD per campo, KEK/DEK per finalità, rotazione, kit di recupero | pronta (P5), nessuna colonna ancora cifrata | [p5](../p5-crittografia-chiavi.md) |
| Cifratura dei contenuti a riposo (taccuino, conversazioni, note, risultati, memoria di sessione) | progettata (P11) | 02 §4.2 |
| Chiavi Fernet separate per finalità | progettata (P12) | 02 §9 |
| Cifratura del disco su L1 | **[DA VALIDARE: non verificata]** | 01 §3.1 |
| Cifratura del disco su L2 | organizzativa (FileVault/BitLocker/LUKS del docente) | [02 B3](02-informativa-docente.md) |
| Backup cifrati | **non attiva** su L2; **non verificata** su L1 | 01 §3.3 |

### 1.5 Log e diagnostica

| Misura | Stato | Riferimento |
|---|---|---|
| Redazione distruttiva fail-closed (`[ERRORE_REDAZIONE]`), regole + gazetteer, payload JSON annidati | attiva (P13) | [p13](../p13-logs-diagnostica.md) |
| Errori dei provider registrati solo per tipo | attiva | `backend/ai_service.py:969-972` |
| Esportazione diagnostica desktop senza testo libero | attiva (P13) | idem |
| Conservazione dei log conversazionali 90 giorni (configurabile) | attiva | `backend/chat_logic.py:165` |

### 1.6 Disponibilità e resilienza

| Misura | Stato | Riferimento |
|---|---|---|
| L2: backup SQLite con verifica di integrità | attiva (F1-05j) | ADR-0003 |
| L1: procedura di backup Postgres | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** (nessuno script nel repo) | 01 §3.3 |
| Prova periodica di ripristino | **[DA VALIDARE]** | — |
| Kit di recupero delle chiavi e custodia | pronta (P5), custodia **[DA VALIDARE 04-D14]** | 02 §9 |

### 1.7 Sviluppo e verifica

| Misura | Stato |
|---|---|
| Corpus sintetico italiano e soglie di non regressione sul rilevamento PII (nessun dato reale nei test) | attiva (P2) |
| Test su Postgres e SQLite | attiva |
| Aggiornamenti firmati dell'app desktop | progettata (F1-16) |
| Revisione di sicurezza finale e test mirati (IDOR, tunnel, gateway) | progettata (P17) |

## 2. Misure organizzative

Tutte **[DA VALIDARE]** e da completare dal Titolare.

| Misura | Contenuto proposto | Responsabile |
|---|---|---|
| Designazione e istruzioni delle persone autorizzate (art. 29) | docenti, ricercatori, amministratori: [02 Parte B](02-informativa-docente.md) | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** |
| Formazione | uso corretto dell'AI, cosa non scrivere, gestione del PC su L2 | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** |
| Contratti con i responsabili (art. 28) | [09 §3](09-registro-trattamenti.md) | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** |
| Elenco dei provider di AI ammessi per finalità | 04-D2, D10 | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** |
| Gestione delle violazioni | [07](07-procedura-data-breach.md) | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** |
| Gestione dei diritti e conservazione | [06](06-politica-conservazione-cancellazione.md) | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** |
| Riesame periodico delle misure (art. 32(1)(d)) | a ogni rilascio dei blocchi P6, P7, P9, P11, P14 e almeno **[DA VALIDARE: frequenza]** | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** |
| Separazione dei ruoli su L1 (chi amministra non legge i contenuti) | dopo P7 | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** |

## 3. Rischi residui noti

Riassunto di 02 §8: falsi negativi del filtro PII; dati in chiaro verso i modelli locali; PC del docente compromesso;
traffico visibile a Cloudflare; metadati (date, conteggi) in chiaro anche dopo P11; condizioni dei provider non
verificate. Valutazione: [08 §4](08-schema-dpia.md).

---

*Bozza P16 — da adottare solo dopo la revisione del Titolare e del DPO.*
