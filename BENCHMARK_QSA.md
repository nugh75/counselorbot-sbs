# Benchmark QSA CounselorBot — Ollama

## Cos'è

Benchmark che simula l'**interazione completa CounselorBot QSA** per valutare velocità e accuratezza dei modelli Ollama (<15B parametri). Testa l'intero flusso: analisi guidata degli 8 step + domande follow-up, con gli stessi system prompt e direttive usati in produzione.

## Come si esegue

```bash
# Default (modelli <15B automatici)
python -m backend.tests.test_ollama_qsa_benchmark

# Con host Ollama remoto e salvataggio report
OLLAMA_URL=http://192.168.129.14:11434 \
  OUTPUT=benchmark_report.md \
  python -m backend.tests.test_ollama_qsa_benchmark

# Solo modelli specifici
MODELS="gemma4:12b,deepseek-r1:8b" \
  python -m backend.tests.test_ollama_qsa_benchmark
```

### Variabili d'ambiente

| Variabile | Default | Descrizione |
|---|---|---|
| `OLLAMA_URL` | `http://localhost:11434` | Indirizzo del server Ollama |
| `CONCURRENT_USERS` | `3` | Numero di utenti simultanei per test concorrenza |
| `MODELS` | `auto` | Lista virgolata di modelli (default: tutti <15B) |
| `LANGUAGE` | `it` | Lingua delle risposte |
| `MIN_WORDS` | `30` | Soglia minima parole per risposta valida |
| `OUTPUT` | `""` | Path per salvare report markdown |
| `MAX_PARAMS_B` | `15` | Filtro massimo parametri in miliardi |
| `WARMUP` | `1` | Riscaldamento modello prima dei test |

## Cosa testa

### 8 Step guidati (+ 3 follow-up)

| # | Step | Tipo | Fattori |
|---|---|---|---|
| 1 | Fattori Cognitivi | factor | C1-C7 |
| 2 | Fattori Affettivi | factor | A1-A7 |
| 3 | Elaborazione e Org. | second-level | C1, C5, C7 |
| 4 | Autocontrollo | second-level | C2, C3, C6 |
| 5 | Motivazione | second-level | A2, A5, A6 |
| 6 | Gestione Emotiva | second-level | A1, A7 |
| 7 | Stile Attributivo | second-level | A3, A4 |
| 8 | Dimensione Sociale | second-level | C4 |
| FUP1 | Approfondimento C2 | factor-qa | C2 |
| FUP2 | Gestione ansia | factor-qa | A1, A7 |
| FUP3 | Motivazione | factor-qa | A2, A6 |

### Dati studente simulati

```
C1: 7/9 (forza)    C2: 5/9 (medio)     C3: 3/9 (forza, invertito)
C4: 6/9 (medio)    C5: 4/9 (medio)     C6: 7/9 (critico, invertito)
C7: 5/9 (medio)    A1: 8/9 (critico)   A2: 6/9 (medio)
A3: 5/9 (medio)    A4: 8/9 (critico)   A5: 6/9 (medio)
A6: 3/9 (critico)  A7: 7/9 (critico)
```

## Metriche

### Velocità
- **TTFT** (Time To First Token): latenza prima risposta
- **Token/s**: velocità di generazione
- **Concorrenza**: N utenti simultanei (latenza media, P50, P95, P99)

### Qualità (0-1)

| Metrica | Peso | Descrizione |
|---|---|---|
| Copertura fattori | 20% | I fattori richiesti dallo step sono menzionati |
| Interpretazione | 20% | L'interpretazione corrisponde al punteggio (es. C1=7 → "forza", A1=8 → "criticità") |
| Formato codici | 10% | Nessun codice isolato: `C2 (Self-regulation)`, mai solo `C2` |
| Consigli pratici | 12% | Presenza di suggerimenti concreti ("prova a", "consiglio") |
| Menzione punteggi | 8% | I numeri (7/9) sono citati |
| No refusal | 5% | Il modello non rifiuta ("non ho accesso ai punteggi") |
| Connessione | 5% | Per second-level: fattori discussi in relazione |
| No saluto | 5% | Non inizia con "Ciao", "Hi", "Benvenuto" |
| Struttura | 5% | Paragrafi, elenchi, organizzazione chiara |
| Lingua | 3% | Caratteri italiani presenti se richiesti |
| HTML | 2% | Nessun tag HTML spurio |

### Punteggio composito
```
qualità × 0.4 + velocità (tok/s) × 0.3 + affidabilità × 0.3
```

## Risultati (2026-06-12)

### Dati raccolti su 192.168.129.14:11434

| Modello | Parametri | Qualità | Tok/s | TTFT | Voto |
|---|---|---|---|---|---|
| **gemma4:e4b** | 4B | **0.83** | 472 | 4.5 s | OTTIMO |
| gemma4:e2b | 2B | 0.76 | 768 | 3.4 s | BUONO |
| gemma4:12b | 12B | 0.74 | 374 | 12.3 s | BUONO |
| qwen3:0.6b | 0.6B | 0.72 | **2258** | **1.2 s** | BUONO |
| deepseek-r1:8b | 8B | 0.62 | 555 | 7.9 s | BUONO |
| gemma3:1b | 1B | 0.52 | 392 | **0.9 s** | SUFF. |
| qwen3.5:9b | 9B | **0.45** | 186 | 11.3 s | SUFF. |

### Raccomandazioni

1. **Migliore qualità**: `gemma4:e4b` (0.83) — 9/11 step OTTIMO. Consigliato per produzione.
2. **Miglior qualità/velocità**: `gemma4:e2b` (0.76, 768 tok/s, 3.4s TTFT) — buon compromesso.
3. **Più veloce**: `qwen3:0.6b` — troppo piccolo per analisi QSA serie.
4. **Da evitare**: `qwen3.5:9b` — qualità SCARSA su tutti gli step.
5. **Inconsistente**: `deepseek-r1:8b` — 4 step OTTIMO, 4 step SCARSO.

### Note

- Tutti i modelli hanno ottenuto **100% affidabilità** (nessun errore di connessione).
- `gemma4:12b` ha TTFT alto (~12s) ma è il modello più completo per profondità analisi.
- `deepseek-r1:8b` è molto inconsistente: alterna risposte eccellenti a SCARSE a seconda dello step.
- La famiglia `qwen3.5` (9B) performa male nonostante i parametri — probabilmente perché è un modello precedente o non ottimizzato per questo tipo di analisi in italiano.
- `qwen3:0.6b` è velocissimo ma non ha abbastanza capacità per interpretare correttamente fattori complessi come la motivazione o l'attribuzione causale.

## Integrazione

Il benchmark è in `backend/tests/test_ollama_qsa_benchmark.py` e può essere eseguito anche come test pytest:

```bash
python -m pytest backend/tests/test_ollama_qsa_benchmark.py -v --collect-only
```
