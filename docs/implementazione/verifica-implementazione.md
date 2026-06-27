# Verifica Implementazione

Questo documento elenca tutte le modifiche fatte al progetto CounselorBot, con il dettaglio di cosa controllare file per file per verificare che l'implementazione sia corretta.

---

## 1. Salvataggio Risultati Questionari su DB

### Modello dati — `backend/models.py:82-91`
**Cosa controllare:**
```python
class QuestionnaireResult(Base):
    __tablename__ = "questionnaire_results"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String, index=True, nullable=False)
    questionnaire_type = Column(String, nullable=False, index=True)
    scores = Column(JSON, nullable=True)
    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
```
- [ ] La classe `QuestionnaireResult` esiste dopo `StrategyFeedback`
- [ ] La tabella si chiama `questionnaire_results`
- [ ] `scores` è di tipo `JSON`
- [ ] `submitted_at` ha `server_default=func.now()`
- [ ] `session_id` e `questionnaire_type` hanno `index=True`

### Schema Pydantic — `backend/schemas.py:132-156`
**Cosa controllare:**
- [ ] `QuestionnaireResultCreate` con campi: `session_id: str`, `questionnaire_type: str`, `scores: Optional[Dict[str, Any]]`
- [ ] `QuestionnaireResultResponse` con `id`, `session_id`, `questionnaire_type`, `scores`, `submitted_at`
- [ ] `QuestionnaireResultResponse` ha `@validator('scores', pre=True)` che gestisce stringhe JSON

### Endpoint POST — `backend/routes/survey.py:72-82`
**Cosa controllare:**
```python
@router.post("/questionnaire-result", response_model=schemas.QuestionnaireResultResponse)
async def submit_questionnaire_result(...)
```
- [ ] `POST /questionnaire-result` è pubblico (nessun `Depends(auth.*)`)
- [ ] Usa `result.model_dump()` per creare il record
- [ ] Fa `db.add()`, `db.commit()`, `db.refresh()`, restituisce il record

### Endpoint GET — `backend/routes/survey.py:85-98`
**Cosa controllare:**
```python
@router.get("/admin/questionnaire-results", response_model=List[schemas.QuestionnaireResultResponse])
async def get_questionnaire_results(...)
```
- [ ] Protetto da `Depends(auth.get_current_active_admin)`
- [ ] Accetta parametri opzionali: `skip`, `limit`, `questionnaire_type` (Query)
- [ ] Filtra per `questionnaire_type` se presente
- [ ] Ordina per `submitted_at.desc()`

### Frontend — salvataggio automatico

**`frontend/src/app/page.tsx:114-151`** — `startInteraction()`:
- [ ] Chiama `addCompletedProfile(qType, newSessionId, scores || {})` per localStorage
- [ ] Fa `fetch('/api/qsa/audit', ...)` per audit log
- [ ] Fa `fetch('/api/questionnaire-result', ...)` per salvare su DB
- [ ] Usa lo stesso `newSessionId` per entrambe le chiamate

**`frontend/src/app/page.tsx:74-98`** — `handleQuestionnaireSelect()` per Savickas:
- [ ] Genera `newSessionId`, chiama `addCompletedProfile()`
- [ ] Fa `fetch('/api/questionnaire-result', ...)` con `questionnaire_type: 'SAVICKAS'` e `scores: {}`

**`frontend/src/app/page.tsx:41-72`** — `useEffect` deep-link (`?start=SAVICKAS`):
- [ ] Stessa logica di salvataggio per Savickas via URL

---

## 2. Download PDF

### Dipendenza — `backend/requirements.txt`
- [ ] `fpdf2` è presente

### Generatore PDF — `backend/pdf_generator.py`
**Cosa controllare:**
- [ ] Contiene `FACTOR_MAP` con dizionari per `QSA`, `QSAr`, `ZTPI`
- [ ] Ogni fattore è una tupla: `(nome, descrizione, invertito)`
- [ ] `_score_label(value, inverted)` restituisce `(label, colore_rgb)`:
  - Non invertito: >=7 → Forza (verde), <=3 → Area crescita (rosso), else → Norma (giallo)
  - Invertito: <=3 → Forza, >=7 → Area crescita
- [ ] `generate_questionnaire_pdf(...)` accetta: `questionnaire_type`, `scores`, `session_id`, `submitted_at`
- [ ] Per `SAVICKAS`: mostra messaggio qualitativo
- [ ] Per questionari con punteggi: itera `scores`, mostra codice, nome, valore, label colore, descrizione
- [ ] Include legenda (Forza/Norma/Crescita) + nota fattori invertiti
- [ ] Restituisce `BytesIO`
- [ ] Usa `ResultPDF(FPDF)` con `header()` e `footer()` personalizzati

