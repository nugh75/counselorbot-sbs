# Benchmark QSA CounselorBot - OpenRouter

**Data**: 2026-06-19 22:33  |  **Lingua**: it  |  **Provider sort**: `price`

Stesso profilo QSA, stessi step e stessa funzione di scoring del benchmark Ollama.

## Classifica

| # | Modello | $/M input | $/M output | Affidabilita | TTFT | Tok/s | Qualita | Costo test | Punteggio |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | `deepseek/deepseek-v4-flash` | 0.090 | 0.180 | 100% | 1.3 s | 46.0 | 0.93 | $0.0024 | 0.756 |
| 2 | `google/gemini-3.1-flash-lite` | 0.250 | 1.500 | 100% | 832 ms | 248.5 | 0.92 | $0.0122 | 0.996 |
| 3 | `qwen/qwen3.6-flash` | 0.188 | 1.125 | 100% | 583 ms | 187.7 | 0.86 | $0.0134 | 0.897 |
| 4 | `qwen/qwen3.7-plus` | 0.320 | 1.280 | 100% | 1.1 s | 60.4 | 0.85 | $0.0125 | 0.738 |

_Punteggio = qualita x 0.4 + velocita x 0.3 + affidabilita x 0.3. Il costo test usa i token/cost restituiti da OpenRouter quando disponibili._

## Dettaglio

### `deepseek/deepseek-v4-flash`

| Passo | Tipo | TTFT | Durata | Token out | Tok/s | Qualita | Errore |
|---|---|---:|---:|---:|---:|---:|---|
| 1. Fattori Cognitivi | guidato | 1.1 s | 17.9 s | 630 | 37.4 | 0.97 |  |
| 2. Fattori Affettivi | guidato | 841 ms | 36.9 s | 971 | 26.9 | 0.91 |  |
| 3.1 Elaborazione e Org. | guidato | 1.1 s | 40.0 s | 1143 | 29.4 | 0.97 |  |
| 3.2 Autocontrollo | guidato | 799 ms | 41.6 s | 870 | 21.3 | 0.88 |  |
| 3.3 Motivazione | guidato | 1.3 s | 35.3 s | 1014 | 29.8 | 0.89 |  |
| 3.4 Gestione Emotiva | guidato | 2.5 s | 52.4 s | 1204 | 24.1 | 0.88 |  |
| 3.5 Stile Attributivo | guidato | 886 ms | 27.5 s | 799 | 30.1 | 0.97 |  |
| 3.6 Dimensione Sociale | guidato | 2.1 s | 47.8 s | 1220 | 26.7 | 0.88 |  |
| Q&A - Approfondimento C2 | follow-up | 1.8 s | 3.8 s | 468 | 240.2 | 0.98 |  |
| Q&A - Gestione ansia | follow-up | 801 ms | 22.7 s | 429 | 19.6 | 0.98 |  |
| Q&A - Motivazione | follow-up | 771 ms | 20.5 s | 406 | 20.5 | 0.90 |  |

Concorrenza: 3 utenti, parete 12.5 s, latenza media 10.7 s, errori 0/3.

### `qwen/qwen3.7-plus`

| Passo | Tipo | TTFT | Durata | Token out | Tok/s | Qualita | Errore |
|---|---|---:|---:|---:|---:|---:|---|
| 1. Fattori Cognitivi | guidato | 1.6 s | 12.7 s | 674 | 60.7 | 0.89 |  |
| 2. Fattori Affettivi | guidato | 1.4 s | 13.4 s | 722 | 60.4 | 0.97 |  |
| 3.1 Elaborazione e Org. | guidato | 949 ms | 13.6 s | 769 | 60.6 | 0.92 |  |
| 3.2 Autocontrollo | guidato | 1.4 s | 14.8 s | 803 | 59.9 | 0.92 |  |
| 3.3 Motivazione | guidato | 838 ms | 14.9 s | 860 | 61.0 | 0.90 |  |
| 3.4 Gestione Emotiva | guidato | 1.1 s | 15.4 s | 858 | 59.9 | 0.74 |  |
| 3.5 Stile Attributivo | guidato | 1.3 s | 18.7 s | 1057 | 60.8 | 0.87 |  |
| 3.6 Dimensione Sociale | guidato | 1.0 s | 18.2 s | 1036 | 60.3 | 0.96 |  |
| Q&A - Approfondimento C2 | follow-up | 1.0 s | 4.2 s | 190 | 60.4 | 0.89 |  |
| Q&A - Gestione ansia | follow-up | 938 ms | 4.9 s | 242 | 60.8 | 0.79 |  |
| Q&A - Motivazione | follow-up | 964 ms | 5.8 s | 288 | 60.1 | 0.51 |  |

