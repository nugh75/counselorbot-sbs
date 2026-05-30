# Progetto di adattamento, validazione e sviluppo digitale del QSA e del QSAr in svedese e inglese

## Stato del documento

| Campo | Valore |
|---|---|
| Progetto | CounselorBot / Competenzestrategiche.it |
| Strumenti | QSA e QSAr |
| Lingue di nuova implementazione | Svedese (`sv`) e inglese (`en`) |
| Popolazione iniziale di validazione | Studenti reclutati in Svezia |
| Stato | Piano di sviluppo e protocollo preliminare |
| Repository di lavoro | `counselorbot-sbs` |
| Vincolo autorizzativo | Il proponente appartiene al gruppo di ricerca e dichiara di disporre delle autorizzazioni necessarie |

## 1. Sintesi del progetto

Il progetto mira a sviluppare, validare e rendere disponibili online quattro versioni linguistiche:

| Versione | Strumento | Lingua | Destinatari iniziali |
|---|---|---|---|
| `QSA-SV` | Questionario sulle Strategie di Apprendimento | Svedese | Studenti svedesi nella fascia educativa coerente con il QSA |
| `QSA-EN` | Questionario sulle Strategie di Apprendimento | Inglese | Studenti in Svezia con adeguata competenza scolastica in inglese |
| `QSAr-SV` | Questionario sulle Strategie di Apprendimento - Ridotto | Svedese | Studenti svedesi nella fascia educativa coerente con il QSAr |
| `QSAr-EN` | Questionario sulle Strategie di Apprendimento - Ridotto | Inglese | Studenti in Svezia con adeguata competenza scolastica in inglese |

Il risultato finale previsto comprende:

1. versioni linguistiche documentate degli strumenti;
2. evidenze di validita e affidabilita per la popolazione reclutata in Svezia;
3. tabelle normative `stanine` da 1 a 9 per lingua e strumento;
4. profili grafici e testuali in svedese e inglese;
5. una modalita di ricerca nell'applicazione per la raccolta controllata dei dati;
6. una modalita di counseling attivabile soltanto dopo la validazione;
7. materiali tecnici pronti per la pubblicazione su `competenzestrategiche.it`.

La versione inglese sara inizialmente validata nel contesto svedese. Di conseguenza, la validazione autorizzera l'uso con studenti in Svezia che compilano in inglese, non l'estensione automatica a popolazioni britanniche, nordamericane o internazionali.

## 2. Principi metodologici e tecnici

Il progetto segue cinque principi.

1. **Equivalenza prima della traduzione letterale.** Ogni item deve conservare il costrutto misurato e risultare comprensibile nel contesto scolastico svedese.
2. **Validazione separata per lingua.** `SV` e `EN` costituiscono versioni distinte; la comparabilita richiede analisi di invarianza.
3. **Scoring normativo.** I profili finali dipendono da norme svedesi costruite sui dati raccolti, non dalla semplice applicazione delle tabelle italiane.
4. **Separazione tra ricerca e orientamento.** Durante la validazione l'intelligenza artificiale non deve influenzare risposte, item o processo di compilazione.
5. **Tracciabilita.** Versioni linguistiche, revisioni, norme e algoritmi di scoring devono essere versionati e auditabili.

## 3. Strumenti da adattare

### 3.1 QSA

Il QSA comprende 100 item e restituisce un profilo articolato in 14 fattori.

| Area | Codice | Fattore | Direzione interpretativa |
|---|---|---|---|
| Cognitiva | `C1` | Strategie elaborative | Diretta |
| Cognitiva | `C2` | Autoregolazione | Diretta |
| Cognitiva | `C3` | Disorientamento | Inversa |
| Cognitiva | `C4` | Disponibilita alla collaborazione | Diretta |
| Cognitiva | `C5` | Organizzatori semantici | Diretta |
| Cognitiva | `C6` | Difficolta di concentrazione | Inversa |
| Cognitiva | `C7` | Autointerrogazione | Diretta |
| Affettivo-motivazionale | `A1` | Ansieta di base | Inversa |
| Affettivo-motivazionale | `A2` | Volizione | Diretta |
| Affettivo-motivazionale | `A3` | Attribuzione a cause controllabili | Diretta |
| Affettivo-motivazionale | `A4` | Attribuzione a cause incontrollabili | Inversa |
| Affettivo-motivazionale | `A5` | Mancanza di perseveranza | Inversa |
| Affettivo-motivazionale | `A6` | Percezione di competenza | Diretta |
| Affettivo-motivazionale | `A7` | Interferenze emotive | Inversa |

### 3.2 QSAr

Il QSAr comprende 46 item e restituisce un profilo articolato in 8 fattori.

| Area | Codice operativo proposto | Fattore | Direzione interpretativa |
|---|---|---|---|
| Cognitiva | `C1` | Strategie elaborative per comprendere e ricordare | Diretta |
| Cognitiva | `C2` | Strategie autoregolative | Diretta |
| Cognitiva | `C3` | Strategie grafiche / organizzatori semantici | Diretta |
| Cognitiva | `C4` | Strategie di controllo dell'attenzione (carenza) | Inversa |
| Affettivo-motivazionale | `A1` | Strategie di controllo delle emozioni / ansieta di base | Inversa |
| Affettivo-motivazionale | `A2` | Volizione | Diretta |
| Affettivo-motivazionale | `A3` | Attribuzioni causali | Diretta |
| Affettivo-motivazionale | `A4` | Percezione di competenza | Diretta |

**Decisione da formalizzare:** la pagina di interpretazione del sito utilizza `A6` per la percezione di competenza del QSAr, mentre la documentazione di validazione utilizza `A4`. Prima dell'implementazione occorre fissare la codifica canonica, conservando eventualmente un alias per compatibilita con documenti precedenti.

## 4. Popolazione e disegno generale

### 4.1 Popolazioni target

La selezione delle classi svedesi deve essere fondata sulla funzione educativa degli strumenti.

| Strumento | Popolazione italiana originaria di riferimento | Popolazione svedese da definire con le scuole |
|---|---|---|
| QSAr | Fine primaria / avvio secondaria di primo grado | Fascia scolastica iniziale adatta a riflettere sulle strategie di studio; ipotesi iniziale: ultimi anni della `grundskola` |
| QSA | Primo biennio secondaria superiore / formazione professionale | Avvio della `gymnasieskola` e, se pertinente, percorsi professionali equivalenti |

La corrispondenza finale deve essere approvata dal gruppo scientifico svedese prima del pilot.

### 4.2 Disegno linguistico

Si propone un disegno a gruppi paralleli con sottostudio bilingue.

| Componente | Procedura | Finalita |
|---|---|---|
| Gruppo `SV` | Compilazione in svedese | Validazione e norme svedesi |
| Gruppo `EN` | Compilazione in inglese | Validazione inglese nel contesto svedese |
| Sottocampione bilingue | Compilazione `SV` e `EN`, ordine controbilanciato, distanza di 2-3 settimane | Equivalenza linguistica e stabilita delle classificazioni |
| Sottocampione retest | Seconda compilazione nella stessa lingua, distanza di 2-3 settimane | Stabilita temporale |

