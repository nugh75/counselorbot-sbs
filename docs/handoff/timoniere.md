# Handoff — Timoniere Counselorbot
Agente: `ex-t-copilota-usmx` (Claude) · Pane: `wV:p4` · Workspace Herdr: `wV`
Aggiornato: 14 novembre 2026, Europe/Rome.

## Stato
- Main a `48f17339`, deployato su portable (counselorbot.labform.net) il 14/11 alle 03:19: solo frontend, container healthy, sito 302 verso auth.
- Nessun subagente builder attivo; resta `srv-deploy` (Sonnet, pane `wV:p9`). La sessione Codex `t-copilota-pttf` (pane `wV:pN`) è registrata come Timoniere in `.timoniere.json` ma è inattiva.
- Nessuna PR aperta del lavoro di questa sessione.

## Fatto
- Feedback tutor (#834–#838, PR #839–#843) e invito per email che apre il programma di posta (#846, PR #847).
- Una sola area per ruolo, via la pagina comune degli strumenti (map #848, issue #849–#854): menu «Scegli la tua classe» in Area studente, catalogo in Area studente, «Prova gli strumenti» in Area docente, arrivo per ruolo.
- Aspetto piatto e uniforme delle due aree (map #861, chiusa): elenco a voci condiviso (`components/ui/EntryList.tsx`), illustrazioni degli strumenti dal prototipo approvato (`components/ui/ToolIllustration.tsx`), variante piatta di `Card`, pagine interne allineate. PR #871 #872 #877 #878 #879 #880 #881 #882 #883 #884 #885 #886.
- Pulizia: cache di build Docker (21 GB) e volumi anonimi orfani; 114 worktree con lavoro già unito rimossi.

## Verifiche
- Check CI non desktop verdi su ogni PR prima del merge; build di produzione del frontend riuscita al deploy.
- NON fatto: test browser e controllo a 390 px delle PR di #861 (dev server troppo lento sul disco esterno). Da guardare a schermo.

## Prossimi passi
- Controllo visivo dell'utente in produzione delle due aree e delle pagine interne.
- Deploy solo a passaggi significativi; deleghe Sonnet per T0/T1, Opus per T2.
- Con più di tre agenti in parallelo il disco esterno rallenta tutto: tenere al massimo tre agenti e un solo dev server.

## Blocchi e rischi
- Worktree non rimossi perché hanno modifiche non salvate (decide l'utente): `chore-monitoraggio-luna`, `fix/desktop-student-pairing-602`, `feature-noticing-all-sources` (19 file modificati), `fix-desktop-local-auth`, `flusso-attivita-recovery`, `fix/portable-proxy-auth-timeout-254`, `fix/test-baseline-frontend`, `timoniere-rilascio-2.1.0`, `qsa-prompting-regression` (2 commit non uniti), tre `task-…` con storia diversa da main.
- Prototipi usa e getta su GitHub: `prototype/flat-areas`, `prototype/role-colours`, `prototype/test-student-picker`; ricerche su `research/*`.
- `journal-cli notify` non recapita (best effort).
