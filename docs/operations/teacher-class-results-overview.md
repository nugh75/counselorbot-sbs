# Vista d'insieme dei risultati e delle chat dei propri studenti (Issue #246)

## Obiettivo

Rendere sempre raggiungibile e fluida per il docente la vista d'insieme dei risultati
e delle chat degli studenti della propria classe (`/docente/classi/{id}`), fornendo:
1. Una scheda dedicata **Partecipanti e risultati** (`?tab=students`) tra le schede attive di `ClassSettingsPage`.
2. Una **Vista d'insieme (matrice)** studenti × strumenti a colpo d'occhio, con date di compilazione, punteggi compatti, conteggio tentativi e pannello di ispezione del risultato selezionato con transcript della conversazione.
3. Una **Vista elenco partecipanti** integrata con i taccuini dei discenti (modello del discente), gestione note e messaggi docente-studente con recapito Telegram.
4. Scorciatoie e navigazione fluida:
   - Dalla dashboard `/docente`: quando una classe è selezionata nella sezione Compilazioni, il link «Vista d'insieme della classe» porta direttamente alla scheda risultati della classe.
   - Dalla pagina `/docente/classi`: link diretto «Partecipanti e risultati» accanto ad «Apri classe», «Strumenti e counselor» e «Percorsi».

## Contratto API e componenti

- Nessuna nuova API introdotta: riuso trasparente degli endpoint esistenti con gate di autorizzazione docenti/admin:
  - `GET /api/admin/groups/{id}/students`: elenco membri, collegamenti Telegram, profilo discente e risultati con punteggi.
  - `GET /api/admin/groups/{id}/students/{username}/conversation/{session_id}`: lettura protetta della chat di sessione dello studente.
  - `GET / POST /api/admin/groups/{id}/notes`: lettura e creazione note.
  - `POST /api/admin/groups/{id}/messages`: invio messaggi visibili nel profilo studente e inviati via bot Telegram.
  - `DELETE /api/admin/teacher-notes/{id}`: eliminazione note consentita all'autore o admin.
- `buildClassResultsMatrix` (`frontend/src/lib/class-results-matrix.ts`):
  - Aggrega i risultati degli studenti per tipo di strumento (`questionnaire_type`), ordinando per data decrescente e identificando l'ultimo tentativo.
  - Calcola totali di completamento per strumento e per studente.
- `PlanStudentsPanel` (`frontend/src/components/admin/PlanStudentsPanel.tsx`):
  - Segmented toggle accessibile per passare tra **Vista d'insieme** (matrice) ed **Elenco partecipanti**.
  - In modalità matrice: visualizzazione tabellare orizzontale responsive (`overflow-x-auto`), con badge di completamento, data, punteggi compatti, e pannello di dettaglio sottostante per leggere la conversazione tramite `StudentResultItem`.
  - In modalità elenco: fisarmonica per studente con taccuino, note e messaggi.
- Internazionalizzazione: tutte le nuove etichette sono tradotte nelle 6 lingue ufficiali (`it`, `en`, `es`, `fr`, `de`, `sv`).

## Verifiche di qualità

1. Unit test frontend: `npm test --prefix frontend` (434 test superati, inclusi i test unitari in `frontend/src/lib/class-results-matrix.test.ts` e `frontend/src/lib/class-settings.test.ts`).
2. Verifica tipi TypeScript: `tsc --noEmit -p frontend/tsconfig.json` (0 errori).
3. Localizzazione: `npm run i18n:check --prefix frontend` (3.329 chiavi allineate nelle 6 lingue).
4. Allineamento guidance: `make guidance-check` (manifest aggiornato con `make guidance-refresh`).
