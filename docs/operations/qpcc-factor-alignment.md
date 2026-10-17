# QPCC: audit, riallineamento e validazione (#242)

## Requisito e fonte del disallineamento

Fonte di prodotto: descrizione canonica fornita dall’utente per il task Diario
`4aff2fef-40f1-4443-9b76-edd0ba9324df`, QPCC di Pellerey–Orio. Il questionario
ha 63 item, quattro dimensioni connesse e dieci scale, con stanine 1–9.
La fonte non fornisce la chiave item→fattore né le norme: non vengono dedotte.

| Dimensione | Scale canoniche |
| --- | --- |
| A affettivo-emozionale | A1 Ansia di parlare in pubblico; A2 Senso di insicurezza; A3 Senso di inadeguatezza |
| V volitiva | V1 Autoregolazione e perseveranza sul lavoro; V2 Far fronte a sfide personali (coping) |
| C cognitiva | C1 Competenze elaborative; C2 Competenza comunicativa |
| M motivazionale | M1 Percezione di competenza; M2 Orientamento all’io; M3 Attribuzioni causali (locus of control interno) |

Al commit di partenza `71a35aa6`, `backend/questionnaire_catalog.py` conteneva
25 item sostitutivi EN/SV, assegnati a cinque aree sintetiche K1–K5. Lo stesso
schema era duplicato in `frontend/src/lib/questionnaires.ts`, traduzioni,
`qsa_extractor.py`, Telegram, prompt di fattore e percorso guidato. Gli item
interni non erano i 63 item QPCC: la diagnosi già documentata in
`docs/validazione/diagnosi-somministrazione-ensv.md` ne segnalava l’invenzione.
Lo skeleton `questionari/item_catalog/qpcc.json` aveva invece 63 posti vuoti,
nessun fattore e scala del resoconto indefinita. La documentazione di dettaglio
confondeva inoltre QPCC con competenze di cittadinanza. Bussola e schede
presentavano descrizioni incomplete e un confronto improprio fra competenza
percepita e competenza effettiva.

## Comportamento corretto

`backend/qpcc_schema.json` contiene lo schema e i nomi nelle sei lingue;
la copia frontend è verificata da un test di parità. Le chiavi di traduzione
sono `factor.QPCC.<codice>`, perché A1–A3 e C1–C2 coincidono come sigle con QSA
ma misurano costrutti differenti. I nomi QSA e gli altri strumenti restano invariati.
Le lingue di sistema sono le sei di `APP_LOCALES` (`it`, `en`, `es`, `fr`, `de`, `sv`,
`backend/content_versions.py`). La lingua ucraina, menzionata nella scheda storica
usata con i tutor PEF per via dello studio pilota Erasmus+ PAGOSTE 2020 (Margottini
& Leproni), non è supportata da CounselorBot; la valutazione di fattibilità e
l'analisi di impatto sono documentate in [`valutazione-lingua-ucraina-qpcc.md`](../validazione/valutazione-lingua-ucraina-qpcc.md) (#243).


Il percorso legge un profilo già calcolato; non somministra 63 domande in chat.
Si rivolge a giovani e adulti in cerca di occupazione o in professioni relazionali:
autovalutazione, nessuna risposta giusta/sbagliata, durata indicativa 20–30 minuti.
Patto con accettazione esplicita, lettura dei dieci fattori, esplorazione con una
domanda principale e al massimo due approfondimenti, sintesi qualitativa.
Gli identificativi dei passi restano stabili:

| Passo | Fattori distinti nel colloquio |
| --- | --- |
| qpcc-intro | patto, senza lettura anticipata dei punteggi |
| qpcc-profilo | tutte le dieci scale |
| qpcc-comunicazione | A1, distinto da C2 |
| qpcc-controllo | A2 e A3 |
| qpcc-volizione | V1 e V2 |
| qpcc-elaborazione | C1 e C2 |
| qpcc-convinzioni | M1, M2 e M3 |
| qpcc-sintesi | integrazione delle quattro dimensioni, senza nuove valutazioni numeriche |

