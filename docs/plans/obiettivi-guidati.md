# Percorsi guidati «Obiettivi di apprendimento» — piano di implementazione

Stato: proposta approvata (decisioni del 2026-02, vedi sotto). Branch previsto:
`feature/obiettivi-guidati`. Nessuna modifica al codice finché il piano non è confermato.

## Decisioni prese

1. **Due strumenti separati**, una sola specifica di step con placeholder `{domain}`:
   - `OBIETTIVO_STUDIO` — «Il mio obiettivo di apprendimento» (studente/adulto in formazione)
   - `OBIETTIVO_DOCENZA` — «Obiettivi per la mia classe» (docente che progetta obiettivi didattici)
2. **Entrambi hanno anche una versione essenziale** (sintetica), sul modello del percorso
   essenziale QSA: scelta prima dell'avvio, percorso completo preselezionato.
3. **Il docente accede alla sua parte da `/docente`**: nuovo punto di ingresso che apre
   la chat guidata con `OBIETTIVO_DOCENZA`.
4. **La sintesi propone la pubblicazione**: al termine, il docente riceve l'offerta di
   pubblicare l'obiettivo nel proprio Catalogo obiettivi (`goal_catalog`, visibile ai
   gruppi gestiti) o di assegnarlo a un gruppo/partecipante; lo studente riceve la
   scheda obiettivo precompilata per gli Obiettivi personali (`/profilo/obiettivi`).
5. Nomi visibili confermati. Versione essenziale etichettata «Versione essenziale».

## Base di letteratura (nei prompt di step, citabile dal counselor)

| Riferimento | Dove entra |
|---|---|
| Bloom (1956) + Anderson & Krathwohl (2001), tassonomia rivista | step «livello»: verbi concreti per livello; non fermarsi a ricordare se si può applicare |
| Doran (1981), SMART | step di verifica dell'obiettivo, un punto alla volta |
| Locke & Latham (1990, 2002), specificità e sfida | step «sfida»: niente «fai del tuo meglio» |
| Dweck (1986), obiettivi di apprendimento vs prestazione | riformulazione («prendere 30» → «saper spiegare X») |
| Zimmerman (2000), apprendimento autoregolato | struttura complessiva: previsione → azione → auto-riflessione |
| Gollwitzer (1999), intenzioni implementative se-allora | step «piano» |
| Oettingen, WOOP (contrasto mentale con ostacoli) | step «piano», variante leggera |
| Biggs (1996), allineamento costruttivo + Wiggins & McTighe backward design | variante docente: allineamento attività/valutazione all'obiettivo |

## Struttura dei percorsi

### Percorso completo (9 step, una spec, `{domain}`)

| # | id suffix | Etichetta | Contenuto |
|---|---|---|---|
| 1 | intro | Presentazione | cosa fa il percorso, durata orientativa, dove finirà l'obiettivo (Obiettivi personali / catalogo docente) |
| 2 | patto | Accordo | adesione scritta libera, avanza senza chiamata AI (pattern evento) |
| 3 | partenza | Da dove parto | il counselor legge il contesto disponibile (Taccuino, obiettivi attivi, profilo QSA se presente) e fa scegliere l'AREA dell'obiettivo |
| 4 | livello | Cosa voglio saper fare | livello Bloom con verbi concreti; verifica che il livello non sia scelto per abitudine |
| 5 | smart | Alla prova SMART | specifico, misurabile, raggiungibile, rilevante, temporizzato — un punto alla volta, riformulazione condivisa |
| 6 | sfida | Specifico e sfidante | sfida senza vaghezza; obiettivo di apprendimento, non di prestazione |
| 7 | piano | Come ci arrivo | sotto-obiettivi, piani se-allora, ostacoli previsti (WOOP), strategie certificate QSA collegate |
| 8 | verifica | Come saprò di esserci riuscito | indicatori, prove, data di revisione |
| 9 | sintesi | Sintesi | riepilogo + blocco privato ```goal``` → scheda precompilata, salvataggio solo su conferma |

### Versione essenziale (4 fasi virtuali, una risposta del counselor ciascuna, il client avanza)

- `…-essential-focus` — area + livello Bloom (una domanda concentrata)
- `…-essential-smart` — verifica SMART + sfida in un solo giro
- `…-essential-plan` — piano se-allora + indicatore di verifica
- `…-essential-summary` — sintesi con blocco ```goal```

Il docente riceve le stesse fasi con contenuto progettuale (livello per la classe,
allineamento attività/valutazione al posto del piano personale).

### Differenze docente (placeholder `{domain}` + due step riscritti)

- step 4: livello Bloom **per la classe/attività**, formulato come obiettivo didattico;
- step 7: **allineamento** (Biggs/backward design): attività e valutazione coerenti con
  l'obiettivo dichiarato, prima della valutazione, non dopo;
- sintesi: oltre alla bozza, **proposta di pubblicazione** nel catalogo/assegnazione.

