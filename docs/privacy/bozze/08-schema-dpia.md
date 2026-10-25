# Schema di valutazione d'impatto (DPIA) — CounselorBot

> [!CAUTION]
> **Bozza tecnica, non consulenza legale.** Questo schema è stato preparato dal progetto CounselorBot per aiutare la
> scuola o l'università a condurre una valutazione d'impatto (art. 35 GDPR). **Non** è una DPIA svolta, **non** è un
> parere legale e **non** attesta la conformità al GDPR: condurre, completare e approvare la valutazione spetta al
> **Titolare**, che chiede il parere del **DPO** (art. 35(2)). Le voci **[DA VALIDARE]** e
> **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** vanno decise prima di usare il documento. I riferimenti normativi non sono
> stati verificati sul testo ufficiale ([04 §Fonti](../04-decisioni-titolare-dpo.md#fonti-normative-e-stato-della-verifica)).

Versione: bozza 0.1 (2026-10-24). Decisione di riferimento: 04-D11. La parte tecnica (§2, §4) è precompilata dal
codice; le valutazioni (§3, §5, §6) sono del Titolare.

---

## 0. Dati della valutazione

- Titolare: **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** · DPO: **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**
- Chi conduce la DPIA: **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** · Data: **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**
- Profili di installazione valutati: [ ] L1 server ai4educ/portable [ ] L1 server di scuola [ ] L2 PC del docente [ ] L3 app studente (Fase 2)
- Versione del software: **[DA COMPILARE: commit o release]**

Per la casella **L2 PC del docente**, compilare anche l'[allegato desktop
teacher-pc](../desktop-teacher-dpia.md), aggiornato a F1-17 con flussi, P6/P7/P11,
backup e limiti della GUI. Le valutazioni e la decisione restano **[DA VALIDARE]**.
I dati generali sotto coprono più profili e non descrivono automaticamente L2.

## 1. Serve una DPIA?

Criteri presenti (indicativi, da confermare **[DA VALIDARE 04-D11]**):

| Criterio | Presente? | Nota tecnica |
|---|---|---|
| Interessati vulnerabili (minori) | probabile | uso scolastico |
| Valutazione o profilazione | probabile | profili di apprendimento QSA/ZTPI, sintesi dell'AI |
| Nuove tecnologie | sì | modelli linguistici, provider esterni |
| Dati di categorie particolari | possibile | testi liberi possono contenere dati sulla salute (04-D4) |
| Trattamento su larga scala | **[DA VALIDARE]** | dipende dall'installazione |
| Trasferimenti extra-UE | possibile | provider di AI (04-D10) |

Esito: **[DA VALIDARE: DPIA necessaria sì/no, motivazione]**.

## 2. Descrizione sistematica (art. 35(7)(a))

| Elemento | Contenuto | Fonte |
|---|---|---|
| Finalità | servizio educativo e orientamento, condivisione con il docente, osservazioni di classe con AI, ricerca, gradimento, sicurezza, Telegram | 04-D3 |
| Categorie di dati | vedi [registro](09-registro-trattamenti.md) | 01 §3 |
| Interessati | studenti (anche minori), docenti, ricercatori, amministratori | — |
| Livelli e flussi | L1 server, L2 PC docente con tunnel Cloudflare, L4 web, provider esterni | 01 §1, 02 §1 |
| Uscite verso l'esterno | 18 punti censiti, 13 provider di chat, Edge TTS, Telegram, Cloudflare | 01 §5 |
| Responsabili | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO, 04-D2]** | — |
| Conservazione | [06](06-politica-conservazione-cancellazione.md) | 04-D5 |

## 3. Necessità e proporzionalità (art. 35(7)(b))

| Domanda | Risposta |
|---|---|
| Base giuridica per ogni finalità | **[DA VALIDARE 04-D3]** |
| I dati sono il minimo necessario? | **[DA VALIDARE]** — nota: le osservazioni di classe inviano gli username al modello |
| L'AI è necessaria o esistono alternative meno invasive (solo modelli locali)? | **[DA VALIDARE]** |
| Informazione degli interessati | [01](01-informativa-studente.md), [02](02-informativa-docente.md), [03](03-informativa-ai.md) — **[DA VALIDARE 04-D8]** |
| Esercizio dei diritti | [06 §4](06-politica-conservazione-cancellazione.md) — export e cancellazione self-service non ancora disponibili |
| Garanzie sui responsabili e sui trasferimenti | **[DA VALIDARE 04-D10]** |

## 4. Rischi (art. 35(7)(c))

Probabilità e gravità sono stime **[DA VALIDARE]**: la colonna «Stima tecnica» riprende 01 §11 e 02 §8.

