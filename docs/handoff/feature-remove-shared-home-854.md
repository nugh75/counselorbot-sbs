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

## Prossimi passi
- Pushare la branch, aprire la PR con `Closes #854` e segnalare che è impilata su #858.
- Dopo il merge di entrambe, un solo deploy sull'istanza portable.

## Blocchi e rischi
- #853 deve arrivare su `main` prima della PR.
- Il deploy resta al proprietario dopo i merge; nessun comando sudo eseguito dall'agente.
