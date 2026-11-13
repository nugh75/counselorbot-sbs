# Handoff — Timoniere Counselorbot
Agente: `t-copilota-usmx` (Claude Fable 5.2) · Pane: `wV:p4` · Workspace Herdr: `wV`
Aggiornato: 13 novembre 2026, Europe/Stockholm.

## Stato
- Feedback tutor (aggiungere studenti, studenti di prova, gestione classe, colori di ruolo) concluso: issue #834–#838 chiuse, PR #839–#843 unite, main a `f307b564`.
- Deploy unico su portable (counselorbot.labform.net) eseguito il 13/11 alle 00:57: backend e frontend ricostruiti, 5 container healthy.
- Nessun subagente builder attivo; resta solo `srv-deploy` (Sonnet, pane `wV:p9`, task persistente `47f38ff3-2374-4e78-999e-30822d554d19`).

## Fatto
- Skill wayfinder e dipendenze nel repo (PR #827) e nello store skill della Console.
- Mappa wayfinder #828 e ticket #829–#833 chiusi con le decisioni dell'utente.
- #834 colori di ruolo (PR #839): studente = colore attuale, docente = crema, studente di prova = celestino; solo schede e badge.
- #835 dati di prova esclusi da conteggi, statistiche ed export (PR #840).
- #836 il docente aggiunge uno studente per email (PR #841): tabella `group_invitations`; l'invito è accettato quando quell'email apre il link della classe.
- #837 taccuino dello studente di prova negli strumenti senza punteggi (PR #842).
- #838 gestione classe in tre blocchi: studenti, inviti in attesa, studenti di prova (PR #843).
- Deploy della PR #825 (12/11) e deploy finale (13/11), backup `predeploy-20261113-005017.sql.gz`.

## Verifiche
- Check non desktop verdi su ogni PR prima del merge; `tests (postgres)` verde su #840 e #841.
- Dopo il deploy: tabella `group_invitations` presente, log backend puliti, sito 302 verso auth, piano prompt di fabbrica vuoto.
- Le PR #839, #842, #843 sono state controllate dagli agenti a 390px, tema chiaro e scuro; nessuna prova manuale in produzione.

## Prossimi passi
- Prova dell'utente in produzione: invito per email, studente di prova in uno strumento senza punteggi, schermata classe.
- Deploy solo a un passaggio significativo, mai dopo ogni merge.
- Deleghe: Sonnet per T0/T1, Opus per T2; niente Codex, nessun revisore automatico.

## Blocchi e rischi
- Counselorbot non spedisce email: ai4auth non ha un'API di invito, il docente invia il link dal proprio programma di posta. L'invio dal server sarebbe un lavoro nuovo.
- ai4auth non verifica l'email alla registrazione con password: per questo l'invito vale solo passando dal link della classe.
- Il check `documentation` sull'evento push può fallire quando l'ultimo commit non tocca la guida; fa fede quello sulla PR.
- Worktree usa e getta rimasti: `Counselorbot-wt-research-829`, `-proto-831`, `-proto-833` (branch mai uniti).
- `journal-cli notify` non recapita (repo senza cartella): best effort.
- `.timoniere.json` modificato nel checkout principale, non toccato.
