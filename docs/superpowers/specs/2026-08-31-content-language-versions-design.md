# Versioni linguistiche dei contenuti — impianto e certificazione per lingua

| Campo | Valore |
|---|---|
| Data | 2026-08-31 |
| Stato | Sotto-progetto 1 completato |
| Branch | `feature/content-language-versions` |
| Sotto-progetti | 1. Fondamenta · 2. Tool in tutte le lingue · 3. Strumenti FR/DE/ES |

## 1. Problema

L'interfaccia parla sei lingue (`it, en, es, fr, de, sv`) e il controllo
`frontend/scripts/check-i18n.mjs` passa su 2099 chiavi. I **contenuti** no.

Stato misurato al 2026-08-31:

| Contenuto | Lingue presenti | Schema | Manca |
|---|---|---|---|
| Item / fattori / nomi strumenti | `en`, `sv` | colonne fisse `it/en/es/sv` | `es`, `fr`, `de` |
| `certified_strategies` (entrano in chat) | solo `it` | colonne fisse `it/en/es/sv` | tutte le altre |
| `certified_readings` | `it`, `en` | JSON `_i18n` | `es`, `sv`, `fr`, `de` |
| `guided_step_questions` | solo `it` | riga per lingua ✓ | 5 lingue |
| `assistant_questions` | solo `it` | riga per lingua ✓ | 5 lingue |
| `reading_themes.label` | solo `it` | dict in codice | admin-facing |
| Skill `instructions_i18n` | `en` | contratto unico | niente, per scelta |

Da qui tre difetti concreti.

**1. Lingue sbarrate prima dei contenuti.** `SUPPORTED_LOCALES = ("it","en","es","sv")`
in `backend/scoring_service.py:18` fa sollevare `ScoringError` per `fr` e `de`.
Nessuna quantità di traduzioni sbloccherebbe il francese finché quella tupla
resta scritta a mano.

**2. Lo spagnolo serve item inglesi.** In
`frontend/src/lib/test-administrations.ts` la voce `es` di QSA e QSAr monta
cornice spagnola e `items: QSA_EN`. Uno studente spagnolo compila item inglesi
sotto istruzioni spagnole. Il profilo che ne esce è un dato di ricerca sporco,
e nulla nel codice segnala l'anomalia.

**3. La certificazione non conosce le lingue.** `instruments.status`
(`experimental | validated`) è per strumento; `certified_strategies.status`
(`draft | certified`) è per riga. Ma
`docs/validazione/progetto-validazione-qsa-qsar-sv-en.md`, principio 2, impone
«validazione separata per lingua»: lo svedese può essere validato mentre il
francese è ancora bozza. Oggi lo schema non sa esprimerlo. Una strategia
certificata in italiano con il francese generato da LLM risulterebbe
«certificata» in blocco.

`norm_thresholds` ha invece già `locale`. La parte normativa è per lingua, lo
stato del contenuto no: è questa l'incoerenza da chiudere.

## 2. Principi

Ereditati dal protocollo di validazione, più uno che nasce qui.

1. **Equivalenza prima della traduzione letterale** — un item deve conservare
   il costrutto misurato.
2. **Certificazione separata per lingua** — ogni coppia (contenuto, lingua) ha
   uno stato proprio.
3. **Nessuna schermata mista** — se l'utente sceglie il tedesco, o il contenuto
   è in tedesco o non viene offerto. Mai un ripiego silenzioso su un'altra
   lingua.
4. **Tracciabilità** — di ogni traduzione si sa da dove viene (umana,
   pubblicata, LLM) e chi l'ha approvata.
5. **Aggiungere una lingua non è una migrazione** — deve essere un seed più una
   riga di stato.

## 3. Modello dati

### 3.1 Contenuto: colonne fisse → JSON `_i18n`

Il progetto ha già convergito su questo schema in `guided_steps.label_i18n`,
`counselors.description_i18n`, `certified_readings.summary_i18n`. Lo si estende
alle quattro tabelle rimaste indietro.

