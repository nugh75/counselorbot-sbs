# Skills engine — design

Data: 2026-08-21
Branch: `feature/skills-engine`
Stato: approvato in brainstorming, pronto per il piano di implementazione

## 1. Problema

La logica che decide *quando* iniettare materiale nel prompt della chat counselor è
oggi hardcoded in Python, distribuita fra:

- `backend/chat_logic.py` (2192 righe): direttive per strumento costruite con regex e
  string surgery — `_apply_qsa_factor_directive`, `_annotate_qsa_factor_codes`,
  `_sanitize_qsa_inverted_wording`, `_apply_ztpi_step_profile_directive`,
  `_sanitize_ztpi_user_text`, `_apply_certified_advice_directive`,
  `_apply_scores_reference`, `_apply_current_step_factor_scope_directive`.
- `backend/certified_strategy_service.py`: gating delle strategie certificate con
  `_TARGET_BAND_PATTERNS`, `_SCORE_RE`, `_factor_tokens`, `_profile_alignment`.
- `backend/strategy_memory.py`: knowledge base Markdown, ranking keyword/embedding.

Conseguenze: aggiungere un comportamento per un nuovo strumento o un nuovo step
richiede una modifica di codice; l'admin non può comporre il flusso; il
comportamento non è ispezionabile dal pannello; `chat_logic.py` continua a crescere.

## 2. Obiettivo

Introdurre un **motore di skill**: unità dichiarative, editabili dall'admin,
condizionate al contesto del turno e agganciabili agli step del percorso guidato.

Il primo giro migra **solo il suggerimento di strategie** (certificate + approvate).
Le direttive per strumento e le sanitizzazioni testuali restano dove sono e
saranno migrate in giri successivi, dopo la validazione dell'architettura.

### Non obiettivi (questo giro)

- Migrare `_apply_*` / `_sanitize_*` di `chat_logic.py`.
- Esporre le skill come tool LLM (function calling).
- Skill che modificano la risposta del modello (post-processing).
- Skill create da utenti non admin.

## 3. Decisioni di architettura

| Decisione | Scelta | Motivo |
|---|---|---|
| Natura della skill | **Ibrida**: definizione dichiarativa in DB + `handler` Python opzionale | Il 90% dei casi è "quando iniettare questo testo"; il resto (parsing punteggi, retrieval) richiede codice |
| Selezione | **Regole deterministiche + router LLM sul residuo** | Le skill strutturali devono essere riproducibili; la scelta fra molte skill opzionali beneficia del contesto conversazionale |
| Ambito | **Pilota sulle strategie** | Valida l'architettura su un caso reale con rischio contenuto |
| Rollout | **Feature flag + test di parità golden** | I prompt sono in produzione e personalizzati in DB; serve rollback immediato |

Le regex non spariscono: si separano in due categorie.

- **Regex di policy** ("questa strategia vale solo per aree di crescita"): diventano
  `conditions` dichiarative, editabili dall'admin.
- **Regex di parsing** (`_SCORE_RE`, estrazione codici fattore, banding): restano
  codice Python dentro gli handler, dove sono testabili in isolamento.

## 4. Modello dati

Due tabelle nuove in `backend/models.py`. Nessun Alembic nel progetto: le tabelle
nascono da `models.Base.metadata.create_all` allo startup (`backend/main.py:135`).

### `Skill`

| Campo | Tipo | Note |
|---|---|---|
| `id` | Integer PK | |
| `slug` | String unique index | identificatore stabile, es. `certified-advice` |
| `name` | String | etichetta admin |
| `description` | Text | **letta dal router LLM**: descrive quando la skill è utile |
| `instructions_i18n` | JSON | contratto solo inglese: `{"en": "...markdown..."}` |
| `conditions` | JSON | gating dichiarativo, vedi §4.3 |
| `handler` | String nullable | nome whitelisted, es. `certified_strategies` |
| `handler_params` | JSON | es. `{"limit": 2}` |
| `routing` | String | `always` \| `optional` |
| `slot` | String | `section` \| `knowledge` \| `directive_tail` |
| `max_chars` | Integer | budget del blocco reso, default 1400 |
| `sort_order` | Integer | ordine dentro lo slot |
| `is_active` | Boolean | default `True` |
| `status` | String | `draft` \| `published`; solo `published` + `is_active` entra in chat |
| `created_at` / `updated_at` | DateTime | |

