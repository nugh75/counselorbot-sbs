# Benchmark QSA CounselorBot - OpenRouter

**Data**: 2026-06-19 23:02  |  **Lingua**: it  |  **Provider sort**: `price`

Stesso profilo QSA, stessi step e stessa funzione di scoring del benchmark Ollama.

## Classifica

| # | Modello | $/M input | $/M output | Affidabilita | TTFT | Tok/s | Qualita | Costo test | Punteggio |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | `deepseek/deepseek-v4-flash` | 0.090 | 0.180 | 100% | 1.2 s | 41.7 | 0.88 | $0.0024 | 0.760 |
| 2 | `mistralai/mistral-small-24b-instruct-2501` | 0.050 | 0.080 | 100% | 676 ms | 38.4 | 0.88 | $0.0011 | 0.753 |
| 3 | `inclusionai/ling-2.6-flash` | 0.010 | 0.030 | 100% | 858 ms | 209.2 | 0.83 | $0.0003 | 0.977 |
| 4 | `qwen/qwen3-235b-a22b-2507` | 0.090 | 0.100 | 100% | 683 ms | 23.6 | 0.65 | $0.0015 | 0.626 |

_Punteggio = qualita x 0.4 + velocita x 0.3 + affidabilita x 0.3. Il costo test usa i token/cost restituiti da OpenRouter quando disponibili._

## Dettaglio

### `inclusionai/ling-2.6-flash`

| Passo | Tipo | TTFT | Durata | Token out | Tok/s | Qualita | Errore |
|---|---|---:|---:|---:|---:|---:|---|
| 1. Fattori Cognitivi | guidato | 1.0 s | 3.2 s | 484 | 228.7 | 0.90 |  |
| 2. Fattori Affettivi | guidato | 836 ms | 3.1 s | 438 | 193.6 | 0.78 |  |
| 3.1 Elaborazione e Org. | guidato | 806 ms | 2.8 s | 433 | 213.5 | 0.86 |  |
| 3.2 Autocontrollo | guidato | 826 ms | 2.9 s | 443 | 214.6 | 0.92 |  |
| 3.3 Motivazione | guidato | 817 ms | 4.6 s | 767 | 204.8 | 0.77 |  |
| 3.4 Gestione Emotiva | guidato | 877 ms | 4.5 s | 776 | 215.6 | 0.79 |  |
| 3.5 Stile Attributivo | guidato | 807 ms | 5.4 s | 886 | 192.7 | 0.83 |  |
| 3.6 Dimensione Sociale | guidato | 794 ms | 5.3 s | 943 | 211.5 | 0.86 |  |
| Q&A - Approfondimento C2 | follow-up | 895 ms | 3.3 s | 502 | 211.4 | 0.95 |  |
| Q&A - Gestione ansia | follow-up | 828 ms | 2.2 s | 307 | 223.5 | 0.70 |  |
| Q&A - Motivazione | follow-up | 908 ms | 2.6 s | 322 | 191.6 | 0.81 |  |

Concorrenza: 3 utenti, parete 3.7 s, latenza media 3.4 s, errori 0/3.

### `mistralai/mistral-small-24b-instruct-2501`

| Passo | Tipo | TTFT | Durata | Token out | Tok/s | Qualita | Errore |
|---|---|---:|---:|---:|---:|---:|---|
| 1. Fattori Cognitivi | guidato | 569 ms | 20.5 s | 740 | 37.2 | 0.98 |  |
| 2. Fattori Affettivi | guidato | 667 ms | 15.6 s | 602 | 40.2 | 0.82 |  |
| 3.1 Elaborazione e Org. | guidato | 313 ms | 23.2 s | 842 | 36.8 | 0.96 |  |
| 3.2 Autocontrollo | guidato | 1.0 s | 24.3 s | 892 | 38.3 | 0.88 |  |
| 3.3 Motivazione | guidato | 763 ms | 20.3 s | 813 | 41.6 | 0.91 |  |
| 3.4 Gestione Emotiva | guidato | 642 ms | 24.5 s | 884 | 37.1 | 0.91 |  |
| 3.5 Stile Attributivo | guidato | 1.5 s | 22.2 s | 777 | 37.5 | 0.87 |  |
| 3.6 Dimensione Sociale | guidato | 356 ms | 24.8 s | 993 | 40.7 | 0.90 |  |
| Q&A - Approfondimento C2 | follow-up | 629 ms | 11.3 s | 391 | 36.6 | 0.90 |  |
| Q&A - Gestione ansia | follow-up | 584 ms | 12.2 s | 407 | 34.9 | 0.68 |  |
| Q&A - Motivazione | follow-up | 369 ms | 5.8 s | 228 | 41.6 | 0.86 |  |

