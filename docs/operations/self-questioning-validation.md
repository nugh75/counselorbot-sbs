# Autointerrogazione: ambito e validazione

## Comportamento richiesto

Dopo la lettura del profilo, la persona può scegliere un aspetto concreto da
comprendere meglio. Nell'esplorazione restano le domande necessarie sulle
esperienze e sulle interpretazioni; l'invito a formulare una domanda propria è
facoltativo e si adatta a ciò che è già emerso. Una risposta approfondita può
rendere superflui altri passaggi. Una risposta breve non giustifica insistenza.
La difficoltà riceve prima aiuto a individuare un focus, poi eventualmente uno
spunto; se persiste si può lasciare aperto o proseguire. Domande spontanee e
rifiuti non richiedono nuove formulazioni.

La sintesi privilegia le domande effettivamente espresse dalla persona, con le
sue parole, correzioni e ritiri; le distingue da richieste rivolte al counselor e
dai suoi suggerimenti. La scelta di continuare a esplorarle resta personale.
Nessun piano, impegno o cambiamento viene imposto o dedotto da un punteggio.

## Perché il contratto è condiviso

`prepare_chat_turn` costruisce lo stesso envelope per chat sincrona, streaming e
Prompt Lab. Il contratto in `prompt_contract.py` viene aggiunto dopo i testi
configurabili, anche nelle varianti Totale/Ristretto/Minimo. Vale quindi per le
installazioni esistenti senza riscrivere prompt nel DB. Governa la formulazione
delle riflessioni, preservando contenuti specifici, consenso, avanzamento e limiti
di domande del passo. Non aggiunge turni obbligatori né condizioni per avanzare.

| Percorso | Applicazione e vincoli |
| --- | --- |
| QPCS | Invito dopo il profilo, esplorazione delle cinque aree, sintesi. Le aree sono sempre quelle esistenti; il passaggio resta scelto dalla persona. |
| QSA / QSAr | Invito nella lettura dei fattori e sostegno nei successivi approfondimenti, senza cambiare gruppi o numero dei passi. |
| ZTPI | Formulazione delle domande nelle letture dei fattori temporali e nella sintesi. Nessun nuovo profilo iniziale o intervista obbligatoria. Il confronto psicometrico previsto con il profilo equilibrato resta valido. |
| QPCC | Profilo e cinque approfondimenti sulle quattro dimensioni e dieci scale canoniche, senza confondere ansia, insicurezza, inadeguatezza e competenze. Restano i limiti dei follow-up. |
| QAP | Profilo e quattro risorse, senza trasformarle nelle cinque aree QPCS né imporre scelte professionali. |
| Savickas | Restano le cinque domande narrative previste. Il sostegno può operare nei follow-up disponibili, senza sostituire la domanda principale. Nessuna lettura di punteggi o profilo aggiunta. |
| QSA essenziale | I compiti specifici dei tre turni prevalgono; la sintesi non aggiunge domande. L'autointerrogazione non diventa un ulteriore turno. |

Presentazioni e patti sono esclusi. IDEA, Eventi, Obiettivi, OpenCode e chat
libera non ricevono questa strategia. La fase volontaria `questions` dei sette
percorsi riceve il sostegno adattivo, senza ripartire dal percorso.

## Evidenza e limiti

Si riutilizzano trascrizione persistita, cronologia e ricostruzione completa della
sessione già esistenti. Non viene inferito o salvato un elenco di domande. Nelle
riduzioni generative delle sintesi dei sette percorsi, `journey_context` richiede
di conservare testualmente domande personali, correzioni, ritiri e attribuzione
in ogni passaggio. Per gli altri strumenti la riduzione resta invariata.

I test controllano consegna delle istruzioni e dei dati, non l'obbedienza di un
modello: fedeltà della riduzione, varietà delle domande, fluidità, assenza di
suggestioni e correttezza delle sintesi richiedono ancora campionamento LLM live.
Non esiste una garanzia deterministica di citazione dopo una riduzione generativa;
se manca il testo esatto, il contratto chiede di dichiararlo senza inventarlo.
Gli esempi A–F in `HANDOFF.md` sono dialoghi sintetici redazionali, non risposte
generate né valutazioni di un provider. Nessuna credenziale o dato reale è stato
usato per questa validazione e nessun provider è stato chiamato.

## Verifiche ripetibili

`backend/tests/test_self_questioning.py` copre tutti i passi dei sette strumenti
nelle sei lingue e nei livelli di contesto; casi A risposta approfondita, B
risposta tersa, C difficoltà iniziale e persistente con cronologia, D domanda
spontanea, E rifiuto e F trascrizione delle cinque aree fino alla sintesi con
correzione/ritiro, attribuzione e isolamento per persona, sessione e conversazione.
Controlla inoltre consenso, domande specifiche degli altri strumenti, percorso
essenziale, parità Prompt Lab/runtime e riduzione con un sostituto deterministico.
Le generazioni accidentali fanno fallire la nuova suite.

