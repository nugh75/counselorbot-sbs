# Handoff: refactor/idea-brand-tokens-927 (#927)

## Stato
Implementazione completata; nessun processo dev avviato. Working tree pulito, PR da aprire.

## Fatto
- **A4, percorso IDEA + introduzione della chat**: rimossi `teal-*` e `rose-*` dai sette file
  in scope, sostituiti dai token già esistenti in `globals.css` (`brand`, `brand-hover`,
  `brand-soft`, `brand-line`, `link`, `ink`, `ink-body`, `ink-on-brand`, `danger-soft`,
  `danger-line`, `danger-ink`) e da `accent-brand` per cursori e caselle.
- `GuidedChatIntro`: il riquadro diventa `Callout variant="info"` (icona `Compass`); il
  `<section data-testid="guided-intro">` resta il contenitore semantico, con il titolo
  `#guided-intro-title` e i due pulsanti dentro, così i test del browser non cambiano.
- CTA testuali (ricerca fonti, salvataggio nodo mappa) ora usano `Button size="sm"`; i
  pulsanti icona soli restano `<button>` con le stesse classi della variante primary.
- Nuova guardia `frontend/src/lib/idea-brand-tokens.test.ts` (nessuna tinta teal/rose,
  Callout nel riquadro, token danger sulle eliminazioni).
- Doc: `docs-counselorbot/funzionalita-counselorbot.md`.

## Verifiche
- `node --test --experimental-strip-types src/lib/idea-brand-tokens.test.ts`: 3/3.
- `tsc --noEmit -p frontend/tsconfig.json`: nessun errore dai file toccati; restano i 252
  errori pre-esistenti `public/guide/*/*.png` e l'errore `field-wiring.test.ts` (TS5097)
  già su main.
- `eslint` sugli 8 file toccati: 0 errori, 0 warning.
- Accettazione: `grep -n "teal-\|rose-"` sui sette file → nessun risultato.
- Nessun controllo visivo/browser (Mac 8 GB, volume esterno lento): da verificare a occhio
  tema chiaro e scuro su IDEA e sul riquadro introduttivo.

## Prossimi passi
- Revisione visiva (chiaro/scuro) di IDEA e dell'introduzione; aprire/mergiare la PR.

## Blocchi e rischi
- Bug sospetto registrato: i token `--info-*` non hanno un valore scuro per `--info-ink`
  (resta `var(--ink)` risolto a `:root`), quindi il testo dei `Callout` info in tema scuro
  può risultare scuro su fondo scuro. Qui i testi del Callout portano `text-ink` /
  `text-ink-body`, quindi l'introduzione resta leggibile; il difetto generale è nel tema.