La dimensione A è esplorata in due passi per distinguere l’ansia in pubblico
da insicurezza/inadeguatezza. A1–A3: alto = maggiore difficoltà dichiarata.
M2: orientamento all’io, interpretato nel contesto, senza classificarlo come
forza/crescita. UI, sidebar, PDF, OpenCode e bande delle strategie rispettano
queste differenze. Nella vista QPCC, l’assenza di fattori nella fascia di forza
non viene descritta come equilibrio globale o assenza di valori estremi. Il bug
generico è registrato nel Diario; gli altri strumenti mantengono il comportamento
precedente. La sintesi distingue proposte da impegni della persona e
conserva solo tempi concordati. Le strategie ancora collegate a K non sono
selezionabili; il seed le crea come bozze. Un collegamento ai fattori canonici
richiede una revisione editoriale, senza ricertificazione automatica.

API nuove compilazioni e repertorio di prova: esattamente i dieci codici con
stanine intere 1–9; profili K, misti, incompleti e valori fuori scala → 422.
L’estrazione da PDF richiede gli stessi dieci fattori. Chat e ripresa congelata
rifiutano i profili K con 409 `qpcc_legacy_profile`; OpenCode li rifiuta con 422.
I nomi del profilo vengono ricostruiti lato server e non accettati come etichette
QSA inviate dal client. I punteggi nel messaggio sono limitati ai fattori del passo.

La somministrazione interna QPCC è sospesa: `/instruments` restituisce zero
item somministrabili e nessuna lingua disponibile; `/instruments/QPCC/rules`
restituisce 409, `/score` 400 prima di calcolare o salvare. Il blocco vale anche
per cataloghi DB preesistenti e amministratori. Non si applica il fallback lineare
ai vecchi item come se producesse stanine canoniche. Le norme e la chiave
canoniche richiederanno un intervento distinto e autorizzato.

## Dati preesistenti e aggiornamento esplicito

L’utente ha confermato che le vecchie analisi non servono. Non vengono convertite,
riutilizzate nel percorso corretto o cancellate da questa PR.

| Dato | Trattamento |
| --- | --- |
| QuestionnaireResult.scores / ValidationResponse.answers e factor_scores | conservati, senza ricalcoli o conversioni K→A/V/C/M |
| TeacherPracticeResult.scores | conservati; K esclusi dalla selezione e dal confronto |
| FrozenSession.data / Log / letture e conversazioni | conservati; profili congelati K non riprendibili |
| bozze locali dei punteggi | solo i campi canonici entrano nel nuovo invio |
| TelegramConversationState.scores | nuove immissioni usano dieci codici; stato K richiede un nuovo profilo |
| vecchi Factor K / QuestionnaireItem | fattori conservati come archivio; item disattivati dal piano approvato |
| Config / GuidedStep / GuidedStepQuestion / OrientationToolBrief | aggiornamento esplicito dei testi di fabbrica riconosciuti; personalizzazioni preservate |

Nessun accesso o aggiornamento di dati reali è necessario per validare questa PR.
Nessuna migrazione distruttiva è richiesta. Le API admin dei fattori mostrano solo
le dieci scale canoniche; le righe K rimangono nel DB come archivio. Per un’installazione già popolata,
in un successivo intervento autorizzato con la connessione DB del target:

```sh
python -m backend.qpcc_alignment plan /tmp/qpcc-alignment-plan.json
# Leggere changes e preserved; verificare anche le varianti CR e i passi personalizzati.
python -m backend.qpcc_alignment apply /tmp/qpcc-alignment-plan.json
# Se necessario, prima di ulteriori modifiche ai target:
python -m backend.qpcc_alignment rollback /tmp/qpcc-alignment-plan.json
```

Il piano è privato (permessi 0600), non va committato; contiene testi, non risposte
personali. L’applicazione usa una transazione, lock PostgreSQL e confronto dei
valori prima/dopo: un target modificato o una nuova rivendicazione di proprietà
admin invalida l’intero piano. Registra revisioni dei prompt. Il rollback verifica
lo stato applicato prima di ripristinare valori e rimuovere solo i fattori aggiunti
da quel piano. I risultati e gli item non vengono eliminati.

