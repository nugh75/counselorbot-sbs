# Verifica differenziazione prompt CR1–CR4

Data: 5 ottobre 2026. Branch `feature/prompt-differentiation`, worktree dedicato
da `origin/main` (`005cf2c`). Nessun deploy, assegnazione automatica o scrittura
di prompt/configurazioni operative.

## Contratti verificati

- CR1: stima UTF-8 coerente Python/TypeScript, conteggio delle bozze e dei
  blocchi che somma al totale, rapporto in anteprima e log sync/streaming.
- CR2: livelli configurabili, nomi modificabili, aggiunta di livelli e
  assegnazione manuale esatta; riferimenti mancanti rifiutati e salvataggi
  serializzati. Componenti esclusi nello step restano esclusi.
- CR3: voci `__short` vuote, proprietà e conferme condivise conservate;
  direttive dinamiche applicate a normale e breve. Breve assente: normale.
  Ripiego: nuovo adattamento dell'envelope originale. Nessun testo breve
  scritto dall'agente.
- CR4: snapshot Prompt Lab includono livelli, assegnazioni e hash del codice;
  worker e client Ollama applicano budget e `num_ctx`. Runner ripetibile con
  36 casi, tre step per ciascuno dei dodici strumenti.

## Confronto sintetico live

Default di fabbrica, italiano, cronologia fittizia di sei scambi, nessun
punteggio e due fonti sintetiche. Apertura, step centrale e chiusura selezionati
in ordine stabile. Totale contro Ristretto; nessuna variante breve disponibile.
Finestra test 32768, temperatura 0, thinking disabilitato, limite globale
600 secondi. Solo modelli locali già disponibili.

Il giudice Prompt Lab usa Qwen, ignora il livello del braccio e supera la
calibrazione con risposta corretta/errata. Digest stabili prima/dopo.
Esiti automatici:

| Modello | Livello | Prove | Superate | Fallite | Inconcludenti | Dati inventati segnalati | Aderenza step |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| qwen3.8:27B | Totale | 36 | 7 | 29 | 0 | 8 | 15 |
| qwen3.8:27B | Ristretto | 36 | 5 | 31 | 0 | 8 | 7 |
| gemma3:1b | Totale | 36 | 4 | 32 | 0 | 9 | 9 |
| gemma3:1b | Ristretto | 36 | 1 | 34 | 1 | 8 | 4 |

L'inconcludente deriva da un errore del modello e resta nel denominatore.
Per ciascun modello, somma degli ingressi stimati sui 36 casi:
**153146 → 139168 token, −9,13%**. Il conteggio senza generazione conferma gli
stessi 72 envelope. **Il confronto non dimostra miglioramento qualitativo**:
i verdetti sono peggiori sul contesto ristretto per entrambi. Nessuna
configurazione è stata attivata in conseguenza di questi risultati.

Limiti: niente punteggi, lingue diverse dall'italiano, classi/docenti, persona
reale, retrieval operativo o testi brevi futuri. Il giudizio di un modello,
soprattutto sul proprio output, non è una revisione educativa umana. Le
segnalazioni di dati inventati restano sospette fino all'esame diretto.
Conservati solo metadati, hash ingressi, rapporti token e verdetti depurati,
senza risposte o log grezzi: [JSON](model-context-comparison-2026-10-05.json).
SHA256: `44386ff229bbdf00dbb7ffc8291e39adff06c91018ad74c87a96bfd11c47cf18`.
Procedura e comando ripetibile: [guida operativa](model-context-levels.md).

## Verifiche tecniche

- Backend: 140 test in immagine isolata Python 3.10: contesto, API, composizione, routing,
  Mappa, factory, Prompt Lab. La parità include 65 step × sei lingue × tre
  lunghezze; fixture nuove isolate in schemi PostgreSQL con rollback.
- Frontend: 265 unit test, 3136 chiavi in sei lingue, build Next con TypeScript.
  ESLint dei file modificati senza errori e due warning preesistenti ConfigForm.
  Browser: 19 test su immagine ricostruita, 1440/390 px, tutte le API simulate.
- Docker backend/frontend ricostruiti: tag locali
  `counselorbot-cr-context-backend:validation` e
  `counselorbot-cr-context-frontend:validation`. Frontend provato su loopback
  3166 con backend inaccessibile. Nessun container operativo ricreato/riavviato.
- Lint globale: un errore preesistente `react-hooks/set-state-in-effect`,
  NewDeckDialog.tsx:36, e 44 warning. File invariato rispetto alla base;
  registrazione Diario aggiornata, correzione fuori ambito.
- Guida pubblica studente/docente riesaminata: nessun nuovo percorso pubblico.
  Funzionalità e manifest aggiornati; screenshot admin
  [desktop](img/model-context-1440.png) e [mobile](img/model-context-390.png).

Non si dichiara pulito ogni controllo globale del repository. I processi e
container di prova propri vengono fermati alla fine; le immagini restano.
Rilascio dopo merge e assegnazioni manuali sono passaggi distinti, non eseguiti.

Suite backend ripetibile nell'ambiente PostgreSQL dedicato (impostare prima
`DATABASE_URL`, `COUNSELOR_TRANSLATE_DISABLED=1`, `ADMIN_SYNC_DISABLED=1`):

```bash
python -m pytest -q \
  backend/tests/test_context_levels.py backend/tests/test_context_levels_api.py \
  backend/tests/test_context_comparison.py backend/tests/test_context_meta_boundary.py \
  backend/tests/test_chat_preparation.py backend/tests/test_prompt_routing.py \
  backend/tests/test_admin_prompt_map.py backend/tests/test_prompt_factory_alignment.py \
  backend/tests/test_prompt_lab_engine.py backend/tests/test_prompt_lab_integrity.py \
  backend/tests/test_prompt_lab_api.py backend/tests/test_prompt_lab_postgres.py
```

## Diario bug

Registrati LOCAL, sync `not-linked`; nessuna issue pubblicata manualmente.

- `e0c77a54-25d2-4f39-9d73-b8a8a62a1352`: compact eliminava PERSPECTIVE dopo
  meta; correzione separata e regressione verificata.
- `1cae09bd-300b-4be0-85fa-ecc40d8afe9f`: nuova fixture API contaminava la
  parità; corretta con schema isolato e verifica congiunta.
- `801f45e9-677f-4578-a172-08e51549a401`: Prompt Lab ometteva il rapporto token
  dalla serializzazione del
  risultato; conservato ora insieme all'envelope, con regressione che verifica
  dispatch e persistenza di due assegnazioni differenti.
- `3daa91a2-b410-4d85-a30e-ee803e15afa6`: segnalazione salvataggio condiviso
  scartata; errore della fixture browser, conferma reale funzionante.
- `9ef8a292-cb86-43c4-88fe-185d5a9be510`: benchmark segnala dati inventati;
  sospetto, richiede revisione umana.
- `2a50c13c-0ad7-4f41-b3ab-01f56888de76`: errore lint preesistente confermato,
  fuori ambito.
- `9c665d96-9364-4db6-a1d0-24e7e7e699a6`: compatibilità sospetta della CLI gh
  con Projects classic dismessi; PR creata senza `--project`, poi collegata
  con successo al Project V2 usando GraphQL.

### Bug non registrati

Nessuno. EROFS del Diario superato: il bug compact è ora registrato con prova.
