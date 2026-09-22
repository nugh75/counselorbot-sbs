# Formato delle risposte e percorso essenziale QSA

Il formato è indipendente dalla lunghezza della risposta. Le opzioni sono
**Discorsivo**, **Per punti**, **Tabella**. La scelta si applica alle risposte
successive, senza riscrivere la conversazione precedente. La tabella è destinata
a confronti e sintesi: domande personali e passaggi dialogici restano in prosa.
Il formato non modifica punteggi, fonti, strumenti, blocchi strutturati o mappe Idea.

## Dove si sceglie

- Chat guidate (inclusa Idea): menu a tre punti accanto alla scrittura.
- Bussola: lo stesso menu. I messaggi del counselor ora supportano Markdown e tabelle.
- Assistente e riflessione sui cambiamenti del taccuino: accanto alla scrittura.
- OpenCode, modalità chat: sopra la scrittura.

Le etichette sono disponibili nelle sei lingue. Le chat guidate e OpenCode
conservano il formato nello snapshot sul server; le altre superfici lo ricordano
nella sessione del browser (per conversazione nella Bussola).
Non sono introdotti controlli nel terminale OpenCode o nel bot Telegram.

## Percorso essenziale

Solo **QSA**, nella modalità di chat guidata, offre prima dell'avvio la scelta
fra **Percorso completo** (preselezionato) ed **Essenziale**. QSAr mantiene il
percorso precedente. Questionario e punteggi non cambiano.

1. Il counselor presenta una risorsa e al massimo due possibili temi. La persona
   sceglie una priorità o ne indica un'altra.
2. Il counselor chiede un esempio concreto. La persona risponde.
3. Il counselor propone una piccola azione. La persona la conferma o modifica.
4. Arriva la sintesi, senza altre domande obbligatorie. Si può concludere oppure
   continuare volontariamente a scrivere.

Il client avanza dopo una risposta completata del modello, senza usare il suo
marcatore di avanzamento. Errori e risposte vuote non fanno avanzare. Ripetere un
passo non cambia fase. Dopo la terza risposta della persona si arriva alla sintesi;
la sua pertinenza e la formulazione delle domande dipendono comunque dal modello.
Le istruzioni distinguono fattori invertiti, priorità scelte, azioni proposte e
concordate e aspetti non esplorati. Non si selezionano temi con una soglia unica
valida per tutti i fattori.

Gli snapshot conservano percorso, fase, formato e identificatore della conversazione.
La ripresa non genera nuovamente il passo già aperto. Se la memoria volatile è
scaduta, le evidenze della conversazione vengono recuperate dai log della sessione
con i controlli di proprietà esistenti. La sintesi essenziale può essere riusata
nel riepilogo/PDF; un approfondimento successivo invalida la sintesi precedente.

## Contratti API

- `response_format`: `standard | bullets | table`, predefinito `standard`, per
  `ChatRequest`, `SiteChatRequest`, `OpencodeChatRequest` e messaggi Bussola.
- `guided_path`: `complete | essential`, predefinito `complete`, per chat guidata
  e audit. `essential` richiede `questionnaire_type=QSA` e una fase essenziale valida;
  combinazioni incompatibili restituiscono 422.
- Fasi: `qsa-essential-focus`, `qsa-essential-experience`, `qsa-essential-action`,
  `qsa-essential-summary`. `qsa-essential-followup` distingue gli approfondimenti
  facoltativi dalle sintesi salvabili.
- Congelamento: nuovi campi JSON `response_format`, `guided_path`, `conversation_id`;
  gli snapshot precedenti ricadono su discorsivo e percorso completo.
- Nessuna nuova tabella, migrazione SQL, dipendenza o variabile d'ambiente.

## Verifiche

Backend: `test_chat_preferences.py`, `test_chat_preparation.py`,
`test_orientation.py`, `test_pdf_summary.py` sul database dedicato ai test.
Frontend: test delle librerie, TypeScript, ESLint sui file modificati, controllo
traduzioni e build Next.js. `frontend/tests/chat-preferences.test.mjs` verifica
nel browser selezione, tre risposte, ripresa, errore, approfondimento, QSAr,
OpenCode, Bussola e Assistente su API simulate. Impostare `CHAT_PREFS_BASE_URL`
per usare il frontend da verificare; predefinito `http://127.0.0.1:3101`.

Ricostruzione: `docker compose up -d --build backend frontend`.

### Evidenza della verifica del 21 settembre 2026

- 189 test delle librerie frontend; TypeScript, ESLint dei file modificati e controllo delle sei lingue superati.
- 202 smoke test backend nel container (la prova sull'host si fermava perché Graphviz non è installato lì).
- 79 test mirati di preparazione, orientamento, preferenze e sintesi superati; il successivo test di audit delle fasi virtuali porta la batteria delle preferenze a 20 test, tutti superati.
- 22 prove browser su build Docker, a 390 e 1440 pixel, con API simulate; verifica aggiuntiva del cambio formato OpenCode senza riavvio del workspace superata sulla build aggiornata.
- Una prova con Clio/Ollama e dati interamente sintetici ha completato il percorso e accolto la modifica da 25 a 10 minuti proposta dalla persona. Una ripetizione, dopo l'affinamento delle istruzioni, ha incontrato un timeout nel modello: la qualità e la latenza generativa non sono garantite da questi test.
- Frontend locale HTTP 200; indirizzo pubblico HTTP 302 verso SSO. Il redirect non costituisce una verifica autenticata dell'interfaccia pubblica.