`instructions_i18n` conserva una forma JSON per compatibilità, ma accetta solo la
chiave `en`. La lingua dell'interfaccia e della risposta resta indipendente.

### `GuidedStepSkill`

| Campo | Tipo | Note |
|---|---|---|
| `id` | Integer PK | |
| `questionnaire_type` | String index | |
| `step_id` | String index | FK logica → `guided_steps.id` |
| `skill_id` | Integer index | FK logica → `skills.id` |
| `sort_order` | Integer | |
| `enabled` | Boolean | default `True` |
| `override_params` | JSON nullable | sovrascrive `handler_params` per questo step |

Vincolo di unicità applicativo su `(questionnaire_type, step_id, skill_id)`.

### 4.3 Formato `conditions`

Tutte le chiavi sono opzionali; assente = nessun vincolo. AND fra chiavi diverse,
OR dentro una lista.

```json
{
  "questionnaire_types": ["QSA", "QSAr"],
  "step_modes": ["second-level", "qsar-second-level", "generic", "factor-qa"],
  "step_ids": null,
  "factor_bands": {"any_of": ["growth"]},
  "min_salient_factors": 1,
  "languages": null,
  "requires_scores": true
}
```

Semantica:

- `questionnaire_types` — confronto case-insensitive su `SkillContext.questionnaire_type`.
- `step_modes` — confronto sul `system_prompt_mode` dello step corrente.
- `step_ids` — restringe a step specifici (raramente usato: l'aggancio esplicito
  via `GuidedStepSkill` copre già il caso).
- `factor_bands.any_of` — almeno un fattore saliente ricade in una di quelle bande
  (`growth` / `adequate` / `strength`), calcolate dai punteggi del contesto.
- `min_salient_factors` — numero minimo di codici fattore presenti nel contesto.
- `languages` — lingue ammesse.
- `requires_scores` — la skill si attiva solo se il turno ha punteggi disponibili.

Una condizione non riconosciuta **non** attiva la skill e produce un warning nei
log: fallire chiuso evita che un errore di battitura dell'admin inietti materiale
in tutti i turni.

## 5. Motore

Nuovo package `backend/skills/`.

```
backend/skills/
  __init__.py      # export pubblico: run_skills, SkillContext
  context.py       # SkillContext, SkillOutput
  registry.py      # caricamento skill pubblicate + agganci step
  conditions.py    # valutatore dichiarativo
  handlers.py      # registry @handler + implementazioni
  router.py        # filtro → always → router LLM sul residuo
  engine.py        # esecuzione, budget, rendering, logging
```

### 5.1 `SkillContext`

Dataclass immutabile costruita una volta per turno da `chat_logic`:

```python
@dataclass(frozen=True)
class SkillContext:
    db: Session
    ai_service: Any
    questionnaire_type: str
    step_id: str | None
    step_mode: str | None
    language: str
    query: str                    # step label + prompt + messaggio + punteggi
    message: str                  # solo il messaggio dello studente (per il router)
    scores_context: str           # già scope-ato ai codici della fase
    salient_factors: frozenset[str]
    score_bands: Mapping[str, str]   # {"C6": "growth", ...}
    component_flags: Mapping[str, Any]
    handler_options: Mapping[str, Any]  # certified_strategy_limit, allowed_strategies
```

`salient_factors` e `score_bands` sono calcolati una sola volta riusando la logica
già esistente in `certified_strategy_service` (`_factor_tokens`, `_score_bands`),
estratta in `backend/skills/handlers.py` come funzioni pure e importata dal
servizio originale per non duplicarla.