| Tabella | Da | A |
|---|---|---|
| `instruments` | `name_it/en/es/sv` | `name_i18n` JSON |
| `factors` | `label_*`, `description_*` | `label_i18n`, `description_i18n` |
| `questionnaire_items` | `text_it/en/es/sv` | `text_i18n` |
| `certified_strategies` | `name_*`, `recommended_when_*`, `description_*` | `name_i18n`, `recommended_when_i18n`, `description_i18n` |

Forma del valore: `{"en": "...", "sv": "..."}`. Una lingua assente è assente,
non stringa vuota: la differenza fra «non tradotto» e «tradotto in vuoto» deve
restare leggibile.

`instruments.response_labels` è già JSON per locale e resta com'è.

### 3.2 Registro: `content_language_versions`

Tabella nuova. Una riga per (tipo di contenuto, chiave, lingua).

| Colonna | Tipo | Ruolo |
|---|---|---|
| `id` | int PK | |
| `content_type` | str | `instrument` \| `certified_strategy` \| `certified_reading` \| `guided_step_question` \| `assistant_question` |
| `content_key` | str | codice strumento, slug strategia, ... |
| `locale` | str | una delle sei |
| `status` | str | vocabolario chiuso per tipo, §3.3 |
| `source` | str | `human` \| `published:<rif>` \| `llm:<modello>` |
| `version_label` | str, null | aggancia le `validation_responses` già raccolte |
| `approved_by` | str, null | username di chi ha promosso l'ultimo stato |
| `approved_at` | datetime, null | |
| `notes` | text, null | rimando al protocollo, riserve, deroghe |
| `created_at`, `updated_at` | datetime | |

Vincolo di unicità su `(content_type, content_key, locale)`.

Il registro è **autorità sullo stato**, non sul contenuto: il testo resta nella
sua tabella. Separare i due evita che una promozione di stato riscriva un testo
o viceversa.

### 3.3 Vocabolari di stato

Chiusi e distinti per famiglia, perché il cammino non è lo stesso.

**Strumenti psicometrici** (`instrument`) — segue
`docs/validazione/progetto-validazione-qsa-qsar-sv-en.md`:

```
draft → translated → reviewed → pilot → validated
```

- `draft` — la lingua esiste come intenzione, nessun item.
- `translated` — item presenti, equivalenza non ancora verificata.
- `reviewed` — interviste cognitive fatte (§4 del protocollo).
- `pilot` — somministrabile con avviso sperimentale, profilo a fallback lineare.
- `validated` — norme stanine validate per quel locale, counseling attivo.

**Tool** (tutti gli altri tipi) — non sono misure, non hanno norme:

```
draft → translated → certified
```

Solo `certified` entra nel contesto della chat.

Il vocabolario vive in `backend/content_versions.py`, con la funzione di
transizione che rifiuta i salti non previsti.

### 3.4 Cancelli derivati dallo stato

| Stato | Strumento | Tool |
|---|---|---|
| `draft`, `translated`, `reviewed` | non somministrabile, non elencato per quella lingua | non consegnato in chat |
| `pilot` | somministrabile, banner sperimentale, stanine non normate | — |
| `validated` / `certified` | somministrabile senza riserve, stanine normate | consegnato in chat |

**Vincolo di non-regressione**: `en` e `sv` sono oggi somministrabili da
chiunque, con banner sperimentale e fallback lineare — esattamente la semantica
di `pilot`. La migrazione li porta a `pilot`, non più in basso. Nessuno studente
perde un accesso che aveva.

Lo stato iniziale si **deriva dai dati**, non si indovina. La derivazione gira
su tutte e sei le lingue dell'interfaccia, così ogni coppia ha una riga e la
domanda «in che stato è il tedesco?» ha sempre una risposta:

```
per ogni strumento, per ognuna delle sei lingue:
    se non esistono item con testo in quel locale  → draft
    altrimenti se esistono norm_thresholds validated per (strumento, locale) → validated
    altrimenti → pilot
```

