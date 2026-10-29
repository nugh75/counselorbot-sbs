# Handoff — menu «⋮» delle chat a sezioni (#682)

## Stato
In corso — s14-menu-opus, milestone #39 «Chat UX unification». Branch
`feature/chat-options-menu-sections` da `origin/main` 9b05cf82. Issue #682.
Solo frontend e documentazione: nessun backend, nessun `.github/`.

## Fatto
- `components/ui/ChatOptionsMenu.tsx`: `ChatMenuSection` (titolo come
  `role=group` + `aria-labelledby`, sparisce se non ha voci), `ChatMenuSetting`
  (riga «Etichetta  valore ›», `aria-label="Etichetta: valore"`, apre un
  sottolivello in portale con «‹» e titolo), classi della variante `list`.
- `ChatActionsPopover`: stato del sottolivello; livello principale `hidden`
  ma nel DOM (il portale delle opzioni vocali resta montato); Esc nel
  sottolivello torna indietro (preventDefault), fuoco sulla riga d'origine.
- Selettori formato/lunghezza/analisi/taccuino: prop `list` (righe ≥44 px con
  etichetta), stessi `role=radio` e `aria-label` di prima.
- `ChatResponseSettings` = sezione «Risposte»; taccuino come riga in fondo,
  il picker «Prova» sta nel suo sottolivello.
- Guidata: Azioni (voce, esplorazione, dettatura) · Mostra · Risposte · Guida.
  «Pannello» dentro Mostra solo da desktop (`useIsDesktop`, stessa soglia
  1024 px del pannello): la soluzione più semplice, il pannello ha già le schede.
- Bussola: Azioni · Risposte · Guida (`orientation`). Assistente: Azioni ·
  Risposte, **senza Guida**: non esiste una voce di guida per l'Assistente.
- i18n: `menuActions/menuShow/menuResponses/menuBack` in 6 lingue.
- Doc: funzionalita (paragrafo #682), `docs/operations/chat-ux-standard.md`.

## Scostamenti dalla proposta
- «Usa il taccuino» non è un interruttore: è una scelta a 5 (2 in Bussola);
  resta una riga con valore e sottolivello per non cambiare la logica.
- «Per te ●»: mostra il conteggio esistente, nessun dato nuovo.
- Formato: solo Discorsivo / Per punti (la tabella è stata tolta prima).

## Verifiche
- Vedi PR. Dev su 127.0.0.1:3182 (solo frontend, API simulate nei test).

## Prossimi passi
- Dopo il merge: `make guidance-refresh` se il check lo chiede.
