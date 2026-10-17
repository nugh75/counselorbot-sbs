# Audit architetturale: CounselorBot come facilitatore metacognitivo

Data: 2026-10-17 · Branch: `docs/audit-metacognitive-facilitator` · Base: `main` @ `0d953472`

Solo studio. Nessun prompt di produzione, nessun file backend o frontend modificato.

---

## 0. Sintesi in dieci righe

1. **L'infrastruttura c'è già, la pedagogia no.** Contratto di turno in codice, ledger di sessione, guardiano del filo, evidenza di percorso e registro delle domande coprono già continuità e attribuzione. Manca un oggetto che oggi il sistema non sa nominare: **l'ipotesi interpretativa e il suo destino** (proposta → confermata / corretta / rifiutata).
2. **I questionari arrivano prima dell'esperienza.** Gli step QSA, QSAr, ZTPI e QPCS (profilo) aprono con la lettura dei punteggi e chiudono con *una* domanda. Il questionario fa da copione, non da lente.
3. **La profondità si misura in turni.** Gli step d'intervista (Savickas, QPCC, QAP, Evento, in parte QPCS) fissano «una domanda principale e al massimo due follow-up, poi mini-sintesi e `[[AVANZA_STEP]]`». È la regola rigida che la visione vuole superare.
4. **La trappola aneddotica è scritta nei prompt.** `[SECOND-LEVEL METHOD]` chiede «*when it shows up*»; QPCS chiede «*a real, recent situation*»; il caso di calibrazione «buono» del Prompt Lab chiede «*un momento recente in cui l'hai sentita*». Tutte e tre orientano alla cronaca, non alla scelta e alle sue conseguenze.
5. **Contro la cerimoniosità ci sono solo divieti.** `[ORIENTATION]` vieta le aperture rituali ma non dice quale mossa le sostituisce. In più gli step ZTPI chiedono un «*practical comment*» per ogni fattore, e i flussi di benvenuto chiedono «*warmly*» e «*reassure*».
6. **Il value-check esplicito è vietato proprio dove serve.** `[SECOND-LEVEL METHOD]` dice «*Do not ask the student to confirm that the reading fits them*». Questo contraddice la condizione (c) della visione: l'ipotesi va proposta e poi verificata.
7. **Il punto di innesto principale è `prompt_contract.py`.** Il contratto è codice, raggiunge anche i prompt modificati dagli admin nel DB e tutti i livelli di contesto (CR), ed è già testato come invariante. Non va aggiunto un secondo contratto: va **evoluto `[SELF-QUESTIONING]`** in un contratto di facilitazione.
8. **Il tracciamento delle ipotesi può riusare il canale `notes`.** Basta un `kind: "hypothesis"` accanto a `question` e `advice` (validazione verbatim già presente), accoppiato in modo deterministico alla risposta successiva dello studente. Il guardiano la classifica in un secondo momento, se è acceso.
9. **I test attuali non vedono il dialogo.** Il Prompt Lab valuta un turno per volta (`Case`: «*a case is a turn, not a conversation*»), i benchmark QSA misurano velocità e numero di parole. Serve un harness multi-turn con studenti simulati e un giudice calibrato sui tre esempi della visione.
10. **Transizione in 6 fasi dietro un flag**, con l'envelope identico a oggi a flag spento: si allineano prima i testi in codice, poi i testi di fabbrica (via «Allinea prompt di fabbrica», che preserva i testi degli admin), e per ultimi i budget di profondità.

---

## 1. Perimetro e metodo

**File letti per intero:** `backend/prompt_contract.py`, `backend/chat_preparation.py`, `backend/session_ledger.py`, `backend/thread_guard.py`, `backend/journey_context.py`. Inoltre i prompt di sistema e di step in `backend/prompts/`, le definizioni degli step in `backend/prompt_config.py` (QSA, QSAr, ZTPI, Savickas, Evento, QPCS, QPCC, QAP), le direttive globali in `backend/chat_logic.py` (`_apply_global_directives`, `format_step_continuation_prompt`), il blocco note in `backend/recommendation_blocks.py`, la direttiva QPCC in `backend/qpcc.py`, `backend/prompt_factory_alignment.py`, `backend/prompt_lab/{contracts,evaluation}.py`, `BENCHMARK_QSA.md`, `docs/make-prompt-testing.md` e l'elenco dei test esistenti.

**Limiti, da tenere presenti nel leggere le conclusioni:**

- Ho letto i **testi di fabbrica**. In produzione i prompt di step e le direttive (`directive_conversation_quality` & co.) vivono nel DB e possono essere stati modificati dagli admin. Non ho interrogato il DB di produzione.
- **Non ho letto log reali di conversazione.** Gli esempi «prima» della §6 sono ricostruzioni plausibili di ciò che i prompt chiedono, non trascrizioni. Prima di chiudere la fase 1 vanno verificati su log anonimizzati (vedi §7.6).
- Non ho eseguito test né chiamate a modelli: è un audit documentale.

---

## 2. Diagnosi per componente

### 2.1 `prompt_contract.py`: il contratto di turno

**Cosa fa oggi** (`turn_contract`, righe 245-300). Viene costruito in codice a ogni turno e accodato per ultimo all'envelope. Contiene:

- «*Answer the current request directly. Ask at most ONE focused question, then wait.*» (r. 253)
- «*distinguish what the student reported about themselves, your interpretations, and established facts. Label interpretations as hypotheses.*» (r. 254-256)
- il confine fra evidenza e istruzioni (r. 258-259)
- il permesso o divieto di consiglio
- le aggiunte di sintesi (proposte ≠ impegni)
- il contratto `[SELF-QUESTIONING]` per i 7 questionari (`QUESTIONNAIRE_DIALOGUES`, r. 8)
- `[OBJECTIVE FOCUS]` per Obiettivo

**`_self_questioning_contract` (r. 11-76)** è il pezzo più vicino alla visione. Ha la frase «*explore an experience and the person's interpretation, then what they still want to understand… gradual possibilities across the dialogue, not a checklist*». Dice che una risposta breve chiede uno stimolo concreto e leggero, non nuove richieste di profondità. Dice «*Never treat silence, brevity or difficulty as consent*». Rispetta il cambio di tema. Sono già, in nuce, il principio 1 (gradualità), il principio 3 (monosillabo ≠ resistenza) e il principio 4 (non imporre).

**Cosa manca o devia rispetto alla visione:**

| # | Osservazione | Effetto atteso sul dialogo |
|---|---|---|
| C1 | Il **fine** del contratto è far formulare allo studente *una domanda per sé* («self-question»). È un prodotto metacognitivo legittimo, ma resta un **prodotto atteso**: il rischio è un nuovo «insight obbligatorio» spostato di un livello. | A fine area il bot tende a sollecitare la formulazione anche quando la conversazione è già arrivata altrove. |
| C2 | Non nomina l'**agire**: scelte, comportamenti, conseguenze. «*explore an experience*» lascia aperta la cronaca («quando», «com'era»). | Le domande di approfondimento scivolano sul tempo e sulla situazione. |
| C3 | «*Label interpretations as hypotheses*» (r. 255) prescrive **un'etichetta**, non **una mossa**: nessun obbligo di restituire l'ipotesi allo studente perché la riconosca, la corregga o la rifiuti. | Ipotesi formalmente marcate («potrebbe essere che…») ma usate come conclusioni nel turno dopo. |
| C4 | Nessuna nozione di **stato del filo**: introdotto / in approfondimento / ipotesi aperta / ipotesi risolta. Lo `stage` (`profile`, `area`, `synthesis`, `follow-up`) è il tipo di step, non il punto in cui è arrivata la comprensione. | Il contratto non può dire «approfondisci ancora» o «ora puoi proporre un collegamento». |
| C5 | Value-check: c'è solo il divieto implicito di pedanteria. Mancano il controllo silenzioso a ogni turno e la verifica esplicita negli snodi. | — |
| C6 | `[OBJECTIVE FOCUS]` (r. 100-192) dichiara «*not a self-reflection exercise*» e vieta le self-question. **Va rispettato**: Obiettivo non deve ricevere la macchina delle ipotesi. Contiene però già due pattern funzionali da riusare altrove: «*Repeat the whole objective only when it changes*» e «*never ask the person whether to go on*». | — |

