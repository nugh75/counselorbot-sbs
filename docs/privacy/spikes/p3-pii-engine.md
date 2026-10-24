# P3 — Spike motore PII: regole, gazetteer, Ollama NER, GLiNER ONNX

Stato: **concluso** (2026-10-24), blocco P3 di [03-piano-blocchi](../03-piano-blocchi.md), issue #548.
Misure su un MacBook Air M1 (8 GB, 8 core), Python 3.11.9, onnxruntime 1.31.0, solo CPU.

## 1. In sintesi

- **Raccomandazione**: tre strati sempre attivi come in [02 §3.4](../02-progettazione.md#34-motore-pii-locale-scelta):
  **regole** (`pii.py`, autoritative sui dati strutturati) + **gazetteer di contesto** (nomi della classe, docenti,
  `institutions.name`) + **GLiNER `urchade/gliner_multi_pii-v1` in fp16** via `onnxruntime`, soglia 0,5, senza torch.
- Sul corpus P2 questa combinazione **maschera per intero il 98 % delle persone e il 97 % delle scuole** (100 % e 75 %, su 4 scuole,
  sull'holdout), contro il 63 % e l'86 % di regole + gazetteer. La soglia di 02 §3.4 (recall ≥ 0,95 su `person` e
  `school`) è raggiunta sulla metrica di mascheramento (§3.2); sulla metrica 1:1 di P2 le persone sono a 0,94.
- **Regole + gazetteer da soli non bastano**: 0,84 di richiamo sul corpus ma **0,31 sull'holdout** scritto a mano.
  Le regole sono tarate sui template del generatore; i nomi fuori elenco passano in chiaro.
- **Costo**: 568 MB di modello + ~109 MB di runtime nell'onedir, 3 s di caricamento, **~140–175 ms a frase**
  (p95 ~200–350 ms), RSS di picco ~750 MB. Il secondo modello (`knowledgator/gliner-pii-base-v1.0`) costa un decimo
  (196 MB, 18 ms) ma maschera meno (persone 0,90, holdout 0,88) e la scheda dichiara solo l'inglese.
- **Da non usare**: l'export int8 pubblicato (`onnx-community/.../model_int8.onnx`, 349 MB) e qualunque quantizzazione
  dinamica int8/uint8 dello stesso modello: i punteggi crollano sotto 0,4 e il richiamo va a 0,01 (§3.4).
- **PyInstaller**: onnxruntime 1.31 + tokenizers + modello fp16 funzionano congelati su macOS arm64 (verificato qui).
  Windows x64 e Linux x64 sono coperti dal workflow `spike-pii-engine.yml` sulla PR. **macOS Intel escluso** per
  decisione dell'utente (2026-10-24): onnxruntime non pubblica ruote macOS x86_64 dopo la 1.23.2.
- **Ollama NER non misurato**: su questa macchina Ollama non è installato. Il banco lo salta con il motivo
  (`ollama unreachable`) e lo misura quando il demone c'è (§2.3).

## 2. Metodo

### 2.1 Dati

- **Corpus P2** `backend/privacy/corpus/it_school_v1.jsonl`: 613 frasi sintetiche, 1100 entità in 18 categorie (30 frasi «negativo» senza dati personali).
- **Holdout P3** `scripts/spikes/p3_holdout.py`: 33 frasi scritte a mano, 42 entità, con formulazioni diverse dai
  template e nomi **assenti dal generatore** (test che lo verifica). Nessuna regola è stata scritta guardando l'holdout.
  Serve a misurare quanto le regole sono sovradattate al corpus.

### 2.2 Motori

Codice in `scripts/spikes/` (non importato dal backend):

| Nome nel banco | Cosa fa |
|---|---|
| `rules` | `backend/pii.py` con gli offset (`RulesBaselineDetector` di P2) |
| `gazetteer_generic` | elenchi di nomi, cognomi, capoluoghi e regioni italiani **scritti per lo spike senza guardare il generatore**; pattern di contesto: scuole (`Liceo`, `Istituto`, `ITIS`, `Università`… + nome fra «»), indirizzi (`via … n.`), titoli (`prof.ssa X`), organizzazioni, data di nascita (`nato il …`), matricola, termini di salute e art. 9 |
| `gazetteer_roster` | stessi pattern, ma con gli elenchi del generatore: simula il gazetteer di contesto di 02 §3.4 nel caso ideale «tutti i nomi sono noti». È un limite superiore, non un test equo |
| `ollama_ner` | prompt attuale di `pii_ner._ner_entities` (`qwen3:0.6b`), offset ricostruiti per corrispondenza esatta |
| `gliner_*` | GLiNER (span markerV0) con **solo `onnxruntime` + `tokenizers`** (`p3_gliner_onnx.py`, ~110 righe), 11 etichette per lo strato ML: person, school, city, region, street address, organization, date of birth, medical condition, religion, sexual orientation, student id number |
| `a+b+c` | unione: le regole su email, telefono, CF, IBAN, URL, IP, social e documenti **non vengono mai sostituite**; sul resto vince lo span più lungo, a parità una categoria specifica batte `date`, poi l'ordine regole > gazetteer > ML |

Il runner GLiNER è stato confrontato con `gliner==0.2.29` (`predict_entities`, `load_onnx_model=True`) su frasi di prova:
stessi span e stessi punteggi alla quarta cifra. In produzione non servono torch né il pacchetto `gliner`.

### 2.3 Metriche e riproduzione

- P/R/F1 per sovrapposizione e per categoria (stessa funzione `evaluate` di P2, abbinamento 1:1); **copertura** = entità
  toccate da uno span di qualsiasi categoria.
- **Mascherati**: quota di entità il cui valore sta **tutto** dentro uno span predetto, di qualsiasi categoria: il valore
  non esce, qualunque etichetta abbia ricevuto. È la metrica più vicina al rischio. Differisce da P/R perché il corpus
  annota «Fatima» e «Lombardi» come due entità adiacenti: uno span unico su «Fatima Lombardi» le protegge entrambe, ma
  l'abbinamento 1:1 conta un falso negativo.
- Latenza: media e p95 per frase (best-of-3 per i motori deterministici, una passata per quelli ML). RAM: RSS di picco
  del processo che carica un solo motore (processo Python di base ~24 MB). Disco: file ONNX + tokenizer + config.

```bash
# modelli (vedi §6 per la provenienza)
M=~/.cache/counselorbot/p3-models
mkdir -p $M/gliner_multi_pii-v1 $M/gliner-pii-base-v1.0
for f in gliner_config.json tokenizer.json; do
  curl -sfL -o $M/gliner_multi_pii-v1/$f https://huggingface.co/onnx-community/gliner_multi_pii-v1/resolve/main/$f
  curl -sfL -o $M/gliner-pii-base-v1.0/$f https://huggingface.co/knowledgator/gliner-pii-base-v1.0/resolve/main/$f
done
curl -sfL -o $M/gliner_multi_pii-v1/model_fp16.onnx https://huggingface.co/onnx-community/gliner_multi_pii-v1/resolve/main/onnx/model_fp16.onnx
curl -sfL -o $M/gliner-pii-base-v1.0/model_quint8.onnx https://huggingface.co/knowledgator/gliner-pii-base-v1.0/resolve/main/onnx/model_quint8.onnx
# ambiente separato: le dipendenze ML non entrano in backend/requirements.txt
python3 -m venv /tmp/p3 && /tmp/p3/bin/pip install onnxruntime==1.31.0 tokenizers==0.23.3 numpy psutil httpx
/tmp/p3/bin/python scripts/spikes/p3_pii_benchmark.py --models $M --threshold 0.5 --out p3.json --markdown
```

I motori assenti (Ollama spento, modello non scaricato, `onnxruntime` non installato) escono come `skipped` con il motivo.
Il report JSON contiene solo id, categorie e metriche, mai testo del corpus (test).

## 3. Risultati

### 3.1 Tabella comparativa (soglia GLiNER 0,5)

R = richiamo per sovrapposizione sul corpus; «mascherati» = §2.3, fra parentesi le sole persone.

| motore | P | R | F1 | copertura | R person | R school | R city | R address | R health | R phone | R CF | R holdout | mascherati (persone) | mascherati holdout | ms/frase (p95) | RSS picco MB | disco MB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| rules | 0,88 | 0,19 | 0,32 | 0,22 | 0,00 | 0,00 | 0,00 | 0,00 | 0,55 | 0,62 | 0,73 | 0,02 | 0,20 (0,00) | 0,05 | 0,04 (0,1) | 24 | 0 |
| gazetteer_generic | 0,92 | 0,68 | 0,78 | 0,68 | 0,76 | 1,00 | 0,96 | 1,00 | 0,97 | – | – | 0,29 | 0,60 (0,63) | 0,29 | 0,04 (0,1) | 25 | 0 |
| rules+gazetteer_generic | **0,94** | 0,84 | **0,88** | 0,84 | 0,76 | 1,00 | 0,96 | 1,00 | 0,97 | 0,62 | 0,73 | **0,31** | 0,76 (0,63) | **0,31** | 0,08 (0,1) | 25 | 0 |
| rules+gazetteer_roster | 0,96 | 0,94 | 0,95 | 0,94 | 0,95 | 1,00 | 0,99 | 1,00 | 0,97 | 0,62 | 0,73 | 0,24 | 0,89 (0,89) | 0,24 | 0,08 (0,1) | 25 | 0 |
| ollama_ner | non misurato: Ollama non installato | | | | | | | | | | | | | | | | |
| gliner_multi_pii (fp32) | 0,66 | 0,70 | 0,68 | 0,82 | 0,90 | 0,60 | 0,91 | 1,00 | 0,58 | – | – | 0,90 | 0,78 (0,97) | 0,90 | 84 (166) | 800 | 1119 |
| gliner_multi_pii_fp16 | 0,66 | 0,70 | 0,68 | 0,83 | 0,90 | 0,60 | 0,91 | 1,00 | 0,58 | – | – | 0,90 | 0,79 (0,97) | 0,90 | 166 (314) | 720 | 568 |
| gliner_multi_pii_int8 | 1,00 | 0,01 | 0,02 | 0,01 | 0,01 | 0,06 | 0,02 | 0,00 | 0,00 | – | – | 0,00 | 0,01 (0,01) | 0,02 | 29 (47) | 721 | 348 |
| gliner_pii_base (uint8) | 0,69 | 0,58 | 0,63 | 0,71 | 0,78 | 0,43 | 0,99 | 0,58 | 0,36 | – | – | 0,74 | 0,65 (0,83) | 0,74 | 21 (39) | 537 | 196 |
| **rules+gaz+gliner_multi_pii_fp16** | 0,78 | **0,92** | 0,85 | 0,94 | **0,94** | **1,00** | 0,91 | 1,00 | 0,96 | 0,62 | 0,73 | **0,95** | **0,95 (0,98)** | **0,95** | 174 (346) | 745 | 568 |
| rules+gaz+gliner_pii_base | 0,84 | 0,92 | 0,88 | 0,94 | 0,91 | 1,00 | 0,99 | 1,00 | 0,97 | 0,62 | 0,73 | 0,88 | 0,91 (0,90) | 0,88 | 18 (30) | 421 | 196 |

Scuole interamente mascherate (corpus / holdout): regole + gazetteer 0,86 / 0,75; con multi_pii 0,97 / 0,75; con
pii_base 0,86 / 0,75. Email 0,98, IBAN/IP/URL/social 1,00 in tutte le combinazioni con le regole.

### 3.2 Soglia 0,3

| motore | P | R | copertura | R holdout | mascherati (persone) | mascherati holdout | falsi positivi sui «negativo» | ms/frase |
|---|---|---|---|---|---|---|---|---|
| rules+gaz+gliner_multi_pii_fp16 | 0,72 | 0,92 | 0,96 | 0,95 | 0,97 (0,98) | 0,95 | 31 (0,5: 22) | 139 |
| rules+gaz+gliner_pii_base | 0,63 | 0,91 | 0,97 | 0,93 | 0,95 (0,94) | 0,93 | 57 (0,5: 21) | 16 |

A 0,3 multi_pii guadagna poco e perde precisione; pii_base recupera richiamo ma raddoppia quasi i falsi positivi. **Soglia
consigliata 0,5** per multi_pii; 0,3 solo se si sceglie pii_base.

### 3.3 Cosa resta scoperto

- **Gazetteer generico**: le persone mascherate scendono da 0,63 (corpus) a 0,14 (holdout); con gli elenchi del generatore
  (`roster`) da 0,89 a 0,05. Un elenco serve solo per i nomi che il sistema conosce davvero: è la ragione per cui 02 §3.4 lo
  vuole costruito dalla classe e non da un dizionario.
- **Con multi_pii**: i falsi negativi residui sono cognomi da soli in elenchi tipo registro («Barbieri,Ginevra (3C)»),
  «COGNOME Nome» etichettato come scuola (protetto lo stesso), nomi minuscoli in gergo, `dislesia`/`discalcula` (typo),
  qualche città in frasi anagrafiche dense.
- **Falsi positivi**: 22 span sulle 30 frasi «negativo» (es. «la prof» e «Il prof di storia» come persona, «La classe 3B» e «liceo» come scuola, «Classroom» e «PCTO» come organizzazione, «ansia» nel senso comune come salute);
  precisione 0,78. Per la pseudonimizzazione il costo è utilità (testo più povero per il modello), non rischio.
- **Regole**: telefono 0,62 e CF 0,73 restano i limiti di `pii.py` misurati in P2 (numeri in lettere, CF con spazi);
  nessun motore ML li migliora: vanno estesi in P4 con i riconoscitori mancanti.
- **Senza regole autoritative** l'unione «vince il più lungo» perdeva telefono e CF (0,62→0,61, 0,73→0,71): GLiNER
  inglobava il numero in uno span più lungo di altra categoria. 02 §3.2 va precisato (§7).

### 3.4 Quantizzazione

- `onnx-community/gliner_multi_pii-v1/onnx/model_int8.onnx`: punteggio massimo 0,38 su «Riccardo Ricci» (fp32: 1,00);
  richiamo 0,01. Anche `quantize_dynamic` di onnxruntime su `model.onnx` (uint8 MatMul+Gather, 354 MB) non trova nulla.
  Il modello di base mDeBERTa-v3 non regge la quantizzazione dinamica; servirebbe una quantizzazione statica calibrata o
  QAT, fuori dallo spike.
- fp16 dà **gli stessi risultati di fp32** a metà disco (568 vs 1119 MB) e meno RAM, ma su CPU è più lento (166 vs 84 ms
  a frase in questa misura: le operazioni fp16 vengono riconvertite). La variabilità fra esecuzioni è alta (fp16 fra 110 e
  175 ms a seconda del carico): i valori sono ordini di grandezza, non budget.
- pii_base è già addestrato con quantizzazione (QAT): l'export uint8 funziona.

## 4. Ollama NER

Non misurato: Ollama non è installato su questa macchina (in `~/.ollama/models` restano modelli vecchi, non `qwen3:0.6b`).
Il motore `ollama_ner` e la combinazione `rules+gazetteer_generic+ollama_ner` sono pronti; con il demone attivo:
`--engines ollama_ner,rules+gazetteer_generic+ollama_ner --ollama-model qwen3:0.6b`. Gli errori di trasporto vengono contati
(`ollama_errors`) come oggi `ner_ok=False`. Indipendentemente dal numero, restano i limiti di 02 §3.4: non disponibile sui PC
studente senza Ollama e un LLM può omettere entità senza segnalarlo. Lo si tiene come ripiego configurabile sul server (L1).

## 5. PyInstaller e piattaforme

Verifica locale (macOS arm64, venv pulito con solo `onnxruntime==1.31.0`, `tokenizers==0.23.3`, `numpy`,
`pyinstaller==6.22.3`): `p3_onnx_freeze_probe.py` congelato in onedir in 8 s, **109 MB** (onnxruntime 70 MB, tokenizers
9 MB, numpy 7 MB); l'eseguibile congelato carica e interroga `model_fp16.onnx` (3,1 s di caricamento, 123 ms la prima frase)
e `model_quint8.onnx` (12,7 ms). L'hook di onnxruntime è già in `pyinstaller-hooks-contrib`: nessun `--collect-*` aggiuntivo.

| Piattaforma | onnxruntime 1.31.0 | Stato |
|---|---|---|
| macOS arm64 | ruota `macosx_14_0_arm64` | **verificato** qui, congelato |
| Windows x64 | `win_amd64` | workflow `spike-pii-engine.yml` sulla PR |
| Linux x64 | `manylinux_2_28_x86_64` (glibc ≥ 2.28: Ubuntu 20.04+) | workflow sulla PR |
| macOS x86_64 | nessuna ruota dopo la 1.23.2 (ottobre 2025) | **escluso** (decisione utente 2026-10-24) |

Note:

- Con la 1.23.2 `model_fp16.onnx` non si carica (errore dell'ottimizzatore `SimplifiedLayerNormFusion`); fp32 sì. Un
  ulteriore motivo per non inseguire le versioni vecchie.
- Il workflow attuale `desktop-teacher.yml` costruisce anche `macos-15-intel`: quando lo strato ML entra nel backend
  desktop (P4), quella build va tolta o costruita senza strato ML (con la regola fail-closed: niente invio esterno di testo
  non verificato).
- Il desktop usa Python 3.12; la verifica locale è su 3.11.9 (solo versione installata qui), il workflow usa 3.12.

## 6. Licenze (schede Hugging Face, 2026-10-24)

| Elemento | Licenza | Lingue dichiarate | Note |
|---|---|---|---|
| `urchade/gliner_multi_pii-v1` (pesi PyTorch) | Apache-2.0 | en, fr, de, es, pt, **it** | modello raccomandato |
| `urchade/gliner_multi-v2.1` (modello di base) | Apache-2.0 | multilingual | conferma la voce aperta di 02 §3.4 |
| `microsoft/mdeberta-v3-base` (encoder) | MIT | multilingue | |
| `onnx-community/gliner_multi_pii-v1` (export ONNX) | **nessuna licenza sulla scheda** | – | usato solo per misurare |
| `knowledgator/gliner-pii-base-v1.0` | Apache-2.0 | **en** | encoder `deberta-v3-small` (inglese) |
| `onnxruntime` | MIT | | |
| `tokenizers` | Apache-2.0 | | |

Poiché l'export `onnx-community` non dichiara licenza, per la distribuzione **l'export fp16 va rifatto da noi** dai pesi
`urchade/gliner_multi_pii-v1` (Apache-2.0) con lo script di conversione di `gliner`, e verificato contro il banco P3 (stessi
numeri della tabella). Va conservato l'avviso NOTICE/licenza nell'installer.

## 7. Raccomandazione architetturale

1. **Strati** (P4): `detect_pii` = regole (`pii.py`, esteso) + gazetteer di contesto + GLiNER multi_pii fp16 in-process.
   Il gazetteer generico dello spike non va portato in produzione così com'è: utile solo per i pattern di contesto (scuole,
   indirizzi, titoli, data di nascita, matricola, termini di salute/art. 9), mentre gli elenchi nominativi vanno presi da
   classe, docenti e `institutions.name`.
2. **Regola di unione** (precisare 02 §3.2): gli span delle regole su dati strutturati e validati (email, telefono, CF,
   IBAN, URL, IP, social, documenti) sono autoritativi; sul resto vince il più lungo, a parità la categoria più specifica.
3. **Soglia** 0,5 per multi_pii; soglie di accettazione in CI per P4 sulla metrica «mascherati»: persone ≥ 0,95 e scuole
   ≥ 0,95 sul corpus, ≥ 0,90 complessivo sull'holdout, nessuna regressione delle categorie a regole (test P2).
4. **Distribuzione**: modello fuori dall'installer, scaricato al primo uso in `DATA_DIR` con hash SHA-256 fissato nel codice
   (568 MB in meno nel pacchetto); finché non è presente, `DetectorUnavailable` ⇒ niente invio esterno (fail-closed).
   Runtime onnxruntime 1.31 nell'onedir (+109 MB). Mac solo Apple Silicon.
5. **Prestazioni**: ~150 ms a frase su M1 sono accettabili per un messaggio di chat (si analizza il turno nuovo, non la
   cronologia già pseudonimizzata); per documenti lunghi serve la segmentazione a frasi e l'elaborazione in background.
   Sessione onnxruntime unica caricata all'avvio (3 s) e riusata; RSS ~750 MB: da verificare sui PC scolastici a 4 GB.
6. **Ripiego leggero** (opzione, non predefinito): pii_base uint8 (196 MB, 18 ms) per PC sotto soglia di RAM, dichiarandone il
   richiamo più basso (persone 0,90) e l'addestramento solo inglese come rischio residuo.
7. **Ollama NER**: resta ripiego configurabile su L1, misurabile con il banco quando il demone è presente.

Prossimi passi: export fp16 proprio con licenza verificata (P4), estensione delle regole su telefono/CF, misura di Ollama
sul server, esito del workflow su Windows/Linux (vedi PR).

## 8. File

- `scripts/spikes/p3_pii_engines.py` — motori, gazetteer, unione, adattatore Ollama.
- `scripts/spikes/p3_gliner_onnx.py` — GLiNER con onnxruntime + tokenizers, senza dipendenze dal backend.
- `scripts/spikes/p3_pii_benchmark.py` — banco a sottoprocessi (RAM per motore), JSON + tabella.
- `scripts/spikes/p3_holdout.py` — 33 frasi di holdout.
- `scripts/spikes/p3_onnx_freeze_probe.py`, `.github/workflows/spike-pii-engine.yml` — verifica PyInstaller.
- `backend/tests/test_privacy_p3_engine_spike.py` — test dello spike (senza modelli; con `P3_MODELS_DIR` anche sui pesi veri).
