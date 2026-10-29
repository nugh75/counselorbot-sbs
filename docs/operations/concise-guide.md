# Guida pratica per azioni

`/guide` presenta sei gruppi di istruzioni per studente e docente. La ricerca
filtra titoli, scopi, passaggi e note della vista scelta; ignora maiuscole e accenti.
Una procedura ha uno scopo, tre passaggi, un'azione verso l'app e una schermata.
Una nota aggiuntiva è espandibile; accessi e limiti importanti restano visibili.
Le istruzioni sono riscritte nelle sei lingue, con massimo 115 parole per scheda.

Le viste sono documentazione, non un'autorizzazione all'uso delle funzioni:
la guida docente resta leggibile da un collegamento pubblico esplicito, come prima.
Il selettore compare per docenti, ricercatori e amministratori; la vista admin
richiede l'identità amministratore. API personali e ChatGPT seguono la disponibilità.

## Navigazione e compatibilità

- `?audience=student|teacher|admin&task=<id>` apre una scheda.
- `?audience=...&group=<id>` elenca le istruzioni di un argomento.
- `?q=...` conserva la ricerca anche con Indietro e ricarica. La ricerca è locale,
  senza richieste AI o lettura di dati personali.
- Le ancore `#guide-section-1`–`17`, `#guide-teacher-section-1`–`9`,
  `#guide-chat-controls` e i vecchi ingressi di configurazione vengono risolti
  e convertiti con replaceState nel collegamento canonico.
- I link di aiuto nei piani, nelle chat e nei moduli punteggi aprono la scheda
  pertinente in un'altra scheda del browser. La chat conserva il popup esistente,
  ora con le stesse istruzioni brevi.

Il primo titolo di una procedura riceve il focus. Ingrandimento immagini con
chiusura visibile, Escape, focus confinato e ritorno al comando di apertura.
I controlli principali hanno almeno 44 px e la ricerca ha un'etichetta accessibile.

## Schermate e verifiche

`scripts/capture-quick-guide.mjs` produce cinque schermate mirate per lingua,
con API interamente intercettate e dati inventati: comandi chat, tentativo del piano,
connessione API vuota, connessione ChatGPT e selettore filtro esterno.
Genera `guide-extra-images.ts`, comprese le coordinate dei richiami ai pulsanti
Riprendi e Fai un altro tentativo. Le altre schermate localizzate vengono riusate.

Suite: `src/lib/guide-tasks.test.ts`, `tests/guide-audiences.test.mjs`,
`tests/personal-ai-visibility.test.mjs`, `tests/external-privacy.test.mjs` e
la regressione della guida in `tests/teacher-class-compilations.test.mjs`.
Eseguire le prove browser su immagini di produzione isolate a :3164, con API
sintetiche. Non è necessario un database per questa modifica frontend.

Prima del commit: test frontend, TypeScript, ESLint mirato, controllo i18n,
`make guidance-refresh` e `make guidance-check`. Ricostruire l'immagine frontend;
distribuzione dopo il merge. Nginx portable invariato: `sudo ./update_nginx.sh`
non è necessario. Nessun ambiente di sviluppo con dati di produzione.