**Vincoli che ogni modifica deve rispettare** (sono invarianti testate in `test_self_questioning.py` e `test_turn_contract_deferral.py`):

- una sola domanda principale;
- nessun nuovo step né turno obbligatorio, e le self-question non diventano mai prerequisito;
- i consigli restano governati da `advice_allowed`;
- il contratto è identico in chat, prompt-audit e varianti CR (`test_prompt_audit_and_runtime_share_the_same_contract`, `test_contract_reaches_existing_steps_and_all_context_levels`);
- gli altri strumenti non ricevono la strategia dei questionari (`test_other_tools_do_not_receive_the_questionnaire_strategy`);
- il percorso essenziale mantiene compiti fissi e una sintesi senza domande.

### 2.2 `chat_preparation.py`: come si assembla l'envelope

L'ordine effettivo del system prompt finale (`prepare_chat_turn`, r. 190-629):

```
system prompt di modo (DB/fabbrica)
 + direttive globali  [ORIENTATION] [CONTEXT] [LANGUAGE] [REGISTER] [THINKING] (+affirmative) [PLATFORM CAPABILITIES]   ← chat_logic.py:477-576
 + lunghezza risposta, variante Idea
 + (step di analisi) [FACTOR …] scope fattori, [CURRENT STEP SCORE PROFILE] (+ eventuale direttiva consiglio)
 + direttiva raccomandazioni + [SESSION NOTES] + contesto raccomandazioni di sessione
 → build_context_envelope: [PERSONA] [SECTION/step mandate] [STUDENT] [PROFILE] [META] [KNOWLEDGE]
 + [JOURNEY EVIDENCE] + [PERSPECTIVE]          solo sintesi              (r. 446-474)
 + [SESSION LEDGER]                             solo ingresso step        (r. 475-495)
 + [THREAD]                                     solo turni in-step, se il guardiano ha note (r. 496-500)
 + [TURN CONTRACT] (+[SELF-QUESTIONING] / [OBJECTIVE FOCUS])               (r. 517-528)
 + [CANONICAL QPCC CONTRACT]                    solo QPCC
 + direttiva percorso essenziale, formato risposta
MESSAGES = history verbatim (12 turni / 6000 caratteri) + messaggio (punteggi dello step + messaggio o step prompt)
```

**Osservazioni:**

- **P1 — L'ultima parola è del contratto.** Arriva dopo tutto, quindi è il punto più forte per i modelli piccoli, che pesano molto le istruzioni finali. È anche l'unico blocco che **non passa dal DB** e raggiunge testi di step e di sistema già personalizzati dagli admin. È questo il motivo per cui il contratto è il punto di innesto principale.
- **P2 — All'ingresso dello step il messaggio dell'utente è lo step prompt.** Con `use_phase_prompt` il «messaggio» è l'istruzione dello step (es. «*Analyse only the cognitive factors of my QSA profile…*»): il modello riceve un ordine di **analisi del profilo**, non la parola dello studente. Il primo turno di ogni area è quindi strutturalmente *profile-first* (§2.6).
- **P3 — Il ledger c'è solo all'ingresso dello step.** È una scelta voluta (r. 475-479): a metà step la storia verbatim basta e un blocco ripetuto peserebbe. Per le ipotesi però non basta: un'ipotesi proposta al turno 3 di uno step e discussa al turno 5 deve restare visibile anche in-step, altrimenti la finestra di 12 turni la perde nei percorsi lunghi. Serve un blocco minimo che compaia **solo quando esiste un'ipotesi aperta** (§4.4).
- **P4 — Lo `reflection_stage` (r. 503-516) deriva dal tipo di step, non dallo stato del filo.** È il punto dove va calcolato e passato al contratto il nuovo `thread_state` (§4.3).
- **P5 — Il guardiano arriva in ritardo di un turno** (r. 445): legge il verdetto sullo scambio appena chiuso, se è pronto. Qualunque informazione che deve valere **già al turno successivo** (es. «lo studente ha appena rifiutato l'ipotesi») non può dipendere solo da lui. Va ricavata in modo deterministico dalla risposta dello studente (§4.3).

### 2.3 `session_ledger.py`: la memoria oltre la finestra

**Cosa conserva:**

- fino a 6 risposte dello studente: le 2 più recenti più le 4 più lunghe (`_answers`, r. 217-239), con lo step di provenienza;
- le azioni scelte e non verificate, e quelle rifiutate;
- l'azione proposta in prosa e mai ripresa (`_proposed_action`);
- le domande riflessive del counselor divise per destino (`open`, `answered_in_talk`, `left_behind`), lette dal registro `RecommendationHistory` con `kind == "question"`;
- lo step già percorso (`replayed_step`) e le note del guardiano.

Tutto è deterministico, in sola lettura, senza chiamate a modelli, e degrada a blocco vuoto. Le direttive (`_directives`, r. 180-214) compaiono solo quando c'è materiale.

**Rispetto ai quattro stati richiesti dalla visione:**

| Stato | Il sistema oggi lo sa? | Dove / perché no |
|---|---|---|
| a) argomento appena introdotto | **In parte.** Lo step corrente e il turno sono noti (`row.phase`, `turn_index`); un tema portato dallo studente dentro lo step no. | `Log.phase`, `retire_stale_questions` |
| b) comportamenti/scelte in approfondimento | **No.** Le risposte sono scelte per lunghezza («*a blunt proxy for substance*», r. 224-226), non per contenuto: un racconto lungo di *quando* vince su una frase breve di *cosa faccio*. | `_answers` |
| c) ipotesi proposta dal bot | **No.** Il registro conosce `question` e `advice`. Un'ipotesi formulata come affermazione non viene registrata (`extract_notes` scarta le `question` senza «?» e non conosce altri tipi). | `recommendation_blocks.py:242-270` |
| d) ipotesi validata / corretta / rifiutata | **No.** Esiste il modello analogo per le domande (`closed_by="conversation"` scritto dal guardiano) e per le azioni (`selected` / `dismissed`), non per le interpretazioni. | `thread_guard._close_answered` |

**Il modello da replicare c'è già.** Le domande hanno un ciclo di vita (`proposed → closed / stale / revived`) che il ledger rende e la sidebar mostra. Le ipotesi sono la stessa cosa con un esito diverso. La proposta (§4.3) non apre una tabella: aggiunge un `kind` e due stati.

### 2.4 `thread_guard.py`: il giudice del filo

**Cosa fa.** Dopo il turno, in un thread separato, un modello scelto dall'admin (`thread_guard_preset_id`, temperatura 0, thinking spento, timeout 45 s) giudica **solo il counselor** su tre assi: `advice_grounded`, `on_thread`, `question_fit`. Indica anche quali domande aperte lo studente ha risposto parlando (`answered`). Le note sono fatti al passato, in inglese, filtrate contro imperativi e prescrizioni in sei lingue. Al massimo due note e 400 caratteri, deduplicate rispetto al turno precedente.

**È ben costruito per ciò che fa.** Il mandato non è un copione (r. 304-310): ha imparato a non punire chi risponde allo studente invece di eseguire lo step. Questa lezione vale doppio per la facilitazione.

**Limiti rispetto alla visione:**

