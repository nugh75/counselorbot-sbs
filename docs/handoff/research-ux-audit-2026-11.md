# Handoff — research/ux-audit-2026-11 (#895)

## Stato
Completo. Ramo usa e getta, nessuna PR (come da compito).

## Fatto
- Audit UX in sola lettura dei percorsi studente e docente su `main` `e2fc242a`.
- Risultato: `docs/research/ux-audit-2026-11.md`, con 33 rilievi (file:riga, gravità, sforzo) e 20 issue proposte in ordine, ciascuna con criteri di accettazione.
- 4 bug registrati nel Diario con triage sospetto: Indietro di `/profilo` che torna su sé stesso, contrasto di `--success`, pagina API personali vuota, «Libretto» nella guida IT/FR.

## Verifiche
- Solo lettura del codice: nessun server dev, browser, Docker o suite di test.
- Rapporti di contrasto calcolati dai token di `globals.css`.
- Parità delle chiavi di `lib/i18n.ts` controllata con un diff delle chiavi (1303 chiavi per lingua).
- Nessun controllo visivo a 390 px né in tema scuro.

## Prossimi passi
- Il proprietario sceglie quali delle 20 proposte aprire come issue; le prime 6 e l'11 sono vittorie rapide.
- La proposta 13 (unire dashboard e impostazioni) richiede prima una decisione del proprietario.

## Blocchi e rischi
- I rilievi su layout e mobile sono dedotti dalle classi: vanno confermati a vista prima della correzione.
- Palestra (#892), noticing (#890) e retry QSA (#889) sono in corso: da rivedere dopo il merge.