Applicata allo stato attuale: `en` e `sv` → `pilot`; `it`, `es`, `fr`, `de` →
`draft`, perché nessuno dei tre ha item. Lo spagnolo smette di essere offerto,
e il bug §1.2 muore per costruzione invece che per patch. L'italiano resta
`draft` per sempre di proposito: la somministrazione italiana vive sul sito
esterno (§9), e il registro lo dice invece di lasciarlo implicito.

Per le strategie certificate: ogni riga con `status == "certified"` genera una
riga di registro `(certified_strategy, slug, it, certified)`, perché il seed è
italiano. Le altre lingue non nascono.

**Quando il cancello dei tool si accende.** Oggi
`certified_strategy_service._localized` ripiega sull'italiano per qualunque
lingua. In una chat tedesca arriva testo italiano: è il difetto da chiudere. Ma
accendere il cancello nel sotto-progetto 1, prima che le traduzioni esistano,
toglierebbe i consigli certificati a ogni lingua diversa dall'italiano senza
darne di nuovi — l'app peggiorerebbe nell'intervallo. Quindi: il sotto-progetto
1 scrive il registro e lascia il ripiego attivo; il cancello dei tool si accende
nel sotto-progetto 2, nello stesso momento in cui le traduzioni entrano. Il
cancello degli **strumenti** invece si accende subito, perché lì «non offerto» è
già meglio dell'attuale «item inglesi sotto cornice spagnola».

### 3.5 `SUPPORTED_LOCALES` derivato

Sparisce la tupla scritta a mano. Le lingue ammesse dall'app sono le sei
dell'interfaccia (costante condivisa); le lingue **disponibili per uno
strumento** sono quelle con una riga di registro in stato somministrabile.
`get_rules` e `score` rifiutano un locale sconosciuto all'app, e rispondono
`409` con lo stato corrente per un locale noto ma non ancora somministrabile —
non `500`, e non un ripiego silenzioso.

## 4. Fonte unica dei testi

`frontend/src/lib/test-administrations.ts` (962 righe) duplica il catalogo DB e
ospita il bug §1.2. Va cancellato, con lo scoring che è già server-side
(`POST /api/instruments/{code}/score`).

Il file mescola due cose che vanno separate:

| Cosa | Esempi | Dove va |
|---|---|---|
| **Dati dello strumento** | item, etichette fattori, nome, scala di risposta | DB, via `GET /api/instruments/{code}/rules` |
| **Cornice dell'interfaccia** | istruzioni, nota privacy, avviso sperimentale, «Invia», «Indietro» | `i18n.ts`, sei lingue |

Consumatori da riscrivere:

- `frontend/src/components/administration/QuestionnaireRunner.tsx`
- `frontend/src/app/somministrazione/page.tsx`
- `frontend/src/app/somministrazione/[instrument]/[locale]/page.tsx`
- `frontend/src/app/strumenti/[id]/page.tsx`
- `frontend/src/lib/test-scoring.ts` (importa solo i tipi)

`AdministrationLocale = 'en' | 'es' | 'sv'` sparisce: la lingua è quella
dell'interfaccia, e la disponibilità la decide il registro.

## 5. Migrazione

Il progetto non usa Alembic: SQL grezzo idempotente in `_seed_and_migrate()`
(`backend/main.py:248`). Si segue quel modo.

**Non distruttiva.** La migrazione aggiunge le colonne JSON e travasa; **non
lascia cadere** le colonne per lingua. Restano lette in fallback per una
release, così un rollback del codice non perde dati. La rimozione è un lavoro
successivo, dichiarato in CONTEXT.md.

Ordine:

1. `ADD COLUMN ... JSON` sulle quattro tabelle (idempotente, `IF NOT EXISTS`
   dove il dialetto lo consente, altrimenti try/except come le migrazioni
   esistenti).
2. Travaso: per ogni riga, `{"<lang>": <valore>}` per ogni colonna per lingua
   non vuota. Idempotente: se il JSON è già popolato, non si tocca.
