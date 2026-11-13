# Handoff — feature/student-area-catalog-850 (#850)

## Stato
Completo: catalogo in /profilo, test verdi, PR in apertura.

## Fatto
- `components/home/InstrumentCatalog.tsx`: blocco catalogo estratto da `ReturningHome` (avviso chat in pausa, Bussola, consigli, gruppi con «Compila sul sito» e dettagli, elenco da riprendere, in arrivo), filtro di classe via `useUserAccess`.
- `ReturningHome` usa il componente (id `home-catalog-section` invariato).
- `PersonalAreaHome`: sezione «Attività e percorsi» (`#profile-instrument-catalog`) dopo i piani di classe, sopra «Da riprendere» e le pagine personali; avvio via `/?start=<id>`.
- `lastCompiledByTool` in `lib/catalog-status.ts` + test.

## Decisioni
- In /profilo niente elenco da riprendere del catalogo né rimando all'Area studente (`inPersonalArea`): la pagina ha già «Da riprendere» (`PersonalResume`), evitato il doppione.
- Avviso chat in pausa: supportato dal componente ma in /profilo non c'è ancora una sorgente (lo stato vive in `app/page.tsx`); lo collega #853/#854 quando l'atterraggio dopo il fiocco passa a /profilo.

## Verifiche
- `node --test src/lib/catalog-status.test.ts`: 6/6.
- eslint sui file toccati: pulito. tsc: nessun errore nei file toccati (solo `guide-extra-images.ts`, immagini guida non presenti nel worktree, preesistente).
- `tests/student-class-catalog.test.mjs` «Student area…» (3 test, 390px chiaro e scuro) verdi su `next dev --webpack` 3121.
- `make guidance-check`: allineata.

## Prossimi passi
- Review e merge della PR; #853/#854 collegano l'avviso chat in pausa e l'atterraggio a /profilo.

## Blocchi e rischi
- Il test preesistente «Restricted student sees only…» va in timeout su `networkidle` in questo ambiente (immagini `/_next/image` sospese nel browser): registrato come bug sospetto, non causato da questa modifica.
- Registrato anche: titoli di gruppo vuoti nel catalogo con accesso ristretto (preesistente, anche in home).
