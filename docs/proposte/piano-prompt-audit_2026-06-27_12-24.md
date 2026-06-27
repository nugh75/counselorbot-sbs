# Piano interventi — Prompt Audit QSA

**Data**: 2026-06-27 12:24
**Branch**: `feature/prompt-audit-api`
**Fonte dati**: DB **PostgreSQL** reale (container `counselorbot_postgres`, db `counselorbot`) — NON lo `counselorbot.db` sqlite (eliminato perché inutilizzato).
**Codice di riferimento**: verificato sul container in esecuzione `counselorbot_backend` (la direttiva `_apply_qsa_factor_directive` è attiva: `routes/chat.py:277,471`, `prompt_audit.py:225`).

> Nota: il working tree sul host risultava temporaneamente disallineato (i file `backend/chat_logic.py`, `prompt_config.py`, `prompt_audit.py` non presenti su disco al momento dell'analisi); l'analisi del comportamento è stata fatta sul codice **deployato** nel container, che è intatto.

---

## Come è montato il prompt (flusso QSA)

Ordine finale del system prompt:

```
[PERSONA it]  +  prompt_factor (body, DB)  +  [language dir]  +  [register dir]
            +  _apply_qsa_factor_directive(...)   ← appende [FACTOR LABELS] + [INVERTED FACTORS] localizzati
            +  [STUDENT]  +  [PROFILE]  +  [KNOWLEDGE]
```

Messaggio utente = `scores (scope-ati allo step)` + `DOMANDA DELLO STUDENTE`.

---

## Agenda — punti (in ordine di impatto)

| # | Punto | Bug risolti | Priorità | Stato | File proposta |
|---|---|---|---|---|---|
| 1 | **Conflitto vocabolari etichette** (body inglese vs direttiva localizzata) | B1, B8 | Alta | ✅ Proposta pronta | `punto1-conflitto-etichette_2026-06-27_12-24.md` |
| 2 | **Direttiva "a liste" → "per-fattore"** (tabella esplicita per fattore) | B2, B9 | Alta | ⏳ Da sviluppare | — |
| 3 | **Scoping fattori per step** (fuga via messaggio E via direttiva all-14) | B3, B4 | Alta | ⏳ Da sviluppare | — |
| 4 | **Regex post-processing duplica nomi** (`_annotate_qsa_factor_codes`) | B5 | Media | ⏳ Da sviluppare | — |
| 5 | **Lingua del prompt / meta-leak** (coerenza mono-lingua) | B7 | Media | ⏳ Da sviluppare | — |
| 6 | **Logging & osservabilità envelope** (persistere prompt completo) | diagnostica | Media | ⏳ Da sviluppare | — |
| 7 | **Guardrail anti-loop + [NO META]** (`max_tokens`, `stop`) | B6, B7 | Bassa | ⏳ Da sviluppare | — |

---

## Legenda bug (dal findings originale)

- **B1** label inglese "Good" invece di "Adeguato"
- **B2** C7 (non-inv) basso → "Forza" invece di "Area di crescita"
- **B3** step affettivo elenca fattori cognitivi (sconfinamento)
- **B4** A2 omesso nello step affettivo
- **B5** nome fattore duplicato ("C1 (Strategie elaborative) Strategie elaborative")
- **B6** loop allucinatorio (cascata di parole)
- **B7** [NO META] violato / regole interne esposte
- **B8** "Normale" usato su fattore non-invertito
- **B9** C5 (non-inv) 4/9 → "Area di crescita" invece di "Adeguato"