La lingua di somministrazione deve essere assegnata casualmente entro scuola o classe, ove la gestione scolastica lo consenta. Se il gruppo inglese viene reclutato esclusivamente in contesti English-medium, la condizione deve essere descritta come caratteristica della popolazione e non come randomizzazione.

### 4.3 Numerosita consigliate

| Fase | QSA-SV | QSA-EN | QSAr-SV | QSAr-EN |
|---|---:|---:|---:|---:|
| Interviste cognitive | 12-15 | 12-15 | 12-15 | 12-15 |
| Pilot | 60-100 | 60-100 | 60-100 | 60-100 |
| Validazione principale | 500 | 500 | 400-500 | 400-500 |
| Retest, per lingua | 75-100 | 75-100 | 75-100 | 75-100 |
| Sottostudio bilingue | 100-150 totali | compreso a sinistra | 100-150 totali | compreso a sinistra |

Il campione raccomandato per la validazione principale e compreso tra 1.800 e 2.000 studenti. Un campione inferiore resta utilizzabile come studio iniziale, ma limiterebbe normazione per sottogruppi e analisi di invarianza.

## 5. Work package scientifici

## WP0 - Governance, autorizzazioni e protocollo

### Obiettivo

Stabilire la responsabilita scientifica, amministrativa e tecnica prima della produzione delle traduzioni.

### Attivita

1. Designare responsabile scientifico, coordinatore svedese, psicometrista e responsabile tecnico.
2. Individuare scuole, referenti locali e fasce scolastiche target.
3. Formalizzare l'autorizzazione all'adattamento e alla pubblicazione delle versioni.
4. Definire il trattamento dei dati, i ruoli privacy e i tempi di conservazione.
5. Preparare il protocollo per la verifica etica in Svezia.
6. Preregistrare, ove opportuno, ipotesi e piano statistico prima della raccolta principale.

### Deliverable

- `D0.1` Protocollo scientifico.
- `D0.2` Data Management Plan (DMP).
- `D0.3` Documentazione etica e privacy.
- `D0.4` Piano statistico preregistrato.

## WP1 - Definizione della fonte e matrice item-fattore

### Obiettivo

Creare un'origine dati univoca per item, fattori, direzione interpretativa e versioni linguistiche.

### Attivita

1. Stabilire l'edizione italiana canonica di `QSA` e `QSAr`.
2. Estrarre e ricontrollare tutti gli item dai documenti approvati.
3. Associare ogni item al fattore ufficiale.
4. Identificare eventuali item con ricodifica e distinguere:
   - item con risposta da invertire prima del punteggio grezzo;
   - fattori la cui interpretazione e inversa pur senza ricodifica dell'item.
5. Risolvere la codifica `A4/A6` del QSAr.

### Deliverable

- `D1.1` Master item matrix italiana verificata.
- `D1.2` Dizionario dei fattori e delle regole di scoring.
- `D1.3` Registro delle discrepanze documentali risolte.

## WP2 - Traduzione e adattamento culturale

### Obiettivo

Produrre versioni preliminari in svedese e inglese equivalenti sul piano concettuale.

### Procedura per ogni strumento e lingua

1. Due traduzioni indipendenti dall'italiano.
2. Riconciliazione delle traduzioni.
3. Retrotraduzione verso l'italiano da parte di un traduttore indipendente.
4. Confronto item per item con la fonte.
5. Revisione da parte del panel scientifico.
6. Revisione da parte di docenti che conoscano il lessico degli studenti target.
7. Approvazione di una versione candidata al pilot.

### Oggetti da tradurre

- istruzioni;
- item;
- risposte Likert;
- titoli e descrizioni dei fattori;
- messaggi di completamento;
- testi del profilo individuale;
- informativa, assenso e consenso;
- messaggi di interfaccia necessari alla somministrazione.

### Matrice di traduzione minima

| Campo | Descrizione |
|---|---|
| `instrument_code` | `QSA` oppure `QSAr` |
| `item_code` | Identificatore stabile dell'item |
| `factor_code` | Fattore associato |
| `source_it` | Testo italiano approvato |
| `sv_translation_1/2` | Traduzioni indipendenti |
| `sv_reconciled` | Testo svedese candidato |
| `sv_back_translation` | Retrotraduzione |
| `en_translation_1/2` | Traduzioni indipendenti |
| `en_reconciled` | Testo inglese candidato |
| `en_back_translation` | Retrotraduzione |
| `decision_note` | Motivazione di una scelta o modifica |
| `status` | `draft`, `reviewed`, `pilot`, `validated`, `published` |

### Deliverable

- `D2.1` QSA-SV e QSA-EN candidate.
- `D2.2` QSAr-SV e QSAr-EN candidate.
- `D2.3` Registro completo delle decisioni traduttive.

## WP3 - Validita di contenuto

### Obiettivo

Verificare che gli item tradotti risultino pertinenti, chiari e culturalmente appropriati.

### Panel

| Panel | Composizione minima |
|---|---|
| Svedese | Ricercatori educativi, docenti svedesi, linguista o traduttore accademico |
| Inglese | Ricercatori bilingui, docenti con esperienza English-medium, revisore linguistico |
| Centrale | Autori o membri del progetto originario e psicometrista |

### Valutazione degli item

Ogni item viene giudicato rispetto a:

- equivalenza concettuale;
- chiarezza;
- adeguatezza alla fascia scolastica;
- rilevanza rispetto al fattore;
- naturalezza linguistica;
- rischio di interpretazioni dipendenti dal contesto italiano.

### Criteri decisionali

| Esito | Azione |
|---|---|
| Chiarezza e pertinenza adeguate | Item mantenuto |
| Problema linguistico correggibile | Revisione e nuova verifica |
| Differenza culturale rilevante | Adattamento motivato e documentato |
| Dubbi persistenti sul costrutto | Item sottoposto a ulteriore valutazione prima del pilot |

### Deliverable

- `D3.1` Report di validita di contenuto.
- `D3.2` Versioni pre-cognitive interview.

## WP4 - Interviste cognitive

### Obiettivo

Verificare se gli studenti comprendono gli item e le opzioni di risposta nel modo atteso.

### Procedura

1. Presentazione dello strumento nella lingua assegnata.
2. Compilazione guidata di una selezione rappresentativa di item.
3. Tecnica `think aloud` o domande retrospettive.
4. Verifica specifica di:
   - termini scolastici;
   - concetti astratti;
   - riferimenti alle emozioni;
   - item con formulazione negativa;
   - differenze tra opzioni della scala di risposta.
5. Registrazione strutturata delle difficolta.
6. Revisione degli item problematici.

### Criteri per il passaggio al pilot

