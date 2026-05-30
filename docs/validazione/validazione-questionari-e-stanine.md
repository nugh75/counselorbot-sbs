# Validazione dei questionari e costruzione delle stanine

Questo documento spiega (1) cosa sono le stanine "vere" e come ottenerle, e
(2) la procedura scientifica per validare i questionari EN/SV
(QSA, QSAr, ZTPI, QPCS, QPCC, QAP).

> Riferimento completo: [`progetto-validazione-qsa-qsar-sv-en.md`](progetto-validazione-qsa-qsar-sv-en.md).
> Stato corrente: l'app calcola i punteggi lato backend dalle regole salvate nel DB
> (editabili in admin → tab *Questionari & Scale*). Finché non esistono tabelle
> normative validate, lo stanine mostrato è una **riscalatura lineare sperimentale**,
> non un punteggio normato.

---

## 1. Le stanine "vere"

### Cosa sono

**Stanine** = *standard nine*. Scala 1–9, media 5, deviazione standard ~2. Non è
una formula applicata al punteggio del singolo: è la **posizione** del suo punteggio
grezzo rispetto a un **campione normativo reale**. Le bande sono fissate sulla curva
normale per percentili:

| Stanine | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| % del campione | 4 | 7 | 12 | 17 | 20 | 17 | 12 | 7 | 4 |
| percentile cumulato | 4 | 11 | 23 | 40 | 60 | 77 | 89 | 96 | 100 |

### Perché ora non sono "vere"

L'app usa, in assenza di norme, `round(1 + (media − min) · 8 / span)`: una semplice
riscalatura lineare 1–4 → 1–9. **Ignora la distribuzione reale** dei punteggi. Una
stanine vera richiede dati raccolti: senza campione normativo è matematicamente
impossibile produrla, e nessun accorgimento software la può fabbricare.

### Come ottenerle (riempire `norm_thresholds`)

1. Raccogli i **punteggi grezzi per fattore** dal campione normativo (per strumento ×
   lingua, eventualmente per fascia scolastica).
2. Calcola la distribuzione e i **percentili** di ogni fattore.
3. Trova i **cutoff grezzi** corrispondenti ai percentili cumulati della tabella sopra
   (es. punteggio al 4° percentile = soglia massima dello stanine 1; fino all'11° =
   stanine 2; e così via).
4. Inserisci le righe `raw_min / raw_max → stanine` nella tabella `norm_thresholds`
   (endpoint admin `POST /admin/instruments/{code}/norm-thresholds`), con
   `status = "validated"`, una riga per banda × fattore × lingua.
5. A quel punto lo scoring backend smette di usare il fallback lineare e restituisce
   la stanine normata (`stanine_is_normed = true`). L'infrastruttura è già pronta:
   tabella + endpoint + logica di scoring esistono.

I passi 1–4 sono validi **solo se** il campione è valido e affidabile: serve quindi
prima completare la validazione (sezione 2).

---

## 2. Procedura scientifica di validazione

### Fase 0 — Governance e autorizzazioni (WP0)

- Designare responsabile scientifico, coordinatore svedese, psicometrista, responsabile tecnico.
- Ottenere l'autorizzazione all'uso/adattamento degli item proprietari (Pellerey / CNOS-FAP).
- Data Management Plan (DMP); ruoli privacy, base giuridica, tempi di conservazione.
- Parere etico svedese (Etikprövningsmyndigheten) — necessario se coinvolti minori.
- Pre-registrazione di ipotesi e piano statistico prima della raccolta principale.

### Fase 1 — Matrice item–fattore (WP1)

- Fissare l'edizione italiana canonica di ciascuno strumento.
- Inserire gli item ufficiali + la chiave `factor` / `reverse` di ciascun item.
- Distinguere **reverse-scoring** (ricodifica della risposta) da **direzione
  interpretativa** (come si legge il fattore): sono due cose diverse.
- Risolvere i nodi noti (vedi [`diagnosi-somministrazione-ensv.md`](diagnosi-somministrazione-ensv.md)):
  codifica QSAr A4/A6; ZTPI item 47 fuori fattore + reverse mancanti; item QPCS/QPCC
  segnaposto da sostituire; scala 1–5 per ZTPI e QAP (oggi 1–4).
- Tutto modificabile nell'editor admin (*Questionari & Scale*).

### Fase 2 — Traduzione e adattamento (WP2)

