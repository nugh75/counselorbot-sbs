# Organizzazione documentazione implementata - 2026-05-30

Stato: implementata il 2026-05-30.

Obiettivo: usare `docs/` come cartella unica per documentazione, analisi, note di progetto e materiali di riferimento, lasciando fuori solo cio' che e' necessario al runtime o a convenzioni tecniche consolidate.

## Stato prima della migrazione

La documentazione e' distribuita in piu' punti:

- Root del repository: `README.md`, `VERIFICA_IMPLEMENTAZIONE.md`, `PROMPT_TRANSLATIONS_REVIEW.md`, `CLAUDE.md`, `GEMINI.md`.
- `docs/`: documenti di validazione, formule e fonti sulle competenze strategiche.
- `questionari/`: progetto di validazione, diagnosi EN/SV e PDF degli strumenti.
- `questionari/item_catalog/README.md`: guida locale allo scaffold degli item.
- `organizzazione/`: diario di bordo e bozze email.
- `prompt_translation/`: review dei prompt live e script/dati di migrazione.
- `knowledge/approved_strategies.md`: base di conoscenza caricata dal backend, quindi non e' solo documentazione.

## Struttura implementata

```text
docs/
  README.md

  progetto/
    diario.md
    comunicazioni/
      mail-olle.md
      mail-olle-en.md
    organizzazione/
      proposta-organizzazione-docs-implementata-2026-05-30.md

  validazione/
    progetto-validazione-qsa-qsar-sv-en.md
    manuale-operativo-validazione.md
    dettagli-validazione-questionari.md
    validazione-questionari-e-stanine.md
    diagnosi-somministrazione-ensv.md
    formule/
      formule-validazione.pdf
      sorgenti-latex/

  questionari/
    strumenti/
      QAP_it.pdf
      QPCC_it.pdf
      QPCS_it.pdf
      QSA_it.pdf
      QSAr_it.pdf
      ZTPI_it.pdf
    item-catalog.md

  prompting/
    prompt-translations-review.md
    live-db-prompt-translation-review.md

  implementazione/
    verifica-implementazione.md
    note-agenti/
      claude.md
      gemini.md

  fonti/
    competenze-strategiche/
      Dirigere_se_stessi_2020.pdf
      Grzadziel_Convegno_2019.pdf
      Guida_2019.pdf
      Guida_2023.pdf
      Introduzione_Volume_2020.pdf
      Margottini_Convegno_2019.pdf
      Pellerey_Convegno_2019.pdf
```

## Mappatura dei file esistenti

| File attuale | Destinazione proposta | Nota |
| --- | --- | --- |
| `VERIFICA_IMPLEMENTAZIONE.md` | `docs/implementazione/verifica-implementazione.md` | Analisi tecnica conclusa. |
| `PROMPT_TRANSLATIONS_REVIEW.md` | `docs/prompting/prompt-translations-review.md` | Review generale dei prompt. |
| `prompt_translation/REVIEW_live_prompts.md` | `docs/prompting/live-db-prompt-translation-review.md` | Tenere script e JSON in `prompt_translation/`. |
| `organizzazione/diario.md` | `docs/progetto/diario.md` | Link interni aggiornati in formato relativo. |
| `organizzazione/mail-olle.md` | `docs/progetto/comunicazioni/mail-olle.md` | Bozza comunicazione progetto. |
| `organizzazione/mail-olle-en.md` | `docs/progetto/comunicazioni/mail-olle-en.md` | Traduzione inglese. |
| `questionari/PROGETTO_VALIDAZIONE_E_SVILUPPO_QSA_QSAR_SV_EN.md` | `docs/validazione/progetto-validazione-qsa-qsar-sv-en.md` | Riferimenti in codice/commenti aggiornati. |
| `questionari/diagnosi-somministrazione-ensv.md` | `docs/validazione/diagnosi-somministrazione-ensv.md` | Collegato al documento sulle stanine. |
| `questionari/*.pdf` | `docs/questionari/strumenti/` | Fonti degli strumenti, non codice. |
| `questionari/item_catalog/README.md` | `docs/questionari/item-catalog.md` | Guida spostata nella documentazione canonica. |
| `docs/manuale_operativo_validazione.md` | `docs/validazione/manuale-operativo-validazione.md` | Normalizzare nome file. |
| `docs/dettagli_validazione_questionari.md` | `docs/validazione/dettagli-validazione-questionari.md` | Normalizzare nome file. |
| `docs/validazione-questionari-e-stanine.md` | `docs/validazione/validazione-questionari-e-stanine.md` | Link relativi aggiornati. |
| `docs/formule_validazione.pdf` | `docs/validazione/formule/formule-validazione.pdf` | Copia pubblicata del PDF formule. |
| `docs/competenzestrategiche/*.pdf` | `docs/fonti/competenze-strategiche/` | Fonti bibliografiche. |
| `docs/competenzestrategiche/latex_formule/` | `docs/validazione/formule/sorgenti-latex/` | Tenere `.tex`; valutare se ignorare `.aux`, `.log`, `.out`. |
| `CLAUDE.md`, `GEMINI.md` | Restano in root, con copia o rimando in `docs/implementazione/note-agenti/` | Alcuni agenti cercano questi file in root. |
| `README.md` | Resta in root | Convenzione GitHub; deve puntare a `docs/`. |
| `frontend/README.md` | Resta in `frontend/` | README locale generato da Next.js; utile vicino al modulo. |
| `knowledge/approved_strategies.md` | Resta in `knowledge/` per ora | Il backend lo carica da `knowledge/approved_strategies.md`. Spostarlo richiede modifica codice/config. |

## Migrazione eseguita

1. Creato `docs/README.md` come indice principale.
2. Spostati in `docs/` i documenti statici da root, `organizzazione/`, `questionari/`, `prompt_translation/` e dalle vecchie sottocartelle `docs/`.
3. Aggiornati i link Markdown e i commenti tecnici che puntavano ai vecchi percorsi.
4. Lasciati in sede i file con funzione runtime o convenzione esterna: `README.md`, `CLAUDE.md`, `GEMINI.md`, `frontend/README.md`, `knowledge/approved_strategies.md`.
5. Aggiornato il diario di bordo con la nuova organizzazione.

## Decisioni aperte residue

- `CLAUDE.md` e `GEMINI.md`: meglio non spostarli finche' restano usati da agenti o workflow esterni.
- `knowledge/approved_strategies.md`: si puo' migrare a `docs/runtime/approved-strategies.md` solo aggiornando `backend/strategy_memory.py` o introducendo una variabile di configurazione.
- Formule PDF duplicate: resta una copia pubblicata in `docs/validazione/formule/formule-validazione.pdf` e una copia generata nei sorgenti LaTeX. Se non serve versionare gli artefatti LaTeX, valutare `.gitignore` per `*.aux`, `*.log`, `*.out`.