### Endpoint PDF — `backend/routes/survey.py:101-123`
**Cosa controllare:**
```python
@router.get("/questionnaire-result/{session_id}/pdf")
async def download_questionnaire_pdf(session_id: str, ...)
```
- [ ] Pubblico (no auth)
- [ ] Cerca il risultato per `session_id`, 404 se non trovato
- [ ] Chiama `generate_questionnaire_pdf(...)`
- [ ] Restituisce `Response(content=..., media_type="application/pdf")` con header `Content-Disposition: attachment`

### Frontend — pulsante PDF — `frontend/src/app/page.tsx:373-395`
**Cosa controllare:**
- [ ] Pulsante "Scarica PDF" (classe `bg-emerald-600`) nella schermata `completed`
- [ ] `onClick` fa fetch a `/api/questionnaire-result/${sessionId}/pdf`
- [ ] Crea blob, genera URL, simula click su `<a download>`, pulisce

---

## 3. Admin — Risultati e Validazione Scale

### Tab nella admin page — `frontend/src/app/admin/page.tsx`
- [ ] Nuovo tab con icona `BarChart3` e label `t('admin.tab.results')`
- [ ] `activeTab` type include `'results'`
- [ ] `activeTab === 'results'` renderizza `<QuestionnaireResultsViewer />`

### Componente — `frontend/src/components/admin/QuestionnaireResultsViewer.tsx`
**Cosa controllare:**
- [ ] Filtro per tipo questionario con pulsanti (Tutti / QSA / QSAr / ZTPI / Savickas)
- [ ] Statistiche in alto: totale risultati + conteggio per tipo
- [ ] Pulsante CSV export
- [ ] **Tabella** con colonne: Data, Tipo, Sessione, Punteggi
- [ ] Badge colore per punteggi (verde/giallo/rosso con logica invertiti)
- [ ] **Espansione riga**: mostra tutti i punteggi con nome fattore, descrizione, valore
- [ ] **Sezione statistiche aggregate** per tipo selezionato:
  - Grafico a barre (`Recharts`): media per fattore, barre colorate, tooltip, error bar
  - Tabella stats: Fattore, N, Media, Dev Std, Min, Max, % Forza, % Norma, % Crescita
- [ ] I punteggi delle schede "in preparazione" (QPCS, QPCC, QAP) nella home page non vengono toccati

### Traduzioni — `frontend/src/lib/i18n-admin.ts`
- [ ] Tutte le chiavi `admin.results.*` sono presenti in IT e EN
- [ ] Le chiavi sono: `total`, `all`, `stats`, `csv`, `factor`, `count`, `mean`, `stddev`, `min`, `max`, `pctStrength`, `pctNormal`, `pctGrowth`, `col.date`, `col.type`, `col.session`, `col.factors`, `qualitative`, `qualitativeDesc`, `sessionFull`, `noScores`, `empty`

---

## 4. Flusso Combinato Chatbot

### Profile Tracker — `frontend/src/lib/profile-tracker.ts`
**Cosa controllare:**
- [ ] `addCompletedProfile(type, sessionId, scores)`: upsert in localStorage
- [ ] `getCompletedProfiles()`: legge da localStorage
- [ ] `hasCompletedAll()`: restituisce `true` se QSA (o QSAr) + ZTPI + SAVICKAS sono presenti
- [ ] `getCombinedScoresContext()`: formatta tutti i profili come stringa strutturata con nome fattori
- [ ] `clearCompletedProfiles()`: rimuove la chiave dal localStorage

### GuidedChatInterface — `frontend/src/components/qsa/GuidedChatInterface.tsx`
- [ ] `scoresContextOverride?: string` nell'interfaccia `GuidedChatInterfaceProps` (riga 31)
- [ ] Se presente, usa `scoresContextOverride` invece di formattare `scores`
- [ ] Lo passa nel body della richiesta chat come `scores_context`

### page.tsx — nuovi stati e step
**Cosa controllare:**
- [ ] `Step` type include `'combined-interaction'`
- [ ] State: `combinedScores`, `combinedContext`
- [ ] `addCompletedProfile()` chiamato in: `startInteraction()` (QSA/QSAr/ZTPI), `handleQuestionnaireSelect()` (Savickas), `useEffect` deep-link (Savickas)

