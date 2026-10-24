# Privacy Layer di CounselorBot

Analisi e progettazione (fasi 1-2 del brief del 2026-10-24). **Nessun codice applicativo** in questa cartella.
Le misure descritte non rendono da sole il trattamento conforme al GDPR.

| Documento | Contenuto |
|---|---|
| [01-analisi.md](01-analisi.md) | i quattro livelli reali, stack, dove stanno i dati personali, autenticazione e autorizzazione, **tutte le uscite verso modelli e servizi esterni** con `file:riga`, filtro PII e cifratura esistenti, informative e consensi, lacune G1–G13 |
| [02-progettazione.md](02-progettazione.md) | confini di fiducia, contratti del Privacy Layer, motore PII locale, pseudonimi/HMAC/AES-256-GCM/Argon2id, chiavi, autorizzazioni e matrice ruoli, gateway AI fail-closed, informative e consensi versionati, threat model, migrazione reversibile |
| [03-piano-blocchi.md](03-piano-blocchi.md) | blocchi P0–P17 con Definition of Done, dipendenze, aree toccate, tier, parallelismo e collisioni con i compiti desktop |
| [04-decisioni-titolare-dpo.md](04-decisioni-titolare-dpo.md) | decisioni D1–D14 per titolare/DPO/consulente, documenti da produrre, fonti normative e stato della verifica |
| [p13-logs-diagnostica.md](p13-logs-diagnostica.md) | redazione distruttiva fail-closed, gazetteer nei log, download backend risanitizzati e ZIP desktop offline senza testo libero |
| [spikes/p3-pii-engine.md](spikes/p3-pii-engine.md) | spike P3: regole, gazetteer, Ollama NER e GLiNER ONNX misurati sul corpus P2 e su un holdout; PyInstaller; licenze; raccomandazione (regole + gazetteer di contesto + GLiNER multi PII fp16) |
| [p5-crittografia-chiavi.md](p5-crittografia-chiavi.md) | P5: AES-256-GCM con AAD per campo, KEK da ambiente/portachiavi, DEK per finalità in `privacy_keys`, `subject_pid`, indici ciechi, rotazione, kit di recupero, parametri Argon2id |
| [p8-subject-mappe.md](p8-subject-mappe.md) | P8: `subject_pid` base32 minuscolo, indici ciechi, tabella `privacy_pseudonym_maps` cifrata con la DEK `mapping` e `SqlAlchemyMapStore` |

I quattro livelli: **L1** server (Console/portable), **L2** app desktop docente, **L3** app desktop studente (Fase 2, non
ancora esistente), **L4** livello web Next.js (unico ingresso verso il backend). Il gateway AI non esiste come processo: va
costruito dentro il backend.

## Nucleo P1 implementato

`backend/privacy/{__init__,types,errors,policy}.py` espone i contratti di 02 §3 e
§6, senza import di ORM, provider, configurazione o accessi alla rete. Non
introduce tabelle o migrazioni e non modifica i flussi AI esistenti.

- Vocabolario canonico in inglese (`PIICategory.PERSON.value == "person"`),
  livelli `SensitivityLevel`, modalità `TreatmentMode`, ruoli `PrivacyRole`
  e finalità note `PrivacyPurpose`. `PrivacyContext.purpose` resta una stringa
  per accogliere le future chiavi configurate in `privacy_purposes`.
- `Principal`, `PrivacyContext`, `PIISpan`, `PseudonymMap`,
  `PseudonymizedBatch`, riferimenti di campo/risorsa, eventi e richieste/risposte
  AI sono dataclass frozen con `repr`/`str` privi di valori. `PIISpan` accetta
  `start, end, category, text_masked, score`; `text_hash` e `detector` sono
  metadati aggiuntivi da passare per nome. `Span` e `Category` sono alias.
  Il campo `text_masked` non è una promessa di redazione: anche un valore
  assegnato erroneamente in chiaro resta escluso dalle rappresentazioni.
- `PseudonymMap(scope_id, entries)` contiene segnaposto → originali, solo nel
  backend. La persistenza cifrata e l'isolamento degli ambiti sono P4/P5.
  `PseudonymizedBatch` restituisce testi, riferimento alla mappa e soli conteggi.
- `PIIDetector`, `Pseudonymizer` e `Depseudonymizer` sono protocolli strutturali.
  `detect_pii(text, ctx)` e `pseudonymize(texts, ctx, policy)` sollevano
  `PIIDetectorUnavailable`; `depseudonymize(text, ctx)`/`restore_authorized`
  sollevano `AccessDenied`. La cifratura senza servizio dà `KeyUnavailable`;
  la decifratura si ferma prima sull'autorizzazione. `authorize_data_access`
  restituisce sempre una decisione negativa; gli eventi danno
  `AuditUnavailable` e `AIGateway.send(request, ctx)` dà `EgressBlockedError`.
- Ogni errore espone un codice fisso `privacy.errors.*`; argomenti, keyword
  e note diagnostiche libere sono scartati. `DetectorUnavailable` e
  `PurposeDisabled` sono alias di `PIIDetectorUnavailable` e
  `PurposeDisabledError`. Non allegare eccezioni originali con `raise ... from
  original`: ai confini dei servizi usare `raise PrivacyError() from None`.
  Non registrare variabili locali dei traceback, `vars`, `asdict`, campi o
  serializzazioni: il contenuto resta accessibile al codice autorizzato.

