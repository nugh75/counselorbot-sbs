# Stato lavori — Raccomandazioni fuori-chat (sidebar persistente)

**Data**: 2026-09-04 · **Branch**: `feature/diagram-shapes-and-note` (⚠️ NON un branch dedicato: le modifiche stanno su questo branch esistente, insieme al lavoro sui diagrammi)

**Riferimento design**: `docs/progetto/adr-recommendations-sidebar.md`

---

## Obiettivo

Le raccomandazioni (letture/film + strategie certificate) escono dalla prosa della chat e vivono in una **sidebar persistente a tab**, con log per sessione e non-ripetizione. La chat resta lo spazio di riflessione.

**Stato: funzionalità completa e verificata dai test.** Restano fuori due cose, per scelta: la sezione PDF (nell'ADR è ancora "da decidere") e il rebuild Docker.

---

## ✅ Fatto

### Backend

1. **`backend/models.py`** — modello `RecommendationHistory`: `id, username, session_id, recommendation_type ("strategy"|"reading"), slug, turn_index, payload (JSON), created_at`, con vincolo univoco su `(username, session_id, recommendation_type, slug)`. Lo schema si discosta dall'ADR su un punto: c'è anche `username`, perché due studenti possono portare lo stesso `session_id` e la sidebar dell'uno non deve mostrare le letture dell'altro.
2. **`backend/recommendation_service.py`** (nuovo) — `record()` (idempotente per `(username, session_id, tipo, slug)`), `slugs_shown()`, `list_for_session()`. Il log non si cancella mai a fine sessione: una sessione congelata deve riaprirsi con la stessa sidebar.
3. **`backend/skills/handlers.py`** — `_certified_readings_block` ritorna `(blocco, voci)`; gli `ids` di `reading_sources` sono ora **gli slug del catalogo certificato** (prima erano le URL delle fonti RAG, che a valle non usava nessuno) e il gestore passa `excluded_reading_ids` al retrieval.
4. **`backend/certified_reading_service.py`** — `retrieve()` accetta `excluded_ids` e filtra per slug; nuovo `payloads_for_slugs()` per il render della sidebar.
5. **`backend/skills/engine.py`** — inoltra `excluded_reading_ids` alla skill `reading-guide`.
6. **`backend/chat_logic.py`** — `_retrieved_context` ritorna 5 valori (aggiunto `reading_ids`); legge `slugs_shown` e li gira come esclusioni (strategie e letture). ⚠️ `skills_result.ids` è indicizzato per **slug della skill** (`reading-guide`), non per nome dell'handler (`reading_sources`): la prima stesura usava la chiave sbagliata e la sidebar restava vuota. Il test di stream l'ha colto.
7. **`backend/routes/chat.py`** — `_record_recommendations()` condivisa; registrazione a fine turno su `/chat` **e su `/chat/stream`** (è quello che usa davvero il frontend), con le raccomandazioni nell'evento `done` dello stream; `/chat/message` restituisce il catalogo della sessione; nuovo `GET /api/session/{session_id}/recommendations`.
8. **`backend/reading_frame.py`** e **`backend/certified_strategy_service.py`** — direttive nelle sei lingue: non ripetere titoli, autori e nomi di strategia nella risposta, discutere le implicazioni. Il tetto `MAX_CERTIFIED_CONTEXT_CHARS` sale da 1400 a 1610 perché la direttiva allunga l'intestazione di ~200 caratteri: così l'elenco delle strategie mantiene lo spazio che aveva prima (senza, la coda veniva troncata).
9. **`backend/routes/opencode.py`**, **`backend/prompt_audit.py`** — call site di `_retrieved_context` allineati a 5 valori.

### Frontend

10. **`frontend/src/lib/recommendations.ts`** (nuovo) — tipi e `normalizeRecommendationCatalog()`: deduplica per slug e regge un payload malformato senza rompere il pannello.
11. **`frontend/src/components/qsa/RecommendationsPanel.tsx`** (nuovo) — tab Letture/Film | Strategie, card con titolo, autori, anno, perché, disponibilità linguistica, dove trovarlo, avvertenza; collassabile su mobile, sempre aperto da `lg` in su. Non si disegna finché non c'è niente da mostrare.
12. **`frontend/src/lib/chat-stream.ts`** — `recommendations` letto dall'evento finale SSE.
13. **`frontend/src/components/qsa/GuidedChatInterface.tsx`** — pannello sopra i punteggi; catalogo aggiornato a ogni risposta e ricaricato dall'endpoint quando la sessione cambia o riparte (resume da frozen incluso), con fallback silenzioso se l'endpoint non risponde.
14. **`frontend/src/lib/i18n.ts`** — 10 chiavi × 6 lingue.

### Test

15. `backend/tests/test_recommendations.py` (8 test): record, idempotenza, `slugs_shown`, ordine per turno, sessione vuota, isolamento fra studenti con lo stesso `session_id`.
16. `backend/tests/test_smoke.py`: `/chat/message` restituisce il catalogo; `/chat/stream` registra la lettura del turno, la unisce a quelle già in log e la ripropone identica a `GET /session/{id}/recommendations`.
17. `backend/tests/test_certified_readings.py`: gli `ids` del turno sono gli slug del catalogo e `excluded_reading_ids` toglie di mezzo quel che è già in sidebar; le direttive anti-ripetizione ci sono in italiano e in inglese.
18. `backend/tests/test_skills_specialized.py`: il contratto nuovo degli `ids` (non più le fonti RAG) e la direttiva sidebar nel blocco strategie.
19. `frontend/src/lib/recommendations.test.ts`: normalizzazione e deduplicazione.

---

## ⚠️ Non fatto (per scelta) e da decidere

- **Sezione PDF nel booklet**: nell'ADR è ancora "da decidere" e il generatore PDF andrebbe disegnato prima. Il log è persistente, quindi la sezione si potrà aggiungere senza altri cambi di schema. *(Una versione precedente di questo file la dava per decisa: prevale l'ADR.)*
- **Testo canonico della Bussola**: non toccato. La Bussola instrada fra strumenti e non descrive i pannelli della chat guidata; nominarci la sidebar sarebbe fuori registro.
- **Rebuild Docker**: non eseguito. Il backend gira ancora sull'immagine vecchia — la funzionalità non è live finché non si rifà l'immagine (`docker compose up -d --build backend frontend`).
- **Commit e push**: non eseguiti.
- **Branch**: le modifiche stanno su `feature/diagram-shapes-and-note` insieme al lavoro sui diagrammi. Se serve un PR separato vanno spostate su `feature/recommendations-sidebar`.

