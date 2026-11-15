# Handoff: feature/ui-primitives-923 (#923)

## Stato
Implementazione completata; verifiche mirate in corso, poi commit, push e PR verso main.

## Fatto
- Nuove primitive in `frontend/src/components/ui/`: `Field` + `Input`/`Select`/`Textarea`, `StatusBadge`, `Dialog` (+ `DialogBody`, `DialogFooter`); `buttonClasses` e `ButtonLink` in `Button.tsx`.
- `lib/field-wiring.ts`: id di aiuto/errore e `aria-describedby` (logica pura, testabile senza DOM).
- `globals.css`: token `--backdrop` (chiaro e scuro) e utility `bg-backdrop`.
- Pilota: palestra di prova (`PracticeNotebooks`, `PracticeChats`, `PracticeRepertoire`) e obiettivi (`GoalDialog`, `GoalCatalogDialog`). `GoalsPanel` non aveva campi, pillole né veli: invariato.
- Doc: `docs/design.md` §5, `funzionalita-counselorbot.md`, `CONTEXT.md`.

## Verifiche
- `node --test --experimental-strip-types` su `ui-primitives-tokens`, `field-wiring`, `practice-notebooks`: 27/27; `tests/targeted-goals.test.mjs`: 3/3.
- tsc ed eslint sui file toccati: vedi PR.
- Nessun controllo visivo (niente dev server per vincolo del volume lento / 8 GB).

## Decisioni
- `docs/design.md` è in italiano (non in inglese come dice la issue): righe nuove in italiano per coerenza della tabella.
- Il repo non ha vitest né jsdom: test di Dialog e Field a lettura del sorgente (convenzione del repo) più test unitari della logica `fieldWiring`.
- `StatusBadge` e `ButtonLink` non hanno ancora usi nel pilota (nessuna pillola né link-pulsante `Link` lì); il download PDF dell'obiettivo usa `buttonClasses`.
- `GoalUI.tsx` (`Field`, `input`) resta per `GoalForm`: fuori dai file del pilota.

## Prossimi passi
- Revisione e merge della PR; adozione nel resto dell'app nei ticket successivi di #920.

## Blocchi e rischi
- Cambio visivo minimo nel pilota: campi `px-3 text-sm` (prima `px-4`, nel goal dialog `text-base`), pulsanti secondari con bordo `border-line` di `Button`.
