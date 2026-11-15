# Handoff — fix/back-links-section-rules-952 (issue #952)

## Stato
Implementazione completa, verifiche locali verdi, PR aperta su `main`.

## Fatto
- `ui/EntryList.tsx:10,14`: filetto dei titoli di sezione `border-line` → `border-line-strong`
  (riga hover di `EntryLink` lasciata su `border-line`).
- Stesso cambio sulle altre regole di sezione con `pb-1/pb-2/pb-3` in `h2`/`h3` o loro wrapper:
  `flashcards/FlashcardsPage.tsx:150`, `profile/PersonalAreaHome.tsx:186`,
  `profile/PersonalAIConnections.tsx:19`, `teacher/PracticeChats.tsx:77`,
  `teacher/ClassCompilationsSection.tsx:72`, `teacher/ClassPracticeStudents.tsx:52`,
  `teacher/PracticeNotebooks.tsx:49` (costante `sectionTitle`),
  `teacher/PracticeRepertoire.tsx:112`, `teacher/TeacherNotebook.tsx:309` (legend con h2/h3).
  Non toccati righe di tabella/elenco, divisori di form e regole `pb-4`.
- `ui/BackButton.tsx`: entrambe le varianti sono link di testo (freccia 16px, `text-ink-muted`,
  `hover:text-link`), niente bordo/fondo/pillola/cerchio; disabilitato a opacità 50%;
  commento in testa riscritto. Nessuna modifica a call site, prop o etichette.
- Test: `lib/ui-primitives-tokens.test.ts` — `BackButton` aggiunto alle primitive sorvegliate
  + due test mirati (link di testo, regola di sezione forte).
- Docs: `docs/design.md` (§4 elenco a voci, tabella primitive `BackButton`),
  `docs-counselorbot/funzionalita-counselorbot.md` (paragrafo #952).

## Verifiche
- `node --test --experimental-strip-types src/lib/ui-primitives-tokens.test.ts` → 17/17 ok.
- `tsc --noEmit -p .` (con `next-env.d.ts` rigenerato, file ignorato da git) → 0 errori.
  Senza `next-env.d.ts` gli unici errori sono i moduli png di `guide-*.ts` (ambiente, non codice).
- `eslint` sui 12 file toccati → 0 errori, solo warning preesistenti (`<img>`, variabile inutilizzata).
- `make guidance-check` → ok.
- Nessun controllo visivo: nessun dev server/Docker (Mac 8 GB, volume lento).

## Prossimi passi
- Merge della PR da app; nessun passo manuale, nessun rebuild Docker necessario (solo frontend).

## Blocchi e rischi
- I quattro file dei piani docente (`ClassPathsTab`, `ClassPathProgress`, `PathTemplatesPanel`,
  `TeacherClassPathsPage`) non hanno regole di sezione con `pb-1/2/3`: solo wrapper `pb-4`,
  esclusi dalla specifica. Nessun cambiamento là; i file con `pb-4` restano `border-line`.
- Le regole di sezione con `pb-4` (panoramica classe, dispositivi, profilo) restano su
  `border-line`: fuori scope, da valutare in un follow-up se il proprietario le vuole forti.