# Handoff srv-deploy

## Stato
Deploy PR #825 (merge 7301e9cf) completato sul Mac portable il 2026-11-12. Servizio persistente, in attesa di ordini.

## Fatto
- Backup pre-deploy: data/backups/counselorbot/predeploy-20261112-201225.sql.gz (~3 MB).
- Backend non montato e senza --reload: ricostruito SOLO counselorbot-backend (--no-deps) dal checkout principale. Frontend non toccato. `image prune -f`: 0B.
- Allinea prompt di fabbrica: piano make_plan = 2 changes (directive_conversation_quality, prompt_factor), 0 preserved; apply_review (author srv-deploy) -> updated 2; nuovo piano vuoto.

## Verifiche
- 5 container healthy, restart count 0; backend ricreato (~1 min di downtime backend).
- https://counselorbot.labform.net -> 302 verso auth.labform.net.
- Log backend ultimi 5 min: nessun errore.

## Prossimi passi
Nessuno. Sudo non necessario (profilo portable, update_nginx.sh non applicabile).

## Blocchi e rischi
Nessuno. Checkout principale ha .timoniere.json modificato (estraneo, non toccato).
