# Privacy Layer di CounselorBot

Analisi e progettazione (fasi 1-2 del brief del 2026-10-24). **Nessun codice applicativo** in questa cartella.
Le misure descritte non rendono da sole il trattamento conforme al GDPR.

| Documento | Contenuto |
|---|---|
| [01-analisi.md](01-analisi.md) | i quattro livelli reali, stack, dove stanno i dati personali, autenticazione e autorizzazione, **tutte le uscite verso modelli e servizi esterni** con `file:riga`, filtro PII e cifratura esistenti, informative e consensi, lacune G1–G13 |
| [02-progettazione.md](02-progettazione.md) | confini di fiducia, contratti del Privacy Layer, motore PII locale, pseudonimi/HMAC/AES-256-GCM/Argon2id, chiavi, autorizzazioni e matrice ruoli, gateway AI fail-closed, informative e consensi versionati, threat model, migrazione reversibile |
| [03-piano-blocchi.md](03-piano-blocchi.md) | blocchi P0–P17 con Definition of Done, dipendenze, aree toccate, tier, parallelismo e collisioni con i compiti desktop |
| [04-decisioni-titolare-dpo.md](04-decisioni-titolare-dpo.md) | decisioni D1–D14 per titolare/DPO/consulente, documenti da produrre, fonti normative e stato della verifica |

I quattro livelli: **L1** server (Console/portable), **L2** app desktop docente, **L3** app desktop studente (Fase 2, non
ancora esistente), **L4** livello web Next.js (unico ingresso verso il backend). Il gateway AI non esiste come processo: va
costruito dentro il backend.
