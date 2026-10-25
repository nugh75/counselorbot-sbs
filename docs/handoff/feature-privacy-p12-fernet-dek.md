# P12 — s72-p12-fernet
Task: a62aae25-ef78-4af6-b0a2-369de174421a
Branch: feature/privacy-p12-fernet-dek

## Stato
Implementazione verificata; issue #583, base iniziale uguale a origin/main.
## Fatto
- Letti prompt, regole Timoniere, KeyRing P5 e cifratura P11.
- Decisione: switch esplicito PRIVACY_CREDENTIAL_ENCRYPTION, default Fernet compatibile.
- Con switch on: tre DEK separate, lettura duale, errori senza contenuti.
- Job a lotti e runbook implementati; vincolo schema aggiornato, errore HTTP 503 istituto.
- Richieste senza creazione chiavi; bootstrap rifiuta DEK perse con credenziali migrate.
## Verifiche
- SQLite: 98 pass (P12, P5, P11, istituto, admin API/ChatGPT); zero nuove regressioni.
- Python predefinito 3.9 incompatibile; verifiche host con Python 3.11.9.
- Altri 5 test SQLite passati (schema vecchio, BEGIN IMMEDIATE, chiave Fernet rimossa).
- Postgres: 104 + 3 pass, zero nuove regressioni; tutte le chiavi Fernet perse coperte.
- Container test condiviso :18650; nessun servizio production toccato.
- Docker: immagine counselorbot-privacy-p12:local ricompilata; 34 P12 SQLite passati, rete disabilitata.
- SQL portability OK (19 occorrenze note, zero nuove); guidance-refresh/check OK.
## Prossimi passi
Implementazione committata (c8af7ce0); test in commit separato, poi documentazione, push e PR.
## Blocchi e rischi
Conservare vecchie chiavi per i record Fernet; migrazione non attiva automaticamente.
