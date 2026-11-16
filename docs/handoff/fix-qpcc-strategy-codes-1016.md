# Handoff fix/qpcc-strategy-codes-1016
## Stato
Completo, PR aperta.
## Fatto
- 15 strategie QPCC: K1-K5 -> fattori correnti (K1 A1, K2 A2, K3 V1, K4 C1, K5 M3/M1); testi e keywords allineati.
- Seed: riallinea per slug le righe esistenti con codici K (factor_codes, testo, keywords, draft -> certified).
- Test rimosso da postgres_known_failures.txt; nuovo test di riallineamento.
## Verifiche
pytest: test_skills_specialized, test_certified_strategy_gating, smoke seed (31 passed). Postgres di test rimosso.
## Prossimi passi
Deploy backend (nessun passo manuale).
## Blocchi e rischi
Nessuno.
