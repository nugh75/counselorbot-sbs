# Audit: sezioni prompt e step guidati dell'Amministrazione

Data: 2026-10-05 · Branch: `docs/audit-admin-prompt-sections` (base `origin/main` 5a3957e) · Tipo: audit in sola lettura, nessuna modifica al codice.

Perimetro: *Amministrazione → Configurazione → (filtro sezione, PR #46) → strumento → 4 schede interne*: **Prompt per step**, **Prompt di sistema**, **Testi interfaccia**, **Step guidati**.

## Sintesi esecutiva

1. Le quattro schede non corrispondono a quattro "cose": tre di esse modificano **gli stessi due oggetti** (l'istruzione dello step e il prompt di sistema) da posti diversi, con nomi che non dicono la differenza.
2. "Prompt per step" non è un elenco di prompt: è un **banco di composizione** dello step (istruzione, prompt di sistema, meta prompt, componenti del contesto, note, anteprima). "Step guidati" modifica di nuovo istruzione e mode dello stesso step.
3. Nulla nell'interfaccia dice **dove va un testo**: al modello, allo studente o solo all'admin. La relazione step → prompt di sistema passa per un campo "mode" che l'interfaccia chiama "Prompt di sistema" ma che non apre né mostra quel prompt.
4. **Bug confermati** (registrati nel Diario): per 21 step raggiungibili dall'admin (Obiettivo ×18, intro QPCS/QPCC/QAP ×3) il pannello mostra e **salva il prompt di sistema sbagliato** (per Obiettivo: `prompt_generic`, la chat generica QSA); le varianti per lingua dello step prompt vengono salvate ma **mai usate a runtime**; il select del mode non contiene i mode di Obiettivo e Idea.
5. Prompt condivisi (`prompt_evento_*`, `prompt_obiettivo_*`, `prompt_generic`) appaiono in più strumenti senza avviso: modificarli da uno cambia anche l'altro.
6. Raccomandazione: **opzione A** subito (correzioni + testi + badge di destinazione + "usato da", costo basso), poi **opzione B** (vista "Percorso" centrata sullo step) come evoluzione.

## 1. Mappa

### 1.1 Dove stanno le quattro schede

```
/admin  (app/admin/page.tsx:61, tab 'config')
└── ConfigForm  (components/admin/ConfigForm.tsx:1139)
    ├── PromptFactoryAlignment  (sempre visibile sopra il filtro, :1792)
    ├── SectionFilter  (PR #46, :1799; componente SectionFilter.tsx)
    │   ├── Impostazioni: Generale · Direttive globali
    │   └── Strumenti: QSA · QSAr · ZTPI · Savickas · Evento studio · Evento prof. ·
    │                  Obiettivo studio · Obiettivo docenza · QPCS · QPCC · QAP   (IDEA assente)
    └── [strumento selezionato]  (:2194)
        ├── header + "Salva tutto"  (salva solo prompt di sistema e testi, non gli step: :2196, :2213)
        └── schede interne INSTRUMENT_SUBSECTIONS (:224)
            ├── Prompt per step     → StepPromptsPanel (:687)
            ├── Prompt di sistema   → elenco q.systemPrompts (:2299)
            ├── Testi interfaccia   → elenco q.texts (:2331)
            └── Step guidati        → CRUD guided_steps (:2381)
```

L'elenco degli strumenti e delle chiavi per scheda è **cablato nel frontend** (`questionnaireConfigs`, ConfigForm.tsx:1524-1723), non arriva dal backend.

### 1.2 Contenuto di ogni scheda

| Scheda | Cosa modifica | Dove vive | Chi lo legge a runtime | Quando entra | Destinazione |
|---|---|---|---|---|---|
| **Prompt per step** | (a) istruzione dello step | `guided_steps.prompt` (lingua base); per altre lingue `configs.guided_step_prompt_<id>__<lang>` (ConfigForm.tsx:561, 2280) | `_resolve_user_message_for_chat` (chat_logic.py:1939) legge **solo** `guided_steps.prompt` | ingresso nello step (`use_phase_prompt=true`) | modello (in testa al SYSTEM) |
| | (b) prompt di sistema dello step | `configs.<chiave da mode o fase>` (`promptKeyForStep`, ConfigForm.tsx:538) | `_resolve_system_prompt` (chat_logic.py:1893) | ogni turno dello step | modello |
| | (c) meta prompt | `configs.prompt_meta_<Q>_<step>` o, se vuoto, `prompt_meta_<Q>` (:551) | `_instrument_meta_system_prompt` (chat_logic.py:2584) | ogni turno | modello, blocco `[META SYSTEM PROMPT]` |
| | (d) componenti del contesto + strategie ammesse | `configs.prompt_components_<Q>_<step>` (JSON, :543) | `get_prompt_component_flags` (chat_logic.py:2397) | ogni turno | decide cosa entra nell'envelope |
| | (e) note per modificare la fase | `configs.prompt_guidance_<Q>_<step>` (:547) | **nessuno** (grep backend: 0 risultati) | mai | solo admin |
| | (f) anteprima della richiesta | — | `PromptRequestPreview` → endpoint di preview | — | solo admin |
| **Prompt di sistema** | prompt di sistema e meta prompt dello strumento | `configs.prompt_*` (lista cablata :1530-1711) | `_resolve_system_prompt`, `_instrument_meta_system_prompt` | ogni turno | modello |
| **Testi interfaccia** | titoli e messaggi fissi delle fasi Domande/Conclusione | `configs.text_*`, `configs.label_guided_*`, varianti `__<lang>` (:1342) | `GET /qsa/guided-ui-texts` (routes/chat.py:310) → GuidedChatInterface.tsx:820-824, 933-940 | ingresso fase Domande e Conclusione | studente (messaggi in chat) |
| **Step guidati** | id, titolo, mode, colore, istruzione, ordine | tabella `guided_steps` (models.py:139) | `/qsa/guided-ui-texts` (titoli, colori); chat_preparation.py:171 (mode, prompt) | elenco step e ogni turno | titolo/colore → studente; mode/istruzione → modello |

Altre entità collegate ma **fuori da queste schede**:
- `guided_steps.label_i18n` (titoli nelle 5 lingue): esposto dall'API (`schemas.py:180`) ma **non modificabile** nella UI; seminato da `guided_step_label_i18n.py:458`.
- Domande suggerite per step: tab separato **Domande suggerite step** (`GuidedStepQuestionsPanel`, page.tsx:72), tabella `guided_step_questions`.
- Direttive globali: sezione **Direttive globali** (ConfigForm.tsx:2152), solo 3 di 6 chiavi (vedi F-09).
- Persona del counselor: tab **Counselor**.

### 1.3 Default nel codice vs override nel DB

```
prompt_config.py (default) ──seed all'avvio──▶ configs / guided_steps (DB) ──▶ runtime
         │  main.py:875-895: inserisce le chiavi mancanti; ripristina il default
         │  solo se il valore è vuoto; non sovrascrive testi esistenti
         │  chat_logic.py:188: step di default solo per strumenti senza step
         └─ fallback a runtime: ai_service.config.get(key, DEFAULT_...) se la chiave manca
```

I prompt live sono quelli del DB (personalizzati), non i default del codice. Gli aggiornamenti dei default passano da `prompt_updates.py` (piano + compare-and-swap) e da *Allineamento dei prompt di fabbrica* (`prompt_factory_alignment.py`), che preserva i testi di proprietà dell'admin. Ogni salvataggio dall'admin scrive una revisione (`prompt_revisions.record`, routes/admin.py:1162, 1353, 1375): DB produzione `guided_step` 146 revisioni, `config` 353.

## 2. Relazioni e composizione a runtime

### 2.1 Chi punta a chi

```
 guided_steps (1 riga per step)
 ┌──────────────────────────────┐
 │ id ─────────────┐            │        configs
 │ label (base) ───┼─▶ STUDENTE │   ┌───────────────────────────────────┐
 │ label_i18n ─────┼─▶ STUDENTE │   │ prompt_<mode>  ◀── MODE_TO_SYSTEM_PROMPT_KEY
 │ color_theme ────┼─▶ STUDENTE │   │ prompt_<fase>_intro/_welcome ◀── GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS (per id)
 │ system_prompt_mode ──────────┼──▶│   (stessa chiave condivisa da più step e
 │ prompt (istruzione) ─▶ MODELLO│   │    talvolta da più strumenti)
 └──────────────────────────────┘   │ prompt_meta_<Q>[_<step>] ─▶ MODELLO
          │ id                      │ prompt_components_<Q>_<step> ─▶ filtra contesto
          ├────────────────────────▶│ prompt_guidance_<Q>_<step> ─▶ solo admin
          │                         │ guided_step_prompt_<id>__<lang> ─▶ NESSUNO (F-02)
          ▼                         │ text_* / label_guided_* [__lang] ─▶ STUDENTE
 guided_step_questions ─▶ STUDENTE  │ directive_* ─▶ MODELLO (tutti gli strumenti)
                                    └───────────────────────────────────┘
```

Il legame step → prompt di sistema è **indiretto**: lo step non ha un campo "prompt di sistema", ha un `system_prompt_mode` che il backend traduce in chiave; per gli step di apertura vince invece l'id dello step (`GUIDED_PHASE_SYSTEM_PROMPT_DEFINITIONS`, prompt_config.py:947). Il frontend replica questa traduzione con mappe proprie (ConfigForm.tsx:246, 502) che non sono allineate (F-01).

### 2.2 Ingresso in uno step guidato (`use_phase_prompt = true`)

Fonte: `prepare_chat_turn` (chat_preparation.py:161) + `build_context_envelope` (chat_logic.py:2658).

```
 GuidedChatInterface  ──POST /chat {phase: step.id, mode: step.system_prompt_mode,
                                    use_phase_prompt: true, message: '', scores_context, language}
        │
        ▼
 1. step = guided_steps[phase]
 2. chiave = phase ∈ fasi d'apertura ? prompt_<fase>_intro/_welcome : MODE_TO_SYSTEM_PROMPT_KEY[step.mode]
    system = configs[chiave]  (+ suffisso anti-saluto per gli step di analisi)
 3. system += direttive globali: conversation_quality · context · language · register ·
              thinking · affirmative · contesto piattaforma        (chat_logic.py:475)
 4. system += lunghezza risposta · variante Idea · direttive fattori/punteggi/consigli
              (QSA/QSAr/ZTPI/competenze) · direttive raccomandazioni
 5. istruzione = guided_steps.prompt   ← sempre la lingua base (oggi testo inglese)
 6. flag componenti = prompt_components_<Q>_<step>  (default da codice, override DB)
        │
        ▼
 ╔═════════════════ SYSTEM (al modello) ═══════════════════════════════╗
 ║ [istruzione dello step]                       ← "Prompt dello step"  ║
 ║ [persona counselor]                           ← tab Counselor        ║
 ║ [prompt di sistema + direttive dei passi 3-4] ← "Prompt di sistema"  ║
 ║ [META SYSTEM PROMPT] prompt_meta_<Q>_<step> || prompt_meta_<Q>       ║
 ║ [SECTION] skill  · [STUDENT] metadati · [GUIDED PATH] percorso       ║
 ║ [PROFILE] taccuino/obiettivi/punteggi · [CONTESTO CLASSE] · [READING]║
 ║ [IDEA …] solo Idea · [KNOWLEDGE] grafo/strategie/letture · coda skill║
 ╚══════════════════════════════════════════════════════════════════════╝
 ╔═ HISTORY ═ trascrizione lato server (session_memory) ═╗
 ╔═ USER ════ punteggi della sezione (+ istruzione ripetuta per mode qpcs-*/idea-*) ═╗

 Solo allo STUDENTE (mai al modello): titolo step (label/label_i18n), colore,
 domande suggerite, testi di fase Domande/Conclusione, banner.
 Solo all'ADMIN: note per modificare la fase, anteprima.
```

### 2.3 Turno libero o follow-up nello step (`use_phase_prompt = false`)

```
 POST /chat {phase, mode: factor-qa | qsar-factor-qa | mode dello step, message: "domanda"}
 SYSTEM = [persona] [prompt di sistema del mode conversazionale o dello step + direttive]
          [META] [STUDENT] [GUIDED PATH] [PROFILE] … [KNOWLEDGE]
 USER   = punteggi persistiti della sezione + "DOMANDA DELLO STUDENTE:\n" + messaggio
```

Differenze rispetto al §2.2: l'istruzione dello step **non** entra; per QSA/QSAr il prompt di sistema diventa `prompt_factor_qa` / `prompt_qsar_factor_qa` (chat_logic.py:1752, 1905).

### 2.4 Fasi fisse Domande e Conclusione

Non sono righe di `guided_steps`: la fase `questions` usa `prompt_guided_questions` (prompt_config.py:948), i suoi testi sono in **Testi interfaccia** (QSA: 5 chiavi; altri strumenti: introduzione e conclusione, mentre titolo e banner sono calcolati nel codice, routes/chat.py:378-418). Nell'admin questi testi non compaiono accanto agli step, anche se nella chat lo studente li vede come "ultimo step".

## 3. Finding

Legenda: **B** = bloccante per la comprensione (o correttezza), **NB** = non bloccante, **O** = osservazione.

### B-01 · Il pannello "Prompt per step" modifica il prompt di sistema sbagliato (bug, confermato)

- Prova: `promptKeyForStep` (ConfigForm.tsx:538) usa `SYSTEM_PROMPT_KEY_BY_PHASE` (:502) e `SYSTEM_PROMPT_KEY_BY_MODE` (:246); mancano `obiettivo-interview`, `obiettivo-summary`, `idea-focus`, le fasi `obbstudio-intro`, `obbdocenza-intro`, `qpcs/qpcc/qap-intro` (il frontend conosce solo gli id storici `*-welcome`).
- Riproduzione: confronto deterministico tra le mappe del frontend e del backend su tutti gli step del DB di produzione (SELECT in sola lettura):
  ```
  $ python3 scratchpad/mapcheck.py
  MISMATCH admin-panel key vs runtime key: 29
    ('OBIETTIVO_STUDIO', 'obbstudio-patto', 'obiettivo-interview', 'prompt_generic', 'prompt_obiettivo_interview')
    ('OBIETTIVO_STUDIO', 'obbstudio-intro', 'intro', 'prompt_generic', 'prompt_obbstudio_intro')
    ('QPCS', 'qpcs-intro', 'qpcs-analysis', 'prompt_qpcs_analysis', 'prompt_qpcs_welcome')
    … (18 Obiettivo, 3 intro QPCS/QPCC/QAP, 8 Idea non raggiungibili dall'admin)
  ```
- Effetto: chi modifica il "Prompt di sistema" di uno step Obiettivo salva in realtà `prompt_generic` (chat generica QSA); per gli intro QPCS/QPCC/QAP salva il prompt di analisi/intervista e non quello che il runtime usa. `prompt_qpcs_welcome`, `prompt_qpcc_welcome`, `prompt_qap_welcome` non sono modificabili da nessuna scheda.
- Diario: bug `9d0cd6cc-2ded-4fd3-8eee-3f9214cf0b30` (alta, confermato).

### B-02 · Lo stesso oggetto si modifica da tre posti con nomi diversi

| Oggetto | Prompt per step | Prompt di sistema | Step guidati |
|---|---|---|---|
| `guided_steps.prompt` | "Prompt dello step" | — | "Istruzione dello step" (:2571) |
| `configs.prompt_<mode>` | "Prompt di sistema" (:1072) | voce per chiave (:2306) | campo "Prompt di sistema" = **select del mode** (:2542) |
| `prompt_meta_<Q>` | "Meta system prompt strumento" | "Meta system prompt QSA" | — |

- Il campo "Prompt di sistema" in Step guidati è un select di mode (`admin.config.stepSystemPrompt`, i18n-admin.ts:491), non un prompt: stesso nome, cosa diversa.
- I due editor di `guided_steps.prompt` hanno stati separati: le bozze non si vedono a vicenda (StepPromptsPanel `stepDraft` :795 vs `guidedSteps` :1167).

### B-03 · Nessuna indicazione della destinazione del testo

- Solo due etichette dicono la destinazione: "Prompt di Sistema (istruzioni per l'IA)" e "Testi e Messaggi (mostrati allo studente)" (i18n-admin.ts:476-477), visibili solo dentro le schede. Le schede stesse ("Prompt per step", "Prompt di sistema", "Testi interfaccia", "Step guidati") non hanno descrizione.
- In "Step guidati" titolo e colore (→ studente) e istruzione e mode (→ modello) stanno nella stessa scheda senza distinzione.
- Le "Note per modificare la fase" (`prompt_guidance_*`) non vengono mai inviate al modello, ma l'interfaccia non lo dice.

### B-04 · La relazione step ↔ prompt di sistema è invisibile e i prompt condivisi non sono segnalati

- Lo step mostra un mode, non il nome o il testo del prompt; il pannello mostra la chiave (`admin.promptAudit.promptKey`, :935) ma non quanti altri step la usano.
- Prompt condivisi: `prompt_evento_interview`/`_summary` appaiono sia in Evento studio sia in Evento professionale (:1600, :1615); `prompt_obiettivo_interview`/`_summary` in entrambi gli Obiettivo (:1630, :1645). Per QSA, `prompt_factor` vale per 2 step e `prompt_second_level` per 7 (DB). Modificarli da una sezione cambia l'altra senza avviso.

### NB-01 · Varianti per lingua dello step prompt salvate ma ignorate (bug, confermato)

- Con lingua prompt ≠ `it` il salvataggio va in `guided_step_prompt_<id>__<lang>` (ConfigForm.tsx:2280-2285); nessun file backend legge la chiave:
  ```
  $ grep -rn "guided_step_prompt" backend --include=*.py | grep -v tests
  (nessun risultato)
  $ SELECT key FROM configs WHERE key LIKE 'guided_step_prompt%';
  guided_step_prompt_intro__en
  ```
- L'anteprima admin invia invece il testo tradotto come `message` (PromptRequestPreview.tsx:103), quindi **l'anteprima non corrisponde a ciò che il runtime invia**.
- La lingua "Italiano" nel select corrisponde alla colonna base, che oggi contiene testo **inglese** (es. `intro`: "Welcome me and introduce the QSA guided path…"): l'etichetta inganna.
- Diario: bug `709f3b75-8b95-4c2b-b612-4f0d16251e86` (media, confermato).

### NB-02 · Select del mode incompleto (bug, confermato)

- `SYSTEM_PROMPT_MODES` (ConfigForm.tsx:190-213) non contiene `obiettivo-interview`, `obiettivo-summary`, `idea-focus`, `factor-qa`, `qsar-factor-qa`. Per i 18 step Obiettivo il select mostra la prima opzione ("Presentazione") invece del mode reale; se l'admin tocca il select, il mode cambia davvero.
- Prova: `mapcheck.py` → `MODE NOT IN ADMIN SELECT: 24`.
- Diario: bug `105f9bf7-45a9-4dc0-9dfd-613aed801d98` (bassa, confermato).

### NB-03 · Prompt esistenti e usati ma non esposti

- `prompt_qsar_intro`, `prompt_ztpi_intro`, `prompt_savickas_intro`, `prompt_evstudio_intro`, `prompt_evprof_intro`: non nell'elenco "Prompt di sistema", raggiungibili solo dal pannello dello step intro.
- `prompt_qpcs/qpcc/qap_welcome`: non raggiungibili (B-01).
- `prompt_factor_qa` (follow-up QSA): presente nel DB (1270 caratteri), assente dall'elenco QSA, mentre QSAr espone `prompt_qsar_factor_qa` (:1555).
- IDEA: 8 step e `prompt_idea_focus` + 4 varianti esistono nel DB ma lo strumento manca dal filtro sezioni (:1524-1712), mentre è presente in PromptExportPanel, SkillsPanel, CounselorsPanel.
- Direttive globali: l'admin espone `directive_language`, `directive_register`, `directive_thinking` (:2162-2166); il runtime ne usa altre tre (`directive_conversation_quality`, `directive_context`, `directive_affirmative`, prompt_config.py:1498-1536), presenti nel DB ma non modificabili.
- Le voci QPCS/QPCC/QAP "Percorso guidato"/"Sintesi" compaiono solo se la chiave esiste già nel DB (:1661-1706).

### NB-04 · Due lingue diverse governano due schede vicine

- "Testi interfaccia" modifica la lingua **dell'interfaccia admin** (`lang`, :1341; badge "Lingua in modifica", :2339): per tradurre un testo in svedese bisogna cambiare la lingua di tutta l'app.
- "Prompt per step" ha un select "Lingua prompt" proprio (:926), che cambia anche la lingua di pulsanti ed etichette del pannello (`promptUiText(selectedLanguage)`, :866; `promptComponentText`, :865): interfaccia e contenuto si confondono.
- I titoli degli step nelle 5 lingue (`label_i18n`) non sono modificabili: rinominare uno step lascia le traduzioni vecchie (handleSaveStep invia solo `label`, :1384-1389).

### NB-05 · "Salva tutto" non salva tutto

- Il pulsante nell'intestazione dello strumento salva solo `systemPrompts` e `texts` (`allKeys`, :2196); non salva step, componenti, meta prompt per step, note. Nessun testo lo spiega (`admin.config.saveAllTitle`).

### NB-06 · Modalità di salvataggio diverse per scheda

- Prompt per step: modifica/salva/annulla per blocco (EditablePromptTextBlock, :616).
- Prompt di sistema e Testi: textarea sempre editabile + icona dischetto senza etichetta (:2312, :2349).
- Step guidati: campi sempre editabili + dischetto per step; riordino salvato subito (:1488).

### NB-07 · Scheda iniziale poco orientante

- Aprendo uno strumento si entra sempre in "Prompt per step" (`openSection`, :1184), cioè nel pannello più denso (5 editor, 4 select, flag, anteprima), senza una vista d'insieme del percorso.

### O-01 · Chiavi orfane nel DB

- `prompt_qpcs_interview` (1322 caratteri): nessun mode lo usa, nessun riferimento nel backend (`grep prompt_qpcs_interview backend/*.py` vuoto). Da verificare prima di toccarlo.

### O-02 · Direttive: "lascia vuoto per il default" è impreciso

- La descrizione dice di lasciare vuoto per usare il default (i18n-admin.ts:89); all'avvio però il seed riscrive il default nelle chiavi vuote (main.py:893-895), quindi dopo un riavvio il campo non è più vuoto.

### O-03 · Etichette i18n definite due volte

- `admin.config.inner.*` è definito nel dizionario base e di nuovo nell'overlay `promptAudit*` (es. IT :478 e :4764; ES "Prompts de paso" :1888 sovrascritto da "Prompts por paso" :5483). Vince l'overlay; il doppione è un rischio di deriva. Copertura delle etichette `admin.config.label.*` e `admin.mode.*` nelle 6 lingue: completa (script di controllo, 0 mancanti).

### O-04 · Filtro sezioni (PR #46)

- Funziona come navigazione, ma il gruppo "Strumenti" mostra solo sigle; la ricerca trova le sezioni per nome strumento, non per contenuto (es. cercare "conclusione" o una chiave `prompt_…` non dà risultati). I sottolivelli (le 4 schede) restano bottoni non raggiungibili da `?section=`.

## 4. Proposta di riorganizzazione (non implementata)

Principio: l'admin pensa per **percorso e step**; il sistema ragiona per **chiavi**. L'interfaccia deve mostrare lo step e, accanto a ogni testo, **dove va** e **chi altro lo usa**.

### Opzione A — Chiarire e correggere sul posto (beneficio alto, costo basso) · consigliata subito

```
Strumento: QSA                                              [Salva modifiche (3)]
┌ Prompt per step ─┬ Prompt di sistema ─┬ Testi per lo studente ─┬ Percorso (step) ┐
│ ⓘ Componi uno step: cosa riceve il modello in ogni fase e anteprima.             │
└──────────────────────────────────────────────────────────────────────────────────┘
 Istruzione dello step   [→ MODELLO]   guided_steps.prompt · lingua base (EN)
 Prompt di sistema       [→ MODELLO]   prompt_factor · ⚠ condiviso da 2 step: cognitive, affective
 Meta prompt             [→ MODELLO]   prompt_meta_QSA_cognitive (sovrascrive prompt_meta_QSA)
 Componenti del contesto [FILTRO]      prompt_components_QSA_cognitive
 Note di lavoro          [SOLO ADMIN]  non inviate al modello
```

- Rinominare: "Prompt per step" → **Componi step**; "Step guidati" → **Percorso**; "Testi interfaccia" → **Testi per lo studente**; nel form step, "Prompt di sistema" → **Tipo di step (sceglie il prompt di sistema)** con link al prompt risolto.
- Descrizione di una riga sotto ogni scheda (6 lingue).
- Badge di destinazione su ogni campo: → MODELLO · → STUDENTE · SOLO ADMIN · FILTRO.
- "Usato da N step / anche in <strumento>" accanto a ogni prompt di sistema; avviso prima di salvare un prompt condiviso.
- Correggere B-01/NB-02 con **una sola fonte**: il backend restituisce la chiave risolta per ogni step (es. campo `system_prompt_key` in `/admin/guided-steps`) e la lista dei mode; il frontend smette di duplicare le mappe.
- Decidere NB-01: collegare `guided_step_prompt_<id>__<lang>` al runtime **oppure** togliere la modifica per lingua dello step prompt e rinominare "Italiano" in "Lingua base".

### Opzione B — Vista "Percorso" centrata sullo step (beneficio alto, costo medio) · evoluzione consigliata

```
Strumento: QSA  ▸  Percorso
┌──────────────── Percorso ───────────────┐ ┌──────── Step: 1. Fattori cognitivi ─────────┐
│ 0  Presentazione        intro           │ │ ▸ Cosa vede lo studente                      │
│ 1  Fattori cognitivi    factor   ◀──    │ │   Titolo (6 lingue) · Colore · Domande sugg. │
│ 2  Fattori affettivi    factor          │ │ ▸ Cosa riceve il modello                     │
│ 3… Secondo livello ×7   second-level    │ │   Istruzione · Prompt di sistema (condiviso, │
│ ── Fase Domande (fissa)                 │ │   apre editor dedicato) · Meta · Componenti  │
│ ── Conclusione (fissa)                  │ │ ▸ Anteprima della richiesta                  │
│ [+ step] [riordina]                     │ │ ▸ Storico revisioni                          │
└─────────────────────────────────────────┘ └──────────────────────────────────────────────┘
 Libreria dello strumento: Prompt di sistema (con "usato da") · Meta prompt · Testi di fase
```

- Le fasi fisse Domande e Conclusione compaiono nel percorso, con i loro testi e il loro prompt.
- Le domande suggerite (oggi tab separato) entrano nel dettaglio dello step.
- La "Libreria" sostituisce la scheda "Prompt di sistema" e mostra le dipendenze.
- Un solo editor per `guided_steps.prompt`.

### Opzione C — Registro dal backend e aree separate (beneficio medio-alto, costo alto)

```
Amministrazione
├── Istruzioni per il modello   (tutti gli strumenti, IDEA incluso; direttive globali tutte e 6)
│   └── grafo: direttive → prompt di sistema → step → componenti
├── Contenuti per lo studente   (titoli step, testi di fase, domande suggerite; editor multilingua)
└── Percorsi                    (struttura e ordine degli step per strumento)
```

- Il backend espone un registro (chiave, strumento, destinazione, usato da, default, lingua) e l'admin si genera da lì: niente più `questionnaireConfigs` cablato.
- Costo alto: tocca molte schede, richiede test e migrazione della navigazione (`?section=`).

Ordine per beneficio/costo: **A > B > C**. Raccomandazione: A ora (blocchi 1-4), B dopo (blocchi 5-7), C solo se il numero di strumenti continua a crescere.

## 5. Piano a blocchi

| # | Blocco | Definition of Done verificabile |
|---|---|---|
| 1 | **Fonte unica per la chiave del prompt di sistema** (fix B-01, NB-02) | `/admin/guided-steps` restituisce `system_prompt_key` risolta da `_resolve_system_prompt`; il select dei mode viene da `MODE_TO_SYSTEM_PROMPT_KEY`; test backend che per ogni step seminato confronta chiave restituita e chiave runtime; lo script di confronto riporta 0 discrepanze; nessuna mappa di chiavi resta in ConfigForm.tsx. |
| 2 | **Decisione e fix sulle varianti per lingua dello step prompt** (NB-01) | Decisione scritta in CONTEXT.md; se si collega: test che con `language=en` e chiave `__en` presente il SYSTEM contiene il testo `__en`; se si rimuove: il select lingua del pannello non offre la modifica e la chiave esistente `guided_step_prompt_intro__en` è documentata (non cancellata senza ok). Anteprima e runtime coincidono (test sull'endpoint di preview). |
| 3 | **Testi e badge di destinazione** (B-02, B-03) | Nuovi nomi e descrizioni delle 4 schede nelle 6 lingue; badge su ogni campo; controllo i18n a 0 chiavi mancanti; `docs-counselorbot/funzionalita-counselorbot.md` aggiornato; guida funzionalità rigenerata. |
| 4 | **"Usato da" e avviso sui prompt condivisi** (B-04) | Ogni prompt di sistema mostra gli step e gli strumenti che lo usano; salvare `prompt_evento_interview` da Evento studio mostra un avviso che cita Evento professionale; test del frontend sulla conta. |
| 5 | **Esporre i prompt mancanti** (NB-03) | Intro di QSAr/ZTPI/Savickas/Evento, welcome QPCS/QPCC/QAP, `prompt_factor_qa`, le 3 direttive mancanti e IDEA sono raggiungibili; nessun salvataggio automatico su chiavi esistenti (verifica: revisioni invariate dopo l'apertura). |
| 6 | **Lingua e titoli tradotti** (NB-04) | Editor `label_i18n` nel form dello step; "Testi per lo studente" con select lingua proprio, indipendente dalla lingua dell'admin; le etichette del pannello restano nella lingua dell'admin. |
| 7 | **Vista Percorso** (opzione B) | Un solo editor per `guided_steps.prompt`; fasi Domande/Conclusione nel percorso; domande suggerite nel dettaglio dello step; "Salva tutto" sostituito da un contatore di modifiche non salvate che copre tutti i campi; screenshot in dev env (8002/3107) allegati alla PR. |

## 6. Rischi: cosa non toccare

- **I prompt live sono personalizzazioni nel DB**, non i default del codice: nessun blocco deve riseminare, normalizzare o "pulire" valori in `configs`/`guided_steps`. Gli aggiornamenti passano da `prompt_updates.py` (compare-and-swap) o dall'allineamento di fabbrica, che preserva i testi dell'admin.
- **Step prompt personalizzati: solo append, mai overwrite** (es. direttiva SECOND-LEVEL METHOD). Vale anche per eventuali migrazioni dei blocchi 2 e 5.
- **Le chiavi sono un contratto**: rinominare `prompt_*`, `text_*`, `prompt_meta_*`, `prompt_components_*` o gli id degli step rompe override, revisioni (`prompt_revisions`) e storico. Rinominare solo le etichette.
- `GUIDED_PHASE_ALIASES` e gli id storici `*-welcome` servono a installazioni esistenti: non rimuoverli.
- `prompt_qpcs_interview` e `guided_step_prompt_intro__en`: non cancellare senza conferma dell'utente.
- `guided_steps.label` è la lingua base e `label_i18n` le traduzioni; la colonna `prompt` base oggi contiene testo inglese: non "correggerla" in italiano.
- `?section=` (PR #46) è usato in link condivisi: mantenere gli id delle sezioni.
- Default dei componenti QSA (`qsa_prompt_components.json`, `qsa_component_defaults`): cambiano cosa entra nel contesto, non sono solo UI.

## 7. Cosa non ho potuto verificare

- **Screenshot e osservazioni sulla UI**: il dev env (porte 8002/3107) non era attivo e il compito vieta di avviarlo; il frontend di produzione su :3000 non è stato usato. Le osservazioni UI vengono dalla lettura del codice.
- **Chiamate reali al modello**: non ho eseguito turni di chat; la composizione del §2 è ricostruita dal codice (`prepare_chat_turn`, `build_context_envelope`).
- **Testi di fase nella history del modello**: risultano aggiunti solo nello stato del client (GuidedChatInterface.tsx:933-940) e la history inviata al modello viene dalla trascrizione lato server; non ho verificato se un turno successivo li salva nella trascrizione.
- **Test e build**: nessuna modifica al codice, quindi nessun test eseguito; il controllo i18n e il confronto delle mappe sono script temporanei in sola lettura, non aggiunti al repo.
- **DB**: solo SELECT con `default_transaction_read_only = on` sul DB di produzione (`counselorbot_postgres`); nessun accesso a `.env` o segreti.

## Bug registrati nel Diario

| Id | Titolo | Gravità | Triage |
|---|---|---|---|
| `9d0cd6cc-2ded-4fd3-8eee-3f9214cf0b30` | Admin "Prompt per step" modifica il prompt di sistema sbagliato per Obiettivo e per gli intro QPCS/QPCC/QAP | alta | confermato |
| `709f3b75-8b95-4c2b-b612-4f0d16251e86` | Step prompt tradotti salvati dall'admin non usati a runtime | media | confermato |
| `105f9bf7-45a9-4dc0-9dfd-613aed801d98` | Select del mode degli Step guidati senza obiettivo-* e idea-focus | bassa | confermato |

Nessun bug non registrato.
