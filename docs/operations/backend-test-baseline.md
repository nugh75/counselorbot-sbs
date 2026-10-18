# Baseline dei test backend

Come eseguire l'intera suite backend (`pytest backend/tests`, smoke inclusi) e
Ruff F senza toccare dati reali né lo stack di produzione. Obiettivo: su `main`
devono essere verdi, così una regressione si vede subito.

## Ruff

```bash
ruff check --select F backend
```

`ruff.toml` esclude solo F811 in `backend/tests`: i test importano fixture
pytest da altri moduli di test e il parametro omonimo che le usa è per Ruff una
ridefinizione.

## Pytest

I test vogliono tre cose oltre alle dipendenze di `backend/requirements.txt`:

- un PostgreSQL **dedicato**, con database `counselorbot_test` (le guardie dei
  test di migrazione e concorrenza controllano il nome del database);
- l'**intero repository** in `/app`, non solo ciò che il Dockerfile copia:
  alcuni test leggono `docs/operations/*.md` e la guida
  `docs-counselorbot/funzionalita-counselorbot.md` (in produzione è montata da
  compose con `COUNSELORBOT_DOCS_DIR`);
- `/app` scrivibile (indici RAG, upload), quindi una copia e non il worktree in
  sola lettura.

Procedura usata per la baseline (rete Docker interna, Postgres in memoria;
nessun provider AI raggiungibile):

```bash
WT=$(pwd)                       # radice del worktree
TMP=$(mktemp -d)
docker build -q -f backend/Dockerfile -t counselorbot-test-deps .
git archive HEAD | tar -x -C "$TMP"
printf 'FROM counselorbot-test-deps\nRUN rm -rf /app && mkdir /app\nCOPY . /app/\nWORKDIR /app\n' > "$TMP/Dockerfile.test"
docker build -q -f "$TMP/Dockerfile.test" -t counselorbot-test-tree "$TMP"

docker network create --internal cb-test-net
docker run -d --name cb-test-pg --network cb-test-net \
  --tmpfs /var/lib/postgresql/data:rw,size=2g \
  -e POSTGRES_USER=t -e POSTGRES_PASSWORD=t -e POSTGRES_DB=counselorbot_test \
  postgres:16 -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c max_connections=300

docker run --rm --network cb-test-net \
  -e DATABASE_URL=postgresql://t:t@cb-test-pg:5432/counselorbot_test \
  -e PYTHON_DOTENV_DISABLED=1 -e COUNSELORBOT_DOCS_DIR=/app/docs-counselorbot \
  -e DATA_DIR=/tmp/data -e SESSION_MEMORY_DIR=/tmp/mem \
  counselorbot-test-tree python -m pytest -q -rfE --disable-warnings backend/tests

docker rm -f cb-test-pg && docker network rm cb-test-net
```

Note:

- `fsync=off` e il tmpfs valgono solo per questo Postgres usa e getta.
- Su macOS un bind mount del repository rende la suite circa due volte più
  lenta: meglio la copia dentro l'immagine.
- Non usare `docker compose` dello stack portabile per i test.

## Checkpoint del 18 ottobre 2026

Dopo il merge di main, Ruff F passa e l'immagine isolata
`counselorbot-baseline-completion:backend` è stata ricostruita. L'esecuzione di
16 moduli ha prodotto **500 passati e 10 falliti**, senza dati di produzione.
Due fixture sono state poi corrette ma richiedono riesecuzione: autorizzazione
dell'admin sul proprio istituto e conservazione della password nell'URL della
migrazione. Gli altri otto fallimenti riguardano prompt, budget di token e
letture certificate; la suite completa resta da chiudere. La PR #349 rimane
in bozza. Postgres sintetico e runner sono stati fermati.
