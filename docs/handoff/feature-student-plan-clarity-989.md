# Handoff — feature/student-plan-clarity-989 (#989)

## Stato
Implementazione completa (WP1 + WP2 + decisioni del proprietario del 16 nov). PR in apertura.

## Fatto
- Nome lato studente «Attività assegnate» (voce Area studente, intestazioni, Guida); rotta invariata.
- Home `/profilo`: solo blocco «Da fare adesso» per piano + link alla pagina completa; errore di caricamento → Callout con «Ricarica».
- Card in `/profilo/piani-operativi`: occhiello senza maiuscolo, frase per lo studente, «1 su 4 attività completate», blocco Da fare adesso (unico pulsante pieno), righe compatte con 4 stati a parole, dettagli a richiesta (ripetizione come link, «Le volte precedenti (n)» senza la corrente, chevron lucide, summary 44 px), niente opacity-60/`[n]`/percentuale/«rilevato automaticamente», date leggibili.
- Piano finito chiuso con messaggio; stato vuoto con «Vai all’Area studente».
- Etichette: Continua, Vedi i risultati / Rileggi la conversazione, Compila di nuovo, Ricomincia da capo; analisi «Inizia/Continua la conversazione»; sei lingue; testi Guida allineati.
- h1 nella pagina attività (chat/analisi); PlanChatCompleted piatto.

## Verifiche
- tsc pulito; eslint sui file toccati pulito; i18n:check ok; `npm run test:ci` 948/948; make guidance-check ok.
- Nessuna verifica visiva (niente dev server: Mac 8 GB, volume lento).

## Prossimi passi
- Rigenerare gli screenshot della Guida rapida (`capture-quick-guide.mjs`) con le nuove etichette.
- Ticket separati: logica date, conferma prima di ripetere.

## Blocchi e rischi
- `frontend/node_modules` è un symlink locale (ignorato da git) verso il checkout principale; `next-env.d.ts` generato localmente (ignorato).
