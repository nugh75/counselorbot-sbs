# Congelamento e ripresa della sessione guidata

Data: 2026-08-28 — Branch di lavoro previsto: `feature/frozen-sessions`

## Problema

Lo studente non può interrompere di proposito un percorso guidato e riprenderlo
dopo. Oggi esiste solo una ripresa implicita e parziale:

- [frontend/src/lib/resume.ts](../../../frontend/src/lib/resume.ts) salva in
  `localStorage` l'ultima chat aperta (strumento, `sessionId`, esperienza,
  counselor). Il pulsante "Riprendi" nell'header vive di questo dato.
- `GET /api/memory/user/{session_id}` restituisce `current_phase`, e
  `GuidedChatInterface` rimette lo step giusto mostrando una riga di sistema
  "ripreso allo step X".

Restano tre limiti: la ripresa funziona solo dallo stesso browser, la
trascrizione non torna (i messaggi vivono in `useState`), e non c'è un gesto
esplicito di congelamento.

## Obiettivo

Un pulsante "Congela sessione" nella chat guidata che salva lo stato lato
server, e una ripresa che da qualsiasi dispositivo riporta lo studente allo
step in cui era, con la trascrizione completa che aveva davanti.

## Approccio scelto: snapshot lato server

Al congelamento il frontend invia al backend lo stato visibile della sessione;
il backend lo conserva in una tabella indicizzata per `username`. Alla ripresa
il frontend rilegge lo snapshot e ricostruisce la chat.

Alternative scartate:

- **Ricostruzione dai log.** La tabella `logs` contiene già ogni turno, ma
  mescola messaggi interni (`internal_message`, prompt di step, marker
  `[[AVANZA_STEP]]`, banner di fase) e in alcuni percorsi è redatta per PII. La
  trascrizione ricostruita non coinciderebbe con quella vista dallo studente.
- **Estendere `session_memory`.** Il transcript verbatim esiste già, ma è
  tagliato a 12 turni / 6000 caratteri, ha TTL 7200s ed è indicizzato per
  `session_id` — che vive solo in `localStorage`. Non dà il cross-device.

## Modello dati

Nuova tabella in [backend/models.py](../../../backend/models.py), creata da
`models.Base.metadata.create_all` all'avvio (il progetto non usa alembic).
Segue il pattern già presente in `StudentBooklet`.

```python
class FrozenSession(Base):
    """Sessione guidata congelata dallo studente, ripresa da qualsiasi dispositivo."""

    __tablename__ = "frozen_sessions"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=False, index=True)
    session_id = Column(String, nullable=False, index=True)
    questionnaire_type = Column(String, nullable=False, index=True)
    data = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
```

Una riga per `(username, session_id)`: congelare di nuovo la stessa sessione
aggiorna la riga esistente. Nessun vincolo di unicità a livello DB; l'upsert è
applicativo, come per `StudentBooklet`.

Contenuto di `data`:

| campo | tipo | uso alla ripresa |
|---|---|---|
| `messages` | lista di `{role, content, reasoning?, strategyIds?, responseId?, feedbackPhase?, feedback?}` | ricostruisce la trascrizione |
| `current_phase` | stringa | step su cui riaprire |
| `scores` | oggetto `{codice: numero}` | i punteggi oggi vivono in `localStorage`, servono nello snapshot per il cross-device |
| `counselor_id` | intero o null | riapre lo stesso counselor |
| `experience` | `"standard"` \| `"opencode"` | modalità chat; il congelamento è offerto solo in `standard`, il campo serve a riaprire la chat giusta |
| `locale` | stringa | lingua della sessione |
| `response_length` | `"short"` \| `"medium"` \| `"long"` | preferenza di lunghezza |
| `label` | stringa | etichetta leggibile per la lista (strumento + step) |

## API

Nuovo modulo `backend/routes/frozen_sessions.py`, registrato in
`backend/main.py` come gli altri router. Tutti gli endpoint dipendono da
`auth.get_current_user` e filtrano per `username` dell'identità: nessuno può
leggere o cancellare la sessione di un altro.