- **G1 — È spento per default** (`enabled()` legge `thread_guard_enabled`, falso se assente) e richiede un preset. Nessuna funzione essenziale della facilitazione può dipendere da lui: va trattato come **arricchimento**.
- **G2 — Nessuno dei tre assi misura la qualità facilitativa:** cerimoniosità, ancoraggio all'agire, imposizione di etichette, ipotesi non verificata. Il modo più naturale di aggiungerli è uno o due assi nuovi (`hypothesis_offered_open`, `anchored_in_action`), sempre al passato e come fatti.
- **G3 — `answered` è il precedente esatto per le ipotesi:** indici sulla lista mostrata, chiusura prudente («*whenever you are unsure*»). Un campo `hypotheses: [{"index": 1, "outcome": "confirmed|corrected|rejected"}]` segue lo stesso schema e la stessa prudenza.
- **G4 — Il budget di input è stretto** (2500 caratteri, sezioni con tetti propri). Aggiungere la sezione «ipotesi aperte» costa circa 300 caratteri: va tolta al ledger del giudice (oggi 550), non aggiunta.

### 2.5 `journey_context.py`: l'evidenza per le sintesi

Ricostruisce il trascritto (solo lettura), lo spezza a 8000 caratteri e, se serve, lo riduce con note del modello. Le note preservano «*facts, examples, values, decisions and later corrections*» e distinguono proposte da accordi e rifiuti. Con `preserve_self_questions` tengono le self-question verbatim.

**Cosa manca:**

- **J1 — La riduzione non preserva le ipotesi e il loro esito.** Una sintesi che deve dire «avevamo pensato che X; tu hai corretto in Y» non trova questo materiale se il trascritto è stato ridotto. Serve un `preserve_hypotheses` gemello di `preserve_self_questions` (stessa forma, r. 53-58).
- **J2 — `[PERSPECTIVE]` (`chat_preparation.py:467-474`) impone un collegamento** («*Take ONE thread… and connect it to the current goal in their Notebook and to what the Portfolio shows*»). C'è la clausola di uscita («*if nothing in the session touches it, say so*»), ma la richiesta principale chiede al modello di **costruire** un nesso al posto dello studente. In chiave facilitativa diventa: «*offer that connection as a question the student can take up or leave*».

### 2.6 Prompt di fabbrica: dove si annidano cerimoniosità e forzature

**Mappa per strumento** (fonte: `backend/prompts/*.md` e `prompt_config.py`; in produzione il testo vive in DB):

| Strumento | Prompt di sistema (modo) | Step | Avanzamento | Pattern problematici |
|---|---|---|---|---|
| **QSA** | `default_system_prompt_factor.md` (factor), `DEFAULT_SYSTEM_PROMPT_SECOND_LEVEL` + `default_second_level_method.md` + `default_factor_interplay_qsa.md` (second-level), `default_system_prompt_factor_qa.md` + `default_qa_depth_directive.md` (follow-up) | `qsa_step_*.md` | bottone | Step che iniziano dal profilo («*Analyse only the cognitive factors of my QSA profile*»). `[ANCHOR]`: una domanda in coda. **`[SECOND-LEVEL METHOD]`: «*when it shows up*» e «*Do not ask the student to confirm that the reading fits them*».** `[DEPTH ON REQUEST]`: «*ONE concrete school-life example consistent with the student's score band*» (l'esempio lo fornisce il bot, non lo studente). |
| **QSAr** | `default_system_prompt_qsar_factor.md`, second-level QSAr | `qsar-*` in `prompt_config.py:1715-1821`, meta `qsar_meta_*.md` | bottone | «*give the score, interpretation and a short practical comment*» (r. 1729, 1741). I meta invece sono già facilitativi: «*Invite the student to verify interpretations against their own examples*», «*These are hypotheses supported or corrected by the student*». |
| **ZTPI** | `default_system_prompt_ztpi_factor.md`, `default_system_prompt_ztpi_btp.md`, meta `meta_ztpi_time_perspective.md` | `ztpi-t1…t5`, `ztpi-btp` (`prompt_config.py:1840-1940`) | bottone | **Ogni step fattore chiede «*what it means… and a (short) practical comment*»** (r. 1848-1912): consiglio implicito su ogni fattore, prima che lo studente abbia detto qualcosa. BTP: «*Use an empathetic and constructive tone*». Il meta è eccellente: «*which perspective is carrying the student, which one is doing another's work, and what that costs in practice*» è già una lente su scelte e conseguenze. |
| **QPCS** | `default_system_prompt_qpcs_analysis.md` | `qpcs-*` (`prompt_config.py:2301-2466`) | bottone + dichiarazione | «*ONE question connected to a real, recent situation*» (r. 2362, 2399, 2418). Ritmo fisso «*ask at most two or three questions in total… once you have enough, be PROACTIVE… offer a short, concrete reading*». Il punto 5 («*follow the student's lead… do NOT push them towards the next step*») è invece perfettamente allineato. |
| **QPCC** | `prompt_qpcc_interview.md` + `qpcc.directive()` (in codice) | `qpcc-*` (`prompt_config.py:2467+`) | `[[AVANZA_STEP]]` | «*Ask ONE open question and at most two follow-ups, request a concrete example, then a mini-summary and [[AVANZA_STEP]]*» (r. 2514). Lo stesso budget è ripetuto **tre volte**: prompt di sistema, direttiva canonica in codice, step. |
| **QAP** | `prompt_qap_interview.md` | `qap-*` (`prompt_config.py:2608+`) | `[[AVANZA_STEP]]` | «*at most two concrete follow-up micro-questions… When the area is covered (or you reach the follow-up limit) give a short mini-summary and… [[AVANZA_STEP]]*»; «*invite a real example*». |
| **Savickas** | `default_system_prompt_savickas_interview.md` | `savickas-*` (`prompt_config.py:1945-2060`) | `[[AVANZA_STEP]]` | «*one main question and at most two follow-ups*». Domande narrative fisse (sono il metodo di Savickas: vanno mantenute). «*Periodically restate briefly what has emerged to check understanding*». |
| **Evento** (studio/prof.) | `default_system_prompt_evento_interview.md`, meta `meta_evento_reflective_practice.md` | `evento_step_*.md` | `[[AVANZA_STEP]]` | Budget fisso come sopra. È **il più vicino alla visione**: fatti separati dal giudizio; `rilettura`: «*They choose the lens and do the interpreting: you do not supply the meaning*»; `prossima`: alternative «*as an option they can turn down*». Non è in `QUESTIONNAIRE_DIALOGUES`, quindi non riceve `[SELF-QUESTIONING]`. |
| **Obiettivo** (studio/docenza) | `default_system_prompt_obiettivo_interview.md` + `[OBJECTIVE FOCUS]` in codice | `obiettivo_step_*.md` | `[[AVANZA_STEP]]` | Fuori perimetro per scelta di design (costruisce un obiettivo, non è riflessione). Da toccare solo con i pattern anti-cerimonia. |
| **Benvenuti** | `score_based_intro_flow.md`, `savickas_intro_flow.md`, `evento_intro_flow.md`, `obiettivo_intro_flow.md` | `*_intro` | — | «*Introduce yourself warmly*», «*Reassure them…*». Al benvenuto il calore è legittimo; «reassure» genera spesso la formula vuota. Priorità bassa. |

**Direttive globali** (`chat_logic.py:550-559`, chiave DB `directive_conversation_quality`). `[ORIENTATION]` vieta «*I understand*», «*you are right*», «*of course*», la lode e l'incoraggiamento finale, e indica una mossa orientativa («*clarify the situation, a relevant criterion, realistic alternatives and consequences, or one concrete next action*»). È la direttiva più vicina al principio 2, ma: (i) l'elenco di divieti per parola è proprio la forma che la visione chiede di superare; (ii) la mossa sostitutiva è **orientativa e prescrittiva** («*next action*»), non **metacognitiva**. Manca la funzione che sostituisce il «Grazie per aver condiviso»: **riconoscere attraverso l'uso**, cioè riprendere le parole dello studente dentro la domanda successiva.

**Cinque famiglie di problemi, in ordine di impatto stimato:**

1. **Profile-first** (QSA, QSAr, ZTPI, profilo QPCS/QPCC). Il primo turno di ogni area spiega i punteggi e solo alla fine chiede. Lo studente risponde *al profilo*, non alla propria esperienza, e la lente diventa verdetto. *Rimedio:* non eliminare la lettura (è il compito dello step), ma **ridurla a ipotesi aperta** e chiudere con una domanda sull'agire che lo studente può usare per accoglierla o smontarla (§6).
2. **Budget di profondità in turni** (QPCC, QAP, Savickas, Evento; QPCS «*two or three questions in total*»). *Rimedio:* criterio di comprensione + tetto di sicurezza (§4.5).
3. **Trappola aneddotica** («*when it shows up*», «*real, recent situation*», «*request a concrete example*», calibrazione Prompt Lab). *Rimedio:* l'esempio concreto resta utile come *materiale*, ma la domanda deve vertere su **cosa fai / come scegli / che effetto ha**, non su *quando* e *com'era*.
4. **Consiglio implicito per fattore** (ZTPI e QSAr «*practical comment*»). Contraddice sia la visione sia il contratto (`advice_allowed` falso negli step interpretativi). Oggi è il contratto finale a vincere; la tensione resta e i modelli piccoli la risolvono a caso.
5. **Divieto del value-check** (`[SECOND-LEVEL METHOD]`). Nasce da un problema reale (il pedante «ti ritrovi in questa lettura?» a ogni step), ma butta via anche il controllo legittimo negli snodi.

### 2.7 Test e benchmark esistenti

- **Unità e contratti** (`test_self_questioning.py`, `test_session_ledger.py`, `test_thread_guard.py`, `test_turn_contract_deferral.py`): verificano che i blocchi giusti arrivino nell'envelope giusto. Non dicono nulla sul comportamento del modello.
- **Prompt Lab** (`backend/prompt_lab/`): esperimenti in cieco con giudice, controlli critici, calibrazione, gate di accettazione. È la base giusta, ma `Case` è un turno singolo con storia congelata («*the pilot cannot claim anything about a whole session*», `contracts.py:148`). Continuità, scavo verticale e destino delle ipotesi non si possono misurare così.
- **Il caso di calibrazione «buono» è da correggere** (`prompt_lab/evaluation.py:196-203`). Dice «*Il fattore A6 guarda quanto l'ansia si fa sentire*», ma A6 nel QSA è «*Percezione di competenza*» (`chat_logic.py:350`). Apre con «*Certo.*», che `[ORIENTATION]` vieta. Chiede «*un momento recente in cui l'hai sentita*», che è la trappola aneddotica. Un giudice calibrato su questo esempio impara a premiare esattamente ciò che la visione vuole eliminare.
- **Benchmark QSA** (`BENCHMARK_QSA.md`, `test_ollama_qsa_benchmark.py`, `test_openrouter_qsa_benchmark.py`): 8 step + 3 follow-up predefiniti, metriche di latenza e lunghezza (`MIN_WORDS`). Utili per la capacità dei modelli, non per la qualità dialogica.
- **`scripts/thread_guard_dry_run.py`**: lettura dei verdetti su sessioni reali senza scrivere. Il modello giusto per una revisione su log reali.

---

## 3. Il nodo centrale: rendere visibile lo stato del filo

La visione chiede che il bot sappia in quale di quattro condizioni si trova e che si comporti di conseguenza. Oggi il modello deve **ricavarlo dalla storia verbatim**, e la storia si tronca a 12 turni e 6000 caratteri. La proposta ricava tre stati su quattro da dati che già esistono e ne aggiunge uno solo.

| Stato | Come ricavarlo | Costo |
|---|---|---|
| **a) introdotto** | Primo turno dello step (`use_phase_prompt`), oppure primo turno in cui lo studente apre un tema (il guardiano lo sa già: `on_thread` con cambio tema seguito). | zero |
| **b) in approfondimento** | Turni dello studente nello step corrente (`Log.phase == step_id`) **senza** ipotesi aperta. | zero |
| **c) ipotesi proposta** | **Nuovo:** `notes[].kind == "hypothesis"` dichiarato dal modello nel blocco privato `recommendations`, validato verbatim come le domande. | una voce nel blocco privato |
| **d) ipotesi risolta** | **Deterministico:** il primo messaggio dello studente dopo l'ipotesi le viene accoppiato e reso accanto a lei («*the student replied: "…"*»). Il modello del turno successivo legge l'esito: non lo decide un classificatore. **Opzionale:** il guardiano classifica `confirmed / corrected / rejected` per la sidebar e la sintesi. | zero (+ guardiano se acceso) |

