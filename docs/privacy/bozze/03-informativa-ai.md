# Informativa sul trattamento con intelligenza artificiale — CounselorBot

> [!CAUTION]
> **Bozza tecnica, non consulenza legale.** Questo testo è stato preparato dal progetto CounselorBot per aiutare la
> scuola o l'università a spiegare come vengono usati i modelli di AI (artt. 12-14 e 22 GDPR). **Non** è un parere
> legale e **non** attesta la conformità al GDPR né ad altre norme (per esempio il Regolamento (UE) 2024/1689 sull'AI,
> la cui applicabilità **[DA VALIDARE]**): decidere, adattare e approvare il testo spetta al **Titolare** con il **DPO**.
> Le voci **[DA VALIDARE]** e **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** vanno decise prima di usare il documento.
> I riferimenti normativi non sono stati verificati sul testo ufficiale ([04 §Fonti](../04-decisioni-titolare-dpo.md#fonti-normative-e-stato-della-verifica)).

Versione: bozza 0.1 (2026-10-24). Integra le informative [studente](01-informativa-studente.md) e [docente](02-informativa-docente.md).
Descrive il codice di `main` al 2026-10-24 e distingue ciò che **funziona oggi** da ciò che è **progettato**
(blocchi di [03-piano-blocchi](../03-piano-blocchi.md)).

---

## 1. A che cosa serve l'AI

- Chat guidata sui risultati dei questionari e chat di orientamento.
- Riassunti delle conversazioni.
- Per i docenti: osservazioni di classe e sintesi.
- Servizi accessori: lettura ad alta voce, trascrizione della voce, lettura (OCR) di scansioni e PDF, ricerca nei
  documenti (embedding).

**Nessuna decisione automatizzata** con effetti giuridici o analoghi (art. 22 GDPR): l'AI non assegna voti, non decide
ammissioni né percorsi, non fa diagnosi. Le risposte possono essere inesatte e vanno lette con senso critico; lo
studente può chiedere un confronto con un docente **[DA VALIDARE: canale]**. L'interfaccia deve dire chiaramente che
si parla con un sistema automatico **[DA VALIDARE: testo e posizione]**.

## 2. Dove vanno i testi

Due tipi di destinazione, decisi dalla configurazione dell'installazione **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**:

| Destinazione | Che cosa riceve oggi |
|---|---|
| **Modello locale** (Ollama o llama.cpp su un host dichiarato fidato: loopback o `PRIVACY_LOCAL_HOSTS`/`TRUSTED_LOCAL_HOSTS`) | il testo **in chiaro**, compresi contesto dello studente, cronologia e punteggi |
| **Provider esterno** (fino a 13 provider configurabili più il collegamento ChatGPT personale) | il testo dopo il **filtro** descritto al §3 |

Un host Ollama non dichiarato fidato è trattato come esterno (P6b). Provider effettivamente abilitati:
**[DA COMPILARE DA PARTE DEL TITOLARE/DPO, 04-D2]**.

## 3. Il filtro verso i provider esterni

**Oggi** (`AIService._anonymize_external`, 01 §7):

1. regole deterministiche con verifica dei codici di controllo: email, telefoni, codice fiscale, IBAN, carte, URL, IP,
   profili social, date, alcuni termini sanitari;
2. riconoscimento di nomi, scuole, città, indirizzi con un piccolo modello locale via Ollama, se configurato;
3. i dati trovati sono sostituiti con segnaposto e rimessi al loro posto nella risposta.

Limiti attuali: il filtro **non garantisce l'anonimato**; nomi non riconosciuti passano; i segnaposto non sono coerenti
fra un turno e l'altro; se il riconoscimento dei nomi non è disponibile, la chiamata è bloccata solo con la politica
`block`; i dati sulla salute non sono bloccati in modo sistematico.

**Progettato** (P4 e P8 implementati ma non ancora collegati alle chat; P6 da fare):

- motore locale a tre strati (regole, elenco dei nomi noti della classe, modello GLiNER in locale);
- segnaposto leggibili e coerenti per conversazione (`[PERSONA_1]`, `[SCUOLA_1]`), non collegabili fra studenti;
- mappa segnaposto → valori cifrata con AES-256-GCM, mai inviata al modello;
- seconda verifica dei residui prima dell'invio, e blocco se il filtro non è disponibile;
- blocco dei dati sulla salute verso i provider esterni (default proposto, **[DA VALIDARE 04-D4]**);
- un unico punto di uscita (gateway AI) con registro degli invii senza contenuto.

Lo stato di queste misure va aggiornato quando i blocchi sono rilasciati.

## 4. Immagini, voce e documenti

| Servizio | Oggi | Decisione |
|---|---|---|
| Immagini (visione, OCR di scansioni QSA, PDF pQBL) | **mai** verso provider esterni; solo Ollama su host fidato, altrimenti errore (P6a) | **[DA VALIDARE 04-D9]** |
| Lettura ad alta voce | Piper locale se disponibile; altrimenti **Microsoft Edge TTS** con testo filtrato da regole in modo distruttivo e bloccante in caso di errore (P6c). Sul PC del docente oggi si usa Edge filtrato | **[DA VALIDARE 04-D9]** |
| Trascrizione della voce | servizio `transcription` interno all'installazione | **[DA VALIDARE]** |
| Embedding per la ricerca nei documenti | documenti pubblici e query filtrate; i contenuti privati non escono; con OpenRouter si chiede `data_collection: deny` e `zdr: true` | **[DA VALIDARE 04-D10]** |

## 5. Condizioni dei provider esterni

Per ogni provider abilitato il Titolare deve verificare e documentare **[DA VALIDARE 04-D2, D10]**:

| Verifica | Stato |
|---|---|
| Contratto o DPA ex art. 28 | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** |
| Conservazione dei dati delle richieste | **non verificata** per nessun provider |
| Uso per addestramento | **non verificato**; il codice chiede l'esclusione solo per gli embedding via OpenRouter (`backend/embedding_service.py:107`) |
| Paesi di trattamento e garanzie (artt. 44-49) | **[DA VALIDARE]** |
| Sub-responsabili | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** |

Il collegamento ChatGPT personale usa l'account e le condizioni dell'utente con OpenAI: **[DA VALIDARE: ammesso o no per gli studenti]**.

## 6. Registri

Oggi i log Python dell'AI riportano solo il tipo di errore; i registri delle conversazioni (`logs`) contengono domanda
e risposta, ripulite dalla redazione distruttiva (P13). Il registro degli invii all'AI senza contenuto
(`privacy_events`) è **progettato** (02 §7, P8 eventi).

## 7. Prima di attivare l'AI

1. Elenco dei provider ammessi per ciascuna finalità (04-D2, D10).
2. Base giuridica per ogni finalità che usa l'AI (04-D3).
3. Scelta sui dati art. 9 (04-D4) e su immagini e voce (04-D9).
4. DPIA ([schema](08-schema-dpia.md), 04-D11).
5. Testo definitivo di questa informativa, anche in versione per minori (04-D7, D8).

---

*Bozza P16 — da adottare solo dopo la revisione del Titolare e del DPO.*
