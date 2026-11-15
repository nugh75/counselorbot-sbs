# Handoff feature/flat-guided-path-926

## Stato
Implementazione di #926 completa; PR #941 aperta, check non desktop verdi (documentation, eslint).

## Fatto
- CounselorSelector: elenco a righe con filetto, una riga di metadati «·» al posto delle 9 pillole, niente ombre, avvisi in Callout, proposta sotto filetto (non box nel box).
- CounselorCover: fallback SVG piatto su `--i-*` (niente linearGradient, hex, indaco/viola, maiuscolo).
- AnalysisModeSelector: EntryLink con onOpen. InputMethodSelector: righe piatte sui token, Select/Input/Button; resta selezione + doppio clic (i `<select>` interni non stanno in EntryLink).
- glass-panel ritirato dai file del percorso guidato e dalla chat (ChatSettingsCard, ProfileScoresPanel, GuidedChatInterface, ProfileVisualization, RecommendationsPanel) e cancellato da globals.css. page.tsx: 5 Card boxed → flat.
- Test: src/lib/guided-path-flat.test.ts. Doc: funzionalita, design.md §4.

## Verifiche
- node --test (Node 22) su 17 file sorgente-contratto: 103/103 verdi.
- tsc: nessun errore nei file toccati (preesistenti: .png senza next-env.d.ts, field-wiring.test.ts). eslint: 0 errori.
- Nessun dev server né Docker: controllo visivo non fatto.

## Prossimi passi
Merge da parte dell'utente; #933 (colori fattori) dopo questo.

## Blocchi e rischi
- `components/privacy/*` usa ancora `glass-panel`: lo toglie #925 (in parallelo). Finché #925 non è su main quelle sezioni restano senza riquadro e il grep dell'acceptance non è vuoto.
- node_modules del worktree è un symlink (non tracciato) al checkout principale.