- assenza di incomprensioni sistematiche;
- comprensione adeguata della scala di risposta;
- nessun item ritenuto estraneo alla vita scolastica target senza motivazione;
- approvazione del panel centrale.

### Deliverable

- `D4.1` Report delle interviste cognitive.
- `D4.2` Versioni pilota numerate, ad esempio `QSA-SV-v0.3`.

## WP5 - Pilot digitale

### Obiettivo

Valutare fattibilita, qualita dei dati e correttezza della somministrazione online.

### Dati da osservare

- numero di studenti invitati e partecipanti;
- tasso di completamento;
- tempo di compilazione;
- item mancanti;
- risposte uniformi o inattendibili;
- segnalazioni degli studenti;
- distribuzione delle risposte;
- affidabilita preliminare delle scale.

### Decisioni dopo il pilot

| Risultato | Decisione |
|---|---|
| Buona comprensione e dati utilizzabili | Avvio raccolta principale |
| Problemi limitati ad alcuni item | Revisione mirata e mini-pilot di conferma |
| Difficolta estese nella versione EN | Limitazione del target EN a studenti con esposizione documentata all'inglese |
| Errori della piattaforma | Correzione software prima della raccolta principale |

### Deliverable

- `D5.1` Dataset pilot pseudonimizzato.
- `D5.2` Report di fattibilita.
- `D5.3` Versioni definitive per la raccolta principale.

## WP6 - Raccolta dati principale

### Obiettivo

Ottenere il dataset necessario alla validazione psicometrica e alla costruzione delle norme.

### Variabili minime

| Categoria | Variabili |
|---|---|
| Disegno | strumento, lingua, versione item, scuola, classe, data |
| Studente | codice pseudonimo, eta o fascia, genere opzionale, anno scolastico |
| Lingua | lingua principale, esposizione all'inglese, eventuale programma English-medium |
| Compilazione | risposta a ciascun item, tempo complessivo, stato completamento |
| Retest | collegamento pseudonimo, intervallo temporale, ordine linguistico se bilingue |

### Dati da non registrare nel dataset psicometrico

- nome e cognome;
- email personale;
- testo libero di counseling;
- conversazioni con modelli AI;
- dati non necessari al protocollo.

### Deliverable

- `D6.1` Dataset principale congelato.
- `D6.2` Codebook.
- `D6.3` Registro delle esclusioni e delle deviazioni dal protocollo.

## WP7 - Analisi psicometriche

### Obiettivo

Valutare le proprieta delle quattro versioni linguistiche.

### 7.1 Qualita dei dati

Per ogni combinazione strumento-lingua:

- partecipazione e completamento;
- tempi di risposta;
- missing per item;
- distribuzione delle risposte;
- effetti pavimento e soffitto;
- pattern inattendibili definiti a priori.

### 7.2 Analisi degli item

- correlazioni item-scala corrette;
- distribuzione delle categorie di risposta;
- funzionamento degli item potenzialmente problematici;
- confronto descrittivo `SV/EN`;
- eventuale Differential Item Functioning (DIF) per lingua o competenza inglese.

### 7.3 Validita strutturale

Le risposte sono ordinali. L'analisi principale dovrebbe quindi utilizzare una Confirmatory Factor Analysis (CFA) con correlazioni policoriche e stimatore adatto, ad esempio `WLSMV`.

| Strumento | Modello teorico primario |
|---|---|
| QSA | 14 fattori originari |
| QSAr | 8 fattori originari |

Per ogni modello riportare:

- `CFI`;
- `TLI`;
- `RMSEA` con intervallo di confidenza;
- `SRMR`;
- carichi fattoriali;
- correlazioni tra fattori;
- eventuali modifiche, sempre motivate sul piano teorico e linguistico.

### 7.4 Affidabilita

Per ogni scala e lingua:

- omega per dati ordinali;
- alpha ordinale;
- intervalli di confidenza;
- confronto con i risultati delle versioni italiane, con finalita descrittiva.

### 7.5 Stabilita temporale

Nel sottocampione retest:

- stabilita dei punteggi di scala;
- stabilita della classificazione `basso / medio / alto`;
- analisi degli eventuali effetti di apprendimento o memoria.

### 7.6 Invarianza tra svedese e inglese

La comparabilita dei punteggi richiede Multi-Group Confirmatory Factor Analysis (MGCFA).

| Livello | Domanda |
|---|---|
| Configurale | Le due lingue mantengono la stessa struttura fattoriale? |
| Metrica | I carichi fattoriali risultano comparabili? |
| Soglie/scalare per item ordinali | Le categorie di risposta operano in modo confrontabile? |
| Parziale | Eventuali item non invarianti possono essere esclusi o gestiti senza alterare il costrutto? |

Se l'invarianza non risulta sufficiente, le due versioni possono essere pubblicate con norme separate, ma non usate per confronti diretti dei punteggi.

### 7.7 Validita convergente

Individuare una misura gia validata in svedese, compatibile con eta e contesto, relativa a:

- autoregolazione dell'apprendimento;
- autoefficacia scolastica;
- motivazione accademica;
- strategie di studio.

Lo strumento esterno va selezionato prima della raccolta principale, verificandone autorizzazioni e proprieta psicometriche.

### Deliverable

- `D7.1` Script analitici riproducibili.
- `D7.2` Report psicometrico QSA-SV/EN.
- `D7.3` Report psicometrico QSAr-SV/EN.
- `D7.4` Decisione formale su comparabilita tra lingue.

## WP8 - Normazione e profili

### Obiettivo

Trasformare gli esiti psicometricamente supportati in profili utilizzabili nella piattaforma.

### Tabelle normative

Per ogni versione approvata produrre:

- punteggi grezzi per fattore;
- media e deviazione standard;
- percentili;
- conversione in scala `stanine` da 1 a 9;
- eventuali norme differenziate per fascia scolastica, soltanto se il campione e adeguato.

### Regola di restituzione

| Stanine | Descrizione generale per fattori diretti | Descrizione generale per fattori inversi |
|---:|---|---|
| `1-3` | Area da esplorare o sostenere | Punto di forza relativo |
| `4-6` | Fascia media | Fascia media |
| `7-9` | Punto di forza relativo | Area da esplorare o sostenere |

I testi finali devono essere formulati come indicazioni riflessive e non diagnostiche.

### Profili da predisporre

| Strumento | Lingua | Profilo grafico | Profilo testuale |
|---|---|---|---|
| QSA | `sv` | 14 fattori | Basso/medio/alto per ciascun fattore |
| QSA | `en` | 14 fattori | Basso/medio/alto per ciascun fattore |
| QSAr | `sv` | 8 fattori | Basso/medio/alto per ciascun fattore |
| QSAr | `en` | 8 fattori | Basso/medio/alto per ciascun fattore |

### Deliverable

- `D8.1` Tabelle normative stanine.
- `D8.2` Testi dei profili in `sv` e `en`.
- `D8.3` Manuale tecnico dello scoring.

