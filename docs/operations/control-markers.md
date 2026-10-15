# Segnali di controllo del modello (`[[AVANZA_STEP]]`)

Il modello chiude uno step scrivendo `[[AVANZA_STEP]]`. È un segnale per
l'applicazione, non testo per la persona: non deve comparire in nessuna chat,
né durante lo streaming, né alla ripresa, né nella cronologia, né negli export.
Il filtro è **codice comune**: una chat nuova lo eredita senza fare nulla.

## Registro unico

| Dove | Che cosa |
| --- | --- |
| `backend/control_markers.py` | `CONTROL_MARKERS` (elenco dei nomi), `extract`, `strip_control_markers`, `strip_for_display` |
| `frontend/src/lib/control-markers.ts` | stesso elenco, `extractControlSignals`, `stripControlMarkers`, `stripControlMarkersForDisplay` |

I due elenchi sono confrontati da un test in entrambi i lati
(`backend/tests/test_control_markers.py`, `frontend/src/lib/control-markers.test.ts`).
Riconoscono anche le varianti che i modelli producono: spazi interni,
minuscole, trattino basso scappato dal markdown (`AVANZA\_STEP`), e durante lo
streaming una coda ancora a metà (`[[AVAN`).

## Percorso comune

1. **Generazione** — `/chat` e `/chat/stream` (`backend/routes/chat.py`)
   estraggono i segnali come primo blocco privato, prima di bozze, raccomandazioni
   e patch: il testo visibile non li contiene più. Il client li riceve a parte nel
   campo `control_signals` della risposta (o dell'evento `done`). Una risposta
   fatta del solo segnale è completa anche senza testo visibile (niente nuovo
   tentativo, niente errore). La chat del sito e OpenCode passano dallo stesso filtro.
2. **Streaming** — ogni evento `display` è filtrato, anche a metà segnale.
3. **Persistenza** — log, memoria di sessione e trascritto ricevono solo il testo visibile.
4. **Rilettura** — i log scritti prima di questo filtro passano da
   `strip_control_markers` dove si rileggono: conversazione dell'Area personale e
   PDF (`routes/survey.py`), sintesi dello step, prove del percorso
   (`journey_context.py`), voce (`session_ledger.py`), Telegram, generatore PDF
   (ogni testo e ogni messaggio), vista conversazione dei log amministrativi. Un
   messaggio fatto del solo segnale sparisce.
5. **Client** — `streamChat` (`lib/chat-stream.ts`), unico lettore SSE delle chat,
   filtra ogni aggiornamento e restituisce `control_signals`; la chat guidata
   filtra anche i messaggi ripresi da snapshot congelati prima di mostrarli.

L'avanzamento delle chat non cambia: chi avanzava sul marcatore ora legge
`control_signals`; chi non lo usava continua a non usarlo.

## Aggiungere un segnale

1. Aggiungere il nome in `CONTROL_MARKERS` nei due registri (il test di contratto
   fallisce se divergono).
2. Decidere nel client che cosa fa il segnale, leggendolo da `result.control_signals`.
3. Nessun'altra modifica: estrazione, streaming, log, cronologia ed export lo
   nascondono già.

## Guardia

`test_no_chat_type_shows_a_control_marker` enumera i tipi di chat registrati
(catalogo strumenti `orientation.TOOL_IDS`, strumenti dei percorsi guidati di
fabbrica, strumenti registrati nel database, chat libera), non un elenco scritto
a mano: per ognuno, su `/chat` e `/chat/stream`, controlla stream, risposta,
segnale, log, cronologia ricostruita (anche con log vecchi) e testo del PDF. Un
tipo di chat nuovo entra nella guardia appena è registrato. Verificato per
mutazione: togliendo l'estrazione falliscono tutti i 28 casi.

Lato client, `no component reads a chat stream without streamChat` fallisce se
un componente legge uno stream di chat (`getReader()`) fuori da `streamChat`.
