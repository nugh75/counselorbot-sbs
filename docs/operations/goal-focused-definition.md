# Obiettivi: un focus preciso e una bozza presto (blocco 2)

Conduzione iniziale delle chat **OBIETTIVO_DOCENZA** (prioritaria) e
**OBIETTIVO_STUDIO**: arrivare presto a UN obiettivo formulato e utilizzabile,
poi progettarne il raggiungimento e la verifica. Si appoggia al contesto classi
del blocco 1 (`docenza-group-context.md`) senza cambiarlo. Nessuna nuova
tabella, dipendenza, permesso, passo o classificatore.

Scopo diverso dall'autointerrogazione della PR #290: qui le domande servono solo
a raccogliere ciò che manca all'obiettivo. Non si chiede mai di formulare
domande su di sé, né come traguardo né come condizione per proseguire; gli
strumenti Obiettivo restano fuori da `[SELF-QUESTIONING]`.

## Contratto

| Punto | Regola | Codice |
| --- | --- | --- |
| Focus | Una cosa precisa. Più risultati o apprendimenti: nominarli, proporne uno come prioritario (per quella classe o gruppo, nella docenza) con un motivo tratto da ciò che è stato detto, mettere da parte gli altri, chiedere quale prendere. Focus già chiaro: riconoscerlo, non richiederlo. | `prompt_contract._objective_focus_contract` |
| Bozza presto | Scelto il focus, UNA bozza modificabile in una frase, poi UNA domanda principale sull'elemento che la cambia di più. Riuso di persona, taccuino, contesto classe e turni precedenti; una correzione successiva sostituisce la precedente. | idem, `obiettivo_step_partenza.md` |
| Definito abbastanza | Destinatari, risultato osservabile dell'apprendente, contenuto circoscritto, prova plausibile con condizione o criterio proporzionati. «Fare una lezione» è attività del docente; «capire meglio» va reso osservabile. Nessuna percentuale, scadenza, bisogno, difficoltà, livello o successo inventati; descrizione e metodologie della classe sono contesto. Rubriche complete, sequenze e calendario vengono dopo. | idem |
| Bloom e SMART | Controlli selettivi delle lacune: niente lettera per lettera, niente lezione sulle tassonomie. Obiettivo già definito: dirlo e proseguire. Troppo ampio: proporre una delimitazione da confermare. Punti aperti: la persona può proseguire, vengono nominati. | contratto + `obiettivo_step_{livello,smart,sfida}.md` |
| Progettazione | Obiettivo fermo. Studio: primi passi e piano se-allora personale. Docenza: si parte dalla prova attesa e si allineano attività e valutazione al risultato degli studenti. | contratto (fase `design`), `obiettivo_step_piano_*.md`, `obiettivo_step_verifica_*.md` |
| Sintesi | UN obiettivo; gli altri risultati solo come «da parte», se nominati; i punti aperti restano aperti. Blocco `goal` privato e salvataggio/pubblicazione solo su conferma, invariati. | `obiettivo_step_final_*.md`, `goal_draft.py` |
| Presentazione (bug `f8e237bd`) | Sistema e step hanno lo stesso mandato: un solo invito facoltativo a dire che cosa si ha in mente, nessuna analisi o bozza; segnaposto risolti per studio e docenza. | `prompt_config._obiettivo_intro_system_prompt`, `obiettivo_intro_*.md` |

Il contratto `[OBJECTIVE FOCUS]` è codice: entra in `[TURN CONTRACT]` a ogni
turno dei passi da *partenza* a *sintesi* (fasi `definition`, `design`,
`synthesis`; presentazione e patto esclusi) e nelle fasi essenziali, anche con
testi DB personalizzati e nelle varianti compatte. I testi degli step restano
dell'amministratore: dove chiedono ancora tutte le lettere SMART o tutti i
livelli, il contratto dice di applicarli solo a ciò che manca.

## Percorso essenziale: tre fasi brevi, non tre risposte

