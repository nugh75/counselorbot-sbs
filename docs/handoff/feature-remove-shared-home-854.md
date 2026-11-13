# Handoff — Rimozione della pagina comune degli strumenti
Agente: `s15-rimozione-854` · Branch: `feature/remove-shared-home-854` · Task: `2b727384-f475-4e7b-a568-b643eed0c499`

## Stato
- Completato in un clone isolato su disco interno, `/private/tmp/counselorbot-854`.
- Impilata su #853 (`feature/role-landing-853`, PR #858): il merge di quella branch è già dentro questa.

## Fatto
- Rimossa la voce «Attività e percorsi» dalle navigazioni desktop e mobile.
- Riutilizzata la conferma di eliminazione e conservata la ripresa pQBL in «Da riprendere» nell'Area studente.
- Eliminati `ReturningHome`, il passo `base` e lo stato collegato (`studentPaths`, `lastCompiledAt`); l'introduzione e i deep link restano.
- Aggiornati i test browser: catalogo dell'Area studente al posto della vecchia home, redirect `/strumenti` temporaneo (307), intro raggiunta con `?view=intro`.
- Aggiornate guida funzionale, `CONTEXT.md` e le note sulle illustrazioni.

## Verifiche
- `next typegen`, `tsc --noEmit`, ESLint mirato: superati.
- Build di produzione (`npm run build`): superata.
- Unit test: 794/795; unico fallimento noto e preesistente `idea-branching.test.ts` («branch commands sit next to the composer»).
- Browser: `legacy-routes` 11/11, `account-onboarding` 44/45 (il solo «chat mode is remembered» è preesistente su `main`), test del catalogo e della vista di classe superati.
- `make guidance-check`: superato.

## Rilascio
- PR #858 (`feat: send each role to its own area`, #853) mergiata il 13 novembre 2026
  in `8c34f59d`; PR #859 (`refactor: remove the shared tools page`, #854) mergiata
  subito dopo in `68979552`.
- Deploy unico sull'istanza portable lo stesso giorno: `main` a `68979552`,
  `docker compose --env-file .env -f docker-compose.portable.yml up -d --build`.
  Backend rimasto healthy senza ricreazione (codice invariato); frontend,
  trascrizione e Piper ricreati e healthy; PostgreSQL healthy.
- Verifiche sul deploy: `/` mostra «Accesso richiesto» con «Accedi a CounselorBot»
  e il questionario «Dicci com'è andata»; `/strumenti` risponde 307 verso
  `/?view=home`; `/profilo` 200; `/runtime-config.js` 200 con gli URL pubblici;
  nessun errore nei log del frontend; zero errori JavaScript nella pagina.
- Nessun comando `sudo` richiesto né eseguito: la configurazione nginx della
  Console non cambia.

## Prossimi passi
- Nessuno per #853 e #854. Restano da verificare a mano, con un account reale,
  l'atterraggio per ruolo e la ripresa pQBL nell'Area studente.