### 5.2 `SkillOutput`

```python
@dataclass
class SkillOutput:
    text: str            # blocco già reso, pronto per l'envelope
    ids: list[str]       # identificatori del materiale usato (slug strategie)
    meta: dict           # diagnostica per i log
```

### 5.3 Handler

Registry a decoratore, whitelist esplicita: `Skill.handler` accetta solo nomi
registrati; un nome sconosciuto disattiva la skill e logga un errore.

```python
@handler("certified_strategies")
def certified_strategies(ctx: SkillContext, params: dict) -> SkillOutput: ...

@handler("approved_strategies")
def approved_strategies(ctx: SkillContext, params: dict) -> SkillOutput: ...
```

`params` è il merge, in ordine di precedenza crescente:
`Skill.handler_params` → `GuidedStepSkill.override_params` →
`ctx.handler_options` (le opzioni per step già esistenti, cioè
`certified_strategy_limit` e `allowed_strategies` da
`get_prompt_component_options`). Le opzioni per step vincono perché sono già oggi
la fonte di verità configurata dall'admin per quel passo.

Gli handler del pilota incapsulano le chiamate esistenti:

- `certified_strategies` → `certified_strategy_memory.retrieve(...)` +
  `_filter_allowed_strategy_entries` + `render_context(...)`, con `limit` da
  `params["limit"]` (default `_default_certified_strategy_limit(step_mode)`).
- `approved_strategies` → lettura di `Config[approved_strategies_markdown]` +
  `strategy_memory.retrieve(...)` + `_filter_allowed_strategy_entries` +
  `render_context(...)`.

Una skill senza `handler` è puramente testuale: rende esclusivamente
`instructions_i18n["en"]`.

Una skill con `handler` **e** istruzioni concatena istruzioni e output
dell'handler, nell'ordine: istruzioni, poi materiale.

### 5.4 Router

```
run_skills(ctx):
  candidate = [s for s in registry.for_step(ctx) if conditions.match(s, ctx)]
  always    = [s for s in candidate if s.routing == "always"]
  optional  = [s for s in candidate if s.routing == "optional"]
  if len(optional) > threshold:
      chosen = llm_route(optional, ctx)     # timeout, fallback embedding
  else:
      chosen = optional
  return engine.render(always + chosen, ctx)
```

`llm_route` costruisce un prompt minimo — slug + `description` di ogni candidata,
messaggio dello studente, step corrente — e chiede un array JSON di slug, al
massimo `K = threshold`. Vincoli:

- timeout `skills_router_timeout_s` (default 6s);
- qualunque errore, timeout o output non parsabile ⇒ **fallback deterministico**:
  ranking con `memory_embedder.rank` sulle `description`, troncato a `K`; se anche
  quello fallisce, si prendono le prime `K` per `sort_order`;
- il router non solleva mai eccezioni verso il turno di chat;
- gli slug non presenti fra le candidate vengono scartati.

Modello: `skills_router_model` se valorizzato, altrimenti il modello corrente.

### 5.5 Budget

Ogni skill è troncata a `max_chars`. La somma dei blocchi è troncata a
`skills_total_max_chars` (default 3000) rispettando l'ordine: le skill `always`
hanno precedenza sulle `optional`, poi vale `sort_order`. Il troncamento avviene
a confine di riga, mai a metà parola.

## 6. Integrazione nell'envelope

Punto di innesto unico: `_retrieved_context()` in `backend/chat_logic.py`, che oggi
compone le sezioni in quest'ordine:

```
graph_context, counselorbot_context, questionari_context,
strategy_context, certified_context, learned_context
```

Con il motore attivo, `strategy_context` e `certified_context` non vengono più
calcolati inline: provengono dallo slot `knowledge` del motore, e i seed hanno
`sort_order` tali da riprodurre esattamente quell'ordine.

La firma di ritorno resta `(text, strategy_ids, certified_ids)`: gli `ids` arrivano
da `SkillOutput.ids`, così il logging e il feedback sulle risposte non cambiano.

