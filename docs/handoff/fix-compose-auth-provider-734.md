# Handoff — fix/compose-auth-provider-734 (issue #734)

Aggiornato: 2026-11-24

## Stato
Completato, in attesa di PR. Branch: `fix/compose-auth-provider-734`.
Nessun container Docker avviato o ricostruito (come da vincoli).

## Fatto
- `docker-compose.portable.yml`: fissati esplicitamente `AUTH_PROVIDER: ai4auth` e `COUNSELORBOT_PROFILE: ""` sotto `services.counselorbot-backend.environment`, impedendo leak da `.env` desktop docente (`teacher-pc`).
- `backend/tests/test_backend_base_image.py`: esteso con il test `test_portable_compose_pins_auth_provider_and_empty_profile` preservando la skip rule quando i file root mancano dentro il container.
- Verificata coerenza con `docker-compose.yml`, `.env.example`, `docs/operations/portable-installation.md` e `CONTEXT.md` senza modifiche superflue (ponytail).

## Verifiche
- `PYTHONPATH=. pytest backend/tests/test_backend_base_image.py -v`: 5 passed.
- YAML parsing + `docker compose -f docker-compose.portable.yml config >/dev/null`: superati con successo.
- `make guidance-check`: verde (documentazione allineata).
- Nessun rebuild Docker eseguito (come da istruzioni).

## Prossimi passi
- Push del branch e apertura PR verso `main` con `Closes #734`.
- Review e merge via GitHub app da parte del solo developer.

## Blocchi e rischi
- Nessun blocco. Nessun rischio per il backend server/desktop.
