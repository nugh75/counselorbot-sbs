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

## Percorso completo: un passaggio iniziale e cinque fasi (blocco 3)

Le undici fasi precedenti (Presentazione, Patto, Da dove parto, Il livello
(Bloom), Alla prova SMART, Specifico e sfidante, Come ci arrivo, Come saprò di
esserci riuscito, Sintesi, Domande e Approfondimenti, Conclusione) nominavano il
metodo, rilavoravano la stessa frase in tre fasi e chiudevano con domande su di
sé. Ora (`backend/obiettivo_layout.py`, etichette in sei lingue):

| Id (invariato) | Docenza | Studio |
| --- | --- | --- |
| `*-intro` | 0. Presentazione e accordo | 0. Presentazione e accordo |
| `*-partenza` | 1. Cosa vuoi che imparino | 1. Cosa voglio imparare |
| `*-livello` | 2. Rendiamo l'obiettivo preciso | 2. Rendiamo l'obiettivo preciso |
| `*-piano` | 3. Come ci arriveranno | 3. Come ci arrivo |
| `*-verifica` | 4. Come verificherai che ci sono riusciti | 4. Come capirò di avercela fatta |
| `*-final` | 5. L'obiettivo finale | 5. L'obiettivo finale |

- **Presentazione e accordo**: un solo turno che presenta i cinque passi e chiede
  di confermare il modo di lavorare con il pulsante «Accetto» esistente (lo step
  d'accordo è ora `*-intro`; non si salta con la freccia). Se la persona scrive
  la sua idea, viene riconosciuta come punto di partenza e si chiede di nuovo la
  conferma.
- **Rendiamo l'obiettivo preciso**: Bloom (verbo osservabile, livello del verbo),
  SMART e sfida/orientamento sono controlli interni; si nomina solo ciò che manca,
  una domanda alla volta. Se l'obiettivo è già preciso, lo dice e passa oltre
  nella stessa apertura.
- **Come verificherai**: la prova e il criterio devono controllare ogni requisito
  dell'obiettivo; se non lo fanno (es. «sequenza coerente» verificata solo con
  «percorso completato») lo si dice e si sceglie se aggiungere il controllo o
  togliere il requisito.
- **L'obiettivo finale**: sintesi, bozza (`GoalDraftCard`) e «Concludi» nella
  stessa fase; niente «Domande e Approfondimenti» né «Conclusione». Soggetto:
  gli studenti in Docenza, «io» in Studio; il livello di Bloom nominato è quello
  del verbo; un criterio che non controlla i requisiti resta segnalato come punto
  aperto; nessuna domanda riflessiva.

**Passaggio di fase** (come l'essenziale): una risposta completata con il segnale
`AVANZA_STEP` apre da sola la fase successiva, senza chiedere conferme; la nuova
fase inizia dicendo in una frase che cosa si fa ora e non ripete l'obiettivo se
non è cambiato. «Passa al prossimo tema» resta la scelta della persona.
Le altre chat a intervista (Savickas, Eventi, QPCC, QAP) non cambiano.

**Contratto runtime** (`prompt_contract._objective_focus_contract`, vale anche
senza allineamento dei testi): parole comuni con un esempio quando una parola può
non essere chiara; una domanda per turno; bozza solo da ciò che la persona ha
detto, un dato del taccuino o della classe solo se confermato e con la fonte;
dettagli concordati conservati; obiettivo ripetuto solo quando cambia; mai
chiedere se proseguire; frase d'apertura della fase; regole della sintesi sopra;
dopo la sintesi si risponde solo al messaggio nuovo.

Il segnale non si vede mai, in nessuna chat né export: `control-markers.md`.

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

Il codice porta subito contratto, fasi, etichette, avanzamento, filtro del
segnale e PDF. I testi salvati nel database (`prompt_obiettivo_interview`,
`prompt_obiettivo_summary`, `prompt_obbstudio_intro`, `prompt_obbdocenza_intro`,
`counselorbot_chat_context` e i 12 step `obbstudio-*` / `obbdocenza-*` rimasti)
**non** si aggiornano all'avvio. Finché non si allinea, la presentazione non
chiede ancora l'accordo (il pulsante «Accetto» c'è comunque) e i testi dei passi
parlano ancora di «7 passi»; il contratto runtime corregge già la conduzione.

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

Struttura delle fasi sulle installazioni esistenti, **senza scritture nel DB**:

- `*-patto`, `*-smart`, `*-sfida` non sono più nei default; le righe restano e
  vengono tenute fuori dal percorso (interfaccia, contesto del percorso, export
  OpenCode) solo se il loro testo è di fabbrica (hash registrato o revisione
  seed/migration, nessuna revisione admin). Uno step personalizzato resta, con
  la sua etichetta. Le installazioni nuove seminano solo le sei righe nuove.
- Le etichette di fabbrica precedenti (italiano e traduzioni) si leggono come
  quelle nuove (`resolve_step_label`); un'etichetta scritta dall'amministratore
  resta com'è. Il pannello step mostra ancora le etichette salvate.
- Sessioni e snapshot con le fasi precedenti riprendono nella fase che le ha
  assorbite: patto → presentazione e accordo, SMART e sfida → «Rendiamo
  l'obiettivo preciso», domande e conclusione → «L'obiettivo finale», senza
  rigenerare l'apertura (`currentGoalPhase`).

Il PDF rende apostrofi, virgolette e trattini tipografici e mostra la legenda
Forza/Norma/Crescita solo quando ci sono etichette per fattore.

Ritorno indietro della struttura: revert del codice; nessun dato da ripristinare.

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

Blocco 3: `backend/tests/test_goal_phase_redesign.py` (fasi e etichette in sei
lingue, layout precedente letto come nuovo, step personalizzati conservati,
contesto del percorso, contratto di conduzione e sintesi, PDF tipografico e
legenda), `backend/tests/test_control_markers.py` (guardia su tutti i tipi di
chat), `frontend/src/lib/interview-path.test.ts`, `control-markers.test.ts` e i
due test browser «Obiettivo complete path…» e «Obiettivo snapshot frozen…».

Limite: i test controllano ciò che il modello riceve e la meccanica; la qualità
dialogica (focus scelto bene, bozza utile, assenza di ripetizioni) richiede una
valutazione autorizzata con un modello su casi sintetici.
