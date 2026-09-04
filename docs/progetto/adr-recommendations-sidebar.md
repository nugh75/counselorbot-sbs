# ADR — Raccomandazioni fuori-chat (sidebar persistente)

**Data**: 2026-09-04
**Stato**: accettata e implementata il 2026-09-04, tranne la sezione PDF (resta da decidere)

---

## Decisione

Le raccomandazioni (letture, film, strategie certificate) smetteranno di vivere solo nella prosa del chatbot. Vengono esposte come **dati strutturati** in una **sidebar persistente** con due tab — **"Letture/Film"** e **"Strategie"** — separata dal flusso chat. La chat resta lo spazio di riflessione su implicazioni, conseguenze e uso. Una raccomandazione entra nella sidebar una sola volta (dedup per sessione); la storia resta anche dopo scroll, resume da frozen, o cambio di step.

## Motivazione

- **Tracciabilità**: oggi lo studente scrolla via un titolo e non lo ritrova più. La chat non è un catalogo.
- **Non ripetizione**: il modello tende a riproporre le stesse letture/strategie se lo skills engine le inietta ogni turno; il meccanismo di `excluded_ids` (già presente in `certified_strategy_service`) diventa l'elenco dei "già mostrate in sidebar".
- **Chiarezza**: il prompt smette di dire "proponi queste letture nella risposta" e dice "le raccomandazioni ufficiali sono nella sidebar; discuti solo le implicazioni". La prosa rimane più fluida.

## Conseguenze principali

### Backend

- **Nuova tabella `RecommendationHistory`** (in `backend/models.py`):
  - `id`, `session_id`, `turn_index`, `type` ("reading" | "strategy"), `resource_slug`, `payload` (JSON — titolo, autori, anno, ruolo, profile_note, etc.), `created_at`.
  - Migrazione gerata con `content_versions.ensure_i18n_columns` o `create_all` (tabelle semplici) a scelta.
- **`chat_logic.py`**: dopo `skills_engine.run_skills(ctx)`, dove già `skills_result.ids` è disponibile, si scrive un nuovo log e si passa `excluded_ids` come "già in sidebar" agli handler successivi (o si usa una query su tabella come filtro).
- **Endpoint nuovo**: `GET /api/session/{session_id}/recommendations` ritorna lista deduplicate ordinate per turno.
- **Bussola**: aggiunge anche le raccomandazioni di IDEA o altre come "rimandi" ai questionari? No, IDEA = mappa. Bussola raccomanda **strumenti** (QSA, QSAr...), restano prosa + card cliccabili in chat. La sidebar che gestiamo è per le letture/film/strategie **dentro i questionari guidati**.
- **Prompt**: `reading_frame.py` aggiornato per dire "non nominare titoli in prosa, discuti solo le implicazioni; il catalogo è in sidebar"; simile per strategie.
- **PDF booklet**: si valuta se aggiungere sezione "Letture e strategie consigliate" nel booklet scaricabile, pescando da `RecommendationHistory`. Da decidere con il disegno delle sezioni del PDF. **Non implementata**: il log e' persistente e la sezione si potra' aggiungere quando le sezioni del PDF saranno disegnate, senza altri cambi di schema.

### Frontend

- **Nuovo componente `RecommendationsPanel`** (sidebar, alta sinistra, dove oggi c'è lo Scores Panel):
  - Tabs "Letture/Film" vs "Strategie".
  - Una card per raccomandazione con titolo, autori, anno, tipo (icon), e reason (se available).
  - Panel chiuso su mobile (toggle).
- **`GuidedChatInterface.tsx`**: `ChatMessage` ottiene campo opzionale `recommendations` (parallel a `strategyIds`). Sidebar accumula da tutte le risposte.
- **Icone**: si usano quelle esistenti da lucide-react (Book, Film, Strategy/Target/Lightbulb per strategie).

### Migrazione

- Tabella nuova, migrazione semplice.
- Il frontend fa graceful fallback se endpoint non risponde (sidebar vuota).

### Compatibilità

- `msg.strategyIds` resta com'è per feedback (thumbs up/down). Nuovo campo `recommendations` è parallelo.
- Se lo skills engine non ha raccomandazioni per il turno, sidebar rimane come era prima (nessuna nuova).

## Rischi aperti (da valutare in implementazione)

- **Prompt-test**: il modello potrebbe iniziare a parlare di "sidebar" o "catalogo" in modo innaturale. Va testato e aggiustato il frame.
- **Sessioni resume da frozen**: raccomandazioni salvate prima devono ricaricarsi. Il `RecommendationHistory` ha `session_id` e va fornito al resume.
- **PDF**: se vengono incluse raccomandazioni, il PDF va aggiorato. Il generator PDF attuale gestisce solo profili/scores. Schema sezione va disegnato.

## Passi prossimi (ordine)

1. ~~Disegnare schema della tabella (campi e JSON payload)~~ fatto
2. ~~Preparare prompt-frame aggiornati (letture + strategie)~~ fatto
3. ~~API endpoint~~ fatto
4. ~~Componente `RecommendationsPanel` + integrazione in `GuidedChatInterface`~~ fatto
5. ~~Test (`test_recommendations.py`)~~ fatto
6. (Eventuale) Sezione PDF nel booklet — non fatta, vedi sopra

Stato di dettaglio in `docs/progetto/recommendations-sidebar-stato.md`.