## WP9 - Pubblicazione e monitoraggio

### Obiettivo

Portare gli strumenti validati nella piattaforma ufficiale e predisporre il controllo successivo.

### Attivita

1. Consegnare strumenti, norme e manuale tecnico a `competenzestrategiche.it`.
2. Inserire le nuove lingue nella procedura di somministrazione ufficiale.
3. Pubblicare rapporto metodologico e limiti di trasferibilita.
4. Monitorare completamenti, distribuzioni e affidabilita su nuovi dati.
5. Pianificare, in seconda fase, QPCS, QPCC, ZTPI e QAP.

### Deliverable

- `D9.1` Pacchetto di pubblicazione per Competenzestrategiche.it.
- `D9.2` Rapporto pubblico della validazione.
- `D9.3` Piano di monitoraggio post-rilascio.

## 6. Requisiti etici e di protezione dei dati

Il progetto coinvolge studenti, inclusi potenzialmente minori, e raccoglie dati sulle autopercezioni relative allo studio. Prima della somministrazione principale occorre:

1. verificare con l'istituzione responsabile in Svezia la necessita di valutazione da parte della Swedish Ethical Review Authority (`Etikprovningsmyndigheten`);
2. definire titolare del trattamento, responsabili, accessi e base giuridica;
3. predisporre informativa e procedure di consenso/assenso in svedese;
4. separare i codici di collegamento retest dai dati delle risposte;
5. applicare minimizzazione dei dati e tempi di cancellazione;
6. evitare l'uso delle risposte per valutazioni scolastiche individuali;
7. impedire l'accesso dell'intelligenza artificiale ai dati item-level durante la validazione.

La documentazione dell'autorita svedese indica che, nella ricerca, studenti di 15-17 anni capaci di comprendere lo studio possono esprimere consenso; per partecipanti sotto i 15 anni la gestione del consenso deve comprendere i titolari della responsabilita genitoriale, nel rispetto della volonta del minore.

## 7. Situazione corrente del repository

L'applicazione e composta da:

- frontend Next.js/React in `frontend/`;
- backend FastAPI/SQLAlchemy in `backend/`;
- database PostgreSQL nella configurazione Docker corrente;
- modulo di chat guidata con provider AI configurabile;
- traduzioni dell'interfaccia gia presenti, incluso lo svedese.

### 7.1 Funzionalita gia disponibili

| Funzionalita | Stato corrente | File principali |
|---|---|---|
| Selettore strumenti | Presente | `frontend/src/components/questionnaire/QuestionnaireSelector.tsx` |
| QSA come questionario attivo | Presente, con inserimento di punteggi stanine gia calcolati | `frontend/src/lib/questionnaires.ts`, `frontend/src/lib/qsa-model.ts` |
| ZTPI e Savickas | Attivi | `frontend/src/lib/ztpi-model.ts`, componenti `qsa/` |
| QSAr | Registrato ma non implementato | `frontend/src/lib/questionnaires.ts` |
| Interfaccia in svedese | Gia disponibile per flusso generale e QSA corrente | `frontend/src/lib/i18n.ts`, `backend/chat_logic.py` |
| Chat guidata su punteggi | Presente | `frontend/src/components/qsa/GuidedChatInterface.tsx`, `backend/routes/chat.py` |
| Database per configurazione, log e feedback | Presente | `backend/models.py` |
| Somministrazione item-level | Assente | Da progettare |
| Scoring grezzo -> stanine | Assente per somministrazione di item | Da progettare |
| Gestione versioni linguistiche degli item | Assente | Da progettare |
| Esportazione dataset psicometrico | Assente | Da progettare |

### 7.2 Limitazioni da risolvere

L'attuale applicazione e orientata al counseling su un profilo gia ottenuto, non alla validazione di un questionario. In particolare:

- `ScoreInputForm` accetta punteggi di fattore `1..9`, non risposte ai singoli item;
- `ProfileVisualization` presenta immediatamente una lettura del profilo;
- `GuidedChatInterface` invia i punteggi al modello AI;
- `Log` e `SurveyResponse` non rappresentano un dataset di ricerca item-level;
- `QSAr`, `QPCS`, `QPCC` e `QAP` usano fattori placeholder;
- il backend usa migrazioni SQL opportunistiche nello startup per una colonna esistente; la raccolta scientifica richiede migrazioni versionate.

## 8. Architettura applicativa proposta

## 8.1 Separazione tra Research Mode e Counseling Mode

Si propone di introdurre due percorsi distinti.

### Research Mode

Utilizzato per traduzione, pilot e validazione.

| Caratteristica | Regola |
|---|---|
| Item | Presentati integralmente nella versione assegnata |
| AI | Non attiva durante la compilazione e lo scoring sperimentale |
| Profilo | Non mostrato oppure marcato esplicitamente come sperimentale |
| Dati | Risposte item-level pseudonimizzate |
| Export | Disponibile solo a ricercatori autorizzati |
| Versionamento | Ogni somministrazione registra la versione esatta degli item |

### Counseling Mode

Utilizzato soltanto dopo approvazione delle norme.

| Caratteristica | Regola |
|---|---|
| Scoring | Tabelle stanine validate |
| Profilo | Grafico e testo nella lingua compilata |
| AI | Attivabile sul profilo validato, non sulle risposte item-level |
| Audit | Registrazione di strumento, lingua e norm set utilizzato |

## 8.2 Flussi utente proposti

### Flusso di ricerca

1. Accesso tramite link/codice studio.
2. Presentazione informativa e raccolta consenso/assenso secondo protocollo.
3. Inserimento o assegnazione del codice pseudonimo.
4. Assegnazione di strumento e lingua.
5. Compilazione item.
6. Conferma invio.
7. Messaggio finale neutro.
8. Eventuale richiesta retest tramite procedura separata.

### Flusso successivo di counseling

1. Selezione `QSA` o `QSAr`.
2. Scelta lingua `sv` o `en`.
3. Compilazione del questionario validato oppure caricamento del profilo ufficiale.
4. Calcolo del punteggio grezzo.
5. Conversione stanine mediante norma appropriata.
6. Visualizzazione profilo.
7. Avvio facoltativo della conversazione orientativa.

## 9. Modello dati proposto

Le risposte di ricerca non devono essere inserite nei log di chat o nella tabella survey di feedback. Si propone un dominio dati dedicato.

### 9.1 Tabelle di catalogo

#### `instruments`

| Campo | Tipo indicativo | Funzione |
|---|---|---|
| `code` | string PK | `QSA`, `QSAr` |
| `name_it` | string | Nome ufficiale |
| `factor_count` | integer | `14` oppure `8` |
| `item_count` | integer | `100` oppure `46` |
| `status` | string | `draft`, `pilot`, `validated`, `published` |

#### `instrument_versions`

