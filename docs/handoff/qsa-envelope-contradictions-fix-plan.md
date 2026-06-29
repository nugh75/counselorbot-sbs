# Handoff — Fix contraddizioni e ripetizioni nell'envelope QSA

Data: 2026-06-29 · Branch proposto: `fix/qsa-envelope-contradictions`

## Contesto

Audit dell'envelope iniettato durante un ciclo QSA completo con studente di prova
(sessione log `c45071db`, counsellor "Sara", 2026-06-29 10:12–10:14). Analizzati i
`details.envelope.system_prompt_final` reali (prompt **DB-custom**, non i default di
codice) per i 10 turni: `intro → cognitive → affective → sl-elaboration →
sl-selfcontrol → sl-motivation → sl-emotions → sl-attribution → sl-social → generic`.

Diagnosi completa: contraddizioni (ordini in conflitto nello stesso envelope),
ripetizioni (stessa regola in più punti), rumore knowledge. Questo documento è il
**piano di fix**, ordinato per priorità. Nessuna modifica ancora applicata.

> ⚠️ **Parità obbligatoria**: ogni modifica alle direttive in
> [backend/chat_logic.py](../../backend/chat_logic.py) usata da
> [backend/routes/chat.py](../../backend/routes/chat.py) va replicata **identica** in
> [backend/prompt_audit.py](../../backend/prompt_audit.py) (ricostruisce lo stesso
> envelope: se diverge, l'audit mente). I due call-site in `chat.py` (`/chat` e
> `/chat/stream`) vanno tenuti allineati tra loro.

---

## P0 — Contraddizioni (rompono la coerenza degli ordini)

### P0.1 — Step `factor`: "niente consigli ora" vs blocchi che dettano il piano

