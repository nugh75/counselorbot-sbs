# S1 — Salute dei prompt

## Stato
- Agente s1-prompt-health; task Diario 80b9b6f3-9580-421f-816f-e792224ce133 concluso.
- PR #785 MERGED; main aggiornato a 1f12e776, branch feature locale eliminato.
- Deploy pubblico autorizzato dal proprietario ed eseguito su counselorbot.labform.net l’8 novembre 2026.
- Registro operativo su branch docs/prompt-health-deploy; nessuna modifica al codice dopo il merge.

## Fatto
- Problemi per gravità, conteggio unico, filtri e nomi leggibili nelle sei lingue.
- Origine codice/prompt distinta dalla fabbrica; confronto e riepilogo copiabile per un agente.
- Corrette contraddizioni codice/codice nascoste e riferimenti errati ai consumer.
- Evidenze del codice invalidate al cambio della richiesta senza chiamare il modello.
- Mappa, modello e uso reale espandibili; note, ripristino e ricontrollo conservati.
- Ricostruite e ricreate solo le immagini/container portable backend e frontend da main 1f12e776.
- Backup privato PostgreSQL: portable/data/backups/counselorbot/2026-11-08-s1-prompt-health/postgres.dump.

## Verifiche
- Prima del merge: 34 test backend, 16 unitari frontend, 5 browser, TypeScript, lint, i18n e guidance verdi.
- Build production frontend (webpack e TypeScript) e backend Python 3.12 riuscite.
- Hash dei due moduli prompt_health nel backend attivo identici ai sorgenti di main.
- Dopo il deploy: 5 test browser verdi sull’immagine attiva (:3108), tutte le API simulate.
- Cinque container portable healthy; frontend locale HTTP 200, dominio pubblico HTTP 302 verso SSO.
- Backup: 3.425.185 byte, elenco pg_restore verificato; spazio libero su / circa 19 GiB.

## Prossimi passi
- Il proprietario può ricaricare /admin?tab=promptHealth con il proprio accesso.
- Notifica PR #785 pending/no-timoniere; nessuna consegna confermata, mobile disattivato.
- Rilascio desktop e issue #775–#779 restano coordinati separatamente.

## Blocchi e rischi
- Segreti e dati mai stampati; backup non ispezionato; volumi e configurazione Console/nginx preservati.
- Nessun sudo necessario; update_nginx.sh non eseguito. Riavvio dei due servizi, interruzione non misurata.
- Modifica preesistente .timoniere.json preservata nel checkout principale; container S1 di prova fermati.
- Tag rollback non creati: vecchi ID immagini non disponibili nello store; backup DB conservato.
- Bug LOCAL confermati: 6fabbcce-110e-4971-907f-1f3b66028897 e 2e5a5441-a078-4cb3-8f95-0a8ae4e165e4.
- Default Docker Python 3.10 fuori scope: efc2ea65-2cb3-4502-9511-999bb8d7a87b; mantenuto runtime 3.12.

## Bug non registrati
- Nessuno; registrazioni LOCAL non collegate a issue, nessuna issue creata manualmente.
