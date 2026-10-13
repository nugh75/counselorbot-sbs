# Profili di prova e chat guidata — validazione

Task Diario `a284bc1a-0845-42b2-99e0-39fed5b99a66`, base `71a35aa6`.
Nessuna dipendenza dalla PR #252.

## Audit e scelta UX

- UI: `PracticeNotebooks` contiene `PracticeRepertoire`; l’editor riusa
  `ScoreInputForm`, prima con «Continua» come submit. Il repertorio permetteva
  creazione/generazione/eliminazione, senza modifica o avvio diretto.
- API/modelli: `TeacherPracticeNotebook` e `TeacherPracticeResult` sono già
  separati dalle compilazioni reali. CRUD proprietario e guard plan-manager
  esistono; il PUT dei punteggi estende il medesimo router senza nuove tabelle.
- Chat: `app/page.tsx` gestisce `?start`, counselor, punteggi e nuova sessione;
  `GuidedChatInterface` invia contesto e ID, li salva negli snapshot e li
  ripristina. `chat_preparation` e l’envelope verificano ruolo/proprietà a ogni
  turno; un taccuino altrui/archiviato non introduce dati reali.
- UX: editor inline già usato dal repertorio, salvataggio esplicito con etichetta
  «Salva profilo», conferma riuscita ed errore che conserva la bozza. Modifica
  conserva identità/strumento/provenienza; «Avvia chat guidata» apre il percorso
  corrente con il profilo salvato. Token petrol/ocra/slate, target da 44px,
  sei lingue e larghezza mobile seguono `docs/design.md`.
- Guida: aggiornata la sezione docente nelle sei lingue. Le immagini esistenti
  dell’Area docenti non rappresentano il repertorio e restano pertinenti;
  screenshot del nuovo editor acquisito soltanto con fixture anonime per QA.

## Ambiente e comandi

Usare Node 22 e Python 3.11 (le dipendenze PDF richiedono Python >=3.10).
Nessun `.env`, credenziale o servizio di produzione. PostgreSQL effimero,
trust su loopback, dati sintetici, schema di ogni test annullato alla fine. Nel container di test montare
`docs-counselorbot` in sola lettura a `/app/docs-counselorbot`, come nel runtime,
per i test della Bussola:

```bash
# Prima controllare che 18594 e 3141 siano libere: ss -ltn, oppure lsof su macOS.
docker run -d --rm --name s5-practice-notebooks-test-postgres \
  -p 127.0.0.1:18594:5432 -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_USER=practice_test -e POSTGRES_DB=counselorbot_test postgres:16
python3.11 -m venv backend/.venv/runtime
backend/.venv/runtime/bin/python -m pip install -r backend/requirements.txt
PYTHON_DOTENV_DISABLED=1 DATABASE_URL=postgresql://practice_test@127.0.0.1:18594/counselorbot_test \
  backend/.venv/runtime/bin/python -m pytest backend/tests/test_practice_notebooks.py \
  backend/tests/test_notebook_context.py backend/tests/test_teacher_context.py -q
cd frontend
npm ci --no-audit --no-fund
npm test
npm run i18n:check
# TypeScript nella copia isolata creata dal runner (contiene next-env.d.ts):
# cd backend/.venv/class-settings-frontend-<id> && npx tsc --noEmit
npx eslint src/app/page.tsx src/components/teacher/PracticeRepertoire.tsx \
  src/lib/practice-notebooks.ts src/lib/practice-notebooks-api.ts \
  src/lib/practice-notebooks.test.ts src/lib/i18n-practice-notebooks.ts \
  src/lib/i18n-guide-audiences.ts
# Terminale separato, dalla radice del worktree:
DEV_FRONTEND_PORT=3141 BACKEND_ORIGIN=http://127.0.0.1:9 \
  bash scripts/dev-class-settings-frontend.sh
# Runner comune con snapshot esplicito dei sorgenti: nessun file ambiente copiato.
TEACHER_PRACTICE_BASE_URL=http://127.0.0.1:3141 \
  node --test tests/teacher-practice-notebooks.test.mjs
# La build Docker frontend esegue next build su un contesto che esclude .env*.
cd ..
make guidance-refresh
make guidance-check
```

Le fixture browser intercettano tutte le API e bloccano traffico esterno;
verificano salvataggio tramite pulsante, refresh, modifica, retry e doppio click,
lingue/layout, avvio dal profilo e continuazione da snapshot nonostante una
preferenza browser diversa. I test API verificano lettura fresca dal DB,
validazione e 403/404 anche per un risultato di un altro taccuino dello stesso
docente. I test envelope coprono separazione dei dati reali e controlli a ogni
turno. Le risposte AI sono simulate: nessuna chiamata a un provider reale.

Preview SSH: `ssh -N -L 3141:127.0.0.1:3141 <user>@<server>`, poi
`http://localhost:3141/docente/taccuini-prova` (fixture disponibili solo nei test).
Fermare Next con Ctrl+C nella sessione che lo ha avviato; fermare solo il DB
creato qui con `docker stop s5-practice-notebooks-test-postgres`.

Build Docker richieste solo con tag locali `s5-practice-notebooks-backend:local`
e `s5-practice-notebooks-frontend:local`, senza Compose, avvio o riavvio di
servizi di produzione. Nessun deploy o passo sudo richiesto.
