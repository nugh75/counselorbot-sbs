# Handoff — fix/python-312-default-981 (issue #981)

Aggiornato: 2026-11-16

## Stato
PR aperta: https://github.com/nugh75/counselorbot-sbs/pull/987 (base `main` 39257a0b,
milestone Code health (Nov 2026)). CI gating verde al primo push: tests/startup
(postgres), documentation, portability. Nessun dev server, nessun Docker avviato
(vincoli Mac 8 GB / volume lento).

## Fatto
- `backend/Dockerfile`: `ARG PYTHON_BASE_IMAGE=python:3.12-slim` (era 3.10).
- `docker-compose.yml`: aggiunto blocco `build.args` con default
  `${COUNSELORBOT_PYTHON_BASE_IMAGE:-python:3.12-slim}`.
- `docker-compose.portable.yml`: default arg portato a 3.12.
- `.env.example`: esempio mirror Python 3.12.
- `docs/operations/portable-installation.md`, `live-dev-environment.md` (nota
  workaround rimossa), `chat-continuation-duplicates.md`: allineati a 3.12.
- `CONTEXT.md` e `docs-counselorbot/funzionalita-counselorbot.md`: nota Python 3.12.
- Nuova guardia `backend/tests/test_backend_base_image.py`: legge i file e fa
  `pytest.skip` se non sono presenti (es. dentro l'immagine backend, dove manca la
  radice del repo), come richiesto in review.

## Verifiche
- `pytest backend/tests/test_backend_base_image.py` (venv 3.12 del checkout principale):
  4 passed, nessun Postgres.
- `make guidance-check`: verde.
- YAML parse + `docker compose config --no-interpolate` su entrambi i compose: ok.
- Non eseguito: rebuild immagini Docker (vietato in questa sessione), `docker compose
  config` interpolato (manca `.env` reale), tsc/eslint (nessun file frontend toccato).

## Prossimi passi
- Attesa merge da app del proprietario; nessun merge fatto dall'agente.
- Dopo il merge: `docker compose up -d --build` (backend) per usare l'immagine 3.12.

## Blocchi e rischi
- `docker-compose.prompt-lab.yml` usa ancora `python:3.10-slim` per il container
  `prompt-lab-bootstrap`: non è l'immagine backend (script solo stdlib), fuori scope.
