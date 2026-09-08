# Loop notturno di miglioramento dei prompt

**Stato**: piano approvato, non implementato. Progettato il 2026-09-08.
**Perimetro**: backend, nessuna modifica al frontend.

---

## Il problema

Il thread guard (`backend/thread_guard.py`) giudica ogni turno del counselor e
scrive il verdetto in `Log(action="thread_guard")`. Sa dire che un turno ha
perso il filo, che la domanda era fuori posto, che il consiglio non era fondato
su quello che lo studente aveva detto. Ma il verdetto vive un turno e muore lì:
serve a iniettare al massimo due note nel turno successivo, e nessuno legge la
somma di migliaia di verdetti per chiedersi *quale prompt* continua a produrre
quei fallimenti.

Il prompt che ha generato la risposta non pertinente resta intatto. Questo
documento descrive il circuito che lo chiude: raccogliere i fallimenti,
attribuirli a un prompt, formulare ipotesi sul perché, testarle su casi reali
congelati, applicare quella che vince e revocarla se il miglioramento non si
vede.

Gira di notte, su modello locale, senza costo per token e senza toccare le ore
in cui gli studenti usano l'app.

---

## Decisioni prese

| Domanda | Decisione |
|---|---|
| Autorità | **Auto-apply con rollback**. Il loop scrive in produzione da solo; l'admin vede il diff dopo e può fare rollback. |
| Banco di prova | **Suite di regressione che cresce**. Ogni turno bocciato viene congelato come caso; il test rigioca i casi congelati. |
| Perimetro | **Pieno**: `guided_steps.prompt`, chiavi di prompt in `configs`, `counselors.persona` — con soglie di evidenza diverse. |
| Segnale di fallimento | **thread_guard + feedback umano**. Il guard trova i candidati in volume, i voti degli studenti fanno da ancora. |
| Ritmo | **Un target a notte, ore 04:00**, poi 7 giorni di osservazione con revert automatico. |

Il rischio accettato con l'auto-apply è dichiarato: un prompt peggiorato
raggiunge gli studenti prima che una persona lo legga. Le contromisure sono la
finestra di osservazione, il revert automatico e i vincoli sulla forma della
modifica (sotto, §5 e §6).

---

## Architettura

Una run notturna, cinque fasi, tutto dentro il container backend.

```
04:00  cron host → docker exec counselorbot_backend python -m backend.prompt_loop
   │
   ├─ 1. HARVEST      verdetti thread_guard (7 gg) ⨝ feedback umano ⨝ Log(chat_message)
   │                  → congela i turni bocciati come casi di regressione
   ├─ 2. ATTRIBUTE    aggrega per target → sceglie UN target (evidenza più forte)
   ├─ 3. HYPOTHESIZE  qwen3.8 legge il prompt vivo + K turni falliti → ≤3 ipotesi
   │                  ciascuna: causa dichiarata + testo candidato + predizione
   ├─ 4. TRIAL        replay dei casi congelati × (baseline + ogni candidato)
   │                  giudice = thread_guard → pass-rate
   └─ 5. APPLY        vince solo chi supera la soglia → write_live + PromptRevision
                      → target in osservazione 7 gg → revert se non migliora
```

### Moduli nuovi

| File | Responsabilità | Stima |
|---|---|---|
| `backend/prompt_loop.py` | orchestratore della run, entry `python -m`, budget di tempo | ~150 righe |
| `backend/prompt_loop_harvest.py` | verdetti + feedback → casi congelati | ~200 |
| `backend/prompt_loop_hypothesis.py` | prompt al modello locale, parsing e validazione dei candidati | ~180 |
| `backend/prompt_loop_trial.py` | replay A/B sui casi congelati | ~200 |
| `backend/prompt_loop_guard.py` | soglie, apply, osservazione, revert | ~180 |

### Riuso

Il grosso esiste già e non va riscritto:

- `thread_guard.evaluate` — rilevatore in produzione **e** giudice del test.
- `prompt_revisions.write_live` / `record` / `restore` — apply e rollback già
  pronti, con `origin` che distingue chi ha scritto.
- `AIService` — qwen3.8 locale via preset, `temperature=0`, thinking off.
- `pii.redact_always` — gli envelope congelati passano di qui prima di essere
  salvati.
- `chat_logic.build_log_envelope` — l'envelope completo di ogni turno reale è
  **già** in `Log.details` quando `log_full_prompt` è attiva (default). È la
  scoperta che rende il replay semplice: non si ricostruisce niente.