| Campo | Tipo indicativo | Funzione |
|---|---|---|
| `id` | UUID PK | Identificatore versione |
| `instrument_code` | FK | Collegamento allo strumento |
| `locale` | string | `it`, `sv`, `en` |
| `version_label` | string | Es. `v0.3-pilot`, `v1.0-validated` |
| `source_version_id` | UUID nullable | Versione sorgente italiana |
| `stage` | string | `translation`, `pilot`, `validation`, `published` |
| `content_hash` | string | Impronta degli item per audit |
| `created_at` | datetime | Data versione |
| `locked_at` | datetime nullable | Congelamento per raccolta |

#### `factors`

| Campo | Tipo indicativo | Funzione |
|---|---|---|
| `instrument_code` | FK | Strumento |
| `code` | string | `C1`, `A1`, ecc. |
| `sort_order` | integer | Ordine nel profilo |
| `is_interpretation_inverted` | boolean | Direzione della lettura |
| `label_it/sv/en` | string | Denominazione multilingue |
| `description_it/sv/en` | text | Descrizione multilingue |

#### `items`

| Campo | Tipo indicativo | Funzione |
|---|---|---|
| `id` | UUID PK | Identificatore item-versione |
| `instrument_version_id` | FK | Versione linguistica |
| `item_code` | string | Identificatore stabile, es. `QSA-001` |
| `sort_order` | integer | Ordine di presentazione |
| `factor_code` | string | Scala |
| `wording` | text | Testo nella lingua della versione |
| `requires_reverse_scoring` | boolean | Ricodifica risposta, se prevista |
| `active` | boolean | Inclusione nella versione |

### 9.2 Tabelle di ricerca

#### `research_studies`

| Campo | Funzione |
|---|---|
| `id`, `code`, `title` | Identificazione dello studio |
| `phase` | `cognitive`, `pilot`, `validation`, `retest` |
| `starts_at`, `ends_at` | Periodo autorizzato |
| `profile_feedback_enabled` | Di norma `false` prima della validazione |
| `status` | Apertura/chiusura della raccolta |

#### `research_assignments`

Definisce quale strumento e lingua viene assegnato a un partecipante pseudonimo.

| Campo | Funzione |
|---|---|
| `study_id` | Studio |
| `participant_code_hash` | Codice pseudonimizzato |
| `instrument_version_id` | Versione da somministrare |
| `sequence_group` | Es. `SV_FIRST`, `EN_FIRST`, `SINGLE_SV`, `SINGLE_EN` |
| `wave` | `T1`, `T2` |

#### `administrations`

| Campo | Funzione |
|---|---|
| `id` | Singola compilazione |
| `study_id` | Studio |
| `instrument_version_id` | Versione immutabile usata |
| `participant_code_hash` | Identita pseudonima |
| `school_code`, `class_code` | Variabili contestuali pseudonime |
| `age_band`, `grade_level` | Variabili campionarie |
| `primary_language`, `english_exposure` | Variabili linguistiche |
| `started_at`, `submitted_at` | Tempistiche |
| `completion_status` | `started`, `completed`, `withdrawn`, `excluded` |
| `exclusion_reason` | Tracciabilita delle esclusioni |
| `consent_record_id` | Collegamento a consenso separato |

#### `item_responses`

| Campo | Funzione |
|---|---|
| `administration_id` | Compilazione |
| `item_id` | Item della versione |
| `value` | Risposta Likert |
| `answered_at` | Timestamp opzionale per qualita dati |

#### `scale_scores`

| Campo | Funzione |
|---|---|
| `administration_id` | Compilazione |
| `factor_code` | Fattore |
| `raw_score` | Punteggio grezzo |
| `stanine_score` | Nullable durante fase sperimentale |
| `norm_set_id` | Nullable fino alla normazione |
| `scoring_version` | Versione algoritmo |

### 9.3 Tabelle normative e profili

#### `norm_sets`

| Campo | Funzione |
|---|---|
| `id` | Identificatore norma |
| `instrument_version_id` | Versione linguistica |
| `population_label` | Es. `Sweden, gymnasieskola entry, SV` |
| `sample_size` | Numero casi validi |
| `status` | `provisional`, `validated`, `retired` |
| `approved_at` | Approvazione |
| `method_note` | Metodo di trasformazione |

#### `norm_thresholds`

| Campo | Funzione |
|---|---|
| `norm_set_id` | Norma |
| `factor_code` | Scala |
| `raw_min`, `raw_max` | Intervallo grezzo |
| `stanine` | Punto standard `1..9` |

#### `profile_texts`

| Campo | Funzione |
|---|---|
| `instrument_version_id` | Lingua e strumento |
| `factor_code` | Scala |
| `band` | `low`, `mid`, `high` |
| `text` | Commento approvato |
| `status` | `draft`, `reviewed`, `published` |

### 9.4 Consenso e identificazione

I riferimenti che permettono di collegare lo studente reale al codice pseudonimo non devono essere salvati nello stesso database delle risposte, salvo motivazione e protezioni approvate dal DMP. Il repository applicativo dovrebbe conservare soltanto l'hash o il token pseudonimo richiesto per la compilazione e il retest.

## 10. Backend: piano di sviluppo

### 10.1 Organizzazione dei moduli

Si propone di mantenere i router attuali per chat e feedback, introducendo moduli dedicati alla somministrazione.

```text
backend/
  models.py                     # estensione o suddivisione dei modelli SQLAlchemy
  schemas.py                    # schemi Pydantic esistenti + schemi ricerca
  routes/
    instruments.py              # catalogo versioni, item pubblicabili
    research.py                 # assegnazione e compilazione sperimentale
    scoring.py                  # scoring solo per versioni abilitate
    exports.py                  # esportazioni protette per ricercatori
  services/
    instrument_service.py       # caricamento versioni e item
    scoring_service.py          # punteggi grezzi, stanine, profili
    assignment_service.py       # randomizzazione / sequenze bilingui
    export_service.py           # dataset e codebook
    consent_service.py          # registrazione stato consenso senza dati eccedenti
  migrations/                   # migrazioni versionate, preferibilmente Alembic
```

Se il refactor in `backend/routes/` e ancora in corso, i nuovi moduli devono essere aggiunti dopo aver stabilizzato la struttura corrente, senza reintrodurre logica in `backend/main.py`.

### 10.2 API pubbliche di Research Mode

| Metodo | Endpoint proposto | Funzione |
|---|---|---|
| `GET` | `/research/studies/{study_code}/landing` | Informazioni pubbliche, lingue e requisiti |
| `POST` | `/research/studies/{study_code}/consent` | Registra stato di consenso/assenso |
| `POST` | `/research/studies/{study_code}/assign` | Convalida token e restituisce assegnazione |
| `GET` | `/research/administrations/{id}/questionnaire` | Restituisce item della versione assegnata |
| `POST` | `/research/administrations/{id}/responses` | Salvataggio incrementale |
| `POST` | `/research/administrations/{id}/submit` | Congela la compilazione |
| `GET` | `/research/administrations/{id}/complete` | Messaggio conclusivo senza profilo sperimentale |

