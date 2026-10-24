# Privacy Layer di CounselorBot

Analisi e progettazione (fasi 1-2 del brief del 2026-10-24). **Nessun codice applicativo** in questa cartella.
Le misure descritte non rendono da sole il trattamento conforme al GDPR.

| Documento | Contenuto |
|---|---|
| [01-analisi.md](01-analisi.md) | i quattro livelli reali, stack, dove stanno i dati personali, autenticazione e autorizzazione, **tutte le uscite verso modelli e servizi esterni** con `file:riga`, filtro PII e cifratura esistenti, informative e consensi, lacune G1–G13 |
| [02-progettazione.md](02-progettazione.md) | confini di fiducia, contratti del Privacy Layer, motore PII locale, pseudonimi/HMAC/AES-256-GCM/Argon2id, chiavi, autorizzazioni e matrice ruoli, gateway AI fail-closed, informative e consensi versionati, threat model, migrazione reversibile |
| [03-piano-blocchi.md](03-piano-blocchi.md) | blocchi P0–P17 con Definition of Done, dipendenze, aree toccate, tier, parallelismo e collisioni con i compiti desktop |
| [04-decisioni-titolare-dpo.md](04-decisioni-titolare-dpo.md) | decisioni D1–D14 per titolare/DPO/consulente, documenti da produrre, fonti normative e stato della verifica |

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
