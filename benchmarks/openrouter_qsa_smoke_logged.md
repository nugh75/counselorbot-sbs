# Benchmark QSA CounselorBot - OpenRouter

**Data**: 2026-06-19 21:34  |  **Lingua**: it  |  **Provider sort**: `price`

Stesso profilo QSA, stessi step e stessa funzione di scoring del benchmark Ollama.

## Classifica

| # | Modello | $/M input | $/M output | Affidabilita | TTFT | Tok/s | Qualita | Costo test | Punteggio |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | `inclusionai/ling-2.6-flash` | 0.010 | 0.030 | 100% | 866 ms | 220.3 | 0.82 | $0.0003 | 1.000 |

_Punteggio = qualita x 0.4 + velocita x 0.3 + affidabilita x 0.3. Il costo test usa i token/cost restituiti da OpenRouter quando disponibili._

## Dettaglio

### `inclusionai/ling-2.6-flash`

| Passo | Tipo | TTFT | Durata | Token out | Tok/s | Qualita | Errore |
|---|---|---:|---:|---:|---:|---:|---|
| 1. Fattori Cognitivi | guidato | 1.1 s | 3.1 s | 454 | 219.8 | 0.86 |  |
| 2. Fattori Affettivi | guidato | 768 ms | 3.1 s | 497 | 212.7 | 0.83 |  |
| 3.1 Elaborazione e Org. | guidato | 816 ms | 4.4 s | 827 | 231.6 | 0.85 |  |
| 3.2 Autocontrollo | guidato | 758 ms | 3.5 s | 560 | 205.9 | 0.92 |  |
| 3.3 Motivazione | guidato | 819 ms | 5.3 s | 1004 | 226.5 | 0.87 |  |
| 3.4 Gestione Emotiva | guidato | 806 ms | 4.6 s | 865 | 227.0 | 0.76 |  |
| 3.5 Stile Attributivo | guidato | 1.3 s | 5.1 s | 925 | 243.7 | 0.81 |  |
| 3.6 Dimensione Sociale | guidato | 910 ms | 5.2 s | 1005 | 232.9 | 0.86 |  |
| Q&A - Approfondimento C2 | follow-up | 770 ms | 2.5 s | 416 | 234.3 | 0.81 |  |
| Q&A - Gestione ansia | follow-up | 728 ms | 2.2 s | 318 | 215.6 | 0.69 |  |
| Q&A - Motivazione | follow-up | 820 ms | 1.4 s | 105 | 173.1 | 0.72 |  |

## Raw JSON

Il file JSON affiancato contiene token, costi stimati e metriche grezze per step.