| # | Rischio per gli interessati | Origine | Misure oggi | Misure progettate | Stima tecnica | Probabilità | Gravità |
|---|---|---|---|---|---|---|---|
| R1 | Identità o dati personali rivelati a un provider di AI | filtro non completo, nomi non riconosciuti | regole + NER via Ollama, immagini bloccate (P6a), Edge filtrato (P6c), host locali per indirizzo (P6b) | P6 già operativo in transizione; strict richiede configurazione e prerequisiti (vedere allegato L2) | alta | **[DA VALIDARE]** | **[DA VALIDARE]** |
| R2 | Dati sulla salute ai provider | testi liberi | sostituzione di alcuni termini sanitari | blocco art. 9 (04-D4) | alta | **[DA VALIDARE]** | **[DA VALIDARE]** |
| R3 | Docente che vede più del necessario | accesso oltre ambito di classe/periodo/categorie | grant P7 per classe, periodo e categorie; taccuino escluso dal default | verifica del perimetro applicato | residuo [DA VALIDARE] | **[DA VALIDARE]** | **[DA VALIDARE]** |
| R4 | Amministratore tecnico che legge i contenuti | amministrazione tecnica e controllo del PC | vista pseudonimizzata e break-glass P7 su L1; docente-admin L2 con controllo del PC | misure organizzative L2 | residuo [DA VALIDARE] | **[DA VALIDARE]** | **[DA VALIDARE]** |
| R5 | Furto di database, PC o backup | contenuti in chiaro | cifratura del disco non imposta; P11 facoltativo e parziale | migrazione storico e copertura dei campi mancanti; vedere allegato L2 | media L1, alta L2 | **[DA VALIDARE]** | **[DA VALIDARE]** |
| R6 | Dati personali nei log | testi nei log | redazione fail-closed con regole e gazetteer (P13) | modello ML anche nei log | media | **[DA VALIDARE]** | **[DA VALIDARE]** |
| R7 | Consensi non dimostrabili | documenti non pubblicati e UI P10 assente | P9: scelte/revoche versionate; osservazioni legacy non abilitanti | pubblicazione documenti approvati, basi/finalità P0 e UI P10 | residuo [DA VALIDARE] | **[DA VALIDARE]** | **[DA VALIDARE]** |
| R8 | Conservazione eccessiva | solo `logs` ha un termine | 90 giorni sui log | job P14 | media (G13) | **[DA VALIDARE]** | **[DA VALIDARE]** |
| R9 | Reidentificazione nei dati di ricerca | tabella dei codici in chiaro | nessuna | HMAC con chiave separata (04-D13) | media | **[DA VALIDARE]** | **[DA VALIDARE]** |
| R10 | Cloudflare vede il traffico | tunnel su L2 | TLS fino all'edge | informativa, tunnel nominativo | strutturale | **[DA VALIDARE]** | **[DA VALIDARE]** |
| R11 | Perdita di disponibilità per chiave persa | cifratura | kit di recupero (P5) | custodia (04-D14) | bassa | **[DA VALIDARE]** | **[DA VALIDARE]** |
| R12 | Risposte dell'AI errate o inadatte a un minore | modelli generativi | prompt guidati, nessuna decisione automatica | **[DA VALIDARE]** | media | **[DA VALIDARE]** | **[DA VALIDARE]** |
| R13 | Prompt injection da documenti caricati | RAG, riferimenti Idea | contesto dichiarato non fidato | segnaposto neutralizzati (P4) | media | **[DA VALIDARE]** | **[DA VALIDARE]** |

## 5. Misure per affrontare i rischi (art. 35(7)(d))

Elenco completo delle misure tecniche e organizzative: [10](10-misure-tecniche-organizzative.md). Per ogni rischio il
Titolare indica: misura scelta, responsabile, scadenza, rischio residuo **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**.

| Rischio | Misura scelta | Responsabile | Scadenza | Rischio residuo |
|---|---|---|---|---|
| R1 | | | | |
| … | | | | |

## 6. Pareri e decisione

- Parere del DPO: **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**
- Opinione degli interessati o dei loro rappresentanti (art. 35(9)), se raccolta: **[DA VALIDARE]**
- Rischio residuo elevato? Se sì, consultazione preventiva del Garante (art. 36): **[DA VALIDARE]**
- Decisione del Titolare e data: **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**
- Revisione prevista: **[DA VALIDARE: data o evento, per esempio nuovo provider o rilascio di P6/P7/P11]**

---

*Bozza P16 — da adottare solo dopo la revisione del Titolare e del DPO.*