Per ogni lingua: due traduzioni indipendenti IT→SV / IT→EN → riconciliazione →
**back-translation** verso l'italiano → confronto item per item con la fonte → revisione
del panel scientifico. Tradurre anche: istruzioni, scala Likert, titoli/descrizioni dei
fattori, testi del profilo, messaggi di interfaccia.

### Fase 3–4 — Validità di contenuto e interviste cognitive (WP3–WP4)

- Panel di esperti valuta equivalenza concettuale, chiarezza, pertinenza, adeguatezza
  alla fascia scolastica.
- Interviste cognitive ("think aloud") con studenti: verificano che item e scala di
  risposta siano compresi come previsto. Correzione degli item problematici.

### Fase 5 — Pilot (WP5)

n ≈ 60–100 per strumento. Si osservano: tasso di completamento, tempi, item mancanti,
risposte inattendibili, distribuzioni, affidabilità preliminare. Si correggono gli item
problematici prima della raccolta principale.

### Fase 6 — Raccolta principale (WP6)

- n ≈ **500 per strumento** (≈ 1.800–2.000 totali per le quattro versioni QSA/QSAr × SV/EN).
- Sottocampione **retest** (75–100): seconda compilazione a 2–3 settimane.
- Sottocampione **bilingue** (100–150): compila SV ed EN, ordine controbilanciato.
- Dataset item-level **pseudonimizzato**; nessun dato identificativo nel dataset psicometrico;
  nessuna risposta item-level inviata ai modelli AI durante la raccolta.

### Fase 7 — Analisi psicometriche (WP7)

- **Analisi degli item**: correlazioni item-scala corrette, distribuzione delle categorie,
  effetti pavimento/soffitto, eventuale DIF (Differential Item Functioning) per lingua.
- **Validità strutturale**: Confirmatory Factor Analysis (CFA) su dati **ordinali** →
  correlazioni policoriche, stimatore **WLSMV**. Riportare CFI, TLI, RMSEA (con IC),
  SRMR, carichi fattoriali, correlazioni tra fattori.
- **Affidabilità**: omega ordinale e alpha ordinale per ciascuna scala, con intervalli di confidenza.
- **Stabilità temporale**: test-retest sul sottocampione (2–3 settimane).
- **Invarianza SV/EN**: Multi-Group CFA (configurale → metrica → soglie/scalare). Se
  l'invarianza non è sufficiente, le due lingue si pubblicano con **norme separate** e
  non si confrontano direttamente i punteggi.
- **Validità convergente**: correlazione con uno strumento esterno già validato in svedese
  (autoregolazione, autoefficacia, motivazione, strategie di studio), selezionato e
  autorizzato prima della raccolta.

Stack analitico raccomandato: **R** — `lavaan` (CFA, invarianza), `psych` (affidabilità).
Script riproducibili, separati dal backend applicativo (vedi PROGETTO §13).

### Fase 8 — Normazione (WP8) — qui nascono le stanine vere

Dai punteggi grezzi del campione validato: media, deviazione standard, **percentili →
conversione in stanine 1–9** (tabella della sezione 1). Una tabella normativa per
strumento × lingua (× fascia scolastica se il campione lo consente). Caricamento in
`norm_thresholds`.

### Fase 9 — Rilascio

- Testi del profilo rivisti scientificamente e linguisticamente; messaggio esplicito di
  **non-diagnosticità**.
- **Doppio calcolo concordante**: gli stessi casi calcolati dallo script R ufficiale e
  dal backend dell'app devono coincidere su punteggi grezzi, stanine e classificazioni.
- Impostare `status = "validated"` sullo strumento → si attiva la modalità counseling sul
  profilo validato.

---

## 3. Sintesi

- Le **stanine vere** sono l'output della Fase 8 e dipendono dalle Fasi 6–7: niente
  scorciatoie, servono ~500 studenti per strumento e le analisi CFA / affidabilità /
  invarianza.
- L'applicazione è **già pronta a riceverle**: la tabella `norm_thresholds` e lo scoring
  che la usa appena `status = "validated"` sono implementati.
- Fino ad allora i profili restano un'**anteprima sperimentale non validata** e devono
  essere presentati come tali.

## Roadmap tecnica suggerita (lato app)

1. Directory `research/` con script R scheletro: quality check, analisi item, CFA per
   strumento, invarianza SV/EN, retest, calcolo norme stanine, export profili (PROGETTO §13).
2. Modalità "ricerca" che disattiva profilo e AI durante la raccolta (PROGETTO §8).
3. Export dataset item-level pseudonimizzato per i ricercatori.
4. Import delle tabelle normative prodotte in R dentro `norm_thresholds`.