### Pulsante combinato — `frontend/src/app/page.tsx:353-363`
- [ ] `{hasCompletedAll() && (...)}` sopra la griglia dei bottoni
- [ ] Pulsante verde (`bg-green-600`) con icona `Layers` e label `t('completed.combined')`
- [ ] `onClick={handleCombinedStart}`

### handleCombinedStart — `frontend/src/app/page.tsx:157-186`
**Cosa controllare:**
- [ ] Genera `newSessionId`
- [ ] Recupera profili con `getCompletedProfiles()`
- [ ] Merge punteggi (nessuna collisione: QSA usa C/A, ZTPI usa T)
- [ ] Salva su DB come `questionnaire_type: 'COMBINED'`
- [ ] Imposta `combinedScores`, `combinedContext`, `sessionId`
- [ ] Imposta step `combined-interaction`

### Combined step render — `frontend/src/app/page.tsx:327-335`
- [ ] `step === 'combined-interaction' && combinedScores`
- [ ] Renderizza `GuidedChatInterface` con `scores={combinedScores}`, `questionnaireType={'QSA'}`, `scoresContextOverride={combinedContext}`
- [ ] `onComplete={handleCombinedComplete}` che pulisce profili e torna alla selezione

### Traduzioni — `frontend/src/lib/i18n.ts`
- [ ] `completed.combined` presente in tutte e 6 le lingue (IT/EN/ES/FR/DE/SV)
- [ ] `completed.downloadPdf` presente in tutte e 6 le lingue

---

## 5. Test

### `backend/tests/test_smoke.py`
**Cosa controllare:**
- [ ] `EXPECTED_ROUTES` include:
  - `POST /questionnaire-result`
  - `GET /admin/questionnaire-results`
  - `GET /questionnaire-result/{session_id}/pdf`
- [ ] `test_questionnaire_result_submit_public()`:
  - [ ] Chiamata POST con session_id, questionnaire_type, scores
  - [ ] Asserisce status 200
  - [ ] Asserisce `questionnaire_type == "QSA"` e `scores["C1"] == 7`
- [ ] `test_questionnaire_results_admin_list()`:
  - [ ] Chiamata GET
  - [ ] Asserisce status 200 e response è una lista
- [ ] `test_questionnaire_pdf_download()`:
  - [ ] Crea risultato via POST
  - [ ] Scarica PDF via GET
  - [ ] Asserisce `content-type: application/pdf` e contenuto > 100 byte

### Esecuzione test
```bash
docker exec counselorbot_backend python -m backend.tests.test_smoke
```
- [ ] Tutti i test PASS

---

## 6. Docker

### `backend/Dockerfile`
- [ ] `COPY backend/*.py backend/` copia `pdf_generator.py` automaticamente
- [ ] `fpdf2` installato via `requirements.txt`

### Build & Deploy
```bash
docker compose build --no-cache backend frontend
docker compose up -d backend frontend
```
Dopo il rebuild:
- [ ] La tabella `questionnaire_results` viene creata automaticamente all'avvio
- [ ] `GET /questionnaire-result/{session_id}/pdf` restituisce PDF
- [ ] `POST /questionnaire-result` salva su DB
- [ ] `GET /admin/questionnaire-results` restituisce lista

---

## Checklist verifica funzionale

### Flusso studente
- [ ] Seleziono QSA → inserisco punteggi → Dashboard → Start Chat
- [ ] Il dato viene salvato su DB (`questionnaire_results`)
- [ ] Completo la chat → schermata "Analisi Completata"
- [ ] Pulsante "Scarica PDF" → scarica un PDF con i punteggi
- [ ] Ripeto per ZTPI e Savickas
- [ ] Dopo tutti e 3, compare pulsante "Analisi Combinata dei Profili"
- [ ] Al click, parte una chat con tutti i profili uniti

### Flusso admin
- [ ] Vado su `/admin` → tab "Risultati Questionari"
- [ ] Vedo la tabella con tutti i risultati
- [ ] Filtro per tipo → si aggiorna la tabella
- [ ] Clicco una riga → si espande con tutti i punteggi
- [ ] Vedo le statistiche aggregate (media, dev std, % etc.)
- [ ] Vedo il grafico a barre
- [ ] Scarico CSV

### PDF
- [ ] Il PDF contiene: tipo questionario, data, sessione, punteggi con colore e label
- [ ] Per QSA: 14 fattori (C1-C7, A1-A7) con nomi e descrizioni
- [ ] Per ZTPI: 5 fattori (T1-T5) con nomi e descrizioni
- [ ] Legenda presente
- [ ] Nota fattori invertiti presente per QSA e ZTPI
- [ ] Per Savickas: messaggio qualitativo
