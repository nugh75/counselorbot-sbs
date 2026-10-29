# Handoff — ChatMarkdown condiviso (#654)

## Stato
In consegna — milestone #39, seconda slice. Branch `feature/chat-ux-markdown-654`
da `origin/main` 1eeddc57 (merge #667). Task Diario ee7368f4.

## Fatto
- `frontend/src/components/ui/ChatMarkdown.tsx`: renderer della chat guidata
  spostato (split diagrammi / errore provider / Markdown, tabella con scroll nel
  contenitore `tabIndex=0`), più stili espliciti per h1–h4, link, codice in
  linea e a blocchi, citazioni, righe (prima solo dalla `.prose` globale).
- Adottato in chat guidata, Bussola, Assistente e `PlanActivityReview` (che già
  importava `GuidedMessageContent`, rimosso). Tolti i wrapper `prose` di Bussola
  e Assistente; errore provider con `guided.stepConnError` ovunque.
- Assistente: messaggi della persona in testo semplice come le altre chat;
  anteprima documenti invariata (non è chat).
- Commit: 91e826bc feat, df4857b3 test, più docs.

## Verifiche
- `tests/chat-markdown.test.mjs` 2/2 (390/1440), due run: HTML identico sulle
  tre superfici, link/codice/citazione/elenco/grafico/errore, `<img>` grezzo
  non reso, tabella che scorre nel box, pagina senza scroll orizzontale.
- `chat-shell` 4/4; `voice-reader` Bussola+guidata 7/7; `diagram-content` 6/6.
- `chat-recovery` 28/32: i 4 di baseline (bug 90d5eee3).
- `qpcc-chat-formatting` 0/5 anche con i sorgenti di main → baseline, bug
  fab2ede3; la tabella della guidata è coperta dal nuovo test.
- `tsc` 0; ESLint file toccati 0; `i18n:check` solo i 12 testi di baseline.
- Immagine isolata `counselorbot-frontend:chat-markdown-654` (runner) ok;
  nessun container avviato, produzione intatta. Dev :3173 fermato.

## Prossimi passi
- #655 audio/TTS, #656 composer, #661 diagrammi: non iniziati.

## Blocchi e rischi
- Dev Next: il primo test dopo una modifica di file può scadere per la
  ricompilazione; rilanciare senza modifiche intermedie.