`preserved` richiede verifica dell’operatore: prompt/etichette personalizzati,
fattori canonici già presenti, domande personalizzate. Le varianti CR1–CR4,
i vecchi percorsi compatti, le personalizzazioni e i prompt dei counselor non
sono sovrascritti: devono essere controllati nella Mappa e nel Prompt Lab.
Il contratto canonico entra comunque nell’envelope della chat a ogni turno,
anche quando la variante del prompt salvato è diversa. Non vengono sovrascritti
prompt QPCC attivi all’avvio per applicare questo riallineamento.

## Verifica riproducibile

Test su PostgreSQL dedicato `counselorbot_test`, schemi transazionali e sole fixture:

```sh
python -m pytest backend/tests/test_qpcc_alignment.py \
  backend/tests/test_prompt_files.py backend/tests/test_prompt_pair_drift.py \
  backend/tests/test_diagram_factor_symbols.py backend/tests/test_prompt_factory_alignment.py \
  backend/tests/test_qsa_factor_directive.py backend/tests/test_w4_content.py -q
cd frontend
npm test
npm run i18n:check
npx tsc --noEmit
```

Browser con tutte le richieste API intercettate, nessun backend o dato reale:

```sh
./scripts/dev-qpcc-validation.sh
# da un altro terminale:
cd frontend
QPCC_BASE_URL=http://127.0.0.1:3147 node --test tests/qpcc-alignment.test.mjs
# CHROMIUM_PATH può indicare Chrome installato; QPCC_SCREENSHOTS abilita le immagini.
```

Porta 3147, backend deliberatamente inesistente su 8047, nessun DB frontend.
Stop con Ctrl-C. Su questo worktree il primo avvio Turbopack sul volume locale
ha superato il timeout di compilazione della home: la verifica browser è stata
eseguita sull’immagine frontend isolata, pubblicata solo su 127.0.0.1:3149,
con lo stesso codice e le stesse fixture. Nessun container produttivo usato.
Dettagli in `live-dev-environment.md`. Copertura: campi e nomi
in sei lingue a 390px, profilo, chat congelata/consenso a 1440px e avviso per
ripresa K; schema, direzione, scoping, PDF/OpenCode/Telegram, rifiuto dello scoring,
CAS/rollback, personalizzazioni e storico. Il provider LLM è simulato: questi test
verificano percorso ed envelope, non l’aderenza di un modello reale.

Prima del merge è obbligatoria la revisione cross-modello della PR, con
`opencode-go/glm-5.3` o modello che il Timoniere farà confermare. Questa PR
non esegue merge, deploy, sudo, né riavvii dei container di produzione.

## Esito della sessione di implementazione

- Backend: 172 test passati nella nuova immagine, incluso PostgreSQL isolato;
  28 casi specifici QPCC su schema, sei lingue, contratti, percorso, PDF,
  OpenCode/Telegram, migrazione e conservazione dello storico.
- Frontend: 429 test di libreria; i18n e TypeScript passati; lint dei file modificati
  senza errori, con quattro avvisi già presenti nei componenti esistenti.
- Browser: otto casi su sei lingue, input e profilo mobile, consenso/chat desktop
  e rifiuto della ripresa K. Screenshot da fixture controllati, compresa la barra
  neutra M2 e la direzione di A1–A3.
- Entrambe le immagini Docker di validazione ricostruite; produzione invariata.
- `make guidance-refresh`, `make guidance-check` e gate rispetto a `origin/main`
  passati, manifest incluso. L’audit npm segnala vulnerabilità preesistenti:
  registrate nel Diario come bug locale per un intervento dedicato.

I test non attestano norme psicometriche né risposte di un provider reale. Il
questionario item-level rimane sospeso finché non saranno disponibili chiave
canonica autorizzata e norme validate. Nessun dato reale usato o modificato.