## Prodotto finale

- **Studente**: card `GoalDraftCard` (modello `EventBookletCard`) con motivazione,
  criterio, priorità, data di revisione precompilati → form obiettivo esistente in
  `/profilo/obiettivi`; salvataggio solo su conferma esplicita.
- **Docente**: stessa card più azione «Pubblica/assegna» che precompila la creazione in
  `goal_catalog` (o assegnazione a gruppo) — sempre conferma esplicita, mai automatica.

## Toccate tecniche (additive, pattern EVENTO)

Backend:
- `prompt_config.py`: `_OBIETTIVO_STEP_SPECS`, `_obiettivo_guided_steps()`,
  `DEFAULT_OBIETTIVO_*_GUIDED_STEPS`, intro system prompt per i due codici,
  testi statici questions-intro/conclusion, definizioni in
  `GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS` / `GUIDED_STATIC_TEXT_DEFINITIONS`.
- `backend/prompts/obiettivo_step_*.md` + `obiettivo_intro_flow.md` (seguono il modello
  `evento_*`; `{domain}` = studio / docenza).
- Estensione del percorso essenziale: `chat_logic.py` generalizza la validazione di
  `guided_path=essential` oltre a QSA (fasi virtuali per i due nuovi codici);
  `guided_path` resta `complete | essential`, 422 per combinazioni incompatibili.
- Nuovo `backend/goal_draft.py` (modello `event_booklet.py`): estrazione blocco
  ```goal```, campo `goal_draft` nella risposta di sintesi.
- Liste strumentali (tabella «Adding an instrument» del CONTEXT.md):
  `chat_logic._ensure_questionnaire_guided_steps`, `routes/memory.py:MEMORY_QUESTIONNAIRE_TYPES`,
  `schemas.py:FROZEN_SESSION_TYPES`, `skills_seed.py:ENGINE_INSTRUMENTS`,
  `orientation.py` (brief + catalogo + fallback offline), pannelli admin
  (`SkillsPanel`, `CounselorsPanel`, `LogViewer`, `PromptExportPanel`,
  `routes/admin.py:_EXPORT_INSTRUMENT_ORDER`), migrazione counselor-scope
  `counselor_scope_event_paths_v1` → analogo `…_obiettivi_v1` (una tantum, additive).
- Contesto: il counselor di `OBIETTIVO_STUDIO` riceve già `goals_context` +
  `_learner_profile_context` (canale esistente); nessun nuovo canale dati.

Frontend:
- `lib/questionnaires.ts` (`QuestionnaireType`, `QUESTIONNAIRES`),
  `QuestionnaireSelector.tsx` (`ACTIVE_QUESTIONNAIRES`), `page.tsx`
  (`STARTABLE_QUESTIONNAIRES`), `ReturningHome.tsx`, `app/strumenti/[id]/page.tsx`
  (`AVAILABLE_INSTRUMENTS`) — per `OBIETTIVO_STUDIO`.
- `/docente`: nuova sezione/card «Progetta obiettivi per la tua classe» che apre la
  chat guidata con `OBIETTIVO_DOCENZA` (stesso flusso della chat guidata, già accessibile
  ai docenti come partecipanti).
- Selettore «Percorso completo / Versione essenziale» prima dell'avvio (pattern QSA).
- `GoalDraftCard` + precompilazione form obiettivo; per il docente anche azione
  «Pubblica/assegna» collegata alle API catalogo/assegnazioni esistenti.
- Label i18n step in sei lingue via `guided_step_label_i18n`; UI in sei lingue.

Non toccato: Telegram (web only, come EVENTO), tabelle DB nuove (nessuna),
punteggi (non ci sono), QSA-first routing della Bussola.

## Test e verifica

- Backend: estendere `test_smoke.test_every_gate_that_would_silently_exclude_idea_lets_it_through`
  ai due nuovi codici; test estrazione blocco ```goal``` (ben formato, mancante, malformato);
  test validazione `guided_path=essential` per i nuovi codici e 422 per combinazioni
  errate; test precompilazione card (ownership, revision).
- Frontend: test librerie + TypeScript + ESLint sui file toccati; controllo traduzioni
  sei lingue; prova browser del selettore essenziale/completo e della card
  (pattern `frontend/tests/` esistenti).
- Esecuzione: `docker exec counselorbot_backend python -m backend.tests.test_smoke`,
  `cd frontend && npm run test` (target specifici), `docker compose up -d --build backend frontend`.
- Prova live con modello e dati sintetici su entrambi i percorsi (completo + essenziale,
  studente + docente), come da prassi delle ultime funzioni.

## Aperti (decidere in implementazione)

- Etichette esatte dei 9 step in italiano (bozza nella tabella sopra).
- Se la pubblicazione docente precompila solo il catalogo oppure offre anche
  l'assegnazione diretta nello stesso flusso (proposta: entrambe, scelta esplicita).
