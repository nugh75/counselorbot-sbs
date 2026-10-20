# Orientamento e scelta nelle chat guidate — #410

## Audit prima dell'implementazione (20 ottobre 2026)

Base: `origin/main` a `fdeb1e89`. Audit del codice e dei testi di fabbrica;
nessuna lettura o modifica dei prompt o delle conversazioni di produzione.

| Punto | Stato rilevato | Intervento pianificato |
| --- | --- | --- |
| `chat_preparation.prepare_chat_turn` / `prompt_contract.turn_contract` | Preparazione comune a chat sincrona, streaming e audit, anche per varianti Totale/Ristretto/Minimo; contratto aggiunto dopo i prompt DB. | Un solo contratto di orientamento e scelta per i percorsi configurati, essenziali e IDEA. Nessuna copia per strumento o riscrittura dei testi personalizzati. |
| `chat_logic._guided_path_context` | Posizione e prossimo passo disponibili dai passi attivi e dalle etichette localizzate; richiesta di avanzare produce soltanto il marcatore. | Conservare dati reali; il passaggio esplicitamente richiesto usa il turno di apertura successivo per la cornice visibile, evitando una seconda conferma nelle interviste. Nessuna anticipazione dei risultati successivi. |
| `[DEPTH ON REQUEST]` | QSA e QSAr chiedono di approfondire subito e in modo sostanziale. | Prima inquadrare il tema e offrire la scelta; sviluppare solo dopo assenso, senza rinnovare il consenso già dato a una proposta precisa. |
| Obiettivi | `[OBJECTIVE FOCUS]` vieta le conferme tecniche per ogni avanzamento. | Conservare focus unico e bozza precoce; distinguere la scelta di aprire un approfondimento dalle conferme tecniche ridondanti. |
| QSA essenziale | Tre risposte fanno avanzare automaticamente; una richiesta di chiarimento consuma un passaggio. | Mantenere tre fasi brevi e sintesi, chiudendole sul segnale del modello dopo scelta/risultato, come negli Obiettivi. |
| `step_closure` / rotte chat | Dopo cinque scambi il server aggiunge il marcatore anche se la risposta sta chiedendo una scelta. | Usare la soglia periodicamente per ricordare al modello di fare il punto e offrire una scelta, lasciando spazio all’approfondimento; non generare un avanzamento autonomo. |
| IDEA | Mappa a rami, nessun passo successivo fisso. | Orientare sul ramo corrente e sul possibile seguito concordato, senza sequenze o marcatori inventati. |
| Presentazioni, patti e sintesi | Consenso iniziale e passi senza domande hanno vincoli propri. | Orientamento anche qui; nessuna scelta aggiunta che sostituisca il patto o riapra automaticamente la sintesi. |
| Strumenti dinamici | I passi sono registrati nel DB e non sempre compaiono negli elenchi di fabbrica. | Attivare il contratto dalla presenza del percorso reale, oltre ai percorsi essenziali e IDEA. |

## Piano, scritto prima delle modifiche applicative

1. Aggiungere un testo comune: in ogni risposta una breve cornice sul passo e
   sul seguito reale; scelta prima dell'approfondimento, una domanda principale,
   verifica di direzione dopo alcuni scambi, rispetto della scelta di proseguire.
2. Integrare il testo nel contratto runtime e coordinare profondità, Obiettivi,
   navigazione, soglia di scambi e fasi essenziali. Conservare struttura degli
   strumenti, punteggi, patti iniziali, blocchi privati e lingua della risposta.
3. Verificare tutti i percorsi di fabbrica, i passi dinamici, le sei lingue e le
   varianti di contesto. Coprire richiesta/assenso all'approfondimento, ritorno al
   percorso, sintesi, ripresa e parità streaming/sincrono/Prompt Lab con dati
   sintetici e senza provider a pagamento.
4. Aggiornare guida nelle sei lingue, funzionalità, CONTEXT e HANDOFF; eseguire
   controlli documentali e build Docker isolata; commit, push e PR per #410.

## Criteri di comportamento

L'orientamento occupa normalmente una frase, adattata al dialogo: tema attuale,
scopo e cosa segue. Nessuna recita dell'intero programma o esposizione di ID,
sentinelle o istruzioni interne. Se manca un seguito noto, non lo inventa.