Lo slot `section` viene appeso al system prompt in `build_context_envelope` subito
dopo `[META SYSTEM PROMPT]`; `directive_tail` in coda a `parts_system`. Nel pilota
nessuna skill usa questi due slot: sono predisposti per le fasi successive e
coperti da test unitari.

### Precedenza dei flag

L'ordine di spegnimento resta invariato e precede il motore:

1. `component_flags["knowledge"]` — spegne tutto il blocco.
2. `component_flags["certified_strategies"]` / `["approved_strategies"]` — spengono
   la skill corrispondente (mappatura esplicita slug → flag, in `registry.py`).
3. `component_flags["allowed_strategies"]` — whitelist per step, applicata dentro
   l'handler come oggi.
4. `conditions` della skill.
5. Router.

## 7. Configurazione

Nuove chiavi in `backend/prompt_config.py`, seed non distruttivo come le altre:

| Chiave | Default | Effetto |
|---|---|---|
| `skills_engine_enabled` | `false` | interruttore globale |
| `skills_engine_instruments` | `[]` | lista strumenti su cui il motore è attivo |
| `skills_router_threshold` | `3` | oltre questo numero di candidate `optional` interviene il router |
| `skills_router_model` | `""` | vuoto = modello corrente |
| `skills_router_timeout_s` | `6` | timeout della chiamata di routing |
| `skills_total_max_chars` | `3000` | tetto complessivo dei blocchi skill |

Il motore è attivo per un turno solo se `skills_engine_enabled` è vero **e** lo
strumento è in `skills_engine_instruments`.

## 8. Seed

`backend/skills_seed.py`, invocato allo startup dopo il seed degli step. Append-only:
crea le righe mancanti per `slug`, non sovrascrive mai record esistenti (stessa
regola già adottata per i prompt degli step, personalizzati in DB).

| slug | handler | routing | slot | sort_order | conditions |
|---|---|---|---|---|---|
| `approved-strategies` | `approved_strategies` | `optional` | `knowledge` | 40 | `{}` |
| `certified-advice` | `certified_strategies` | `optional` | `knowledge` | 50 | `{}` |

**Le condizioni dei seed sono vuote di proposito.** Oggi il retrieval delle
strategie certificate non è gated da `step_mode` né dalla banda del fattore a
livello di `_retrieved_context`: il gating vive dentro
`certified_strategy_memory.retrieve` (`_factors_satisfied`, `_profile_alignment`) e
resta lì, dentro l'handler. Aggiungere condizioni dichiarative al seed
cambierebbe il comportamento e farebbe fallire il test di parità.

Il motore quindi **abilita** il gating dichiarativo senza applicarlo: l'admin può
aggiungere condizioni dalla UI quando vuole restringere una skill, e la preview
mostra l'effetto prima di salvare. Le condizioni sono esercitate dai test unitari
e da skill di prova, non dai seed.

Gli agganci `GuidedStepSkill` di default vengono generati per ogni step esistente
che oggi riceverebbe quel materiale, così che ad attivazione avvenuta il
comportamento coincida con l'attuale.

## 9. API

`backend/routes/skills.py`, montato in `backend/routes/__init__.py`, protetto come
le altre rotte admin.

| Metodo | Path | Scopo |
|---|---|---|
| GET | `/admin/skills` | elenco con filtri `status`, `questionnaire_type` |
| POST | `/admin/skills` | creazione |
| PUT | `/admin/skills/{id}` | modifica |
| DELETE | `/admin/skills/{id}` | eliminazione (rifiutata se agganciata a step: prima si sganciano) |
| GET | `/admin/skills/handlers` | elenco degli handler whitelisted, per la select della UI |
| GET | `/admin/skills/step-map` | matrice step × skill per uno strumento |
| PUT | `/admin/skills/step-map` | salvataggio della matrice |
| POST | `/admin/skills/preview` | dato `{questionnaire_type, step_id, language, scores_context, message}` restituisce le skill attivate, il motivo di ciascuna esclusione e il testo reso |