---

## 1. Harvest — dal verdetto al caso congelato

### Segnali

**Primario, in volume** — `Log(action="thread_guard")`. Il verdetto è un
`Verdict` con tre `Check`, ciascuno `{ok: bool, note: str|None}`:
`on_thread`, `question_fit`, `advice_grounded`. Un turno è *candidato al
fallimento* se almeno un check ha `ok=false`.

**Ancora di verità, in campione** — i voti degli studenti già salvati:

- `SharedChatResponse.helpful` (join al turno via `Log.response_id`),
- `StrategyFeedback.helpful` (per `questionnaire_type` + `phase`).

### Regola di combinazione

| guard | umano | esito |
|---|---|---|
| boccia | boccia | **caso forte** → suite di regressione, peso 2 |
| boccia | assente | caso debole → suite, peso 1 |
| boccia | promuove | **scartato** — e registrato come disaccordo |
| promuove | boccia | caso di controllo invertito → suite, peso 1 |
| promuove | promuove/assente | **caso di controllo**, peso 1 |

I casi di controllo servono quanto quelli falliti: una modifica che aggiusta
dieci turni rotti e ne rompe cinque che funzionavano non è un miglioramento.

Il conteggio dei disaccordi (guard boccia / umano promuove) è di per sé una
metrica: se sale, il giudice si sta scollando dalla realtà e il loop va fermato.
Il valore va in un log dedicato e nel report della run.

### Il caso congelato

Ogni caso salvato contiene:

- l'envelope completo del turno, PII già redatta:
  `{system_prompt_final, full_message, history}` letto da `Log.details`;
- la risposta originale del counselor;
- il verdetto originale del guard e l'eventuale voto umano;
- il target attribuito (§2), la lingua, il modello e il preset usati;
- l'hash del frammento di prompt vivo al momento della cattura.

Congelato una volta, riusabile per sempre: un prompt aggiustato oggi non può
rompere in silenzio un caso di sei mesi fa.

**Tetto**: al massimo 200 casi per target, i più recenti; il resto viene
scartato con una nota. Senza tetto la suite diventa impossibile da far girare in
una notte.

---

## 2. Attribuzione — quale prompt ha colpa

Un turno ha `questionnaire_type`, `phase`, counselor e modello. Tre livelli
possibili, tre soglie di evidenza diverse: più il testo è condiviso, più forte
deve essere la prova prima di toccarlo.

| Scope | Target | Quando è lui | Evidenza minima |
|---|---|---|---|
| `guided_step` | `guided_steps.prompt` di uno step | il fallimento si concentra su **uno step di uno strumento**, attraverso più counselor e più studenti | ≥ 20 turni bocciati, ≥ 3 counselor distinti, ≥ 8 studenti distinti, tasso ≥ 1,5× la mediana degli altri step dello stesso strumento |
| `counselor_persona` | `counselors.persona` | il fallimento segue **un counselor** attraverso più strumenti | ≥ 30 turni bocciati, ≥ 3 strumenti distinti, ≥ 10 studenti, tasso ≥ 2× la mediana degli altri counselor |
| `config` | chiave di prompt in `configs` | il fallimento è **trasversale**: più strumenti, più counselor, nessuna concentrazione | ≥ 50 turni bocciati, ≥ 4 strumenti, ≥ 5 counselor, ≥ 20 studenti |

Le soglie sono da tarare sui volumi veri alla prima settimana di dry-run: sono
un punto di partenza, non un risultato.

L'ordine di verifica è dal più specifico al più generale. Se un fallimento si
spiega con uno step, si ferma lì: si tocca lo step. Solo quando nessuna
concentrazione regge si sale di livello. Questo evita il caso peggiore —
riscrivere un prompt globale per un difetto che stava in una riga di uno
strumento.