**Sintomo.** Negli step `cognitive`/`affective` (mode=`factor`) il prompt SECTION dice
`Advice is deferred: do NOT propose strategies or practical actions for the factors now`,
ma lo stesso envelope inietta `[CURRENT STEP SCORE PROFILE]` ("Practical advice must
focus… Use Italian headings 'Azione da fare oggi'/'questa settimana'") e
`[CERTIFIED ADVICE]` ("complete the requested practical plan using it").

**Causa.** [backend/routes/chat.py:304-317](../../backend/routes/chat.py#L304-L317):
`_apply_current_step_score_profile_directive` e `_apply_certified_advice_directive`
sono attivate su `include_analysis_context` (= ogni step non-intro), senza distinguere
gli step che **non** devono dare consigli.

**Fix.**
1. In [chat_logic.py](../../backend/chat_logic.py) nuova costante + helper:
   ```python
   _ADVICE_PROMPT_MODES = {"second-level", "qsar-second-level", "generic", "qsar-generic"}
   def _step_allows_practical_advice(step_mode: Optional[str]) -> bool:
       return (step_mode or "").strip().lower() in _ADVICE_PROMPT_MODES
   ```
2. Nei 3 file (chat.py ×2, prompt_audit.py) calcolare
   `include_advice = include_analysis_context and _step_allows_practical_advice(step_mode)`.
3. Refactor `_apply_current_step_score_profile_directive` con param `include_advice`:
   - sempre: righe banda risolte (`- C1 (…): 9/9 = Forza`) — utili agli step `factor`
     per la colonna "interpretazione", non sono consiglio;
   - solo se `include_advice`: coda "Primary improvement targets… / Practical advice
     must focus… / heading rule". Su `factor` la coda sparisce → contraddizione risolta.
4. `_apply_certified_advice_directive` chiamata solo se `include_advice`.

**Accettazione.** Envelope `cognitive`/`affective`: niente `[CERTIFIED ADVICE]`, niente
frase "Practical advice must focus", nessuna heading rule. Envelope `sl-*` e `generic`:
invariati (mantengono i blocchi consiglio).

### P0.2 — Step `generic`: il bavaglio certificate scatta quando lo studente chiede i passi

**Sintomo.** Messaggio studente `"Da dove mi consigli di iniziare concretamente?"`.
SECTION generico dice "Propose small, feasible steps"; persona dice passi concreti
"when the student explicitly asks". Ma `[CERTIFIED ADVICE]` impone:
`if no certified item is listed for the current step, keep the response interpretive
and omit the practical plan`. Nel turno generico **non** c'è blocco
`[CERTIFIED_STRATEGIES]` (phase=None → nessun retrieval certificate per-fattore) →
il modello è obbligato a omettere il piano proprio quando è stato richiesto.

**Fix.** In `_apply_certified_advice_directive`
([chat_logic.py:917-941](../../backend/chat_logic.py#L917-L941)) ammorbidire il ramo
"no certified item": consentire come fallback le **strategie di supporto approvate**
(già presenti in `[KNOWLEDGE]` come `## Strategie di supporto approvate`), e restare
solo-interpretativi unicamente se manca anche quello. Bozza:
> `- if no certified item is listed, you may draw the practical step from the approved
> support strategies in [KNOWLEDGE]; stay interpretive only if neither is available;`

**Accettazione.** Turno generico con richiesta esplicita di passi: il modello produce
un passo pratico (da certificate o, in mancanza, da supporto approvato), non un rifiuto.

---

## P1 — Ripetizioni (stessa regola ribadita più volte → rumore e rischio deriva)

### P1.1 — "scope ai soli fattori correnti" detto 3×

Presente in `[CURRENT FACTOR SCOPE]`
([chat_logic.py:821-834](../../backend/chat_logic.py#L821-L834)),
`[CURRENT STEP FACTORS]` ([chat_logic.py:857-869](../../backend/chat_logic.py#L857-L869))
e bullet `[CERTIFIED ADVICE]` "keep advice scoped…"
([chat_logic.py:936](../../backend/chat_logic.py#L936)).

**Fix.** `[CURRENT STEP FACTORS]` resta l'unica fonte autorevole quando `allowed_codes`
è valorizzato:
- in `_apply_qsa_factor_directive` emettere `[CURRENT FACTOR SCOPE]` **solo** nel ramo
  `allowed_codes` vuoto (caso `generic`, dove `[CURRENT STEP FACTORS]` non esiste);
- togliere il bullet "keep advice scoped" da `_apply_certified_advice_directive`.

Risultato: una sola dichiarazione di scope per turno.

### P1.2 — Intestazioni IT 'Azione da fare oggi/questa settimana' dette 2× identiche

In coda a `_apply_current_step_score_profile_directive`
([chat_logic.py:896-900](../../backend/chat_logic.py#L896-L900)) **e** ultimo bullet di
`_apply_certified_advice_directive` ([chat_logic.py:929](../../backend/chat_logic.py#L929)).

**Fix.** Tenerla solo nella coda del score-profile (già gated a `include_advice` dopo
P0.1); rimuoverla da certified-advice.

### P1.3 — Gestione fattori invertiti detta 3×

Header `[INTERPRETATION TABLE]` ("inversion already resolved") + footer tabella
("high score is an area to work on…") + frase score-profile ("…not 'lack of
perseverance is a strength'"). L'esempio *lack of perseverance* viene iniettato anche
su step senza A5 (cognitive, sl-elaboration, sl-selfcontrol) → testo morto.

**Fix.**
- Rimuovere la frase-footer ridondante "For some factors a high score…"
  ([chat_logic.py:846-848](../../backend/chat_logic.py#L846-L848)): la risoluzione
  per-riga + "inversion already resolved" bastano.
- Rendere la nota plain-language dello score-profile condizionata alla presenza di
  almeno un fattore invertito nello scope corrente (e l'esempio A5 solo se A5 in scope).

### P1.4 — Anti-saluto 2× sugli step `factor` (bassa)

`[NO META]` dice già "start directly with the analysis"; `_GUIDED_NO_GREETING_SUFFIX`
([chat_logic.py:957](../../backend/chat_logic.py#L957)) aggiunge "Do NOT start with
greetings. Go straight to the analysis."

**Fix (opzionale).** Non appendere il suffisso se il prompt contiene già
"go straight to the analysis"/"start directly". Innocuo, priorità bassa.

---

## P2 — Rumore knowledge e questioni minori

### P2.1 — Retrieval quasi-duplicato (`_retrieved_context`)

Nel turno generico: SOURCE 1≈SOURCE 3 (stesso file `01_Libretto_dello_studente`),
SOURCE 2≈SOURCE 4 (`Libretto_Modello_QSA`), 1≈2. Iniettata anche impalcatura di moduli
vuoti ("VERIFICO LA PRIMA TAPPA Data…", crocette) senza valore analitico
(~1–2k caratteri sprecati). Nessun dedup in
[chat_logic.py:1318-1330](../../backend/chat_logic.py#L1318-L1330).

**Fix.** In `rag_build_context` / `_retrieved_context`: dedup per
`(source_file, hash testo normalizzato)` e scarto dei chunk a contenuto quasi-nullo
(prevalenza di pipe-tabella / placeholder "Data…", < N parole utili). Mantiene 1 copia
per fonte distinta.

### P2.2 — Tabella Libretto a 14 fattori in step scope-ati (bassa)

Il retrieval ritorna la tabella completa (A1-A7 inclusi) anche negli step `factor` che
vietano i fattori A. È materiale di riferimento; in parte mitigato da P2.1. Valutare
uno scoping della query grafo ai codici dello step. Priorità bassa.

### P2.3 — `targets: none` + piano obbligatorio nei `sl-*` (bassa)

Es. `sl-elaboration`: "Primary improvement targets: none" ma il formato secondo-livello
impone "What you can improve" + piano. Dopo P0.1 i consigli restano corretti per i
secondo-livello; aggiungere solo una riga: quando non ci sono target, orientare il piano
al **consolidamento delle risorse** invece di forzare un problema. Wording, priorità bassa.

### P2.4 — Punteggi presenti 2–3× per turno (won't-fix salvo necessità)

Bande risolte in `[CURRENT STEP SCORE PROFILE]` + grezzi `x/9` in `[FULL_MESSAGE]` +
bande in `[INTERPRETATION TABLE]`. In parte intenzionale (interpretato vs grezzo; i
grezzi nel messaggio sono lo scope inviato dal frontend). Dedup rischioso, non
prioritario. Documentare la scelta.

---

## Cosa NON tocchiamo

- `[LANGUAGE]` / `[REGISTER]` / `[THINKING]`: una volta ciascuno, coerenti. OK.
- Soppressione del riferimento punteggi persistito quando i punteggi sono nel messaggio
  ([chat_logic.py:1426-1438](../../backend/chat_logic.py#L1426-L1438)). OK.
- Step `intro`: già ripulito (no punteggi/fattori/tabella/knowledge/consigli). OK.
- Persona in cima, una volta. OK.
- Prompt SECTION del secondo livello che elenca tutti i 6 raggruppamenti (A3 dell'audit):
  è il prompt canonico, editabile da admin, e funge da riferimento; lo scope è già
  imposto da `[CURRENT STEP FACTORS]`. Lasciare invariato (eventuale rifinitura testo
  prompt è lavoro DB separato).

---

## Test

[backend/tests/test_smoke.py](../../backend/tests/test_smoke.py) — eseguibile in container:
`docker exec counselorbot_backend python -m backend.tests.test_smoke`.

Aggiungere/aggiornare:
- unit `_step_allows_practical_advice` (factor/qsar-factor → False; second-level/generic
  e varianti qsar → True; intro → False).
- envelope `factor`: **assenza** di `[CERTIFIED ADVICE]`, di "Practical advice must
  focus", della heading rule; **presenza** delle righe banda risolte.
- envelope `second-level`: presenza dei blocchi consiglio (regressione P0.1).
- scope: esattamente un blocco di scope quando `allowed_codes` valorizzato (no
  `[CURRENT FACTOR SCOPE]` + sì `[CURRENT STEP FACTORS]`); ramo generico invariato.
- heading rule presente una sola volta negli step advice.
- certified-advice: ramo "no certified item" cita il fallback supporto approvato.

## Validazione manuale

1. Ricostruire gli envelope dei 10 step via prompt-audit (matrix o `/live`) con gli
   stessi punteggi della prova e ri-verificare a vista che P0/P1 siano spariti.
2. Confronto rapido con i dump di riferimento di questa sessione (in scratchpad) per
   i turni `cognitive`, `sl-elaboration`, `generic`.

## Rilascio

- Branch `fix/qsa-envelope-contradictions`.
- Codice **bakato** nell'immagine: `docker compose build backend && docker compose up -d backend`
  (le modifiche a `chat_logic.py`/`chat.py`/`prompt_audit.py` non hanno effetto senza
  rebuild+recreate del backend).
- Commit atomici: (a) refactor gating consigli P0.1/P0.2, (b) dedup direttive P1.x,
  (c) dedup retrieval P2.1, (d) test. Messaggi Conventional Commits.

## Origine evidenze

Tutte le citazioni vengono dagli envelope reali della sessione `c45071db`
(`logs.action='chat_message'`, `details.envelope.system_prompt_final`), leggibili con:
```python
# dentro counselorbot_backend
from backend.database import SessionLocal; from backend import models
db = SessionLocal()
rows = (db.query(models.Log)
        .filter(models.Log.action=='chat_message',
                models.Log.session_id.like('c45071db%'))
        .order_by(models.Log.timestamp.asc()).all())
```