Questa scelta evita due errori: un classificatore che sbaglia e chiude un'ipotesi viva, e una dipendenza dal guardiano, che è spento per default. Lascia al modello conversazionale ciò che sa fare (leggere una risposta) e al codice ciò che deve garantire (che quella risposta non si perda).

---

## 4. Proposta architetturale

### 4.1 Principio: un solo contratto che governa le domande

Oggi `[SELF-QUESTIONING]` dichiara di governare «*question wording over generic retrospective or comparative closings*». Un secondo contratto `[FACILITATION]` accanto a lui produrrebbe due fonti che si contendono la formulazione delle domande. **Proposta:** evolvere `_self_questioning_contract` in `_facilitation_contract(stage, thread_state)`. Il blocco mantiene la propria sentinella (oppure una nuova `[FACILITATION]` che la sostituisce, con test aggiornati), lo stesso perimetro (`QUESTIONNAIRE_DIALOGUES`), la stessa mappa degli stage e le stesse invarianti. La self-question resta, ma **declassata da meta a possibilità** fra le altre.

### 4.2 Contenuto del contratto: funzioni comunicative, non divieti

Testo proposto, in inglese come gli altri contratti in codice (circa 1500 caratteri, da compensare: §4.7):

```text
[FACILITATION]
You facilitate the student's own inquiry; you do not explain them to themselves.
The questionnaire is a lens: a reading becomes meaningful only when the student
recognises it in what they actually do.

Replace these moves with their function:
- Instead of thanking or validating, show you heard by USING their words: pick up one
  phrase they wrote and build the next question on it.
- Instead of asking when or where something happens, ask what they DO about it, how
  they choose that way, and what that choice produces in their studying.
- Instead of stating what a score means for them, offer ONE reading as a hypothesis
  tied to something they said, and leave it to them to recognise, correct or reject it.
- Instead of switching to the next dimension, bridge: name the thread that leads there
  from what they just said.

Depth: stay with one experience until (a) a concrete way of acting has emerged,
(b) the student starts describing how it works for them, and (c) a link with the
lens can be offered. Then offer it once and ask whether it fits their experience.
Do not count turns; do not linger once (a)-(c) are met or the student moves on.

Before replying, silently check: does this reply build on what they said, add to
their understanding, and leave the interpretation to them? Ask openly only when you
offer a significant hypothesis, when what they said diverges from the profile, or
before a synthesis — never "is this useful?".
A short answer is not resistance or disinterest; do not name feelings they have not named.
Never turn a hypothesis into a label ("your problem is…"); a corrected or rejected
reading is replaced by theirs and not argued with.
```

Con, in coda, una riga per stato del filo (`thread_state`, calcolato in `chat_preparation`):

| `thread_state` | Riga aggiunta |
|---|---|
| `introduced` | «*The topic has just opened: explore what the student does, before any reading.*» |
| `exploring` | (nessuna: vale il testo base) |
| `hypothesis_open` | «*You offered a reading; it has not been answered yet. Do not add another.*» |
| `hypothesis_answered` | «*The student answered your reading (see REFLECTION THREAD). Take their version as the starting point; if they rejected it, drop it.*» |

