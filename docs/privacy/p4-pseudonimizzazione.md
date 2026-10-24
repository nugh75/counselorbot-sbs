# P4 — Pseudonimizzazione locale

Stato: **implementato, non collegato alle chat** (2026-10-24), blocco P4 di [03-piano-blocchi](03-piano-blocchi.md),
issue #553. Motore scelto in [P3](spikes/p3-pii-engine.md) §7.

## 1. Moduli

| File | Contenuto |
|---|---|
| `backend/privacy/detect.py` | `RulesLayer`, `GazetteerLayer` + `SchoolContext`, `GlinerLayer`, `fuse`, `LocalPIIDetector` |
| `backend/privacy/gliner_onnx.py` | GLiNER con solo `onnxruntime` + `tokenizers` (porta di `scripts/spikes/p3_gliner_onnx.py`), finestre di 160 parole sovrapposte di 24 per i testi lunghi |
| `backend/privacy/pseudonymization.py` | `ScopeMap`, `MapStore`/`InMemoryMapStore`, `PseudonymizationEngine` (`detect_pii`, `pseudonymize`, `restore_authorized`, `stream_restorer`, `forget`) |
| `backend/privacy/policy.py` | `configure_engine`: le funzioni pubbliche `detect_pii`/`pseudonymize`/`depseudonymize` usano il motore installato; senza motore restano fail-closed |
| `backend/requirements-pii.txt` | dipendenze opzionali dello strato ML (`onnxruntime==1.31.0`, `tokenizers==0.23.3`) |

## 2. Rilevamento a tre strati

1. **Regole** (autoritative): `backend/pii.py` con gli offset, più le forme che P2/P3 avevano trovato scoperte:
   cellulari con punti, barre, gruppi e `(+39)`, attaccati a una parola («al3478876543»), fissi con «/», numeri
   detti cifra per cifra, codici fiscali minuscoli o con spazi (checksum verificato), email «nome punto cognome
   chiocciola dominio».
2. **Gazetteer di contesto**: nomi della classe e dei docenti e nomi degli istituti (`SchoolContext`, fornito dal
   chiamante per ogni `PrivacyContext`), più i valori già presenti nella mappa della conversazione: una volta visto, un
   valore resta mascherato anche se il modello lo perde al turno dopo. Un nome completo vale in qualsiasi maiuscola; un
   nome o cognome isolato solo con l'iniziale maiuscola («Rosa» sì, «la rosa» no). Pattern di contesto di P3 (scuole,
   indirizzi, titoli, data di nascita, matricola, salute, art. 9). **Nessun dizionario generico di nomi** (P3 §3.3).
3. **ML**: GLiNER `urchade/gliner_multi_pii-v1` fp16, soglia 0,5, una sessione onnxruntime caricata al primo uso e
   condivisa. Hash SHA-256 del file fissato (`PRIVACY_PII_MODEL_SHA256`): file diverso ⇒ non caricato.

**Fusione** (`fuse`): ordine di priorità = regole autoritative, poi più lungo, poi categoria specifica su `date`, poi
regole > gazetteer > ML. Uno span che si sovrappone a quelli già presi tiene **solo le parti scoperte**: nessuna
sovrapposizione fa tornare in chiaro una parte di valore, e nessuno span ML tocca uno span autoritativo.