Esito 2026-10-15: **751 test nuovi superati**, **6 test di parità superati** in un
processo separato, **354 regressioni superate** con un solo smoke preesistente
escluso per nome. Superati anche i tre test del controllo documentale, refresh e
check guidance e verifica rispetto a `origin/main`.

Eseguire esclusivamente su un PostgreSQL effimero dedicato, senza rete verso
provider o produzione. Le fixture creano `counselorbot_test`; lo smoke ricrea
le tabelle pubbliche di quel database, quindi non usare un server condiviso con
dati da conservare. Disabilitare dotenv e non passare credenziali del sistema.

Comando per la nuova suite, nell'immagine backend ricostruita:

```sh
docker run --rm --network counselorbot-self-questioning-s2 \
  -e DATABASE_URL=postgresql://postgres@postgres:5432/counselorbot_test \
  -e PYTHON_DOTENV_DISABLED=1 -e COUNSELOR_TRANSLATE_DISABLED=1 \
  -e ADMIN_SYNC_DISABLED=1 \
  counselorbot-self-questioning-validation:20261015-s2 \
  python -m pytest -q --disable-warnings backend/tests/test_self_questioning.py
```

Per la parità eseguire separatamente `backend/tests/test_chat_preparation.py`.
Per la regressione usare gli stessi parametri Docker e aggiungere questi due
mount in sola lettura (sostituire `/percorso/worktree`):

```sh
--mount type=bind,source=/percorso/worktree/questionari/item_catalog/qpcc.json,target=/app/questionari/item_catalog/qpcc.json,readonly
--mount type=bind,source=/percorso/worktree/frontend/src/lib/qpcc-schema.json,target=/app/frontend/src/lib/qpcc-schema.json,readonly
```

Comando di regressione dentro il container:

```sh
python -m pytest -q --disable-warnings \
  backend/tests/test_smoke.py backend/tests/test_context_levels.py \
  backend/tests/test_context_meta_boundary.py backend/tests/test_prompt_variants.py \
  backend/tests/test_prompt_routing.py backend/tests/test_chat_preferences.py \
  backend/tests/test_chat_continuation.py backend/tests/test_prompt_pair_drift.py \
  backend/tests/test_prompt_files.py backend/tests/test_turn_contract_deferral.py \
  backend/tests/test_qpcc_alignment.py backend/tests/test_event_booklet_chat.py \
  -k 'not test_build_context_envelope_component_flags_disable_parts'
```

La rete di questa sessione è interna; il solo PostgreSQL di test usa tmpfs,
senza porte pubblicate o volumi persistenti. Il contesto di build è una copia
temporanea dei soli file versionati necessari a `backend/Dockerfile`, più il
nuovo test: nessun `.env`, memoria o upload di produzione. Nessun container
produttivo viene ricostruito o riavviato. Non è richiesto deploy o sudo.

Il baseline ha un fallimento già registrato nel Diario:
`f6ff90ff-0b05-41f8-9ac7-0eaea2a302e9`,
`test_smoke.py::test_build_context_envelope_component_flags_disable_parts`.
Si aspetta un messaggio vuoto dove arriva `domanda`. La riproduzione usa i tre
moduli originali di `0024ec2d` in un container temporaneo; nessun checkout o dato
produttivo viene modificato. L'esclusione dalla regressione è nominativa, mai
un'omissione silenziosa.

Rilevato anche un difetto preesistente di isolamento dei test, registrato come
`cb078c90-086d-4ca5-8e71-ecb4403b8b24` (confermato, non collegato a GitHub): dopo
lo smoke Obiettivo la parità conta 83 passi invece dei 65 attesi. Si riproduce
anche sul baseline con questi due nodi, nello stesso processo:

```sh
python -m pytest -q --disable-warnings \
  backend/tests/test_smoke.py::test_every_gate_that_would_silently_exclude_obiettivo_lets_it_through \
  backend/tests/test_chat_preparation.py::test_all_steps_and_languages_use_identical_runtime_and_audit_preparation
```

La parità su database pulito supera tutti i sei test; eseguirla separatamente
mantiene il controllo senza alterare test estranei al comportamento richiesto.
Il primo run esteso ha inoltre richiesto i due mount QPCC sopra, come già noto
nel Diario (`29f937d7-0189-42af-95e7-7b30f1acedfa`).

Risorse di test arrestate a fine sessione: entrambi i PostgreSQL
`counselorbot-self-questioning-s2-postgres` e
`counselorbot-self-questioning-postgres`. Nessun processo dev resta attivo.

I risultati definitivi, commit e PR sono nella prima sezione di `HANDOFF.md`.
La revisione da un modello diverso prima del merge spetta al Timoniere.
