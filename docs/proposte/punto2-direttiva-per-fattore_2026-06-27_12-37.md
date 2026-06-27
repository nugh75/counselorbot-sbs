# Punto 2 — Direttiva "a liste" → tabella per-fattore

**Data**: 2026-06-27 12:37
**Target**: funzione `_apply_qsa_factor_directive` in `backend/chat_logic.py:493` (modifica di CODICE, non un prompt da incollare).
**Bug risolti**: B2 (C7 basso → "Forza") e l'errore di inversione emerso nel re-test: **A5=9 → "Forza"** invece di "Area di crescita".
**Vale per**: QSA e QSAr, tutte le lingue (le label restano localizzate automaticamente).

---

## Il problema (evidenza dal re-test del 2026-06-27)

Dopo il fix del Punto 1 le etichette sono corrette quasi ovunque, MA nello step **affective** è comparso:

```
A5 (Mancanza di perseveranza) 9/9 - Forza
```

A5 è **invertito**: 9/9 = **Area di crescita** (alta mancanza di perseveranza = problema, non forza).
Prova che è un problema di *lookup* e non di conoscenza: nello step narrativo **sl-motivation** lo stesso A5=9 è trattato correttamente ("è un fattore invertito… potresti avere difficoltà a continuare"). Nello step a etichette il modello sbaglia l'inversione, in quello discorsivo no.

## Causa radice

La direttiva attuale usa una logica **a due liste con regola condizionale**:

```
1-3 = Area di crescita, 4-6 = Adeguato, 7-9 = Forza.
BUT the following factors are INVERTED: C3, C6, A1, A4, A5, A7.
For THESE factors the reading flips: 1-3 = Forza, 4-6 = Normale, 7-9 = Area di crescita.
```

Per ogni fattore un modello 4B deve: (1) cercare se il codice è nella lista invertiti, (2) scegliere la mappatura giusta. Su A5 il passo (1) fallisce → applica la mappatura diretta → 9/9 = "Forza".

## Soluzione: pre-risolvere l'inversione **per fattore**

Sostituire la logica a liste con una **tabella in cui ogni fattore ha già le proprie bande**. Il modello non deve più decidere nulla sull'inversione: legge la riga del fattore e basta.

---

## CODICE — PRIMA (`chat_logic.py:493`)

```python
def _apply_qsa_factor_directive(system_prompt: str, questionnaire_type: str, language: Optional[str]) -> str:
    if not _is_strategy_questionnaire(questionnaire_type):
        return system_prompt
    instrument = "QSAr" if (questionnaire_type or "").upper() == "QSAR" else "QSA"
    names = _qsa_factor_names(language, questionnaire_type)
    inverted_codes = _QSAR_INVERTED_CODES if instrument == "QSAr" else _QSA_INVERTED_CODES
    examples = ", ".join(f"{code} ({name})" for code, name in names.items())
    inverted = ", ".join(
        f"{code} ({names[code]})" for code in inverted_codes if code in names
    )
    lbl = _qsa_assessment_labels(language)
    return (
        f"{system_prompt}\n\n"
        "[FACTOR LABELS] In every reply addressed to the student, never write "
        f"an isolated {instrument} factor code. Each code must be immediately "
        "accompanied by its full name, in the form `C2 (Self-regulation)`. "
        f"Mandatory reference: {examples}.\n\n"
        "[INVERTED FACTORS] Scale 1-9. Use EXACTLY these assessment labels "
        "(already in the student's language) in the interpretation column, never their English form: "
        f"1-3 = {lbl['growth']}, 4-6 = {lbl['adequate']}, 7-9 = {lbl['strength']}. "
        f"BUT the following factors are INVERTED: {inverted}. "
        f"For THESE factors the reading flips: 1-3 = {lbl['strength']}, 4-6 = {lbl['normal']}, "
        f"7-9 = {lbl['growth']} (a high score = a problem to work on, NOT a strength). "
        "Absolute rule: never read 'high = strength' automatically; "
        "always apply the inversion to the listed factors. "
        f"Apply this rule exclusively to the inverted {instrument} factors listed above."
    )
```

## CODICE — DOPO (`[FACTOR LABELS]` invariato; `[INVERTED FACTORS]` → tabella per-fattore)

