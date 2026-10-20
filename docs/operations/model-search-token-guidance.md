# Ricerca modelli e budget token

Verifica: 21 ottobre 2026. Base `main` a `e05b8a77` (PR #400 già integrata).

La ricerca è condivisa fra Configurazione → riserva di sistema e Preset. Filtra
ID e nomi disponibili, ignora maiuscole e spazi esterni, mostra il numero di
risultati e si cancella con il pulsante o Escape. Il filtro non salva nulla e
conserva il modello scelto anche quando non corrisponde alla ricerca o non compare
nel catalogo. La scelta esplicita di un altro modello resta necessaria.

Nei preset il cambio provider azzera modello e ricerca. Una risposta tardiva del
vecchio catalogo non può sostituire quella del nuovo provider. Il catalogo può
essere ricaricato; con catalogo non raggiungibile si può ancora inserire un ID
manuale. Il salvataggio conserva gli altri parametri e segnala gli errori.

I modelli suggeriti nella riserva di sistema sono candidati di confronto, visibili
solo se presenti nel catalogo live. Gli ID OpenRouter sono stati verificati sul
[catalogo ufficiale](https://openrouter.ai/api/v1/models) il 21 ottobre 2026;
le descrizioni suggeriscono confronti nel Prompt Lab, senza attestare una qualità
di counseling misurata. Consigli, ricerca e messaggi sono nelle sei lingue UI.

## Quale limite modificare

| Campo | Effetto |
| --- | --- |
| Preset: Max token | Usato dal benchmark e dalle chiamate che adottano il campo del preset; vuoto mantiene il valore automatico del chiamante. |
| Chat guidata: Lunghezza | Budget di risposta breve 1000, media 2000, lunga 4000; lettura del profilo almeno 4000. Prevale sul parametro legacy `max_tokens`. |
| Preset: Budget reasoning | Riserva numerica usata quando il provider non espone gli effort o come margine locale. Vuoto mantiene il default della famiglia. |
| Preset: Effort reasoning | Livello `minimal`/`low`/`medium`/`high`/`xhigh`/`max` per i modelli che lo dichiarano. Vuoto usa il default del catalogo. |
| No reasoning | Richiede lo spegnimento sui modelli/provider che lo supportano; il budget salvato viene conservato ma non usato. Su un modello che impone reasoning non viene inviata una disattivazione: si usa il livello minimo e il log lo segnala come non onorato. |

Come punto di partenza: 2000 token per il dialogo, 4000 per sintesi e tabelle,
oppure lasciare vuoto. L'editor avvisa sotto 2000, rifiuta zero, numeri negativi
e frazioni, e salva i campi vuoti come `null`. I consigli non riscrivono i preset.
Per le chat guidate scegliere Lunga per risposte articolate.

## Effort e capacità OpenRouter

Il pannello Preset legge `/api/admin/models`: per OpenRouter il backend scarica
il [catalogo](https://openrouter.ai/api/v1/models), conserva in memoria per sei
ore `reasoning.mandatory`, `supported_efforts`, `default_effort`,
`max_completion_tokens` e i parametri supportati. La chat non fa chiamate di
rete: usa la cache se presente, altrimenti una tabella di fallback per i modelli
noti. Se il catalogo non è raggiungibile, il selettore effort mostra i valori
generici e il salvataggio resta possibile.

La precedenza è: scelta esplicita dello studente (`off`/`deep`) → fonte
personale → preset → default del catalogo. `off` su un modello obbligatorio
diventa il livello minimo disponibile e viene registrato con
`effort_honored=false`; sugli altri modelli resta davvero spento. `deep` usa
`high`, mentre un valore di preset viene clampato sui livelli dichiarati dal
catalogo.

Il trasporto distingue i due contratti: a OpenRouter invia
`reasoning.effort` quando il modello lo supporta e non un `max_tokens` che
potrebbe essere ignorato; a OpenAI invia `reasoning_effort`; per
Anthropic/Gemini traduce l'effort in un budget di thinking. Lo stesso piano è
usato da chat sincrona, streaming, Prompt Lab, benchmark, Bussola e guardia del
thread.

Il backend calcola il totale con `reasoning_profiles.resolve_plan`: quando il
ragionamento è attivo, somma budget di pensiero e il maggiore tra margine della
famiglia e budget di risposta richiesto. Con gli effort adattivi il budget resta
una riserva locale per il contesto, non un limite presentato come effettivo. Per esempio Qwen3: 5000 + 2000 = 7000,
oppure 5000 + 4000 = 9000. Restano applicabili i limiti di output e contesto del
provider. Un tetto troppo piccolo può esaurirsi durante il pensiero: vedi la
[documentazione OpenRouter sui token di ragionamento](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens).

## Verifiche riproducibili

La suite `frontend/tests/admin-model-search.test.mjs` intercetta tutte le API:
nessuna chiave, chiamata LLM o dato reale. Server isolato su loopback :3153;
comandi dev/compilato e stop in `live-dev-environment.md`.

- 596 test unitari frontend superati, inclusi filtro e validazione degli ID.
- 14 test browser superati sia sulla build locale sia su quella Docker: modifica e creazione, selezione conservata, nessun
  salvataggio durante il filtro, cambio provider, risposta tardiva del catalogo,
  catalogo non raggiungibile, budget vuoti/invalidi, sei lingue, 390/1440 px e tema scuro.
- `i18n:check`: 3415 chiavi nelle sei lingue; TypeScript e build Webpack superati.
- ESLint dei file modificati: zero errori; tre warning preesistenti. Lint globale:
  stessi sette errori e 62 warning del `main` verificato separatamente; la
  prosecuzione della baseline è nella PR #351.
- 72 test backend di headroom, profili reasoning, envelope e continuazione
  superati in container isolato, rete interna e Postgres in RAM `counselorbot_test`.
  Il primo tentativo senza DB non ha raccolto i test che importano lo smoke;
  il secondo ha usato esclusivamente il DB sintetico.

Il volume esterno ha bloccato alcune letture dei controlli iniziali. La verifica
finale usa una copia locale della stessa base, con il lavoro recuperato dal
worktree `model-search-suggestions`; nessuna modifica estranea è stata rimossa.
La build locale usa i font effettivi già scaricati, senza dipendere dalla rete Google.
Docker ricostruito come `counselorbot-model-search:validation`: container di prova
avviato su loopback :3154, HTTP 200 e 14/14 browser. Il bridge interno Docker non
esponeva la porta su macOS: aggiunto il bridge ordinario al solo container frontend
di prova (API tutte simulate, backend di default su `127.0.0.1:9`). Produzione invariata.

La Guida studente/docente non descrive l'editor dei preset: riveduta senza cambiare
il percorso didattico o le sue schermate. I controlli non includono sessioni LLM
a pagamento e non garantiscono che ogni provider completi sempre una risposta.

## Verifica effort e capacità catalogo (21 ottobre 2026)

- 84 test backend mirati (profili e capacità OpenRouter, payload effort,
  contratto «Nessuno», stream/headroom, tavolo e trasporto ChatGPT) superati
  con Python 3.11.
- 2 test mirati di `test_smoke` (CRUD preset con `reasoning_effort` e helper
  counselor) superati in container isolato con Postgres di test.
- `test_smoke` completo: 191 superati e gli stessi 16 fallimenti del `main`
  verificato nello stesso container (testo prompt, simboli rimossi,
  aspettativa token di #403); nessuna regressione introdotta da questa PR.
- 15 test browser del pannello preset superati sulla build locale, compreso il
  modello obbligatorio che blocca «No reasoning» e limita l'effort.
- `i18n:check` 3415 chiavi, TypeScript e build Webpack superati; ESLint dei file
  modificati senza errori (un warning preesistente su `window.location`).
- I test unitari TypeScript con `node --test --experimental-strip-types` non
  partono con il Node 20 disponibile in locale: build, type check e test browser
  restano le verifiche eseguibili in questo ambiente.
