# Diagnosi: somministrazioni EN/SV per ZTPI, QAP, QPCS, QPCC

## File modificati (6 + 1 skeleton)

| File | Modifica |
|------|----------|
| `frontend/src/lib/test-administrations.ts` | Tipo unico `AdministrationInstrument`, items EN/SV per ZTPI/QAP/QPCS/QPCC, `dimensionTitles` |
| `frontend/src/lib/test-scoring.ts` | Factor definitions per ZTPI/QAP/QPCS/QPCC, orientation `neutral`, `FACTOR_MAP` |
| `frontend/src/components/administration/QuestionnaireRunner.tsx` | `dimensionTitles` dinamico, `string` per dimension |
| `frontend/src/app/somministrazione/page.tsx` | Lista dinamica da `INSTRUMENT_NAMES` |
| `frontend/src/app/somministrazione/[instrument]/[locale]/page.tsx` | Accetta tutti e 6 |
| `questionari/item_catalog/build_skeletons.py` | Aggiunto ZTPI (56 item, 5 fattori) |
| `questionari/item_catalog/ztpi.json` | Nuovo skeleton |

## Build check

- `npx tsc --noEmit` → nessun errore
- `npm run build` → compilato senza errori

## Cosa funziona

- **Routing**: `/somministrazione/ZTPI/en`, `/somministrazione/QAP/sv`, ecc.
- **Items**: tutti e 6 gli strumenti hanno items EN e SV popolati
- **Scoring**: `calculateExperimentalProfile()` usa `FACTOR_MAP` dispatch per tutti
- **Salvataggio**: `POST /api/questionnaire-result` con `questionnaire_type: instrument`
- **Chat**: link a `/?session_id=...&instrument=...` funziona col main page esistente
- **Dimensioni flessibili**: QSA/QSAr usano `cognitive`/`affective`, ZTPI usa `pn`/`pp`/`ph`/`pf`/`f`, ecc.
- **Scala QPCC**: override agreement scale corretto (Strongly disagree → Fully agree)
- **Backend**: guided steps, system prompts, factor-name dictionaries già esistenti per tutti

## Problemi

### 1. ZTPI — item 47 assegnato al fattore sbagliato

Nella pubblicazione originale (Zimbardo & Boyd, 1999), l'item 47 *"I get irritated at people who keep me from being on time"* carica su **Future (T5)**, non su Past Negative (T1).

- Attuale: `T1.itemNumbers` include 47
- Dovrebbe: spostare item 47 da T1 a T5

Altri item potenzialmente fuori posto — non verificato esaustivamente.

### 2. ZTPI — nessun reverse-scoring configurato

La scala ZTPI originale ha item reverse-scored (es. item 9, 28 nel Future). Attualmente `reverseItems` non è mai popolato per ZTPI.

### 3. QPCS e QPCC — item inventati, conteggio errato

| Strumento | Item nel catalog (build_skeletons.py) | Item implementati |
|-----------|--------------------------------------|-------------------|
| QPCS | 55 | 25 |
| QPCC | 63 | 25 |
| QAP | 24 | 24 ✓ |
| ZTPI | 56 | 56 ✓ |

I 25 item per QPCS e QPCC sono stati **inventati** basandosi sui nomi dei fattori. Non corrispondono agli strumenti reali di Pellerey — sono segnaposto funzionanti ma non validi.

### 4. ZTPI e QAP — scala 1-4 invece di 1-5

Pubblicazioni originali:
- **ZTPI**: scala Likert 1–5 (Very untrue → Very true)
- **QAP/CAAS**: scala 1–5 (Not strong → Strongest)

Attualmente entrambi usano scala 1–4 (frequenza) come QSA. Questo riduce la varianza e rende i punteggi non confrontabili con la letteratura.

### 5. `profileMethod` generico

Il testo `copy.profileMethod` dice *"oppositely worded items are reverse-coded within their factor"* — ma per ZTPI/QAP/QPCS/QPCC non ci sono reverse items configurati.

## Note tecniche

- `satisfies` in TEXT: `neutral` aggiunto correttamente, il vincolo è soddisfatto
- `ProfileDimension` rimosso come tipo esportato: non più referenziato altrove
- `generateUUID()` in QuestionnaireRunner: safe fallback per ambienti senza `crypto.randomUUID`

## Sistemato

1. **Item 47**: spostato da T1 a T5 (`test-scoring.ts`). Build verificato.
2. **Reverse-items ZTPI**: non aggiunti — va validato factor structure dalla fonte prima di impostarli.
3. **Disclaimer `profileMethod`**: da aggiornare quando reverse-items saranno configurati.
