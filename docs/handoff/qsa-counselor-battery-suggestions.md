# QSA Counselor — suggerimenti da batteria di test

**Data**: 2026-06-27
**Fonte**: [`qsa-counselor-battery-report.md`](./qsa-counselor-battery-report.md) — 6 counselor ×
8 step QSA, stesso profilo, via Prompt Audit API.
**Stato**: NIENTE è stato modificato. Solo aggiunta la batteria
[`backend/tests/test_qsa_counselor_prompt_battery.py`](../../backend/tests/test_qsa_counselor_prompt_battery.py)
e questi documenti. Sotto, proposte concrete (non applicate).

Profilo unico usato: `C1=7 C2=5 C3=3 C4=6 C5=4 C6=7 C7=5 · A1=8 A2=6 A3=5 A4=8 A5=3 A6=3 A7=7`
(invertiti: C3 C6 A1 A4 A5 A7).

---

## Priorità

| # | Tipo | Problema | Confidenza | Impatto |
|---|---|---|---|---|
| S1 | bug codice | Duplicazione nome fattore nella risposta | **alta (deterministico)** | cosmetico, ma visibile allo studente |
| S2 | incoerenza dati | Nomi fattori divergenti frontend vs backend | **alta (deterministico)** | studente vede nomi diversi nello stesso flusso |
| S3 | prompt/modello | Inversione a rischio sui modelli piccoli (gemma4:e4b) | media (intermittente) | rischio errore di lettura punteggi |
| S4 | prompt | `poca-connessione` su quasi tutti i second-level | media | i second-level non "integrano" i fattori |
| S5 | prompt | `pochi-consigli` sui first-level | bassa (forse by design) | analisi senza azione |
| S6 | modello | `copertura` cronica su mistral-small (Giulia) | media | fattori dello step non trattati |
| S7 | metodo di test | Grader d'inversione lessicale rumoroso | — | abilita un check deterministico futuro |

---

## S1 — Duplicazione nome fattore (deterministico, confermato live)

Output reale (counselor 4, sl-motivation):
`A6 (Percezione di competenza) Percezione di competenza e' un'area di crescita`
e (counselor 2, cognitive): `C1 (Strategie elaborative) Strategie elaborative 7/9 Forza`.

**Causa**: in [`backend/chat_logic.py`](../../backend/chat_logic.py) `_annotate_qsa_factor_codes`,
la terza `re.sub` aggiunge `(Nome)` dopo ogni codice "nudo":
```python
annotated = re.sub(rf"\b{code}\b(?!\s*\()", f"{code} ({name})", annotated)
```
Il lookahead esclude solo un `(` già presente. Se il modello ha scritto `C1 Strategie elaborative`
o `A6: Percezione di competenza` (codice + nome senza parentesi), la sostituzione inserisce
comunque `(Nome)` → nome ripetuto.

**Fix proposto** (escludere anche il nome che segue già il codice):
```python
annotated = re.sub(
    rf"\b{code}\b(?!\s*\()(?!\s*:?\s*{re.escape(name)})",
    f"{code} ({name})", annotated,
)
```
Aggiungere un test in `backend/tests/test_qsa_factor_directive.py` (o nuovo puro):
`_annotate_qsa_factor_codes("C1 Strategie elaborative", "it")` **non** deve produrre
`Strategie elaborative` due volte; `_annotate_qsa_factor_codes("C1 7/9", "it")` deve restare
`C1 (Strategie elaborative) 7/9`.

---

## S2 — Nomi fattori divergenti frontend ↔ backend (deterministico)

I nomi differiscono su **6 fattori**:

| Codice | Frontend `qsa-model.ts` | Backend `_qsa_factor_names` |
|---|---|---|
| C4 | Collaborazione | Disponibilità alla collaborazione |
| C6 | Difficoltà concentrazione | Difficoltà di concentrazione |
| A3 | Attribuzione controllabile | Attribuzione a cause controllabili |
| A4 | Attribuzione incontrollabile | Attribuzione a cause incontrollabili |
| A5 | Mancanza perseveranza | Mancanza di perseveranza |
| A6 | Percezione competenza | Percezione di competenza |

Il `scores_context` inviato dal frontend usa i nomi frontend; poi
`_annotate_qsa_factor_codes` riscrive il visibile sui nomi **backend** → nello stesso flusso lo
studente vede due varianti dello stesso fattore (profilo vs chat).