**Fail-closed**: senza strato ML, con modello assente o corrotto, o su errore di inferenza ⇒ `DetectorUnavailable`
(nessun risultato parziale, nessun testo nell'errore).

## 3. Segnaposto e mappa

- `[PERSONA_1]`, `[SCUOLA_1]`, `[CITTÀ_1]`… in italiano; `[PERSON_1]`… in inglese (altre lingue: inglese). La lingua
  è fissata alla creazione della mappa.
- Una `ScopeMap` per `scope_id` (conversazione): stesso valore normalizzato (telefono: solo cifre, senza `+39`; CF,
  IBAN, email: senza spazi; resto: spazi compressi, minuscole) ⇒ stesso segnaposto in tutti i turni. Contatori per
  conversazione, `mapping_ref` casuale, nessun hash nel segnaposto ⇒ non collegabile fra conversazioni.
- Segnaposto già scritti dall'utente (`[PERSONA_1]`) diventano `［PERSONA_1］` prima del rilevamento.
- Azioni di `CategoryPolicy`: `replace` ⇒ segnaposto numerato e ripristinabile; `generalize` ⇒ solo categoria
  (`[SCUOLA]`), non numerato né ripristinabile (generalizzazioni più fini come l'età: da fare); `keep`; `block` ⇒
  `PolicyBlocked`. Un lotto che fallisce non lascia voci nella mappa.
- **Verifica residui**: dopo la sostituzione si rileva di nuovo, ignorando i segnaposto; i residui vengono sostituiti
  ancora una volta, poi `ResidualPII`.
- **Ripristino**: `restore_authorized` e `stream_restorer` (riusa `pii_ner.StreamRestorer`) chiedono una `Decision`
  positiva a `authorize_data_access` (P7); oggi nega sempre ⇒ `AccessDenied`. Solo i segnaposto della propria
  conversazione vengono ripristinati.
- **Conservazione**: `InMemoryMapStore` tiene le mappe solo in memoria (perse al riavvio); `SqlAlchemyMapStore` (P8,
  [p8-subject-mappe](p8-subject-mappe.md)) le tiene cifrate in `privacy_pseudonym_maps`, una riga per segnaposto.
  `forget(ctx)` cancella la mappa con la conversazione.

## 4. Configurazione

| Variabile | Obbligatoria | Default |
|---|---|---|
| `PRIVACY_PII_MODEL_DIR` | sì | — (cartella con `gliner_config.json`, `tokenizer.json`, file ONNX) |
| `PRIVACY_PII_MODEL_SHA256` | sì | — |
| `PRIVACY_PII_MODEL_FILE` | no | `model_fp16.onnx` |
| `PRIVACY_PII_THRESHOLD` | no | `0.5` |

`GlinerLayer.from_env()` rifiuta una configurazione incompleta. Nessun rilevatore è installato all'avvio: lo farà il
gateway (P6) con `configure_engine`.

## 5. Misure (MacBook Air M1, Python 3.11.9, onnxruntime 1.31.0, carico di sistema ~16)

Metrica «mascherati» di P3 §2.3, senza `SchoolContext` (nessun nome noto: caso peggiore per il gazetteer).

| Insieme | tutte | persone | scuole | città | salute | telefono | CF | email |
|---|---|---|---|---|---|---|---|---|
| corpus P2 (613 frasi) | 0,97 | **0,97** | **0,97** | 0,98 | 0,84 | 1,00 | 1,00 | 1,00 |
| holdout P3 (33 frasi) | **1,00** | 1,00 | 1,00 | 1,00 | 1,00 | 1,00 | – | 1,00 |

- Soglie di P3 §7 raggiunte: persone e scuole ≥ 0,95 sul corpus, holdout ≥ 0,90, telefono e CF da 0,62/0,73 (P2) a 1,00.
- Salute 0,84 sulla metrica stretta: quasi tutti i casi sono frasi annotate per intero («una diagnosi di dislessia»,
  «un PDP per DSA») di cui il termine sensibile è mascherato; resta scoperto il refuso «discalcula».
- Persone scoperte: «COGNOME Nome» in maiuscolo (`FERRARA Gianmarco`, `EL AMRANI Ginevra`), nomi ambigui isolati
  («Sole», «Noemi», «Fatima»): con la classe in `SchoolContext` sono coperti dal gazetteer.
- Latenza: ~0,8–1 s a frase per un rilevamento con la macchina carica (P3: ~0,15 s a riposo); `pseudonymize` fa due
  rilevamenti (verifica residui), quindi circa il doppio. Primo caricamento lento (hash di 580 MB + ottimizzazione).

## 6. Test

`backend/tests/test_privacy_p4_pseudonymization.py`: fusione, regole (incluse tutte le forme di telefono/CF scoperte
in P2 e nessuna regressione sul baseline), gazetteer, fail-closed, coerenza fra turni, non collegabilità, neutralizzazione,
azioni di politica, atomicità del lotto, verifica residui, autorizzazione al ripristino, streaming, `repr` senza
contenuti. Con `PRIVACY_PII_MODEL_DIR` anche le soglie di P3 sul modello vero e l'assenza dei nomi nel testo
pseudonimizzato.

## 7. Da fare

- Mappa cifrata in `privacy_pseudonym_maps` (dopo P5); autorizzazione reale al ripristino (P7).
- Collegamento al gateway AI e costruzione di `SchoolContext` dal DB (P6).
- Export fp16 proprio dai pesi `urchade` (Apache-2.0), download al primo uso in `DATA_DIR` con hash fissato,
  dipendenze ML nella build desktop e rimozione della build `macos-15-intel` (P3 §5).
- Generalizzazioni fini (età al posto della data di nascita, tipo di scuola).
- Soglie in CI: il modello (580 MB) non è nei runner; i test sul modello vero girano solo con `PRIVACY_PII_MODEL_DIR`.