Concorrenza: 3 utenti, parete 13.5 s, latenza media 12.5 s, errori 0/3.

### `qwen/qwen3-235b-a22b-2507`

| Passo | Tipo | TTFT | Durata | Token out | Tok/s | Qualita | Errore |
|---|---|---:|---:|---:|---:|---:|---|
| 1. Fattori Cognitivi | guidato | 404 ms | 14.7 s | 528 | 36.9 | 0.93 |  |
| 2. Fattori Affettivi | guidato | 718 ms | 22.0 s | 707 | 33.2 | 0.79 |  |
| 3.1 Elaborazione e Org. | guidato | 712 ms | 23.8 s | 785 | 33.9 | 0.85 |  |
| 3.2 Autocontrollo | guidato | 804 ms | 804 ms | 1 | 1.2 | 0.42 |  |
| 3.3 Motivazione | guidato | 742 ms | 29.6 s | 913 | 31.6 | 0.71 |  |
| 3.4 Gestione Emotiva | guidato | 446 ms | 446 ms | 1 | 2.2 | 0.42 |  |
| 3.5 Stile Attributivo | guidato | 462 ms | 31.6 s | 1021 | 32.7 | 0.82 |  |
| 3.6 Dimensione Sociale | guidato | 828 ms | 71.4 s | 2048 | 29.0 | 0.49 |  |
| Q&A - Approfondimento C2 | follow-up | 1.1 s | 1.1 s | 1 | 0.9 | 0.49 |  |
| Q&A - Gestione ansia | follow-up | 551 ms | 3.4 s | 83 | 28.7 | 0.48 |  |
| Q&A - Motivazione | follow-up | 732 ms | 7.2 s | 186 | 28.9 | 0.69 |  |

Concorrenza: 3 utenti, parete 18.4 s, latenza media 18.0 s, errori 0/3.

### `deepseek/deepseek-v4-flash`

| Passo | Tipo | TTFT | Durata | Token out | Tok/s | Qualita | Errore |
|---|---|---:|---:|---:|---:|---:|---|
| 1. Fattori Cognitivi | guidato | 836 ms | 26.8 s | 729 | 28.1 | 0.97 |  |
| 2. Fattori Affettivi | guidato | 1.1 s | 27.6 s | 817 | 30.9 | 0.76 |  |
| 3.1 Elaborazione e Org. | guidato | 835 ms | 38.4 s | 1355 | 36.1 | 0.96 |  |
| 3.2 Autocontrollo | guidato | 880 ms | 34.3 s | 1173 | 35.1 | 0.81 |  |
| 3.3 Motivazione | guidato | 803 ms | 36.4 s | 1225 | 34.4 | 0.98 |  |
| 3.4 Gestione Emotiva | guidato | 1.0 s | 41.3 s | 1022 | 25.4 | 0.72 |  |
| 3.5 Stile Attributivo | guidato | 3.2 s | 12.2 s | 1238 | 137.7 | 0.94 |  |
| 3.6 Dimensione Sociale | guidato | 1.2 s | 32.0 s | 1152 | 37.5 | 0.95 |  |
| Q&A - Approfondimento C2 | follow-up | 821 ms | 19.7 s | 521 | 27.6 | 0.80 |  |
| Q&A - Gestione ansia | follow-up | 830 ms | 11.6 s | 379 | 35.3 | 0.89 |  |
| Q&A - Motivazione | follow-up | 1.5 s | 20.2 s | 563 | 30.1 | 0.94 |  |

Concorrenza: 3 utenti, parete 14.2 s, latenza media 14.1 s, errori 0/3.


## Raw JSON

Il file JSON affiancato contiene token, costi stimati e metriche grezze per step.