```python
def _apply_qsa_factor_directive(system_prompt: str, questionnaire_type: str, language: Optional[str]) -> str:
    if not _is_strategy_questionnaire(questionnaire_type):
        return system_prompt
    instrument = "QSAr" if (questionnaire_type or "").upper() == "QSAR" else "QSA"
    names = _qsa_factor_names(language, questionnaire_type)
    inverted_codes = _QSAR_INVERTED_CODES if instrument == "QSAr" else _QSA_INVERTED_CODES
    examples = ", ".join(f"{code} ({name})" for code, name in names.items())
    lbl = _qsa_assessment_labels(language)
    direct_bands = f"1-3 = {lbl['growth']} · 4-6 = {lbl['adequate']} · 7-9 = {lbl['strength']}"
    inverted_bands = f"1-3 = {lbl['strength']} · 4-6 = {lbl['normal']} · 7-9 = {lbl['growth']}"
    rows = []
    for code, name in names.items():
        if code in inverted_codes:
            rows.append(f"- {code} ({name}) [INVERTED]: {inverted_bands}")
        else:
            rows.append(f"- {code} ({name}): {direct_bands}")
    interpretation_table = "\n".join(rows)
    return (
        f"{system_prompt}\n\n"
        "[FACTOR LABELS] In every reply addressed to the student, never write "
        f"an isolated {instrument} factor code. Each code must be immediately "
        "accompanied by its full name, in the form `C2 (Self-regulation)`. "
        f"Mandatory reference: {examples}.\n\n"
        "[INTERPRETATION TABLE] Scale 1-9. Assign each factor the label of its "
        "score band reading ITS OWN row below; the labels are already in the "
        "student's language. The inversion is already resolved per factor: do NOT "
        "decide inversion yourself, just read the row.\n"
        f"{interpretation_table}\n"
        "The [INVERTED] tag is internal: never display it to the student. "
        "Absolute rule: a high score on an [INVERTED] factor is an area to work on, "
        "NOT a strength; never read 'high = strength' automatically."
    )
```

---

## Testo RESO al modello (IT / QSA) — DOPO

```text
[FACTOR LABELS] ... (invariato: regola codice+nome + lista di riferimento)

[INTERPRETATION TABLE] Scale 1-9. Assign each factor the label of its score band reading ITS OWN row below; the labels are already in the student's language. The inversion is already resolved per factor: do NOT decide inversion yourself, just read the row.
- C1 (Strategie elaborative): 1-3 = Area di crescita · 4-6 = Adeguato · 7-9 = Forza
- C2 (Autoregolazione): 1-3 = Area di crescita · 4-6 = Adeguato · 7-9 = Forza
- C3 (Disorientamento) [INVERTED]: 1-3 = Forza · 4-6 = Normale · 7-9 = Area di crescita
- C4 (Disponibilità alla collaborazione): 1-3 = Area di crescita · 4-6 = Adeguato · 7-9 = Forza
- C5 (Organizzatori semantici): 1-3 = Area di crescita · 4-6 = Adeguato · 7-9 = Forza
- C6 (Difficoltà di concentrazione) [INVERTED]: 1-3 = Forza · 4-6 = Normale · 7-9 = Area di crescita
- C7 (Autointerrogazione): 1-3 = Area di crescita · 4-6 = Adeguato · 7-9 = Forza
- A1 (Ansietà di base) [INVERTED]: 1-3 = Forza · 4-6 = Normale · 7-9 = Area di crescita
- A2 (Volizione): 1-3 = Area di crescita · 4-6 = Adeguato · 7-9 = Forza
- A3 (Attribuzione a cause controllabili): 1-3 = Area di crescita · 4-6 = Adeguato · 7-9 = Forza
- A4 (Attribuzione a cause incontrollabili) [INVERTED]: 1-3 = Forza · 4-6 = Normale · 7-9 = Area di crescita
- A5 (Mancanza di perseveranza) [INVERTED]: 1-3 = Forza · 4-6 = Normale · 7-9 = Area di crescita
- A6 (Percezione di competenza): 1-3 = Area di crescita · 4-6 = Adeguato · 7-9 = Forza
- A7 (Interferenze emotive) [INVERTED]: 1-3 = Forza · 4-6 = Normale · 7-9 = Area di crescita
The [INVERTED] tag is internal: never display it to the student. Absolute rule: a high score on an [INVERTED] factor is an area to work on, NOT a strength; never read 'high = strength' automatically.
```

La riga di A5 dice esplicitamente `7-9 = Area di crescita`: il modello non può più rispondere "Forza" per A5=9.

---

## Note

- **Localizzazione**: invariata. Bande e nomi vengono da `_qsa_assessment_labels(language)` e `_qsa_factor_names(language, ...)`, già per lingua.
- **QSAr**: funziona automaticamente (`_QSAR_INVERTED_CODES = ("C4r", "A1r")`, nomi QSAr).
- **Costo token**: ~+90 token rispetto alle due liste (14 righe). Trascurabile a 8192 ctx.
- **Rischio leak del marker `[INVERTED]`**: mitigato dalla riga "internal: never display". Se nel test dovesse comparire nell'output, **variante**: rimuovere il marker `[INVERTED]` dalle righe (le bande per-riga bastano a determinare l'etichetta) e tenere solo la frase "for some factors a high score is an area to work on".

## Variante 2B (più forte, se A5 dovesse ancora sbagliare)

Passare anche i punteggi alla direttiva e iniettare l'etichetta **già risolta per il punteggio reale**, es. `A5 (Mancanza di perseveranza) 9/9 → Area di crescita`. Azzera ogni ragionamento, ma accoppia la direttiva allo `scores_context` ed è ridondante col messaggio. Da usare solo se 2A non basta.

## Come applicare e testare

1. Modificare `backend/chat_logic.py:493` con la versione DOPO.
2. Riavviare il backend: `docker compose restart backend` (o ricostruire se il codice è copiato in immagine: `docker compose up -d --build backend`).
3. Re-test live step **affective** con il profilo standard → atteso: `A5 (Mancanza di perseveranza) 9/9 = Area di crescita` (non "Forza").
4. Verificare anche che il marker `[INVERTED]` non compaia nel testo allo studente.
