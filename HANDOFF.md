# Handoff: Libretto nella triade — COMPLETATO
Data: 2026-09-26 | PR #8, merge su `main`

Il piano `docs/plans/2026-09-25-libretto-nella-triade-plan.md` (21 task, lotti A–D) è chiuso:
revisione finale Opus con una tornata di correzioni e ri-revisione pulita.

Resta da fare, fuori dal piano:
- rigenerare le catture della guida: `frontend/scripts/capture-guide.mjs` si ferma al passo
  calendario perché simula una tappa futura, che la linea del tempo non mostra più;
- test browser `test:timeline` (2 fallimenti) e `test:visual` falliscono anche su `main`
  prima del piano: da sistemare a parte;
- `student_booklets` resta come sorgente di sola lettura della migrazione; toglierla in una
  release successiva, dopo aver escluso workspace e marcatori dalla pulizia dei log a 90 giorni.

Backup DB prima del rilascio: `~/counselorbot-backups/pre-libretto-triade-20260926-0850.dump`.
