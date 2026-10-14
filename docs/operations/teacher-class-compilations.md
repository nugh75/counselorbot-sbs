# Compilazioni di classe nella dashboard docente

La sezione «Compilazioni degli studenti» è in `/docente`, sotto i taccuini e
prima dei collegamenti per classe/cataloghi/ricerca. La scelta parte vuota:
nessuna lettura dei risultati prima della scelta di una classe.

## Contratto e accesso

- GET `/api/admin/groups`: classi proprie/condivise; per gli amministratori
  resta la visibilità già prevista dal backend.
- GET `/api/admin/groups/{id}/students`: risultati salvati dei membri correnti,
  anche non collegati a un piano; nessuna deduzione sulle compilazioni mancanti.
- GET `/api/admin/groups/{id}/students/{username}/conversation/{session_id}`:
  soltanto su apertura di «Conversazione», con componenti URL codificati.
- `StudentResultItem` è condiviso con `PlanStudentsPanel`, usato in Classi e
  Piani di somministrazione. Mostra gli stessi punteggi e messaggi; dashboard
  senza note, taccuini dei partecipanti, form, esportazioni o nuove API.
- Gate docente/ricercatore/admin esistente, poi controlli server su classe
  propria/condivisa, membro e risultato della sessione. 401/403 nascondono i dati;
  404 e altri errori offrono Riprova con testo locale, senza dettagli server.
- Il componente risultati ha `key=group.id`: cambio selezione smonta elenco e
  conversazioni, interrompe le richieste e ignora risposte tardive. Nessuna cache
  di dati tra classi. Una classe senza risultati mostra il proprio stato vuoto.

## Verifiche isolate e riproduzione

Solo dati sintetici. Per la fixture browser, dalla root:

```bash
npm ci --prefix frontend
scripts/dev-teacher-class-compilations-tests.sh
# Altro terminale, frontend:
TEACHER_COMPILATIONS_BASE_URL=http://127.0.0.1:3143 node --test --experimental-strip-types tests/teacher-class-compilations.test.mjs
```

Lo script verifica la porta 3143 e avvia hot reload solo su `127.0.0.1`, con
upstream irraggiungibile `127.0.0.1:9`. Il test intercetta tutte le API e blocca
traffico esterno. Nessun backend/SSO/DB reale è coinvolto. Attendere la prima
compilazione prima dei test se l’host è sotto carico. Arresto: Ctrl+C nel
terminale di avvio. Tunnel facoltativo:

```bash
ssh -N -L 3143:127.0.0.1:3143 <utente>@<server>
```

URL `http://localhost:3143`; senza fixture non è una preview autenticata.
Per validare il compilato usare `BACKEND_ORIGIN=http://127.0.0.1:9 npm run build`
e lo standalone sulla stessa porta, dopo aver arrestato il dev.

`backend/tests/test_teacher_class_compilations.py` usa l’HTTP FastAPI reale e
`artifact_session`: database **counselorbot_test**, schema casuale transazionale,
rollback finale. Impostare DATABASE_URL esclusivamente verso PostgreSQL di prova.
La sessione S3 usa PostgreSQL temporaneo su `127.0.0.1:55443`, tmpfs senza dati
persistenti. Copertura: proprietario, collega condiviso, altro docente, admin,
studente, docente senza classi, classi vuote, risultati quantitativi/qualitativi,
share revocata, membro rimosso e sessione altrui.

La suite browser copre selezione propria/condivisa, ordine/date/punteggi,
assenza di deduzioni sui partecipanti senza risultati, risposte tardive, reset
conversazioni, errori/retry/accesso negato, riuso della vista Classi, sei lingue,
320 px, target 44 px e temi chiaro/scuro. Non certifica SSO o dati di produzione.

Guida docente aggiornata con un paragrafo autonomo nelle sei lingue. Screenshot
di dashboard aggiornabili con `GUIDE_SCREENS=teacher-area` tramite
`frontend/scripts/capture-guide.mjs`, fixture GET-only. Controlli finali e limiti
effettivi sono riportati in `HANDOFF.md`.
Su host sotto carico `GUIDE_TIMEOUT_MS=45000` porta il limite delle sole catture
da 15 a 45 secondi; non cambia i timeout dell’applicazione.

Per la verifica Docker isolata si usa il tag
`counselorbot-frontend:s3-class-compilations-validation`, con entrambi gli origin
API impostati a `http://127.0.0.1:9`. Il primo build con il Dockerfile originale
è riuscito; un successivo rebuild Turbopack è stato interrotto dopo oltre 25
minuti senza avanzamento. Per riprodurre la verifica con Webpack, conservando
Dockerfile, dipendenze e configurazione di produzione:

```bash
python3 -c 'from pathlib import Path; print(Path("frontend/Dockerfile").read_text().replace("RUN npm run build\n", "RUN npm run build -- --webpack\n"))' | docker build -f - --build-arg BACKEND_ORIGIN=http://127.0.0.1:9 --build-arg NEXT_PUBLIC_API_URL=http://127.0.0.1:9 -t counselorbot-frontend:s3-class-compilations-validation frontend
```

Non usare Compose per questa verifica. Avviare solo l’immagine di prova con
un nome dedicato e binding `127.0.0.1:3143:3000`, dopo la verifica della porta;
arrestare solo quel container alla consegna. Nessun deploy o sudo.
