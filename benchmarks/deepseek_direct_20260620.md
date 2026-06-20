# Benchmark QSA CounselorBot - OpenRouter

**Data**: 2026-06-20 07:43  |  **Lingua**: it  |  **Provider sort**: `-`

Stesso profilo QSA, stessi step e stessa funzione di scoring del benchmark Ollama.

## Classifica

| # | Modello | $/M input | $/M output | Affidabilita | TTFT | Tok/s | Qualita | Costo test | Punteggio |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | `deepseek-v4-flash` | 0.000 | 0.000 | 100% | 4.1 s | 128.0 | 0.89 | $0.0000 | 1.000 |

_Punteggio = qualita x 0.4 + velocita x 0.3 + affidabilita x 0.3. Il costo test usa i token/cost restituiti da OpenRouter quando disponibili._

## Dettaglio

### `deepseek-v4-flash`

| Passo | Tipo | TTFT | Durata | Token out | Tok/s | Qualita | Errore |
|---|---|---:|---:|---:|---:|---:|---|
| 1. Fattori Cognitivi | guidato | 2.3 s | 10.5 s | 951 | 115.5 | 0.97 |  |
| 2. Fattori Affettivi | guidato | 4.5 s | 13.1 s | 1139 | 131.6 | 0.81 |  |
| 3.1 Elaborazione e Org. | guidato | 2.8 s | 10.9 s | 879 | 107.5 | 0.81 |  |
| 3.2 Autocontrollo | guidato | 5.1 s | 19.0 s | 1707 | 122.5 | 0.88 |  |
| 3.3 Motivazione | guidato | 4.0 s | 18.2 s | 1505 | 106.4 | 0.74 |  |
| 3.4 Gestione Emotiva | guidato | 9.4 s | 21.4 s | 1877 | 155.8 | 0.94 |  |
| 3.5 Stile Attributivo | guidato | 2.6 s | 15.9 s | 1325 | 99.6 | 0.88 |  |
| 3.6 Dimensione Sociale | guidato | 3.2 s | 12.9 s | 1132 | 116.1 | 0.94 |  |
| Q&A - Approfondimento C2 | follow-up | 2.7 s | 8.5 s | 662 | 114.2 | 0.98 |  |
| Q&A - Gestione ansia | follow-up | 2.6 s | 8.2 s | 663 | 118.3 | 0.88 |  |
| Q&A - Motivazione | follow-up | 6.3 s | 10.4 s | 918 | 220.3 | 0.95 |  |

Concorrenza: 3 utenti, parete 6.3 s, latenza media 6.1 s, errori 0/3.


## Raw JSON

Il file JSON affiancato contiene token, costi stimati e metriche grezze per step.
