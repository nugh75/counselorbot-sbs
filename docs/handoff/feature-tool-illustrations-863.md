# Handoff — illustrazioni degli strumenti (#863)

## Stato
Codice completo, in PR. Branch `feature/tool-illustrations-863` da main.

## Fatto
- `frontend/src/lib/tool-illustrations.ts`: 12 SVG copiati as-is dal prototipo + `toolIllustration(id, category)` con fallback all'immagine di categoria.
- `frontend/src/components/ui/ToolIllustration.tsx`: SVG inline decorativo (aria-hidden).
- `globals.css`: palette `--i-*` chiara e scura (`.dark`).
- Nessun layout toccato (#864/#865 lo useranno).

## Verifiche
- `node --test` su `src/lib/tool-illustrations.test.ts`: verde.
- tsc/eslint sui file nuovi. Nessun controllo visivo nel browser, nessun dev server.

## Prossimi passi
Nessuno per #863.

## Blocchi e rischi
Nessuno.