`default_category_policy(external=True)` copre tutte le categorie: sostituzione
di default, generalizzazione per data di nascita/scuola/organizzazione, blocco
per salute/art. 9. Città e regione restano sostituite finché una finalità non
richiede una generalizzazione. Una categoria senza azione è bloccata. Per un
target locale il default è `keep`; il gateway deve comunque rispettare la
finalità e l'autorizzazione. Sono default proposti, non decisioni del titolare.

`require_purpose` rifiuta finalità mancanti, inattive, differenti dal contesto o
con base giuridica `undefined`; il consenso esplicito è obbligatorio quando
richiesto e sempre con base `consent`. Le scelte devono provenire dal backend.
`egress_requirements` restituisce un piano, **non un'autorizzazione all'invio**:
testi, prompt, cronologia e `attachments_context` devono essere filtrati insieme
e verificati per residui prima dell'uscita. Immagini/audio esterni sono bloccati.
Target locale significa IP risolto loopback oppure IP nella allowlist fidata
`local_hosts`; hostname non risolti e provider denominati `ollama` non danno
eccezioni. `teacher_noticing`, ricerca e policy `pseudonymize_local=True`
richiedono pseudonimizzazione anche localmente. Autorizzazione e audit restano
sempre obbligatori nel piano; l'attuazione è P4/P6/P7/P8/P9.

Verifiche (Python ≥ 3.10, come il backend Docker):

```sh
TEST_DB=postgres python -m pytest backend/tests/test_privacy_core.py
TEST_DB=sqlite python -m pytest backend/tests/test_privacy_core.py
python3 scripts/check-sql-portability.py
make guidance-check
```

La suite è senza database e provider in entrambi i profili: verifica contratti,
diagnostica, policy e assenza di I/O all'import. Non prova persistenza, motore
PII o trasporto AI, che non esistono ancora nel nucleo. `backend/Dockerfile`
include il pacchetto tramite `COPY backend/privacy/ backend/privacy/`.

## Corpus sintetico e benchmark P2

`backend/privacy/corpus/` contiene il corpus sintetico italiano
`it_school_v1.jsonl` (613 frasi scuola/università) e il suo generatore
deterministico `generator.py` (seme fisso; il test fallisce se il file
committato diverge: rigenerare con `python3 -m backend.privacy.corpus.generator`).
Nessun dato reale: nomi e cognomi comuni combinati a caso (composti, accenti,
apostrofi, nomi di famiglie di origine straniera), codici fiscali calcolati con
carattere di controllo corretto (codici catastali reali solo per il calcolo),
IBAN con mod-97 valido, email su domini `example`, IP `192.0.2.0/24`.

Ogni riga JSONL: `id`, `text`, `tags`, `quasi_identifiers`, `entities`
(`start`/`end` in caratteri, `category` = valore di `PIICategory`, `text`,
`placeholder` atteso come `[PERSONA_1]`, stesso valore ⇒ stesso segnaposto nella
frase) ed `expected_pseudonymized`. Tag: registro, disciplina, relazioni, salute
(DSA/BES/Legge 104, diagnosi), art9, contatti, anagrafica, scuola, social,
pagamenti, combinazione (≥ 3 quasi-identificatori), ambiguo («Rosa», «Sole»,
«Volta»), negativo (nessuna entità), indiretto, typo, punteggiatura, gergo.
Limiti: voti e note disciplinari non sono categorie del contratto P1 e restano
contesto (sono annotate le persone); le date di eventi non sono annotate, solo
le date di nascita; la coreferenza («Marco» dopo «Marco Rossi») ha segnaposto
distinti. Le etichette sono generate dai template e verificate dai test di
integrità; una revisione umana campionaria resta consigliata prima di P3.

`backend/privacy/corpus/benchmark.py` esegue qualunque `PIIDetector` e produce
un report JSON senza testo del corpus: precision/recall/F1 per categoria con
corrispondenza esatta e per sovrapposizione, punteggio indipendente dalla
categoria (il testo è comunque coperto?), recall per tag, falsi negativi per id
e latenza per frase (migliore di N ripetizioni, p50/p95, µs per carattere).
`RulesBaselineDetector` adatta il motore a regole attuale (`backend/pii.py`) come
riferimento per P3:

```sh
python3 scripts/privacy_eval.py --summary --out /tmp/privacy-report.json
TEST_DB=sqlite python -m pytest backend/tests/test_privacy_corpus_benchmark.py
```

Misura di riferimento (24/10/2026, regole, sovrapposizione): email R 0,98,
IBAN/IP/URL/social 1,00, codice fiscale R 0,73 (manca il minuscolo/spaziato),
telefono R 0,63, salute R 0,55; persona, scuola, città, indirizzo, data di
nascita, art. 9 R 0; copertura complessiva 0,22; latenza media ≈ 0,06 ms/frase.
I test fissano questi valori come soglie minime di non regressione.