Fra i target che superano la soglia, la run ne prende **uno**: quello con il
numero maggiore di casi forti (guard + umano d'accordo). A parità, il più
recente.

### Esclusioni

Un target è saltato se:

- la sua ultima `PromptRevision` ha `origin="admin"` ed è più recente di 14
  giorni — una persona ci ha appena messo mano, il loop non la scavalca;
- è già in osservazione da una run precedente;
- è stato modificato dal loop e poi revertito **due volte**: il loop si arrende
  su quel target e lo segnala, perché il problema non è il testo del prompt.

---

## 3. Ipotesi — leggere prima di riscrivere

Il modello locale (qwen3.8, `temperature=0`, thinking off) riceve:

- il testo vivo del prompt target;
- K = 12 turni falliti campionati sul target, ciascuno come
  `(cosa ha detto lo studente, cosa ha risposto il counselor, nota del giudice)`;
- 4 turni di controllo promossi, per mostrare cosa già funziona;
- il nome dello step e dello strumento — **mai** l'istruzione integrale degli
  altri step (lezione appresa nel thread guard: dato lo script verbatim, il
  modello lo spunta invece di leggere la conversazione).

Restituisce al massimo **3 ipotesi**, ciascuna in JSON:

```json
{
  "causa": "il prompt chiede una sintesi e una domanda nello stesso turno; il modello sceglie la sintesi e la domanda cade",
  "predizione": "separando le due richieste, question_fit passa da 0.55 a >0.8 senza toccare on_thread",
  "modifica": { "tipo": "sostituzione", "cerca": "...", "sostituisci": "..." }
}
```

La **causa** e la **predizione** sono obbligatorie e non decorative: la
predizione è quella che il test §4 verifica. Un'ipotesi che non dice in anticipo
quale check dovrebbe migliorare viene scartata prima del test — altrimenti
qualunque risultato la conferma.

### Vincoli di forma sul candidato (validati in codice, non chiesti al modello)

Il modello propone, il codice filtra. Un candidato è rifiutato se:

1. cambia la lunghezza del prompt di più del ±25%;
2. ha meno del 60% di similarità (token overlap) con l'originale — riscrittura
   totale, non correzione mirata;
3. rimuove una **sentinella** (`[DEPTH ON REQUEST]`, `FACTOR_INTERPLAY`,
   `[SECOND-LEVEL METHOD]` e le altre): le migrazioni d'avvio le usano per
   l'idempotenza, toglierne una fa riscrivere il blocco a ogni riavvio;
4. rimuove un segnaposto (`{{counselor_name}}` e simili);
5. cambia la lingua del prompt;
6. introduce un'istruzione che nomina il thread guard o i suoi tre check — il
   loop non deve poter insegnare al counselor a compiacere il giudice.

Il punto 6 è la difesa contro il fallimento più insidioso di tutto il sistema.

---

## 4. Trial — il test A/B

### Come gira il replay

Per ogni caso congelato e per ogni braccio (baseline + candidati):

1. si prende `system_prompt_final` congelato;
2. si **sostituisce** il frammento di prompt vecchio con quello candidato
   (sostituzione di stringa esatta; se il frammento non si trova nell'envelope,
   il caso è saltato e contato come non applicabile);
3. si chiama `AIService` con lo stesso modello e preset del turno originale,
   `temperature=0`;
4. si giudica la risposta con `thread_guard.evaluate`, stesso preset del guard
   di produzione.

Nessuna ricostruzione dell'envelope, nessun passaggio da `prompt_audit`: il
contesto è quello reale del turno, bit per bit, tranne il frammento sotto test.

### Metrica

Per ogni braccio, su ciascun check (`on_thread`, `question_fit`,
`advice_grounded`):

- **fixed** = casi falliti che ora passano;
- **broken** = casi di controllo che ora falliscono;
- **pass-rate** complessivo, pesato (casi forti valgono 2).

### Rumore di fondo

Anche a `temperature=0` la stessa chiamata non dà sempre la stessa risposta. Il
braccio **baseline viene girato due volte**: la differenza fra le due run è il
rumore di fondo della sessione. Un candidato deve battere il baseline di più del
rumore misurato, altrimenti la run si chiude senza applicare niente e lo scrive
nel report.

### Soglia di vittoria

Un candidato vince solo se, tutte insieme:

- `fixed ≥ 5` e `fixed / falliti ≥ 0.30`;
- `broken = 0` sui casi di controllo forti, `broken ≤ 1` in totale;
- il guadagno di pass-rate supera il rumore di fondo di almeno 2×;
- il check che l'ipotesi aveva **predetto** è fra quelli migliorati.

Se vincono in due, passa quello con `fixed` maggiore. Se non vince nessuno, la
run non applica niente: è l'esito normale, non un errore.

### Costo di una run

Con 60 casi (40 falliti + 20 controllo), 3 candidati e il baseline doppio:
`60 × 5 = 300` generazioni + 300 giudizi = 600 chiamate locali. A ~8 s l'una,
in serie, circa 80 minuti. Rientra nella finestra 04:00–06:00 con margine; il
budget di tempo è comunque un parametro e la run si interrompe pulita quando
scade, senza applicare nulla.

---

## 5. Apply, osservazione, revert

### Apply

`prompt_revisions.write_live(scope, target_key, testo)` +
`record(..., origin="auto", author="prompt_loop", note=<causa dell'ipotesi>)`.

`origin="auto"` è un valore nuovo, da aggiungere a `ORIGINS` in
`prompt_revisions.py`. Serve a distinguerlo da `admin`: una revisione `auto` non
va protetta dalle migrazioni d'avvio come lo è una personalizzazione umana.

Il target entra in osservazione: `applied_at`, tasso di fallimento pre-apply,
revisione precedente per il ritorno.

### Osservazione — 7 giorni

Ogni notte la run controlla i target in osservazione **prima** di cercarne di
nuovi. Al settimo giorno confronta il tasso di fallimento del target nei 7
giorni dopo l'apply con quello dei 7 giorni prima, stessa definizione, stessi
check.

- migliorato di almeno il 20% relativo → la revisione resta, osservazione chiusa;
- entro il ±20% → **revert** (`prompt_revisions.restore` sulla revisione
  precedente): non ha fatto danno, ma non ha nemmeno pagato il rischio;
- peggiorato oltre il 20% → **revert immediato**, e il target va in quarantena
  per 30 giorni.

**Revert anticipato**: la run controlla ogni notte, non solo al settimo giorno.
Se dopo 48 ore con almeno 15 turni il tasso è peggiorato di oltre il 50%, il
revert scatta subito.

Un target su cui un admin scrive a mano durante l'osservazione esce
dall'osservazione senza verdetto: la persona ha deciso, il loop si toglie di
mezzo.

### Visibilità

Ogni run scrive un `Log(action="prompt_loop_run")` con il report completo:
target scelto ed evidenza, ipotesi con causa e predizione, risultati per
braccio, decisione, e i revert eseguiti. Il pannello admin mostra la storia
(già leggibile da `prompt_revisions.history`) e il diff before/after di ogni
revisione `auto`.

---

## Schema DB — due tabelle nuove

```python
class PromptLoopCase(Base):
    """Turno reale congelato come caso di regressione per il loop notturno."""
    __tablename__ = "prompt_loop_cases"

    id = Column(Integer, primary_key=True, index=True)
    scope = Column(String, nullable=False, index=True)       # guided_step | config | counselor_persona
    target_key = Column(String, nullable=False, index=True)
    questionnaire_type = Column(String, index=True, nullable=True)
    phase = Column(String, index=True, nullable=True)
    counselor_id = Column(Integer, index=True, nullable=True)
    language = Column(String, nullable=True)
    provider = Column(String, nullable=True)
    model_name = Column(String, nullable=True)
    envelope = Column(JSON, nullable=False)                  # system_prompt_final, full_message, history (PII redatta)
    response_text = Column(Text, nullable=False)
    verdict = Column(JSON, nullable=False)                   # Verdict originale del guard
    human_helpful = Column(Boolean, nullable=True)           # voto studente, se esiste
    kind = Column(String, nullable=False, index=True)        # failing | control
    weight = Column(Integer, nullable=False, default=1)
    prompt_hash = Column(String, nullable=False)             # frammento vivo alla cattura
    source_log_id = Column(Integer, index=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class PromptLoopTrial(Base):
    """Una revisione applicata dal loop e la sua finestra di osservazione."""
    __tablename__ = "prompt_loop_trials"

    id = Column(Integer, primary_key=True, index=True)
    scope = Column(String, nullable=False, index=True)
    target_key = Column(String, nullable=False, index=True)
    hypothesis = Column(JSON, nullable=False)                # causa, predizione, modifica
    trial_result = Column(JSON, nullable=False)              # fixed/broken/pass-rate per braccio, rumore
    revision_id = Column(Integer, index=True, nullable=True)     # PromptRevision applicata
    previous_revision_id = Column(Integer, nullable=True)        # dove tornare
    baseline_failure_rate = Column(Float, nullable=False)
    status = Column(String, nullable=False, index=True)      # observing | kept | reverted | quarantined
    applied_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolution_note = Column(String, nullable=True)
```

---

## Modifiche a codice esistente

1. **`backend/thread_guard.py`** — `store()` scrive solo
   `session_id / username / action / details`. Aggiungere
   `questionnaire_type`, `phase`, `response_id` (colonne già presenti su `Log`)
   così l'aggregazione è un `GROUP BY` invece di un join per timestamp
   sull'ordine dei log. Cambiamento additivo, nessun effetto sul turno.
2. **`backend/prompt_revisions.py`** — aggiungere `ORIGIN_AUTO = "auto"` a
   `ORIGINS`. `is_admin_owned` **non** deve considerarlo di proprietà admin: una
   revisione automatica non protegge il target dalle migrazioni.
3. **`backend/models.py`** — le due tabelle sopra.

Nient'altro. In particolare `prompt_audit.py`, `chat_logic.py` e la catena del
turno restano intatte: il loop legge e scrive prompt, non partecipa alla
conversazione.

---

## Cron

Le 01:00, 02:00 e 03:00 sono occupate da `graphify-cron`.

```cron
0 4 * * * cd /home/nugh75/counselorbot-sbs && docker exec counselorbot_backend \
  python -m backend.prompt_loop >> /home/nugh75/counselorbot-sbs/logs/prompt-loop.log 2>&1 # counselorbot-prompt-loop
```

Il loop rifiuta di partire fuori dalla finestra 22:00–07:00 salvo
`--force`, così un'esecuzione manuale a mano non finisce per caricare Ollama
mentre gli studenti sono in chat.

Flag previsti: `--dry-run` (tutto tranne l'apply), `--target scope:key`
(forza un target), `--budget-min N`, `--force`.

---

## Come si testa il loop

- **Unit**, senza modello: attribuzione (dati sintetici di verdetti → il target
  atteso), validazione dei candidati (i sei vincoli di forma), calcolo delle
  soglie di vittoria, decisione di revert. Sono funzioni pure, si testano tutte
  senza rete.
- **Integrazione, DB di test** (`counselorbot_test`, vedi le regole di progetto):
  harvest da log finti, ciclo apply → osservazione → revert con date iniettate.
- **Dry-run sul DB di produzione**, sul modello di
  `scripts/thread_guard_dry_run.py`: legge i verdetti veri, sceglie il target,
  genera le ipotesi, gira il trial e **stampa** cosa avrebbe fatto. Nessuna
  scrittura. Va tenuto acceso per almeno due settimane prima del primo apply
  vero, ed è lì che si tarano le soglie di §2.
- **Il caso rotto noto**: come per il thread guard, serve almeno un target di cui
  si sappia in anticipo che il prompt è difettoso, per verificare che il loop lo
  trovi. Il silenzio non è accuratezza.

---

## Rischi noti

| Rischio | Contromisura |
|---|---|
| Il loop ottimizza verso il suo stesso giudice (qwen3.8 propone e qwen3.8 valuta) | Ancora umana obbligatoria in §1, conteggio dei disaccordi, vincolo 6 sui candidati (vietato nominare i check del guard) |
| Un prompt peggiorato raggiunge gli studenti | Osservazione 7 giorni, revert anticipato a 48 ore, un solo target a notte, vincoli di forma sul candidato |
| Deriva lenta: molte modifiche piccole, ciascuna innocua, che insieme snaturano il prompt | Massimo un apply per target ogni 30 giorni; `prompt_revisions.history` mostra la catena; alert quando un target supera 4 revisioni `auto` in 6 mesi |
| Volumi troppo bassi perché le soglie abbiano senso | Le soglie di §2 si tarano nel dry-run; sotto i minimi la run non fa niente e lo dice |
| La finestra notturna non basta | Budget di tempo esplicito, interruzione pulita senza apply |
| Riscrittura della persona che cambia l'identità del counselor, non la pertinenza | Soglia più alta per `counselor_persona` (§2) e vincolo di similarità ≥60% |

---

## Punti aperti

1. **Soglie numeriche** — tutte da tarare sui volumi veri; i valori di questo
   documento sono un punto di partenza dichiarato.
2. **Multilingua** — un target serve sei lingue. Se il fallimento si concentra
   su una lingua sola, la modifica giusta probabilmente non è al prompt inglese
   ma alla traduzione. Da decidere: attribuire per `(target, lingua)` o tenere
   la lingua come sola diagnostica.
3. **Interazione con `prompt_updates.py`** — il plan/apply compare-and-swap
   esistente serve alle riscritture manuali in blocco. Se il loop applica
   mentre un piano manuale è aperto, l'hash non torna più. Decidere se il loop
   deve rifiutarsi di partire quando esiste un piano non applicato.
4. **Il modello del counselor cambia** — un caso congelato con un modello
   dismesso non è più replayabile. Serve una politica di scadenza dei casi.