### 10.3 API riservate ai ricercatori

| Metodo | Endpoint proposto | Funzione |
|---|---|---|
| `POST` | `/admin/instruments` | Crea strumento/versione |
| `POST` | `/admin/instrument-versions/{id}/items/import` | Importa matrice item controllata |
| `POST` | `/admin/instrument-versions/{id}/lock` | Congela versione prima della raccolta |
| `POST` | `/admin/research/studies` | Configura studio |
| `POST` | `/admin/research/studies/{id}/tokens` | Genera token pseudonimi |
| `GET` | `/admin/research/studies/{id}/status` | Stato raccolta |
| `GET` | `/admin/research/studies/{id}/export` | Esporta dataset item-level |
| `POST` | `/admin/norm-sets/import` | Inserisce tabelle normative approvate |
| `POST` | `/admin/instrument-versions/{id}/publish` | Abilita scoring/profilo |

### 10.4 API di Counseling Mode dopo validazione

| Metodo | Endpoint proposto | Funzione |
|---|---|---|
| `GET` | `/questionnaires?locale=sv` | Versioni pubblicate selezionabili |
| `POST` | `/questionnaires/{version_id}/score` | Calcola raw scores e stanine |
| `GET` | `/profiles/{administration_id}` | Restituisce grafico/testi approvati |
| `POST` | `/chat` | Riceve esclusivamente il profilo sintetico autorizzato |

### 10.5 Regole backend non negoziabili

- Il backend, non il browser, deve calcolare scoring e stanine.
- Una versione `pilot` non deve usare norme pubblicate come se fosse validata.
- Una versione bloccata per raccolta non deve essere modificabile.
- Ogni profilo deve riportare `instrument_version_id`, `norm_set_id` e `scoring_version`.
- La chat non deve ricevere risposte item-level.
- Le esportazioni devono essere autenticate e registrate in audit log.

## 11. Frontend: piano di sviluppo

### 11.1 Nuove aree applicative

```text
frontend/src/app/
  research/[studyCode]/page.tsx              # landing e consenso
  research/[studyCode]/questionnaire/page.tsx # somministrazione item
  research/[studyCode]/complete/page.tsx      # completamento neutro
  admin/research/page.tsx                     # monitoraggio studio
  profile/[administrationId]/page.tsx         # futuro profilo validato

frontend/src/components/research/
  ConsentForm.tsx
  QuestionnaireRunner.tsx
  LikertItem.tsx
  ProgressIndicator.tsx
  ResearchCompletion.tsx

frontend/src/lib/
  research-api.ts
  instrument-types.ts
  questionnaire-locales.ts
```

### 11.2 Questionario item-level

Il componente di somministrazione deve:

- ricevere gli item dal backend, non incorporarli staticamente nel bundle;
- mostrare la lingua assegnata, senza commutatore dopo l'inizio;
- conservare ordine e formulazione fissati per la versione;
- consentire salvataggio temporaneo secondo protocollo;
- impedire invii incompleti oppure registrarli come incompleti, in base alla regola stabilita;
- registrare il tempo di compilazione senza introdurre elementi distraenti;
- non mostrare chat, consigli o profilo durante la raccolta.

### 11.3 Evoluzione dei componenti presenti

| File esistente | Uso corrente | Evoluzione proposta |
|---|---|---|
| `frontend/src/lib/questionnaires.ts` | Configurazione statica di fattori; QSAr placeholder | Mantenere per profili pubblicati oppure sostituire con metadati provenienti dall'API |
| `frontend/src/components/questionnaire/QuestionnaireSelector.tsx` | Attiva `QSA`, `ZTPI`, `SAVICKAS` | Mostrare `QSA-SV/EN` e `QSAr-SV/EN` solo allo stato `published` |
| `frontend/src/components/qsa/ScoreInputForm.tsx` | Inserimento manuale stanine | Conservare per import di profili esistenti; non usarlo nella validazione |
| `frontend/src/components/qsa/ProfileVisualization.tsx` | Visualizzazione `1..9` | Generalizzare ai fattori QSAr e ai testi multilingue approvati |
| `frontend/src/components/qsa/GuidedChatInterface.tsx` | Counseling guidato | Abilitare per nuove versioni soltanto dopo il rilascio delle norme |
| `frontend/src/lib/i18n.ts` | UI in sei lingue, incluso `sv` | Aggiungere terminologia di Research Mode; non usarlo come archivio degli item validati |

### 11.4 Interfaccia di ricerca

In Research Mode si raccomanda un'interfaccia minimale:

- titolo dello strumento;
- istruzioni nella lingua assegnata;
- indicatore di avanzamento sobrio;
- item con scala di risposta;
- comando di invio;
- contatto per eventuali domande sullo studio;
- messaggio finale neutro.

Elementi da escludere:

- emoji o elementi motivazionali non previsti dal protocollo;
- suggerimenti sulle strategie;
- evidenziazione dei fattori;
- cambi di lingua durante la compilazione;
- chat o estrazione AI da PDF.

## 12. Motore di scoring

## 12.1 Fase sperimentale

Durante pilot e validazione il sistema puo calcolare punteggi grezzi per controllo interno, ma:

- non deve restituire stanine come profilo validato;
- non deve mostrare interpretazioni individuali automatiche;
- deve registrare la versione dell'algoritmo;
- deve permettere una verifica indipendente tramite script statistico.

## 12.2 Fase validata

Il servizio di scoring deve eseguire:

```text
risposte item-level
  -> validazione completezza e range
  -> eventuale ricodifica item prevista
  -> aggregazione per fattore
  -> applicazione norm_set coerente con strumento, lingua e popolazione
  -> punteggio stanine 1..9
  -> classificazione interpretativa secondo direzione del fattore
  -> profilo grafico e testi approvati
```

### Contratto indicativo del risultato

```json
{
  "instrument": "QSAr",
  "locale": "sv",
  "instrument_version": "v1.0-validated",
  "norm_set": "SE-QSAR-SV-2028-v1",
  "scores": [
    {
      "factor_code": "C1",
      "raw_score": 21,
      "stanine": 6,
      "band": "mid",
      "interpretation_direction": "direct"
    }
  ]
}
```

## 13. Analisi statistica e codice di ricerca

Le analisi psicometriche non dovrebbero essere affidate al backend applicativo. Si propone una directory separata e riproducibile, da introdurre quando il protocollo statistico sara approvato:

```text
research/
  README.md
  protocol/
    analysis-plan.md
    variable-dictionary.md
  data/
    README.md                 # nessun dato identificativo versionato in Git
  scripts/
    01_quality_checks.R
    02_item_analysis.R
    03_cfa_qsa.R
    04_cfa_qsar.R
    05_invariance_sv_en.R
    06_retest.R
    07_stanine_norms.R
    08_profile_export.R
  outputs/
    README.md
```

### Scelta dello stack analitico