I router del backend sono registrati senza prefisso `/api`: il proxy del
frontend lo aggiunge. I path qui sotto sono quelli lato backend; il frontend
chiama `/api/session/...`.

| metodo | path | comportamento |
|---|---|---|
| `POST` | `/session/freeze` | upsert dello snapshot per `(username, session_id)`; risponde con il riepilogo della sessione (`FrozenSessionSummary`) |
| `GET` | `/session/frozen` | lista delle sessioni congelate dell'utente: `session_id`, `questionnaire_type`, `label`, `current_phase`, `updated_at` — senza `messages`, per non caricare l'header |
| `GET` | `/session/frozen/{session_id}` | snapshot completo; 404 se non appartiene all'utente |
| `DELETE` | `/session/frozen/{session_id}` | rimuove lo snapshot (fine percorso o scarto esplicito) |

Modelli di richiesta e risposta in `backend/schemas.py`, accanto agli altri.
`questionnaire_type` è validato contro gli strumenti noti; `messages` è
limitato in dimensione per evitare payload abnormi.

## Frontend

**Congelamento** — in
[GuidedChatInterface](../../../frontend/src/components/qsa/GuidedChatInterface.tsx),
accanto ai controlli di step: pulsante "Congela sessione" che invia lo
snapshot, mostra conferma e chiude la chat tornando alla home. Nessun controllo
di autenticazione nel componente: la pagina è già interamente dietro il gate di
identità, quindi la chat guidata è raggiungibile solo da utenti loggati.

**Ripresa** — [HeaderResume](../../../frontend/src/components/layout/HeaderResume.tsx)
interroga `GET /api/session/frozen` (proxy verso `/session/frozen`) e mostra l'icona quando c'è almeno una
sessione congelata, con fallback al punto locale in `localStorage`. Con più
sessioni, un menu di scelta; con una sola, apertura diretta.

**Ricostruzione** — [app/page.tsx](../../../frontend/src/app/page.tsx) accetta
`/?frozen=<session_id>`, scarica lo snapshot, imposta strumento, `sessionId`,
punteggi, counselor ed esperienza, poi entra nello step `interaction`.
`GuidedChatInterface` riceve lo snapshot come prop opzionale: quando è
presente, popola `messages` e `currentPhase` invece di ripartire dalla riga
"ripreso allo step X". Il ramo di ripristino esistente basato su
`/api/memory/user/{session_id}` resta invariato per le sessioni non congelate.

**Chiusura del ciclo** — a percorso completato lo snapshot viene cancellato,
come già avviene per il punto di ripresa locale in `handleInteractionComplete`.

**i18n** — nuove chiavi in [lib/i18n.ts](../../../frontend/src/lib/i18n.ts) per
tutte e sei le lingue: etichetta e tooltip del pulsante, conferma di
congelamento, titolo del menu di ripresa, stato vuoto.

## Sicurezza e privacy

Lo snapshot contiene la conversazione dello studente: gli endpoint richiedono
autenticazione e filtrano per `username`, senza scorciatoie basate sul solo
`session_id` (che è indovinabile e viaggia in URL). Gli admin non ottengono qui
un nuovo accesso alle conversazioni: per quello esiste già la vista sui log.

## Test

- pytest su Postgres di test (`counselorbot_test`): round-trip
  freeze → list → get → delete; il re-freeze aggiorna invece di duplicare;
  l'utente B non vede né cancella la sessione di A; chiamate non autenticate
  respinte.
- `tsc --noEmit` ed `eslint` sui file frontend toccati.
- Verifica manuale del percorso completo su due browser diversi con la stessa
  utenza.

## Fuori scope

Congelamento automatico, scadenza degli snapshot, ripresa della chat libera
dell'assistente e del percorso `opencode`, condivisione della sessione con il
docente.