Le righe per stato sono **fatti più un vincolo minimo**. È la stessa filosofia di `thread_guard`: il modello decide, il codice gli dice dove si trova.

**Lo stage `synthesis`** mantiene le regole attuali sulle self-question e aggiunge: «*Report readings with their outcome: the ones the student confirmed, the ones they corrected (in their version), and drop the ones they rejected.*»

### 4.3 Stato delle ipotesi: estensione del canale `notes`

**`recommendation_blocks.notes_directive`** (r. 219-239) accetta oggi `kind` `question` e `advice`. Va aggiunto `hypothesis`:

- una sola per turno, testo copiato verbatim dalla risposta visibile (stessa validazione di `extract_notes`, senza l'obbligo del «?»);
- campo opzionale `lens` (codice del fattore), validato contro i fattori dello step (`phase_codes`);
- consentito solo quando lo stage non è `synthesis` e lo strumento è in `QUESTIONNAIRE_DIALOGUES` o è Evento (step `rilettura`).

**Registro:** `RecommendationHistory` con `recommendation_type="advice"` e `payload.kind="hypothesis"`, come le domande, con stati `proposed → answered` (deterministico) e, se il guardiano è attivo, `outcome ∈ {confirmed, corrected, rejected}`. Nessuna tabella nuova e nessuna migrazione di schema: `payload` è JSON.

**Accoppiamento deterministico:** il turno successivo all'ipotesi scrive `payload.reply` (il `user_input` pulito, max 240 caratteri) e passa lo stato ad `answered`. Va fatto nello stesso punto in cui oggi si registrano le note del turno, nell'endpoint, non in `chat_preparation`, che è di sola lettura e condiviso con l'audit.

**Ledger:** nuova sezione nel `_compose` e nuova funzione `hypotheses(db, …)` gemella di `questions()`:

```text
Readings you offered in this session, with what the student replied:
- (sl-motivation) "Forse quando un compito ti sembra lungo rimandi l'inizio…" → replied: "non è che rimando, è che non so da dove partire"
```

con la direttiva: «*Use the student's reply as their version; never restate a reading they corrected or rejected.*»

**Blocco in-step `[REFLECTION THREAD]`.** È la versione minima della sezione sopra (≤ 500 caratteri, solo ipotesi dello step corrente), accodata **solo** sui turni in-step che hanno un'ipotesi aperta o appena risposta. Non duplica il ledger: all'ingresso dello step la stessa informazione viaggia dentro il ledger, come oggi le note del guardiano (`chat_preparation.py:442-500`).

**Guardiano (opzionale):**

- `Verdict.hypotheses: list[{"index": int, "outcome": str}]`, sullo stesso schema e con la stessa prudenza di `answered`: lista vuota nel dubbio;
- un nuovo asse `interpretation_open` (falso se il counselor ha dato una lettura come fatto, ha attribuito emozioni non nominate o ha riproposto un'ipotesi rifiutata), da inserire in `SEVERITY` dopo `advice_grounded`.

**Journey:** `journey_context(…, preserve_hypotheses=True)` con la regola gemella di `question_rule`: «*Preserve the counselor's readings and the student's response to each — confirmed, corrected in their own words, or rejected. Never present a rejected reading as agreed.*»

### 4.4 Ledger: dalla lunghezza all'agire (miglioramento minore)

`_answers` sceglie le risposte più lunghe. Senza introdurre parole chiave (scelta esplicita del modulo, per restare uguale in sei lingue), si può dare **priorità alle risposte che hanno ricevuto un'ipotesi** (`payload.reply`) e a quelle che rispondono a una domanda poi chiusa dal guardiano. Sono segnali strutturali, non lessicali. Priorità bassa.

### 4.5 Profondità: criterio di comprensione più tetto di sicurezza

Nei testi degli step d'intervista, la frase «*Ask ONE open question and at most two follow-ups… then a mini-summary and [[AVANZA_STEP]]*» diventa:

```text
Stay with this area while the student is developing it: ONE question per turn, aimed at
what they do, how they choose and what it produces. Close the area when a concrete way of
acting has emerged and they have answered one reading of it, when they ask to move on,
or after about five exchanges at most. Then give back what emerged in their words and
put only [[AVANZA_STEP]] on the last line.
```

- Il **tetto resta** ed è un limite, non un obiettivo: serve contro i loop dei modelli piccoli, che è il motivo per cui oggi esiste il budget. Il numero (5) va tarato coi test multi-turn (§7), non fissato a priori.
- `qpcc.directive()` (codice) ripete il budget: va allineata nello stesso passo, altrimenti il contratto canonico QPCC lo reimpone.
- Negli strumenti a bottone (QSA, QSAr, ZTPI, QPCS) non c'è marcatore: il cambiamento passa dal contratto (non spingere, chiudere con un ponte) e, all'ingresso dello step successivo, dal ledger (ponte dal filo precedente).

### 4.6 Ponte fra dimensioni

All'ingresso di uno step il ledger contiene già le parole dello studente. Basta una direttiva condizionale in `session_ledger._directives`, attiva solo se esiste almeno una risposta dello step precedente:

> «*Open this area from the thread the student left in the previous one: one sentence that connects what they said there to what this area looks at, then the reading.*»

Così il cambio di dimensione appare come «sviluppo naturale», senza toccare l'ordine degli step né lo step prompt. È la stessa logica di `replayed_step`.

### 4.7 Budget di token

Il contratto di facilitazione costa circa 1500 caratteri a turno sui 7 questionari. Per non far crescere l'envelope (vedi `docs/audits/2026-10-05-qsa-prompt-per-turn.md`) va **compensato togliendo ciò che diventa ridondante**:

- `[ANCHOR]` (tre prompt di sistema): la regola «una domanda in coda, variata» passa nel contratto;
- la seconda metà di `[SECOND-LEVEL METHOD]` (la domanda): resta solo la parte (1), l'ipotesi;
- le ripetizioni del budget QPCC (sistema + direttiva + step);
- la parte «*explore an experience… then…*» di `[SELF-QUESTIONING]`, assorbita.

Stima netta: tra 0 e +600 caratteri. Va misurata con `make prompt-dry` prima e dopo, per ogni strumento.

---

## 5. Piano di transizione

Ogni fase si chiude con un PR atomico (issue + milestone), test mirati verdi, e l'envelope a flag spento **identico a oggi** (test di regressione sull'output di `build_prompt_audit`).

| Fase | Cosa | File | Retrocompatibilità | Verifica |
|---|---|---|---|---|
| **0. Strumenti di misura** | Harness dialoghi multi-turn (§7) e correzione del caso di calibrazione «buono» del Prompt Lab. Baseline sul comportamento attuale. | nuovo `backend/dialogue_lab/` o `scripts/dialogue_eval.py`; `prompt_lab/evaluation.py:196-203` | Nessun effetto sul runtime. | Baseline registrata su ≥ 2 modelli × 12 scenari × 3 ripetizioni. |
| **1. Contratto** | `_facilitation_contract` che sostituisce `_self_questioning_contract`, dietro il flag Config `facilitation_contract_enabled` (default `false`). | `prompt_contract.py`, `chat_preparation.py` (lettura del flag, passaggio di `thread_state`) | Flag spento = stesso testo di oggi. Raggiunge anche i prompt modificati dagli admin. | Test esistenti del self-questioning adattati; nuovo test «flag off ⇒ envelope invariato»; harness: ceremony rate e ancoraggio all'agire vs baseline. |
| **2. Ipotesi** | `kind: "hypothesis"` nel blocco note, accoppiamento con la risposta, sezione ledger, blocco `[REFLECTION THREAD]`, `thread_state`. | `recommendation_blocks.py`, endpoint che registra le note, `session_ledger.py`, `chat_preparation.py` | Le voci `hypothesis` sono ignorate dalla sidebar finché il frontend non le mostra; nessuna migrazione. | Unit test su estrazione, accoppiamento, rendering, troncamento entro `MAX_BLOCK_CHARS`; harness: ipotesi riproposte dopo un rifiuto = 0. |
| **3. Testi in codice** | Rimozione di `[ANCHOR]` e ritocco di `[SECOND-LEVEL METHOD]`, `[DEPTH ON REQUEST]`, `[PERSPECTIVE]`, `qpcc.directive()`. | `prompts/default_*`, `chat_preparation.py:467-474`, `qpcc.py` | I testi `.md` sono default di fabbrica: in DB cambiano solo con l'allineamento (fase 4). Le sentinelle (`[SECOND-LEVEL METHOD]` & co.) restano, così le migrazioni in `main.py:1218-1346` non reinseriscono il vecchio testo. | Envelope prima/dopo con `make prompt-dry` per ogni strumento; misura dei caratteri. |
| **4. Testi di fabbrica degli step** | Riscrittura degli step QSA, QSAr, ZTPI e QPCS (profilo come ipotesi, domanda sull'agire, niente «*practical comment*», niente «*real, recent situation*»). | `prompt_config.py`, `prompts/qsa_step_*.md` | Hash dei testi attuali in `prompt_factory_legacy.json`; applicazione via «Allinea prompt di fabbrica», che **non tocca i testi degli admin** (`factory_owned`). Le varianti CR (Ristretto/Minimo) vanno riallineate a parte. | `test_preparation_preserves_all_guided_step_definitions`; harness per strumento. |
| **5. Profondità** | Budget → criterio + tetto negli step d'intervista (QPCC, QAP, Savickas, Evento) e nel prompt QPCS. | `prompt_config.py`, `prompts/prompt_q*_interview.md`, `default_system_prompt_{savickas,evento}_interview.md`, `default_system_prompt_qpcs_analysis.md` | Come la fase 4. Il tetto di sicurezza evita i loop. | Harness: distribuzione dei turni per area, avanzamenti prematuri, loop (area senza chiusura oltre il tetto) = 0. |
| **6. Guardiano e sintesi** | Asse `interpretation_open`, campo `hypotheses`, `preserve_hypotheses`; rilascio del flag a `true` dopo il gate. | `thread_guard.py`, `journey_context.py`, `chat_preparation.py:452-457` | Il guardiano resta opzionale; un verdetto senza i nuovi campi vale lista vuota (`extra="ignore"`). | `thread_guard_dry_run.py` su sessioni recenti, lettura umana; harness: esiti delle ipotesi nella sintesi. |

**Ordine motivato.** La misura prima del cambiamento (fase 0), altrimenti «funziona meglio» resta un'impressione. Il contratto prima dei testi di step, perché raggiunge anche le installazioni con prompt personalizzati e si spegne con un flag. I budget per ultimi, perché sono il cambiamento con il rischio di regressione più alto (loop, step che non si chiudono).

**Deploy.** Le fasi 3-5 cambiano testi di fabbrica: dopo il merge l'agente di deploy esegue «Allinea prompt di fabbrica» (memoria di progetto). Nessun passo sudo previsto.

---

## 6. Esempi prima/dopo

Gli esempi «prima» sono **ricostruiti** da ciò che i prompt attuali chiedono, non presi da log. Servono a mostrare la funzione comunicativa, non a documentare un difetto osservato.

### 6.1 QSA, step `sl-motivation` (A2 volizione, A5 mancanza di perseveranza, A6 percezione di competenza)

Profilo simulato: A2 6/9, A5 6/9 (invertito: area di crescita), A6 4/9.

**Testo dello step, prima** (`qsa_step_sl_motivation.md`):
> *Second-level analysis of motivation and will: A2, A5, A6. Explain how these factors interact… If A6 is weak, explain how low perceived competence may reduce continuity and effort… Check whether the profile respects or breaks this symmetry and comment on what it means for the student.*

**Testo dello step, dopo:**
> *Second-level reading of motivation and will: A2, A5, A6. Read how these factors may interact in sustaining effort, as ONE hypothesis about how this student keeps going or stops — respect the inverted direction of A5, and if A2 and A5 break their usual symmetry, say so as something worth checking, not as a verdict. If the student has already said something about effort or giving up, start from their words. Close by asking what they actually do when a task starts to feel beyond them, and what that way of acting produces.*

**Dialogo prima** (ricostruito):
> **Bot:** La tua volizione (A2, 6/9) è nella media, mentre la mancanza di perseveranza (A5, 6/9) indica un'area di crescita: la simmetria attesa è rotta. Insieme a una percezione di competenza bassa (A6, 4/9), questo suggerisce che fai fatica a mantenere l'impegno quando un compito ti sembra difficile, perché dubiti di potercela fare. Quando ti capita di mollare a metà un compito?
> **Studente:** Boh, tipo quando studio storia.
> **Bot:** Grazie per averlo condiviso, è importante riconoscerlo. In quali momenti della giornata ti succede più spesso?

Cosa non va: la lettura è data come fatto («*questo suggerisce che fai fatica… perché dubiti*»). La domanda è temporale («*quando*»). Sulla risposta breve parte la formula di validazione e poi un'altra domanda di cronaca. Lo studente ha riconosciuto qualcosa? Nessuno lo sa.

**Dialogo dopo** (atteso):
> **Bot:** Nei tuoi risultati la volontà di metterti al lavoro c'è, ma la tenuta nel tempo è il punto più fragile, e la fiducia nelle tue capacità è sotto la media. Un'ipotesi da verificare con te: forse non è l'avvio a mancare, ma quello che succede quando il compito comincia a sembrarti fuori portata. Quando studi storia e arrivi a quel punto, che cosa fai di solito?
> **Studente:** Boh, chiudo il libro e faccio altro.
> **Bot:** Chiudi il libro e passi ad altro. Come decidi che è il momento di chiuderlo, e il giorno dopo, quando riapri storia, che cosa trovi?
> **Studente:** Che sono ancora più indietro. Quindi ci metto ancora di più a ricominciare.
> **Bot:** Quindi chiudere ti dà sollievo subito, ma il giorno dopo rende più pesante ripartire. Ti torna come descrizione di quello che succede, o c'è qualcosa che non ci ritrovi?

Funzioni: la lettura è un'**ipotesi agganciata a una lente** (A5, A6). «Boh» non è trattato come resistenza: la domanda successiva **usa le sue parole** («*chiudi il libro*») invece di ringraziare. Le domande vertono su **scelta** («*come decidi*») e **conseguenza** («*che cosa trovi*»). Il **value-check esplicito** arriva solo allo snodo, quando le tre condizioni sono soddisfatte (agire concreto, funzionamento, collegamento possibile), ed è formulato in modo che lo studente possa correggere. Nel blocco privato il bot dichiara `{"kind": "hypothesis", "text": "Quindi chiudere ti dà sollievo subito, ma il giorno dopo rende più pesante ripartire.", "lens": "A5"}`.

### 6.2 ZTPI, step `ztpi-t4` (Presente fatalistico)

Profilo simulato: Presente fatalistico in «Area di crescita» (sopra il profilo equilibrato).

**Testo dello step, prima** (`prompt_config.py:1885-1900`):
> *Analyse the Present Fatalistic factor of my time-perspective profile. Give the score, the zone…, what it means, and a practical comment. Always explain in simple terms that 'fatalistic' means the feeling of being unable to influence events…*

**Testo dello step, dopo:**
> *Read the Present Fatalistic factor of my time-perspective profile: give the zone and explain in simple words that 'fatalistic' means the feeling that what happens does not depend much on you. Offer it as a possible habit of attention, not a trait, and do not add practical advice. Close by asking how this shows in the way the student prepares — what they choose to do, or not do, when they feel the outcome is not up to them — and what that choice costs or saves them.*

**Dialogo prima** (ricostruito):
> **Bot:** Il presente fatalistico indica la sensazione di non poter influenzare gli eventi. Il tuo punteggio è in area di crescita: tendi a pensare che le cose vadano come devono andare. Un consiglio pratico: prova a fissare piccoli obiettivi giornalieri per sentire di avere più controllo. Qual è il momento in cui cominci a sentirti così?

Cosa non va: etichetta («*tendi a pensare*») e consiglio non richiesto prima che lo studente parli. La domanda di chiusura è la trappola aneddotica citata nella visione.

**Dialogo dopo** (atteso):
> **Bot:** Il presente fatalistico descrive l'impressione che quello che succede dipenda poco da te. Nel tuo profilo è più presente di quanto lo sia in un profilo equilibrato. Non è un tratto fisso: è un'abitudine di attenzione, che può pesare più in certi periodi. Se ti capita di pensare che per un esame «tanto andrà come deve andare», che cosa scegli di fare nella preparazione? E che effetto ha quella scelta sul risultato, o su come ti senti dopo?
> **Studente:** Studio lo stesso ma tipo senza programmare, tanto il prof chiede quello che vuole.
> **Bot:** Studi comunque, ma senza un piano, perché pensi che le domande non siano prevedibili. Quando poi all'esame la domanda arriva, quel modo di prepararti come ti lascia?

Funzioni: la lente ZTPI resta (è lo scopo dello step) ma è restituita come **abitudine e ipotesi**, nello spirito del meta `meta_ztpi_time_perspective.md` («*what that costs in practice*»). Il consiglio scompare: il contratto non lo permette in questo step. La domanda separa **scelta** (preparare senza programmare) e **conseguenza**. Il secondo turno **riconosce attraverso l'uso** e porta in superficie la logica dello studente («*le domande non sono prevedibili*»): è il punto in cui lui stesso può accorgersi del nesso con il fatalismo, senza che il bot lo dichiari.

### 6.3 QPCS, step `qpcs-emozioni` (gestione di emozioni e ansia)

**Testo dello step, prima** (`prompt_config.py:2352-2362`):
> *…Refer to the student's self-assessment result for this area…, then open the reflection with ONE question connected to a real, recent situation.*

**Testo dello step, dopo:**
> *…Refer to the student's self-assessment result for this area as their own self-perception, then open the reflection with ONE question about what they do when tension rises in a demanding task — how they usually respond and what that response leads to.*

**Esempio della visione, mappato sulle funzioni:**

| Variante | Testo | Funzione |
|---|---|---|
| Cerimoniosa | «Grazie per aver condiviso questa riflessione. È importante riconoscere le proprie difficoltà. Come ti organizzi nello studio?» | Validazione vuota + salto di tema. |
| Aneddotica | «Qual è il momento in cui cominci a sentirti così?» | Cronaca: localizza nel tempo, non mette a fuoco l'agire. |
| **Metacognitiva** | «Di fronte a questa sensazione che sia tutto troppo difficile, che cosa fai di solito? Come scegli di muoverti, e che conseguenze ha questo modo di procedere sul tuo studio?» | Riprende le sue parole, chiede comportamento → scelta → conseguenza. |

Questi tre testi sono anche i **primi tre casi di calibrazione** del giudice (§7.4).

---

## 7. Piano di test conversazionale multi-turn

### 7.1 Che cosa serve che oggi non c'è

Un **dialogo** come unità di valutazione: una sequenza di turni che passa dalla pipeline reale (`prepare_chat_turn`, con `retrieval_context` catturato per la riproducibilità, già supportato) e scrive log, note e registro come in produzione. Solo così si osservano ledger, ipotesi e ponte fra step. Va eseguito su DB di test isolato e con un solo test Postgres per volta (memoria di progetto); le passate pesanti di notte.

### 7.2 Due modalità di studente

| Modalità | Come | A cosa serve |
|---|---|---|
| **Scriptata** | Sequenza fissa di messaggi per scenario (non si adatta al bot). | Regressione deterministica su comportamenti locali: risposta monosillabica, rifiuto di un'ipotesi, richiesta di consiglio, cambio tema. |
| **Simulata** | Modello «studente» con scheda persona e una **verità nascosta**: un modo di agire che lo studente conosce ma non dice subito, ad esempio «*rimando l'inizio perché temo di scoprire di non capire*». Temperatura fissa, 3 ripetizioni. | Scavo verticale e autonomia: il bot crea le condizioni perché la verità emerga **dalle parole dello studente**, o la impone? |

### 7.3 Scenari minimi (12)

| # | Scenario | Strumento | Cosa si osserva |
|---|---|---|---|
| S1 | Risposte monosillabiche ma collaborative («boh», «sì», «tipo storia») | QSA sl-motivation | Nessuna attribuzione di stati emotivi; stimolo concreto leggero; nessuna insistenza. |
| S2 | Studente loquace con molti episodi | QPCS emozioni | Il bot passa dagli episodi all'agire (non chiede altri episodi). |
| S3 | Rifiuta l'ipotesi («no, non è così») | ZTPI t4 | L'ipotesi non torna nei turni né nella sintesi; la versione dello studente diventa il punto di partenza. |
| S4 | Corregge l'ipotesi in parte | QSA sl-attribution | La sintesi riporta la versione corretta, attribuita allo studente. |
| S5 | Cambia tema a metà area | QSAr | Segue o ricollega; nessuna riapertura forzata. |
| S6 | Chiede subito un consiglio in uno step interpretativo | ZTPI t1 | Rinvio motivato (regola attuale) senza moralismo. |
| S7 | Esprime disagio forte | QPCS emozioni | Risposta diretta, nessuna formula di rassicurazione, nessuna diagnosi. |
| S8 | «È tutto troppo difficile» (esempio della visione) | QSA affective | Domanda su comportamento, scelta e conseguenza, non su *quando*. |
| S9 | Interpretazione propria in contrasto col punteggio | QPCC | Il disallineamento diventa snodo di verifica esplicita; il punteggio non vince sull'esperienza. |
| S10 | Sessione lunga (> 12 turni) con ipotesi al turno 3 | QSA, 3 step | L'ipotesi e la sua risposta arrivano ancora al turno 15 (ledger / `[REFLECTION THREAD]`). |
| S11 | Sessione ripresa (nuovo `conversation_id`) | QPCS | Continuità dal ledger, come oggi per le risposte. |
| S12 | Intervista con risposte ricche | QAP / Savickas | Chiusura dell'area per comprensione, non per conteggio; nessun loop oltre il tetto. |

### 7.4 Metriche

Per turno (T) e per dialogo (D). «Auto» = calcolabile senza modello; «Giudice» = rubrica in cieco.

| Metrica | Definizione operativa | Tipo |
|---|---|---|
| **Ceremony rate** (T) | Il turno apre o chiude con ringraziamento, validazione generica, lode, rassicurazione non richiesta. Regex multilingua come primo filtro (sul modello di `_ALREADY_ASKED`), giudice per i casi dubbi. | Auto + Giudice |
| **Action anchoring** (T) | La domanda principale verte su cosa lo studente fa, come sceglie, che effetto ha, e non su quando, dove o com'era. | Giudice |
| **Uptake** (T) | La risposta riprende almeno un'espressione dello studente dei 2 turni precedenti. Sovrapposizione di n-grammi normalizzati come proxy. | Auto + Giudice |
| **Hypothesis openness** (T) | Ogni interpretazione è presentata come ipotesi agganciata a parole dello studente o a una lente; nessuna etichetta («il tuo problema è…»). | Giudice |
| **Juncture check** (D) | Verifica esplicita presente dopo un'ipotesi significativa, un disallineamento, prima della sintesi; **assente** altrove (nessun «ti è utile?»). | Giudice + Auto (posizione) |
| **Rejection respected** (D) | Un'ipotesi rifiutata non ricompare né nei turni né nella sintesi. | Auto (registro) + Giudice |
| **Continuity** (D) | Nei turni oltre la finestra, il bot riprende materiale dei primi turni quando è pertinente. | Giudice |
| **Natural bridge** (D) | All'ingresso di uno step nuovo, la prima frase collega il filo precedente. | Giudice |
| **Depth distribution** (D) | Turni per area; aree chiuse senza agire concreto emerso (prematuro); aree oltre il tetto (loop). | Auto |
| **Autonomy of insight** (D, solo simulata) | La «verità nascosta» emerge per prima nelle parole dello studente (bene) o del bot (male). | Giudice con accesso alla verità nascosta |
| **Controlli critici** (T) | Quelli del Prompt Lab: lingua, nessuna invenzione, nessun consiglio non supportato, una sola domanda. | Auto + Giudice |

### 7.5 Giudice

- Riusa `prompt_lab.evaluation`: in cieco rispetto alla variante, temperatura 0, JSON stretto, «*a missing answer is never a pass*», calibrazione obbligatoria prima di ogni passata.
- **Due giudici distinti:** uno per turno (rubrica breve, come oggi) e uno per dialogo (riceve il trascritto intero e le metriche auto, risponde solo sulle metriche D).
- **Calibrazione:** i tre testi della §6.3 (cerimonioso → fallisce, aneddotico → fallisce, metacognitivo → passa), più il caso «buono» corretto e almeno due coppie per lingua (it, en). Il giudice che non separa i tre esempi non giudica.
- Etichettatura umana di un campione (≥ 30 turni) per stimare l'accordo giudice-umano prima di usare il giudice come gate.

### 7.6 Protocollo e gate

1. **Revisione su log reali** (prima della fase 1). Campione anonimizzato di sessioni recenti di QSA, ZTPI e QPCS, con la stessa disciplina di `thread_guard_dry_run.py`: sola lettura, PII redatta. Si conta quante volte compaiono i pattern della §2.6 nelle risposte reali. Conferma o ridimensiona le priorità di questo audit.
2. **Baseline:** comportamento attuale × ≥ 2 modelli usati in produzione (incluso almeno un locale piccolo) × 12 scenari × 3 ripetizioni.
3. **Candidato:** stessa griglia, flag acceso, accoppiata per scenario e seme.
4. **Gate per fase:** nessuna regressione sui controlli critici; ceremony rate e trappola aneddotica in calo; `Rejection respected` = 100%; nessun loop oltre il tetto (fase 5); aumento dei caratteri di envelope entro la soglia concordata. I risultati vanno con intervalli di confidenza: con 36 dialoghi per braccio, differenze piccole vanno lette come «non concluse».
5. Report in `docs/audits/` per ogni passata, con trascritti esemplari (buoni e cattivi) leggibili dall'utente.

---

## 8. Mappa dei punti di innesto

| Punto | File:riga | Intervento | Fase |
|---|---|---|---|
| Contratto di facilitazione | `backend/prompt_contract.py:11-76` | Evolvere `_self_questioning_contract` → `_facilitation_contract(stage, thread_state)` | 1 |
| Firma del contratto | `backend/prompt_contract.py:245-282` | Parametro `thread_state`; inclusione condizionale di Evento | 1 |
| Calcolo dello stato | `backend/chat_preparation.py:503-523` | `thread_state` accanto a `reflection_stage`; lettura del flag | 1-2 |
| Blocco in-step | `backend/chat_preparation.py:442-500` | `[REFLECTION THREAD]` sui turni in-step con ipotesi | 2 |
| Prospettiva di sintesi | `backend/chat_preparation.py:467-474` | Collegamento offerto come domanda | 3 |
| Riduzione con ipotesi | `backend/chat_preparation.py:452-457`, `backend/journey_context.py:45-58` | `preserve_hypotheses` | 6 |
| Note del turno | `backend/recommendation_blocks.py:219-270` | `kind: "hypothesis"`, `lens` | 2 |
| Ledger | `backend/session_ledger.py:125-214`, `369-395` | `hypotheses()`, sezione, direttiva, ponte fra step | 2 |
| Guardiano | `backend/thread_guard.py:88-95`, `416-445`, `585-607` | `hypotheses`, asse `interpretation_open` | 6 |
| Direttiva globale | `backend/chat_logic.py:550-559` (+ valore DB `directive_conversation_quality`) | Aggiungere la funzione sostitutiva «riconoscere attraverso l'uso» | 3 |
| Metodo second-level | `backend/prompts/default_second_level_method.md` | Togliere «*when it shows up*» e il divieto del value-check; tenere l'ipotesi | 3 |
| Ancoraggi | `backend/prompts/default_system_prompt_{factor,qsar_factor,ztpi_factor}.md` | `[ANCHOR]` assorbito nel contratto | 3 |
| Profondità su richiesta | `backend/prompts/default_qa_depth_directive.md` | Esempio chiesto allo studente invece che fornito | 3 |
| QPCC canonico | `backend/qpcc.py:41-57` | Budget → criterio + tetto | 5 |
| Step ZTPI / QSAr | `backend/prompt_config.py:1729, 1741, 1848-1912` | Niente «*practical comment*» | 4 |
| Step QPCS | `backend/prompt_config.py:2362, 2399, 2418`; `prompts/default_system_prompt_qpcs_analysis.md` | Domanda sull'agire; ritmo senza conteggio | 4-5 |
| Interviste | `prompts/prompt_q{pcc,ap}_interview.md`, `default_system_prompt_{savickas,evento}_interview.md`, step in `prompt_config.py` | Criterio + tetto | 5 |
| Calibrazione | `backend/prompt_lab/evaluation.py:196-203` | Correggere il caso «buono» | 0 |
| Allineamento | `backend/prompt_factory_legacy.json`, `prompt_factory_alignment.py` | Registrare gli hash dei testi sostituiti | 4-5 |

---

## 9. Rischi e domande aperte

**Rischi**

- **Modelli piccoli e istruzioni lunghe.** Più regole funzionali possono essere eseguite peggio di pochi divieti. Per questo il contratto va compensato (§4.7) e misurato sul modello locale più debole in uso.
- **Domanda tripla.** L'esempio «atteso» della visione ha tre domande in una frase (cosa fai, come scegli, che conseguenze). È coerente con «una domanda principale» solo se resta **un'unica domanda articolata**. Il contratto deve dirlo, altrimenti i modelli lo leggono come licenza per tre domande.
- **Ipotesi dichiarate male.** Il modello può dimenticare il blocco privato. Effetto: si torna al comportamento di oggi, senza danni (degradazione silenziosa, come le domande).
- **Loop.** Togliere il conteggio senza un tetto riaprirebbe il problema che il budget aveva chiuso. Il tetto resta.

**Domande per te (decisioni pedagogiche, non tecniche)**

1. **Self-question:** resta un obiettivo di chiusura d'area (oggi) o diventa solo una possibilità fra le altre (proposta)?
2. **Evento:** lo includiamo nella facilitazione (ipotesi allo step `rilettura`) o resta com'è, visto che è già il più allineato?
3. **Obiettivo:** confermi che resta fuori, con solo i pattern anti-cerimonia?
4. **Tetto di profondità:** va bene come limite di sicurezza da tarare coi test, o preferisci nessun tetto esplicito per alcuni strumenti (Savickas)?
5. **Visibilità delle ipotesi:** devono comparire allo studente nella sidebar come oggi le domande (e poterle marcare), o restare solo interne?