R e particolarmente adatto al progetto per:

- `lavaan` per CFA e invarianza;
- `psych` e pacchetti correlati per analisi di affidabilita;
- procedure documentabili per dati ordinali;
- produzione controllata delle tabelle normative.

Gli script devono:

- non contenere dati personali;
- leggere solo esportazioni pseudonimizzate;
- produrre report riproducibili;
- generare file normativi importabili dal backend;
- essere bloccati a una specifica versione degli item.

## 14. Sicurezza, privacy e audit applicativo

### 14.1 Misure applicative minime

- HTTPS in produzione.
- Token di partecipazione monouso o con scadenza.
- Hash dei codici pseudonimi.
- Separazione ruoli `admin` e `researcher`, se l'app diventa strumento di raccolta reale.
- Esportazioni tracciate.
- Backup cifrati o gestiti secondo politica dell'istituzione.
- Nessun log contenente item response nel servizio AI.
- Nessun dato di risposta inviato a provider LLM durante Research Mode.

### 14.2 Evoluzione della gestione utenti

Attualmente il modello `User` distingue soltanto `is_admin`. Per una raccolta reale si propone:

| Ruolo | Permessi |
|---|---|
| `admin` | Configurazione tecnica |
| `research_manager` | Creazione studi, versioni, export |
| `school_coordinator` | Monitoraggio della propria scuola senza accesso a dati non necessari |
| `participant` | Compilazione tramite token, senza account persistente |

### 14.3 Audit

Registrare:

- creazione e blocco di una versione;
- apertura e chiusura di uno studio;
- esportazione di un dataset;
- importazione e pubblicazione di un norm set;
- calcolo di un profilo dopo validazione.

Non registrare nei log applicativi generici il testo di ogni risposta item-level.

## 15. Migrazioni e qualita del codice

Il backend corrente crea tabelle tramite SQLAlchemy e contiene una modifica schema eseguita allo startup. Questa strategia non e sufficiente per dati di ricerca, poiche non documenta in modo robusto l'evoluzione dello schema.

### Piano proposto

1. Introdurre migrazioni versionate, preferibilmente Alembic.
2. Creare le tabelle di ricerca mediante migration esplicite.
3. Non trasformare `SurveyResponse` in tabella questionari: misura il feedback sull'app, non gli strumenti psicometrici.
4. Non utilizzare `Log.details` per memorizzare il dataset.
5. Aggiungere vincoli di integrita:
   - una response per item e administration;
   - impossibilita di modificare una administration inviata;
   - impossibilita di modificare una instrument version bloccata;
   - norm set associabile solo alla versione per cui e stato calcolato.

## 16. Piano dei test software

## 16.1 Test backend

| Ambito | Test richiesti |
|---|---|
| Catalogo strumenti | Versioni e item vengono restituiti soltanto se autorizzati per lo studio |
| Assignment | Randomizzazione, sequenze bilingui e retest risultano riproducibili e auditabili |
| Risposte | Range Likert, completezza, blocco dopo submit |
| Scoring | Somme grezze, ricodifica, direzione interpretativa |
| Norme | Applicazione della tabella appropriata per versione/lingua |
| Sicurezza | Endpoint export e amministrazione non accessibili senza ruolo |
| Privacy | Payload chat non contiene item responses |
| Migrazioni | Creazione schema su database vuoto e upgrade idempotente |

## 16.2 Test frontend

| Ambito | Test richiesti |
|---|---|
| Somministrazione | Rendering corretto di item `SV/EN`, navigazione e submit |
| Lingua | Nessun cambio di lingua dopo assegnazione |
| Completezza | Gestione risposte mancanti coerente col protocollo |
| Research Mode | Assenza di profilo e chat prima dell'abilitazione |
| Profilo validato | Visualizzazione corretta di fattori diretti e inversi |
| Accessibilita | Navigazione tastiera, label associate, leggibilita per studenti |

## 16.3 Test di equivalenza scoring

Prima della pubblicazione, un set di casi artificiali deve essere calcolato indipendentemente:

1. mediante script statistico ufficiale;
2. mediante backend applicativo;
3. mediante controllo manuale su un campione di record.

Il rilascio e autorizzato soltanto se i risultati coincidono per punteggi grezzi, stanine e classificazioni.

## 17. Roadmap di implementazione nel repository

### Fase tecnica A - Preparazione alla ricerca

| Ticket | Intervento | File/directory interessati | Dipendenza |
|---|---|---|---|
| `A1` | Definire modello dati scientifico definitivo | documento e schema DB | WP0-WP1 |
| `A2` | Introdurre migrazioni versionate | `backend/`, nuova config migration | `A1` |
| `A3` | Aggiungere tabelle strumenti/versioni/item/studi | `backend/models.py`, migrations, schemas | `A2` |
| `A4` | Creare servizi per catalogo e assignment | nuovi `backend/services/` | `A3` |
| `A5` | Creare router Research Mode | nuovi `backend/routes/` | `A4` |
| `A6` | Creare UI di consenso e compilazione | nuove route/componenti frontend | `A5` |
| `A7` | Aggiungere export pseudonimizzato protetto | backend admin/research | `A5` |
| `A8` | Estendere test automatici | `backend/tests/`, test frontend | `A3-A7` |

### Fase tecnica B - Pilot

| Ticket | Intervento | Esito |
|---|---|---|
| `B1` | Importare versioni item `pilot` SV/EN | Questionari bloccati per pilot |
| `B2` | Configurare studio pilot | Link/token e assegnazioni |
| `B3` | Controllare esportazione e codebook | Dataset pronto per analisi |
| `B4` | Correggere problemi di usabilita senza alterare dati gia raccolti | Nuova versione numerata se necessario |

### Fase tecnica C - Validazione principale

| Ticket | Intervento | Esito |
|---|---|---|
| `C1` | Congelare versioni definitive per raccolta | Hash e version label |
| `C2` | Configurare raccolta principale e retest | Dataset principale |
| `C3` | Aggiungere directory/script di analisi riproducibile | Report psicometrico |
| `C4` | Produrre e importare norm set approvati | Scoring disponibile ma non ancora pubblico |

### Fase tecnica D - Counseling e pubblicazione

| Ticket | Intervento | Esito |
|---|---|---|
| `D1` | Implementare scoring backend e profilo multilingue | Profilo validato `SV/EN` |
| `D2` | Completare configurazioni QSAr nel frontend | QSAr non piu placeholder |
| `D3` | Generalizzare chat guidata a QSA/QSAr per lingua | Counseling successivo al profilo |
| `D4` | Abilitare strumenti pubblicati nel selector | Accesso utente |
| `D5` | Preparare export tecnico per Competenzestrategiche.it | Pacchetto ufficiale |

### Fase tecnica E - Seconda famiglia di strumenti

Dopo il rilascio QSA/QSAr, l'architettura sara riutilizzabile per:

1. QPCS;
2. QPCC;
3. ZTPI, riallineando scoring e norme alla documentazione normativa ufficiale;
4. QAP.

Ogni nuovo strumento richiedera comunque un proprio adattamento e, se somministrato in nuove lingue o popolazioni, una propria evidenza di validazione.

## 18. Criteri di rilascio

### 18.1 Rilascio per raccolta pilot

- versione linguistica approvata dal panel;
- interviste cognitive concluse;
- privacy ed eventuale autorizzazione etica definite;
- Research Mode testata;
- item versionati e bloccati;
- export verificato.

### 18.2 Rilascio per raccolta principale

- problemi del pilot risolti;
- versione definitiva congelata;
- piano analitico approvato prima di osservare gli esiti principali;
- procedure retest e bilingui configurate;
- dataset esportabile senza dati identificativi.

### 18.3 Rilascio del profilo agli studenti

- validita strutturale e affidabilita esaminate;
- norme stanine approvate;
- testi dei profili rivisti scientificamente e linguisticamente;
- backend e script statistici concordanti;
- messaggio di non-diagnosticita presente.

### 18.4 Pubblicazione su Competenzestrategiche.it

- manuale tecnico completo;
- versioni item pubblicabili;
- norm set documentati;
- report di validazione;
- pacchetto di profilo grafico e testuale;
- procedura di monitoraggio post-rilascio.

## 19. Rischi e mitigazioni

| Rischio | Effetto | Mitigazione |
|---|---|---|
| Campione EN con competenza linguistica insufficiente | Misura della lingua invece del costrutto | Raccogliere esposizione all'inglese, pilot dedicato, eventuale target English-medium |
| Campione insufficiente per quattro versioni | Norme e invarianza instabili | Sequenziare QSAr e QSA o ampliare rete scuole |
| Confusione tra norme italiane e svedesi | Profilo non valido | Disattivare restituzione automatica fino all'import di norme approvate |
| Modifiche agli item durante raccolta | Dataset non confrontabile | Versioni immutabili con hash e nuova versione per ogni modifica |
| Uso della chat durante la validazione | Influenza sulle risposte | Research Mode priva di AI |
| Memorizzazione impropria di risposte nei log | Rischio privacy e scientifico | Tabelle dedicate, payload minimizzati, audit export |
| Codifica QSAr non univoca (`A4/A6`) | Errori nei profili e nell'analisi | Decisione canonica prima della matrice item-fattore |
| Deploy rapido senza migrazioni | Schema non riproducibile | Introdurre migration tool prima della raccolta |

## 20. Milestone temporali indicative

| Mese | Milestone scientifica | Milestone tecnica |
|---:|---|---|
| 1 | Governance, target e protocollo | Disegno DB, scelte privacy e migrazioni |
| 2-3 | Traduzioni e retrotraduzioni | Catalogo strumenti/versioni e import item |
| 4 | Validita di contenuto | Research Mode iniziale |
| 5 | Interviste cognitive | UI e API di compilazione testate |
| 6 | Pilot | Export dataset e correzioni |
| 7-10 | Raccolta principale | Hosting e monitoraggio raccolta |
| 10-11 | Retest e studio bilingue | Chiusura dataset |
| 12-14 | Analisi psicometrica | Script riproducibili e import norme |
| 15 | Normazione e testi profilo | Scoring/profile feature |
| 16-18 | Report e pubblicazione | Counseling multilingue e pacchetto piattaforma ufficiale |

## 21. Decisioni da assumere prima di iniziare il codice

| Decisione | Motivo |
|---|---|
| Classi/eta esatte per QSA e QSAr in Svezia | Definiscono reclutamento e norme |
| Numero di scuole disponibili e numerosita realistica | Determina se svolgere entrambi gli strumenti simultaneamente |
| Modalita del gruppo inglese | Distingue EN generale in Svezia da English-medium |
| Politica di profilo durante la ricerca | Determina UI e testo del consenso |
| Codice definitivo del fattore percezione di competenza QSAr | Evita inconsistenze nello schema |
| Strumento di validita convergente | Deve essere autorizzato e integrato nel protocollo |
| Sistema istituzionale per dati e DPO | Determina deployment e accessi |
| Compatibilita tecnica con Competenzestrategiche.it | Determina formato finale di export degli strumenti |

## 22. Fonti di riferimento

### Fonti sugli strumenti e sulla piattaforma

- CompetenzeStrategiche.it, *Guida all'uso della piattaforma*, edizione online/PDF 2023: <https://www.competenzestrategiche.it/mod/book/tool/print/index.php?id=69>.
- CompetenzeStrategiche.it, sezione formativa sul QSA: <https://www.competenzestrategiche.it/course/view.php?id=3&section=2>.
- CompetenzeStrategiche.it, sezione formativa sul QSAr: <https://www.competenzestrategiche.it/course/view.php?id=3&section=3>.
- Margottini, M., *Validazione del QSA ridotto*, in Pellerey, M. (a cura di), *Strumenti e metodologie di orientamento formativo e professionale nel quadro dei processi di apprendimento permanente*, CNOS-FAP, 2018: <https://www.cnos-fap.it/sites/default/files/pubblicazioni/strumenti_e_metodologie.pdf>.
- Pellerey, M., Margottini, M., Ottone, E. (a cura di), *Dirigere se stessi nello studio e nel lavoro. Competenzestrategiche.it: strumenti e applicazioni*, Roma TrE-Press, 2020: <https://romatrepress.uniroma3.it/wp-content/uploads/2020/12/diri-pmmo.pdf>.

### Fonti metodologiche

- International Test Commission, *The ITC Guidelines for Translating and Adapting Tests*, second edition: <https://www.intestcom.org/files/guideline_test_adaptation_2ed.pdf>.
- AERA, APA, NCME, *Standards for Educational and Psychological Testing*: <https://www.testingstandards.net/>.
- Swedish Research Council, *Good Research Practice 2024*: <https://www.vr.se/english/mandates/ethics/ethics-in-research.html>.
- Swedish Ethical Review Authority (`Etikprovningsmyndigheten`): <https://etikprovningsmyndigheten.se/en/>.
- Swedish Authority for Privacy Protection (`IMY`): <https://www.imy.se/en/organisations/data-protection/>.

## 23. Primo incremento realizzabile

Il primo incremento software non deve ancora implementare counseling o scoring normativo. Deve fornire una base controllata per il pilot:

1. schema dati versionato per strumenti, versioni, item, studi, somministrazioni e risposte;
2. import della matrice item `SV/EN` approvata per il pilot;
3. endpoint di compilazione senza AI;
4. interfaccia Research Mode minimale;
5. export pseudonimizzato per analisi;
6. test che garantiscano immutabilita della versione e assenza di risposte nel canale chat.

Questo incremento consente di raccogliere dati validi senza anticipare la restituzione dei profili. Scoring, stanine e counseling saranno introdotti soltanto dopo che le analisi avranno sostenuto le versioni linguistiche.