`preview` è lo strumento diagnostico principale: rende ispezionabile dal pannello
la decisione del motore, router incluso.

## 10. UI admin

`frontend/src/components/admin/SkillsPanel.tsx`, nuovo tab in
`frontend/src/app/admin/page.tsx` (250 righe, pattern a pannelli già consolidato).

Contenuto:

- lista skill con stato, routing, slot, strumenti;
- editor: nome, description, istruzioni Markdown per lingua, select handler,
  parametri JSON, form condizioni (multi-select strumenti / step_modes / bande),
  `max_chars`, `sort_order`, `status`;
- matrice step × skill per strumento, con toggle e riordino;
- pannello preview che chiama `POST /admin/skills/preview`;
- interruttori globali (`skills_engine_enabled`, strumenti attivi) esposti come le
  altre config.

## 11. Test

Su Postgres `counselorbot_test`, come il resto della suite.

- `backend/tests/test_skills_conditions.py` — valutatore: ogni chiave di
  `conditions`, combinazioni AND/OR, chiave sconosciuta ⇒ non attiva + warning.
- `backend/tests/test_skills_router.py` — sotto soglia nessuna chiamata LLM;
  sopra soglia il router è invocato; timeout / JSON invalido / slug inventati ⇒
  fallback deterministico; il router non propaga mai eccezioni.
- `backend/tests/test_skills_parity.py` — parità motore acceso / motore spento:
  1. stesso turno eseguito con flag off e con flag on ⇒ stesso testo e stessi
     `ids` (equivalenza on/off, non snapshot committati: il ramo off resta il
     codice attuale intatto, quindi l'uguaglianza on/off dà la parità con il
     comportamento pre-modifica senza golden da manutenere);
  2. flag on per uno strumento non in lista ⇒ motore inattivo;
  3. flag on con un aggancio disattivato ⇒ diff limitato a quel blocco.
- `backend/tests/test_skills_engine.py` — budget e troncamento, precedenza
  `always` su `optional`, skill senza handler, handler sconosciuto.
- `backend/tests/test_smoke.py` — esteso con l'endpoint `/admin/skills`.

## 12. Fasi di implementazione

Una fase per commit, sul branch `feature/skills-engine`.

1. **Modello e motore** — tabelle, `backend/skills/*`, condizioni, budget, test
   unitari. Flag off: nessun cambiamento di comportamento.
2. **Handler strategie e seed** — i due handler, `skills_seed.py`, agganci di
   default, test di parità golden.
3. **Router** — router LLM, soglia, timeout, fallback, test.
4. **API e UI admin** — rotte, `SkillsPanel`, preview.
5. **Attivazione** — abilitazione per strumento, verifica sui prompt reali,
   documentazione in `CONTEXT.md`.

## 13. Rischi e mitigazioni

| Rischio | Mitigazione |
|---|---|
| Nessun Alembic: le tabelle nascono allo startup | Backup del DB prima del deploy; le tabelle sono nuove, nessuna migrazione distruttiva |
| Regressione sui prompt in produzione | Flag off di default, attivazione per strumento, test di parità golden |
| Il router aggiunge latenza e costo | Interviene solo oltre soglia, con timeout e fallback deterministico; conteggiato nei log come le altre chiamate |
| Envelope già lungo | `max_chars` per skill + `skills_total_max_chars` complessivo |
| Il seed sovrascrive personalizzazioni admin | Seed append-only per `slug`, mai update |
| Condizioni admin scritte male | Fallire chiuso: condizione non riconosciuta ⇒ skill non attiva, warning nei log, visibile nella preview |

## 14. Verifiche prima del merge

- `docker compose up -d --build` (backend e frontend cambiano entrambi).
- `docker exec counselorbot_backend python -m backend.tests.test_smoke`.
- Suite skill completa.
- Preview dal pannello su QSA e QSAr con un profilo reale.
- `CONTEXT.md` aggiornato: nuove tabelle, nuove config, nuovo package.
