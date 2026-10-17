# Valutazione del supporto della lingua ucraina per il QPCC (#243)

**Data**: 17 ottobre 2026  
**Riferimento issue**: [#243](https://github.com/nugh75/counselorbot-sbs/issues/243) (*Lingua ucraina: valutare il supporto per il QPCC*)  
**Milestone**: #12 (*Incontro tutor PEF del 12 ottobre 2026*)  
**File di riferimento**:
- `backend/content_versions.py` (`APP_LOCALES`)
- `docs/operations/qpcc-factor-alignment.md` (#242)
- `docs/questionari/strumenti/schede-bibliografiche/QPCC_it.md`
- Verbale interno: `docs/progetto/incontri/verbale-incontro-tutor-2026-10-12.md` (§3, §6.2, Allegato A)

---

## 1. Contesto e quesito dei tutor PEF

Durante l'incontro del 12 ottobre 2026 con i tutor del PEF dedicato all'esplorazione di CounselorBot, la scheda descrittiva cartacea/esterna dello strumento QPCC presentata come materiale informativo (riportata nell'Allegato A del verbale di incontro) dichiarava:

> *«Attualmente il QPCC è disponibile in due lingue: italiano, ucraino.»*

I partecipanti hanno riscontrato che la piattaforma CounselorBot serve attualmente sei lingue:
- Italiano (`it`)
- Inglese (`en`)
- Spagnolo (`es`)
- Francese (`fr`)
- Tedesco (`de`)
- Svedese (`sv`)

L'ucraino non compare tra le lingue di interfaccia né tra quelle selezionabili per la compilazione o il colloquio guidato. La issue #243 richiede di verificare l'origine della menzione dell'ucraino, valutare la fattibilità tecnica e redazionale del suo supporto per il QPCC in CounselorBot, analizzare l'impatto su contenuti, validazione e manutenzione, e allineare schede e testi per prevenire discrepanze operative.

---

## 2. Ricostruzione storica e filologica: il progetto Erasmus+ PAGOSTE

L'indagine documentale e bibliografica ha chiarito l'origine precisa della dicitura "lingua ucraina" associata al QPCC:

1. **La fonte accademica**:
   Nel 2020, nell'ambito del progetto europeo Erasmus+ **PAGOSTE** (*New mechanisms of partnership-based governance and standardization of vocational teacher education in Ukraine*), è stata realizzata una traduzione e un adattamento del QPCC di Pellerey–Orio (2001) rivolto a docenti della formazione professionale (VET) in Ucraina.
   - **Riferimento bibliografico**:  
     Margottini Massimo, Leproni Roberto, *Implementation of the Self-competences and Convictions’ Perception Questionnaire (QPCC) to VET teachers in Ukraine*, Project Report, 2020. DOI: `10.13140/RG.2.2.26562.81600`.
   - **Documentazione nel corpus di ricerca**:  
     L'articolo di sintesi sulla storia della piattaforma (*Ottone Enrica, Competenzestrategiche.it: un cantiere aperto di ricerca, azione, formazione*, in *Rassegna CNOS 1/2023*, p. 114, nota 19) documenta:
     > *«19 La prima sperimentazione della piattaforma nel 2011 aveva previsto due lingue (italiano e polacco). Di recente il progetto Erasmus+ PAGOSTE ha previsto la traduzione del QPCC in lingua ucraina (Margottini, Leproni, 2020).»*

2. **Natura di quell'adattamento**:
   La versione ucraina del QPCC fu prodotta come strumento di ricerca per un target specifico (insegnanti e formatori VET ucraini nel quadro della cooperazione internazionale), gestita su piattaforma d'indagine esterna o autonoma (LimeSurvey/Moodle).  
   Tale materiale:
   - non è mai confluito nel codice sorgente o nel database di CounselorBot;
   - non dispone di un campione di standardizzazione né di tabelle stanine validate per studenti o giovani in cerca di occupazione (il target proprio del PEF);
   - non comprendeva prompt di colloquio dialogico, rubriche per modelli linguistici o strategie formative di accompagnamento.

---

## 3. Architettura linguistica e modello operativo di CounselorBot

### 3.1 Lista autorevole delle lingue (`backend/content_versions.py`)
In CounselorBot la lista delle lingue supportate è centralizzata e vincolante a livello di backend:

```python
# backend/content_versions.py:12
APP_LOCALES = ("it", "en", "es", "fr", "de", "sv")
```

Tutti i servizi dell'applicazione dipendono strettamente da questa tupla:
- **Registry dei contenuti versionati** (`content_version_service.py`): ogni richiesta per un locale non incluso in `APP_LOCALES` solleva un'eccezione `ContentVersionError`.
- **Scoring e somministrazione** (`scoring_service.py`): le lingue ammissibili (`SUPPORTED_LOCALES`) coincidono con `APP_LOCALES`; qualsiasi codice lingua estraneo genera un errore bloccante `ScoringError`.
- **Modello dati e internazionalizzazione** (`models.py`, `i18n_fields.py`): le colonne `text_i18n`, `label_i18n`, `description_i18n` memorizzano dizionari indicizzati dalle 6 sigle canoniche.
- **Frontend** (`frontend/src/lib/i18n.ts`, componenti React): l'albero di navigazione, i messaggi di sistema, le notifiche e la localizzazione delle viste rispecchiano le sei lingue di piattaforma.

### 3.2 Modello operativo del QPCC in CounselorBot (#242)
Come formalizzato nell'audit e riallineamento canonico (#242, `docs/operations/qpcc-factor-alignment.md`):
- Il QPCC in CounselorBot **non prevede somministrazione interna di item**: l'endpoint `/instruments/QPCC/rules` restituisce `409` e l'elenco espone 0 item somministrabili.
- L'utilizzo consiste nell'**importazione di un profilo già calcolato** con esattamente le dieci scale stanine canoniche (1–9) sulle quattro dimensioni connesse:
  - Dimensione A (affettivo-emozionale): A1, A2, A3;
  - Dimensione V (volitiva): V1, V2;
  - Dimensione C (cognitiva): C1, C2;
  - Dimensione M (motivazionale): M1, M2, M3.
- CounselorBot conduce poi una chat guidata in 8 passi (`qpcc-intro`, `qpcc-profilo`, `qpcc-comunicazione`, `qpcc-controllo`, `qpcc-volizione`, `qpcc-elaborazione`, `qpcc-convinzioni`, `qpcc-sintesi`).
- L'intero colloquio richiede prompt di sistema, vincoli di turno pedagogici, strategie certificate (`certified_strategies`) e letture consigliate (`certified_readings`) allineate al profilo.

---

## 4. Valutazione di fattibilità e analisi di impatto

### 4.1 Valutazione: supporto ucraino escluso nell'ambito corrente
Il supporto della lingua ucraina per il QPCC in CounselorBot è **escluso per la milestone corrente e per il perimetro operativo attuale**.

La decisione si fonda su quattro ragioni vincolanti:

1. **Asimmetria sistemica e architettura monolitica delle lingue**:
   CounselorBot non supporta lingue "a macchia di leopardo" per singolo strumento. Includere `uk` solo per il QPCC violerebbe i contratti di integgrità di `APP_LOCALES`, `content_version_service` e delle rotte frontend. Introdurre `uk` a livello di piattaforma significherebbe tradurre e manutenere l'intero applicativo (interfaccia, autenticazione, gestione classe, consensi privacy, errori, PDF).

2. **Natura conversazionale di CounselorBot vs semplice questionario**:
   CounselorBot non è una maschera di inserimento risposte, ma un agente dialogico che assiste lo studente nella riflessione metacognitiva. Il supporto linguistico non si esaurisce nella traduzione delle 63 affermazioni: richiede che il modello linguistico risponda in ucraino rispettando il patto pedagogico, i vincoli di non giudizio, le rubriche di approfondimento e la sintesi dei 10 fattori.

3. **Incoerenza con lo stato di somministrazione del QPCC**:
   La somministrazione diretta degli item del QPCC è attualmente sospesa anche per l'italiano e le altre 5 lingue (in quanto mancano le norme e le chiavi item-level caricate a sistema, richiedendo l'immissione del profilo già calcolato da competenzestrategiche.it). Disporre del testo ucraino degli item non consentirebbe comunque la compilazione diretta in CounselorBot.

4. **Divario di validazione del target**:
   I dati PAGOSTE 2020 riguardavano insegnanti e formatori professionali ucraini (adulti inseriti nel mondo del lavoro), non studenti della scuola o dei percorsi PEF. Mancano dati normativi o evidenze di equivalenza semantica e metrica per la popolazione giovanile o studentesca in lingua ucraina.

---

## 5. Studio di fattibilità e stima dello sforzo (piano per eventuale backlog futuro)

Qualora un futuro accordo istituzionale o un progetto europeo (es. filone Erasmus+ o supporto a rifugiati) definisse come requisito prioritario l'apertura all'ucraino, il percorso necessario è strutturato come segue:

### 5.1 Fasi di lavoro (Work Breakdown Structure)

```
[WP1: Acquisizione & Copyright] ➔ [WP2: Infrastruttura i18n & Piattaforma] ➔ [WP3: Traduzione & Adattamento Pedagogico] ➔ [WP4: Taratura Prompt & Validazione LLM] ➔ [WP5: Pilota & Test Usabilità]
```

1. **WP1 — Reperimento, licenze e verifica scientifica**:
   - Acquisizione formale degli item e del protocollo dal report PAGOSTE (Margottini & Leproni, 2020).
   - Accordo di licenza con gli aventi diritto (autori Pellerey–Orio e coordinatori del progetto).
   - Verifica di adeguatezza lessicale per il target studenti/giovani.
   - *Impegno stimato*: 2 settimane / 0.5 sviluppatore/ricercatore.

2. **WP2 — Infrastruttura tecnica di piattaforma**:
   - Estensione di `APP_LOCALES` con `"uk"` in `backend/content_versions.py`.
   - Aggiornamento dei vincoli in `scoring_service.py` e migrazione delle colonne `text_i18n` / `label_i18n`.
   - Localizzazione completa del dizionario frontend (`frontend/src/lib/i18n.ts`, formati data, layout, supporto caratteri cirillici in interfaccia e generazione PDF con font idonei come DejaVu Sans / Noto Sans).
   - *Impegno stimato*: 3–4 settimane / 1 sviluppatore full-stack.

3. **WP3 — Traduzione e revisione editoriale di contenuti e prompt**:
   - Traduzione e revisione madrelingua certificata delle 10 scale QPCC (A1–A3, V1–V2, C1–C2, M1–M3) e delle descrizioni dei fattori.
   - Traduzione degli 8 step della chat guidata del QPCC (`qpcc-intro`, `qpcc-profilo`, ecc.).
   - Traduzione delle domande guida (`guided_step_questions`) e delle strategie formative collegate (`certified_strategies`).
   - Panel di revisione bilingue italiano-ucraino secondo standard ITC (*International Test Commission*).
   - *Impegno stimato*: 3 settimane / 1 traduttore specializzato + 1 esperto pedagogico.

4. **WP4 — Taratura dei prompt di sistema e verifica LLM**:
   - Implementazione e test di regressione degli envelope di prompt in lingua ucraina con `make prompt-test`.
   - Verifica della tenuta del registro empatico, del rispetto dei confini etico-pedagogici (nessun consiglio direttivo, nessuna diagnosi psicologica) e della corretta interpretazione dei fattori invertiti (A1–A3) e neutri (M2).
   - *Impegno stimato*: 2 settimane / 1 sviluppatore AI/prompt engineer.

5. **WP5 — Validazione sul campo e pilotaggio**:
   - Test con un gruppo pilota di studenti e tutor di lingua ucraina.
   - Raccolta feedback su comprensibilità e usabilità.
   - *Impegno stimato*: 2 settimane / 1 ricercatore.

### 5.2 Riepilogo sforzo complessivo
- **Tempo solare**: circa 2,5 – 3 mesi.
- **Sforzo complessivo stimato**: **10–12 settimane/persona** (suddivise tra sviluppo software, traduzione specialistica e validazione psicopedagogica).

---

## 6. Allineamento delle schede e indicazioni operative per i tutor PEF

Per prevenire ambiguità e allineare i documenti informativi utilizzati con i tutor:

1. **Chiarimento per i tutor del PEF**:
   - La dicitura presente nella scheda storica del QPCC riflette il report di ricerca accademica Erasmus+ PAGOSTE 2020 condotto con insegnanti VET in Ucraina.
   - CounselorBot è un ambiente software unificato che serve attualmente le 6 lingue di progetto (`it`, `en`, `es`, `fr`, `de`, `sv`).
   - Per gli studenti ucraini seguiti dal PEF:
     - Qualora posseggano sufficiente padronanza dell'italiano o dell'inglese, possono svolgere il colloquio su CounselorBot in una di tali lingue, inserendo le stanine calcolate.
     - Non è possibile selezionare la lingua ucraina all'interno della piattaforma.

2. **Allineamento dei documenti del repository**:
   - `docs/questionari/strumenti/schede-bibliografiche/QPCC_it.md`: menziona la sperimentazione ucraina del progetto PAGOSTE 2020 precisando che la piattaforma digitale serve le 6 lingue canoniche.
   - `docs/validazione/dettagli-validazione-questionari.md`: annota il chiarimento sulla lingua ucraina e rimanda al presente documento.
   - `docs/operations/qpcc-factor-alignment.md`: integra il riferimento alla valutazione issue #243 e alla perimetrazione su `APP_LOCALES`.
   - `docs-counselorbot/funzionalita-counselorbot.md`: ribadisce che CounselorBot opera sulle sei lingue di piattaforma (`APP_LOCALES`) e rimanda alla presente valutazione per la spiegazione della scheda storica.
