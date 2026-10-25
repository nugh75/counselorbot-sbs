# P12 — s72-p12-fernet
Task: a62aae25-ef78-4af6-b0a2-369de174421a
Branch: feature/privacy-p12-fernet-dek

## Stato
PR #586 aperta; integrazione origin/main dopo il merge P9 (#585) verificata.
## Fatto
- Letti prompt, regole Timoniere, KeyRing P5 e cifratura P11.
- Decisione: switch esplicito PRIVACY_CREDENTIAL_ENCRYPTION, default Fernet compatibile.
- Con switch on: tre DEK separate, lettura duale, errori senza contenuti.
- Job a lotti e runbook implementati; vincolo schema aggiornato, errore HTTP 503 istituto.
- Richieste senza creazione chiavi; bootstrap rifiuta DEK perse con credenziali migrate.
- Merge origin/main (P9 #585): sezioni P9/P12 conservate e migrazioni main.py entrambe attive.
## Verifiche
- SQLite: 98 pass (P12, P5, P11, istituto, admin API/ChatGPT); zero nuove regressioni.
- Python predefinito 3.9 incompatibile; verifiche host con Python 3.11.9.
- Altri 5 test SQLite passati (schema vecchio, BEGIN IMMEDIATE, chiave Fernet rimossa).
- Postgres: 104 + 3 pass, zero nuove regressioni; tutte le chiavi Fernet perse coperte.
- Container test condiviso :18650; nessun servizio production toccato.
- Docker: immagine counselorbot-privacy-p12:local ricompilata; 34 P12 SQLite passati, rete disabilitata.
- SQL portability OK (19 occorrenze note, zero nuove); guidance-refresh/check OK.
- Integrazione P9: 59 P12/P9 passati su SQLite, 59 su Postgres e 59 nell’immagine Docker ricompilata.
- Integrazione P9: guidance-refresh/check, compilazione e portabilità SQL OK; container test arrestati.
## Prossimi passi
Revisione e merge della PR #586 da parte del proprietario; attivazione manuale come da runbook.
## Blocchi e rischi
Conservare vecchie chiavi per righe e backup; migrazione non attiva automaticamente.
Nessun deploy, sudo o dev avviato; container P12 di verifica terminato.
