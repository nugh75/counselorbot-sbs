# Handoff fix/pqbl-auth-998 (issue #998)

## Stato
Implementazione completa, PR aperta verso main (non mergiata).

## Fatto
- `backend/routes/pqbl.py`: tutte le rotte con `get_current_user` (401 anonimo).
  Scritture solo proprietario; letture proprietario o `authorize_data_access`
  (admin locale, break-glass su L1; docenti senza grant pQBL). Altri: 404.
- Upload: max 25 MB, scritto su disco a blocchi da 1 MB con hash al volo (413);
  un upload per utente via lock file (`file_lock`) valido tra i 4 worker (429).
- Riuso del question bank solo tra documenti dello stesso utente.
- `backend/telegram_state.py`: passa l'identità alle rotte di lettura (si rompeva).
- Frontend `/profilo/pqbl`: messaggi 401/413/429 in sei lingue; limite 25 MB
  in hint e guida.
- Docs: CONTEXT.md (tabella API pQBL), funzionalita-counselorbot.md.

## Verifiche
- Backend (Postgres di test effimero, rimosso): test_pqbl_access.py (9),
  test_smoke -k pqbl, test_class_personal_tools -k pqbl,
  test_class_access_telegram: tutti verdi.
- Frontend: tsc --noEmit, eslint file toccati (0 errori), i18n:check,
  npm run test:ci (952/952). make guidance-check ok.
- Nessun controllo visivo (niente dev server per vincoli RAM).

## Prossimi passi
- Deploy backend + frontend (nessun passo sudo, nessuna migrazione).

## Blocchi e rischi
- Documenti pQBL vecchi senza username (caricati da anonimi) restano leggibili
  solo da admin.