**Fix proposto**: una sola fonte di verità per i nomi. Più semplice: allineare
`frontend/src/lib/qsa-model.ts` ai nomi backend (sono i più completi e già usati nei test e
nella direttiva `[FACTOR LABELS]`). In alternativa esporre i nomi dal backend al frontend.
Tenere allineati anche i `_QSA_INVERTED_CODES` (già coincidono).

---

## S3 — Inversione a rischio sui modelli piccoli

La **tabella d'inversione pre-risolta** dell'handoff funziona: 0/54 problemi statici e nessun
errore d'inversione *ad alto punteggio* sistematico. Il residuo è **a livello di prosa** sui
modelli più piccoli: `gemma4:e4b` (Sara) ha l'accuratezza più bassa (**0.74**) e l'unica miss ad
alta confidenza (A1=8/A7=7), per quanto **intermittente** (al replay è uscita corretta).

Il rischio si concentra sui **fattori invertiti a basso punteggio** (C3=3, A5=3): il nome è
negativo ("Disorientamento", "Mancanza di perseveranza"), e il modello a volte ne parla in
termini negativi pur avendo la banda corretta in tabella.

**Opzioni**:
1. **Floor di modello per QSA**: evitare `gemma4:e4b` come counselor QSA di produzione
   (relegarlo a fallback). 12b e i cloud sono ≥ 0.84.
2. **Rinforzo prompt** in `[INTERPRETATION TABLE]`: aggiungere una riga del tipo
   *"Quando un fattore invertito ha punteggio basso (1-3) è una FORZA: descrivilo come risorsa,
   non come problema, anche se il suo nome è negativo."* (è il caso C3=3/A5=3).
3. **Etichetta verificabile** (vedi S7): far emettere al modello la banda della tabella
   *verbatim* accanto al fattore, così la lettura è vincolata e controllabile.

---

## S4 — `poca-connessione` sui second-level (tutti i modelli)

Flag presente su quasi tutte le celle second-level, deepseek incluso. Il prompt second-level
chiede di "mettere in relazione i fattori", ma le risposte usano poco lessico connettivo
(insieme/relazione/influenza/combinazione…).

**Fix proposto** (prompt `prompt_second_level` in `backend/prompt_config.py`): rendere esplicito
il requisito di sintesi, es.: *"Concludi con UNA frase che spiega come i fattori citati
interagiscono tra loro (es. 'X amplifica Y', 'X compensa Y'), non analizzarli in isolamento."*
NB: la soglia del check (`connection < 0.5`, 2 parole) è severa — anche da tarare.

---

## S5 — `pochi-consigli` sui first-level (cognitive/affective)

Probabilmente *by design* (i first-level sono analisi; i consigli arrivano nei second-level e
nella fase Q&A). Se si vuole più azione anche al primo livello: aggiungere al prompt factor
*"per ogni fattore chiudi con un micro-suggerimento pratico (max 1 frase)."* Da valutare se non
appesantisce.

---

## S6 — `copertura` cronica su mistral-small (Giulia)

`mistralai/mistral-small-24b` salta fattori dello step in 6/8 celle (e talvolta ling). I fattori
richiesti sono già elencati nel prompt di step.

**Opzioni**: (a) floor di modello come S1/S3; (b) post-check di copertura + 1 retry mirato sui
fattori mancanti; (c) prompt più imperativo *"DEVI trattare TUTTI e soli questi fattori: …;
non ometterne nessuno."*

---

## S7 — (Metodo di test) Grader d'inversione deterministico

La batteria misura la polarità interpretativa con un'**euristica lessicale**: utile come
screening e per il ranking tra modelli, ma con falsi positivi (i casi Sara/sl-emotions ed
Elena/sl-motivation, al replay, erano corretti). Per un check **deterministico** servirebbe uno
di questi:

1. **Etichetta strutturata**: chiedere al counselor di emettere accanto a ogni codice la banda
   esatta della tabella (es. `A1 (Ansietà di base) → Area di crescita`). Allora il test verifica
   il token, non il sentiment. (Combinabile con S3.3.)
2. **LLM-judge**: un secondo modello valuta "il fattore X è descritto in modo coerente con la
   banda Y?". Più costoso, meno fragile del lessico.

Finché non c'è, leggere `Inv.alta`/`Inv.screen`/`Acc.interp` come *indicatori da rivedere a mano*,
non come verdetti — come già scritto nell'header del report.

---

## Cosa NON toccare

- Confinamento reasoning + `reasoning_leak`: 0 leak su 48 celle. Tiene.
- Tabella d'inversione pre-risolta per-fattore: 0 problemi statici, regressione alto-punteggio
  pulita. È la difesa giusta; le proposte S3 la rinforzano, non la sostituiscono.