3. `CREATE TABLE content_language_versions` via `create_all`.
4. Derivazione degli stati iniziali secondo §3.4. Idempotente: non sovrascrive
   una riga di registro esistente.

I lettori (`scoring_service`, seed, pannelli admin) leggono JSON con fallback
sulla colonna vecchia finché la colonna esiste.

## 6. API

| Endpoint | Cambia |
|---|---|
| `GET /api/instruments/{code}/rules` | invariata la forma; `locale` non somministrabile → `409` con `{status, available_locales}` |
| `POST /api/instruments/{code}/score` | idem |
| `GET /api/instruments` (nuovo) | elenco strumenti con, per lingua, lo stato del registro — alimenta selettore e pagina somministrazione |
| `GET /api/admin/content-versions` | registro filtrabile per tipo/chiave/lingua |
| `POST /api/admin/content-versions/{id}/promote` | transizione di stato, con `approved_by` dall'identità chiamante, rifiuta salti non previsti |

## 7. Pannelli admin

- `QuestionnaireEditor.tsx` — da campi per lingua fissa a un selettore di lingua
  che mostra testo e stato di quella lingua, con la transizione di stato in cima.
- `CertifiedStrategiesPanel.tsx` — stessa forma.
- `ValidationExportPanel.tsx` — l'export porta il `version_label` e lo stato
  della lingua esportata, così un dataset di ricerca dice a quale versione
  linguistica appartiene.

## 8. Test

Su Postgres dedicato (`counselorbot_test`), non SQLite; smoke in
`backend/tests/test_smoke.py`.

| Test | Verifica |
|---|---|
| `test_content_versions.py::test_status_transitions` | le transizioni previste passano, i salti no |
| `::test_initial_status_derivation` | en/sv → `pilot`, es → `draft`, coerente coi dati |
| `::test_no_regression_en_sv` | en e sv restano somministrabili dopo la migrazione |
| `::test_unavailable_locale_is_409_not_500` | `fr` risponde 409 con lo stato, non `ScoringError` |
| `::test_migration_is_idempotent` | doppia esecuzione, stesso risultato |
| `::test_i18n_json_fallback` | riga con sola colonna vecchia resta leggibile |
| `test_smoke.py` (esteso) | nessun locale serve testo di un'altra lingua |

L'ultimo è il test che avrebbe colto il bug spagnolo: per ogni strumento e
lingua offerta, il testo servito non deve coincidere con quello di un'altra
lingua.

## 9. Fuori scopo per il sotto-progetto 1

Dichiarato qui perché il confine è la parte che si perde.

- **Sotto-progetto 2 — tool in tutte le lingue.** Traduzione effettiva di
  strategie certificate, letture, domande suggerite, domande assistente.
  Pipeline LLM → bozza → revisione admin → `certified` per lingua. Riusa il
  registro; non aggiunge schema.
- **Sotto-progetto 3 — strumenti FR/DE/ES.** Traduzione degli item e cammino
  fino a `pilot`. Da `reviewed` in poi è lavoro di ricerca, non di software: il
  codice offre la transizione, non la sostituisce.
- **Rimozione delle colonne per lingua.** Dopo una release di convivenza.
- **Italiano somministrabile in-app.** Gli originali stanno sul sito esterno;
  resta il redirect attuale.

## 10. Rischi

| Rischio | Mitigazione |
|---|---|
| La migrazione perde testi | Non distruttiva: colonne vecchie conservate, fallback in lettura, test di idempotenza |
| Uno studente perde l'accesso a en/sv | Vincolo di non-regressione §3.4, test dedicato |
| Lo spagnolo sparisce senza preavviso | È il comportamento voluto: meglio assente che sbagliato. La pagina dice «non ancora disponibile», non tace |
| Il registro diverge dai contenuti | Lo stato si deriva dai dati alla migrazione; la promozione è un gesto admin esplicito, tracciato |
| Traduzione LLM presa per validata | I vocabolari di stato sono distinti: un item LLM non può arrivare a `validated` senza norme, e `source` resta scritto |