Concorrenza: 3 utenti, parete 9.7 s, latenza media 9.5 s, errori 0/3.

### `qwen/qwen3.6-flash`

| Passo | Tipo | TTFT | Durata | Token out | Tok/s | Qualita | Errore |
|---|---|---:|---:|---:|---:|---:|---|
| 1. Fattori Cognitivi | guidato | 505 ms | 4.5 s | 820 | 207.7 | 0.98 |  |
| 2. Fattori Affettivi | guidato | 537 ms | 5.2 s | 916 | 196.9 | 0.91 |  |
| 3.1 Elaborazione e Org. | guidato | 563 ms | 5.4 s | 862 | 176.6 | 0.94 |  |
| 3.2 Autocontrollo | guidato | 587 ms | 7.8 s | 1342 | 185.0 | 0.94 |  |
| 3.3 Motivazione | guidato | 630 ms | 9.4 s | 1722 | 196.1 | 0.89 |  |
| 3.4 Gestione Emotiva | guidato | 580 ms | 7.1 s | 1250 | 192.9 | 0.79 |  |
| 3.5 Stile Attributivo | guidato | 560 ms | 8.6 s | 1538 | 192.4 | 0.89 |  |
| 3.6 Dimensione Sociale | guidato | 695 ms | 6.7 s | 1182 | 195.9 | 0.84 |  |
| Q&A - Approfondimento C2 | follow-up | 617 ms | 1.5 s | 144 | 161.4 | 0.97 |  |
| Q&A - Gestione ansia | follow-up | 587 ms | 2.1 s | 272 | 179.9 | 0.48 |  |
| Q&A - Motivazione | follow-up | 555 ms | 2.7 s | 386 | 180.0 | 0.83 |  |

Concorrenza: 3 utenti, parete 3.7 s, latenza media 3.4 s, errori 0/3.

### `google/gemini-3.1-flash-lite`

| Passo | Tipo | TTFT | Durata | Token out | Tok/s | Qualita | Errore |
|---|---|---:|---:|---:|---:|---:|---|
| 1. Fattori Cognitivi | guidato | 949 ms | 3.4 s | 547 | 221.9 | 0.97 |  |
| 2. Fattori Affettivi | guidato | 506 ms | 2.6 s | 602 | 283.0 | 0.85 |  |
| 3.1 Elaborazione e Org. | guidato | 616 ms | 3.2 s | 662 | 255.5 | 0.93 |  |
| 3.2 Autocontrollo | guidato | 716 ms | 3.6 s | 754 | 257.8 | 0.98 |  |
| 3.3 Motivazione | guidato | 1.0 s | 4.4 s | 714 | 211.1 | 0.88 |  |
| 3.4 Gestione Emotiva | guidato | 1.1 s | 4.7 s | 771 | 211.6 | 0.98 |  |
| 3.5 Stile Attributivo | guidato | 661 ms | 3.7 s | 818 | 269.9 | 0.98 |  |
| 3.6 Dimensione Sociale | guidato | 1.0 s | 4.0 s | 868 | 285.8 | 0.82 |  |
| Q&A - Approfondimento C2 | follow-up | 747 ms | 2.4 s | 419 | 253.7 | 0.84 |  |
| Q&A - Gestione ansia | follow-up | 730 ms | 1.7 s | 260 | 273.9 | 0.98 |  |
| Q&A - Motivazione | follow-up | 1.1 s | 2.2 s | 240 | 209.5 | 0.91 |  |

Concorrenza: 3 utenti, parete 3.5 s, latenza media 3.2 s, errori 0/3.


## Raw JSON

Il file JSON affiancato contiene token, costi stimati e metriche grezze per step.