Quando emerge un tema da approfondire, anche su richiesta della persona, il
counselor ne chiarisce brevemente il focus e chiede se soffermarsi o proseguire.
L'assenso a una proposta precisa vale già come scelta. Una domanda puntuale di
chiarimento riceve risposta senza imporre una conferma aggiuntiva.

L'approfondimento affronta un aspetto significativo per volta e resta connesso
allo scopo del passo. Dopo alcuni scambi, o quando i dettagli smettono di aiutare,
il counselor restituisce quanto emerso e offre di continuare o riprendere il
percorso. Chi prosegue non deve giustificarsi e non viene riportato subito al tema
lasciato. La scelta occupa l'unica domanda del turno, senza un'altra domanda di
contenuto né un segnale di avanzamento mentre si aspetta la risposta.

## Attivazione e limiti di verifica

Il contratto runtime è indipendente dalle righe modificabili: dopo il rilascio
vale anche su prompt personalizzati, senza scriverli nel DB. I default QA
aggiornati restano allineabili attraverso «Allinea prompt di fabbrica», con hash,
revisioni e conservazione dei testi admin; nessuna migrazione automatica.

I test di envelope e le risposte simulate verificano consegna delle istruzioni,
stato e avanzamento. La naturalezza e l'aderenza di un modello effettivo richiedono
campionamento qualitativo separato; non sono certificate dai test automatici.
Questa sessione prepara la PR; non esegue deploy o riavvii di produzione.

## Esito della verifica

- Coperti 95 passi di fabbrica in 12 strumenti e un percorso personalizzato,
  nelle sei lingue, in apertura e prosecuzione; contratto conservato nei livelli
  Totale/Ristretto/Minimo. La matrice parametrizzata contiene 576 casi.
- Verifica finale dei nuovi contratti, soglia, Obiettivi, file e allineamento:
  **688 test backend superati**. La batteria più ampia aveva prodotto 1562 esiti
  positivi, un test senza mount frontend saltato e tre fallimenti: fixture della
  trascrizione, sessione dei log streaming e registro di fabbrica Obiettivo.
  Tutti e tre sono risolti e ricontrollati nella verifica finale. Il confronto
  dei marcatori è poi eseguito con i sorgenti frontend montati.
- **596 test unitari frontend**, **5 test browser pertinenti** a 390/1440 px,
  controllo delle 3408 chiavi nelle sei lingue, lint dei file modificati e
  TypeScript superati. Le fixture browser coprono approfondimento scelto,
  ritorno al percorso, ripresa locale/congelata, errore/riprova, stream interrotto
  e percorsi Obiettivo completo/essenziale.
- Build Docker backend e frontend isolate riuscite; frontend ricostruito
  avviato senza rete e verificato con HTTP 200. I font reali provengono dalla
  cache locale di verifica, senza cambiare i file dell'applicazione.

Il controllo ha trovato impronte mancanti di tre configurazioni e otto passi
Obiettivo già presenti nella base. La correzione è in un commit separato:
registra solo i testi di fabbrica esatti, senza riscrivere righe DB o toccare la
precedenza delle revisioni admin. Verificata anche sui testi anteriori alla
modifica. Le nuove versioni QA/Obiettivo conservano le impronte precedenti per
l'allineamento esplicito.

Limite residuo della suite browser completa `chat-preferences.test.mjs`: quattro
casi precedenti (QSAr, OpenCode, Bussola, Assistente) selezionano ancora il formato
Tabella, già rimosso dal selettore nella base `fdeb1e89` (sono offerti Discorsivo e
Per punti). Restano falliti; la verifica di questa funzionalità usa i cinque casi
sopra. Nessuna valutazione qualitativa con un modello effettivo è stata eseguita.

Anche `test_chat_preparation.py::test_live_audit_fallback_receives_original_history`
fallisce con `ContextCapacityError`: il modello sintetico di riserva ha una
finestra di 16384 token e riserva 14000 token di output, insufficienti per quel
prompt. Il difetto è riprodotto sul backend originale (`git archive` della base,
montato in sola lettura sul container di test), senza la nuova direttiva. Nella
stessa esecuzione gli altri sei controlli, inclusi parità runtime/audit per tutti
i passi e confronto dei marcatori con il frontend montato, passano. Nessun
parametro dei modelli viene modificato per correggere quella fixture.