---

## Verifiche eseguite (2026-09-04)

Test backend in locale contro Postgres `counselorbot_test` (porta host 5435), non nel container:

```bash
set -a && . ./.env && set +a
export DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5435/$POSTGRES_DB"
export SESSION_MEMORY_DIR=/tmp/…/session_memory   # ./session_memory è del container: non scrivibile da qui
python3 -m pytest backend/tests -q -p no:randomly \
  --ignore=backend/tests/test_ollama_qsa_benchmark.py \
  --ignore=backend/tests/test_openrouter_qsa_benchmark.py \
  --ignore=backend/tests/test_ollama_json_mode.py \
  --ignore=backend/tests/test_web_lookup.py \
  --ignore=backend/tests/test_qsa_counselor_prompt_battery.py
```

- backend: 674 passati, 6 saltati (esclusi i benchmark su modelli vivi e la batteria live qui sotto).
- frontend: `npm test` 92 passati, `npm run lint` pulito (4 warning preesistenti, non nei file toccati), `npx tsc --noEmit` pulito.
- **Fallisce, ma non per questo lavoro**: `test_qsa_counselor_prompt_battery.py::test_qsa_prompt_battery_static`. Interroga via HTTP il backend in esecuzione su `localhost:8088` (immagine vecchia, DB di produzione) e segnala `counselor_instrument_mismatch: Counselor 'Giulio' is not configured for QSA` — è uno stato dei dati, non il codice.

---

## Rischi noti

- Il recording recupera i payload con una query per tipo a fine turno: accettabile ora, da rivedere se i turni diventano pesanti.
- Le direttive anti-ripetizione non sono verificabili con un test: vanno guardate su conversazioni vere, perché un modello potrebbe comunque nominare un titolo o, peggio, parlare del pannello.