Fasi invariate negli id (snapshot e ripresa compatibili):
`*-essential-focus` (focus e prima bozza), `*-essential-smart` (completare
l'obiettivo), `*-essential-plan` (piano e prova / attività e verifica),
`*-essential-summary`.

- Una risposta della persona resta nella fase corrente (`essentialReplyPhase`).
- La fase si chiude quando il modello mette `[[AVANZA_STEP]]` su una risposta
  **completata** (stream chiuso con `done`): risultato accettato o corretto, o
  richiesta di proseguire con punti aperti dichiarati. Il client apre allora la
  fase successiva con il suo turno di apertura, come nel percorso completo.
- Le aperture non avanzano, tranne «completare l'obiettivo» quando trova
  l'obiettivo già definito. La sintesi non avanza mai.
- «Passa al prossimo tema» (risposta rapida già esistente) resta la scelta della
  persona di proseguire anche senza marcatore.
- Stream interrotto: nessun avanzamento finché la continuazione non completa la
  risposta (`ChatContinuation`).
- Il QSA essenziale non cambia: tre risposte e sintesi.

Cambiamenti visibili: nella scelta del percorso il testo d'aiuto degli Obiettivi
dice «3 fasi brevi (focus, obiettivo, piano), poi una sintesi…»; le fasi si
chiamano *Focus e prima bozza*, *Completare l'obiettivo*, *Piano e prova*
(studio) o *Attività e verifica* (docenza), *Sintesi*, in sei lingue. Tra una
fase e l'altra compare il separatore della fase e un breve turno di apertura.

## Installazioni esistenti

Il codice porta subito contratto, fasi essenziali ed etichette. I testi salvati
nel database (`prompt_obiettivo_interview`, `prompt_obiettivo_summary`,
`prompt_obbstudio_intro`, `prompt_obbdocenza_intro` e 16 step `obbstudio-*` /
`obbdocenza-*`, il patto escluso) **non** si aggiornano all'avvio. In
particolare il bug della presentazione sparisce su un'installazione esistente
solo dopo l'allineamento, perché il testo vive nella riga `configs`.

`prompt_factory_legacy.json` conserva gli hash dei testi precedenti e registra i
nuovi: un testo di fabbrica viene riconosciuto, uno personalizzato resta com'è.

Dopo merge e deploy (passo manuale, nessun sudo):

1. Controllo in sola lettura di cosa cambierebbe per gli Obiettivi (container
   del backend: `counselorbot-portable-counselorbot-backend-1` nell'installazione
   portabile, `counselorbot_backend` con il Compose standard):

   ```sh
   docker exec counselorbot-portable-counselorbot-backend-1 python -c "from backend.database import SessionLocal; from backend.prompt_factory_alignment import make_plan; db=SessionLocal(); p=make_plan(db); k=lambda c: c['key'].startswith(('obbstudio-','obbdocenza-','prompt_obiettivo_','prompt_obb')); print('changes', [c['key'] for c in p['changes'] if k(c)]); print('preserved', [c for c in p['preserved'] if k(c)]); db.close()"
   ```

2. Amministrazione → **Allinea prompt di fabbrica**: rivedere le differenze
   (l'anteprima mostra anche eventuali altri testi di fabbrica non allineati) e
   confermare. Scritture atomiche con controllo degli hash, revisioni di origine
   `migration`, prompt personalizzati conservati (`prompt-factory-alignment.md`).
3. Ritorno indietro: ripristinare dalla cronologia dei prompt la revisione
   precedente di ciascuna chiave (`POST /api/admin/prompt-revisions/{id}/restore`);
   il ripristino è una scelta amministrativa e rende il testo protetto.

Le etichette degli step nel DB (es. «1. Da dove parto») non cambiano.

## Esempi sintetici (prima/dopo)

Costruiti applicando a mano i mandati: **non** sono risposte di un modello e non
sostituiscono una valutazione su conversazioni reali.

Contesto autorizzato: classe 2B, matematica, laboratorio sui grafici
temperatura-tempo. Docente: «Vorrei migliorare lettura dei grafici,
collaborazione e relazione finale».

- Prima (mandati attesi): chiedere l'area, poi presentare i sei livelli di Bloom,
  poi verificare SMART una lettera alla volta.
- Dopo: «Sono tre risultati distinti. Per la 2B partirei dalla lettura dei
  grafici, che sostiene anche la relazione; teniamo gli altri due per un altro
  obiettivo. Vuoi concentrarti su questo?» → conferma → «Bozza: ogni alunno
  della 2B interpreta un grafico temperatura-tempo descrivendo l'andamento e
  giustificandolo con i dati. Lo verificheresti con un lavoro autonomo o con una
  scheda guida?». Nessuna difficoltà attribuita alla classe.

Altri casi: «Vorrei fare una lezione sulle frazioni» → «Questa è l'attività che
farai; che cosa sapranno fare gli studenti alla fine?». «Voglio capire meglio la
storia» (studio) → bozza con un comportamento osservabile da confermare.
Obiettivo già completo → riconosciuto, si passa al piano. Obiettivo troppo ampio
→ primo risultato delimitato proposto, non imposto.

## Verifica

Backend (PostgreSQL effimero su rete Docker interna, immagine di test, nessun dato
reale né chiamata a provider): `backend/tests/test_goal_focused_definition.py` —
presentazione coerente e senza segnaposto, contratto in ogni passo e solo lì,
varianti docenza/studio, testo admin conservato, classe autorizzata riusata e
classe estranea esclusa, taccuino studente senza classi, correzioni e storico
tra turni, fasi essenziali con apertura/risposta e marcatore, QSA invariato,
registro hash e allineamento che aggiorna i testi di fabbrica e conserva quelli
personalizzati. Riproduzione del bug sul codice precedente: script in HANDOFF.

Frontend: `src/lib/chat-preferences.test.ts` (fase della risposta, marcatore,
stream non completato, aperture, etichette in sei lingue, cablaggio del
componente) e `tests/chat-preferences.test.mjs` (browser con API simulate:
fase che resta aperta, marcatore nascosto, stream interrotto senza avanzamento
fino a «Continua», «Passa al prossimo tema», sintesi e snapshot).

Limite: i test controllano ciò che il modello riceve e la meccanica; la qualità
dialogica (focus scelto bene, bozza utile, assenza di ripetizioni) richiede una
valutazione autorizzata con un modello su casi sintetici.
