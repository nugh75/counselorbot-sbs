# Consiglio orientativo — documento interno della classe

Funzione per la docenza: nel tab **Consiglio orientativo** di `/docente/classi/{id}`
il consiglio di classe redige un documento per studente (attitudini, risultati
osservati, metodi di studio, orientamento per gli anni successivi). Lo studente
**non** lo vede; non entra nel link read-only `/consiglio/{token}` (#422).
L'unica uscita del testo è il PDF che un docente autorizzato scarica a mano.

Contratto runtime del 28/10/2026, branch `feature/consiglio-orientativo`.

## Dati

- Tabelle `orientation_recommendations` (`backend/models.py`): una riga per
  `group_id + username` (`uq_orientation_group_user`); `status` `draft|final`
  (CHECK `orientation_status_check`); `content` testo libero, limite API
  20000 caratteri; `ai_draft_used` dichiara che il testo salvato nasce da una
  proposta del modello (lo dichiara la docenza al salvataggio); `revision`
  per il salvataggio concorrente, come nei piani; `created_by`/`updated_by`/
  `final_by` con tempi `UTCDateTime`.
- Nessuna migrazione: la tabella è nuova, la crea `create_all` su Postgres e
  SQLite (ADR-0003); cancellare la classe rimuove i documenti (FK CASCADE).

## Autorizzazione

- Dipendenza `auth.get_current_plan_manager`.
- Visibilità della classe: `_require_visible_group` (`routes/groups.py`) —
  proprietario, co-docenti (`GroupShare`) e amministratori; chi non la vede
  risponde 404, come ogni altra rotta di classe.
- Scrittura e generazione: solo membri attivi (`GroupMembership`, 404
  `orientation_student_not_found` per un nome fuori classe). Nell'elenco conta
  l'unione di iscritti e righe: il documento di chi ha lasciato la classe resta
  leggibile ed esportabile, senza modifiche o generazione AI. `is_member` distingue i casi.

## API

Tutte sotto `/api/teacher/groups/{group_id}/orientation-recommendations`:

| Rotta | Comportamento |
|---|---|
| `GET` | Elenco studenti con `status`, `revision`, `ai_draft_used`; il testo non viaggia, è nel documento singolo. |
| `GET /{username}` | Documento; riga assente → documento vuoto (`status` null, `revision` 0, `content` ""). |
| `PUT /{username}` | Salva `content`, `status` (opzionale), `ai_draft_used` (opzionale). Riga nuova: parte da `revision` 1, quindi il client manda `revision` 0. Revisione non coincidente → 409 `orientation_conflict`, niente scrittura. `status` sconosciuto → 422. `final` fissa `final_at`/`final_by`; `draft` li azzera. Ogni salvataggio incrementa `revision`. |
| `POST /{username}/ai-draft` | Bozza proposta dal modello: mai salvata da sola; modello non raggiungibile o vuoto → 502 `orientation_draft_unavailable`. |
| `GET /{username}/pdf` | PDF del documento (`%PDF`, allegato, nome `consiglio-orientativo_<studente>.pdf`); 404 se la riga manca o il contenuto è vuoto. Solo testo redatto: nessun punteggio grezzo. |

## Bozza assistita

- Contesto: `backend/orientation_recommendation.py` costruisce il materiale
  dalla stessa base dati del pannello del docente — `council_overview` (#422)
  per piani, assegnazioni e obiettivi condivisi. Risultati e sintesi sono limitati
  alle somministrazioni collegate alla classe; il taccuino personale e i
  risultati di altre classi non sono inclusi. Contesto massimo: 9000 caratteri.
- Chiamata: `AIService.get_response` (percorso ordinario del gateway P6),
  con docente come autore, studente come soggetto e finalità `orientation`.
  In modalità strict la policy può bloccare la generazione. Il prompt di
  sistema vieta dati inventati e riferimenti alla famiglia; output in italiano,
  entro ~350 parole.
- La bozza entra nel documento solo con «Usa bozza» nella scheda, che copia il
  testo nell'editor in revisione del docente; il salvataggio resta esplicito.

## UI

- Tab `orientation` in `/docente/classi/{id}` (e `/admin/classi/{id}`),
  componente `frontend/src/components/teacher/OrientationTab.tsx`: elenco con
  chip di stato e badge «bozza AI riveduta», filtro studenti, scheda con
  generazione/revisione della bozza, editor, Salvare, «Segna come documento
  finale»/«Torna a bozza», «Scarica PDF», etichetta interna al consiglio.
- Testi in sei lingue: `frontend/src/lib/i18n-orientation-rec.ts`; voce di tab
  e breadcrumb in `i18n-class-settings.ts` (`orientation`).

## Verifiche

- Backend: `backend/tests/test_orientation_recommendation.py` (9 test)
  eseguiti su Postgres 16 (`DATABASE_URL` dedicata) e SQLite: elenco, documento
  vuoto, primo salvataggio, revisione 409, transizioni di stato, 422,
  visibilità, bozza mai salvata con 502, PDF con `%PDF`.
- Frontend lib: `frontend/src/lib/orientation-recommendation.test.ts`
  (parser di elenco, documento e bozza; copertura e sei lingue dei testi).

## Limiti

- Il documento resta interno: non entra nella vista studente, nel link del
  consiglio (#422), nei PDF delle letture, in nessun esportato di classe.
- `ai_draft_used` è dichiarativo (lo afferma la docenza); non ripercorre la
  fonte del testo.
- Nessun confronto tra classi o modello dati aggregato. Il documento usa solo
  dati della classe e non richiede accesso al taccuino personale.
