# Piano di Miglioramento UX e Interazione Chat (Post-Sessione 2026-09-21)

Documento operativo derivato dal feedback dell'ultima sessione di test e dall'ultimo riscontro registrato nel questionario di soddisfazione della piattaforma.

---

## 1. Origine e Voce dell'Utente

Dall'analisi del questionario di gradimento (risposta #18, somministrazione QSA con counselor Clio, 2026-09-21):

> *"There are a lot of functions and I felt a bit lost. It would be nice to make each function/similiar functions more distinct, such as using a different color or sections. Also I would like to see more icons or simple figures to lead me through the functions or help me to find what I need the most. The LLM is helpful, although I felt it is too gentle and I would like to see what is essential and priority for me. Maybe use bullet points or something to highlight the important points. Also for easy reading. In general I just like to see a easy to navigate interface."*

Le criticità identificate convergono su quattro pilastri:
1. **Orientamento & Navigazione**: l'utente fatica a muoversi tra le tante funzioni e perde i riferimenti di uscita/ritorno; non sa cosa aspettarsi nel passo successivo.
2. **Flessibilità del Percorso**: le interviste guidate sono troppo rigide e lunghe; serve una versione rapida e la possibilità di interrompere o uscire.
3. **Leggibilità & Concretezza del Counselor**: il testo continuo rischia di risultare prolisso e omogeneo; servono formati strutturati (punti elenco, tabelle) e una separazione visiva netta tra analisi, consigli e piano d'azione.
4. **Interfaccia e Accessibilità Visiva**: homepage densa che necessita di una guida rapida con figure, colori distinti e icone.

---

## 2. Dettaglio degli Interventi

### Punto 1: Standardizzazione Globale della Navigazione "Indietro"
- **Problema riscontrato**:
  I pulsanti "Indietro" hanno posizioni, icone, etichette e comportamenti disomogenei tra home page, questionario, interviste guidate (`GuidedChatInterface`), assistente, tavolo e profilo. L'utente si sente spaesato.
- **Intervento operativo**:
  - Definire un pattern unico di navigazione a ritroso (`GlobalBackBar` o standardizzazione di `BackButton.tsx`).
  - Posizione fissa e prevedibile (in alto a sinistra nella testata di pagina).
  - Presenza di un'etichetta semantica chiara di destinazione (es. "← Torna a Selezione Strumenti", "← Torna al Profilo").
  - Allineamento rigoroso tra lo stato interno dell'applicazione, la cronologia (`flow-history.ts`) e il tasto Indietro del browser.

### Punto 2: Percorso Guidato "Short / Focus Version"
- **Problema riscontrato**:
  I percorsi guidati completi (es. QSA con 10-12 fattori o ZTPI con 6 tappe) richiedono troppi turni e generano risposte prolisse per ogni singolo fattore ("I felt it is too gentle and I would like to see what is essential and priority for me").
- **Intervento operativo**:
  - Introdurre prima dell'avvio del colloquio guidato un selettore di profondità:
    - **Percorso Completo (Standard)**: analisi fattore per fattore (10+ passi).
    - **Percorso Rapido (Short / Focus)**: seleziona in automatico i 2 o 3 fattori prioritari (es. stanine critici ≤ 3 o ≥ 8, punti di forza e debolezza chiave) e si sviluppa in soli 3 passaggi:
      1. Panoramica del profilo complessivo.
      2. Approfondimento guidato sui 2-3 fattori prioritari.
      3. Sintesi strategica e definizione del piano d'azione.

### Punto 3: Opzione Formato di Risposta in Chat (Punti Elenco, Tabelle, Conversazionale)
- **Problema riscontrato**:
  La chat offre selettori per la lunghezza della risposta (`ResponseLengthSelector`) e il livello di ragionamento (`ReasoningSelector`), ma manca la possibilità di scegliere come impaginare l'output ("Maybe use bullet points or something to highlight the important points. Also for easy reading").
- **Intervento operativo**:
  - Aggiungere in `frontend/src/lib/session-prefs.ts` il tipo di preferenza `ResponseFormatPref`:
    - `standard`: prosa discorsiva e conversazionale.
    - `bullets`: punti elenco, grassetti sui concetti chiave e sintesi schematica.
    - `table`: tabelle comparative di sintesi (es. Fattore | Punteggio | Cosa significa | Azione pratica).
  - Creare il componente UI `FormatSelector.tsx` da affiancare a lunghezza e reasoning nella barra opzioni della chat.
  - Integrare l'istruzione di formattazione nel system prompt e nella chiamata backend (`backend/ai_service.py` / `chat.py`).

### Punto 4: Homepage di Apertura Semplificata e Visiva (Quick-Start Onboarding)
- **Problema riscontrato**:
  La landing page (`frontend/src/app/page.tsx`) presenta un'elevata densità di testi e sezioni complesse senza un percorso visivo immediato ("more icons or simple figures to lead me through the functions... using a different color or sections").
- **Intervento operativo**:
  - Introdurre una vista "Quick-Start / Guida Visiva" in apertura:
    - 3 card macro-percorso con icone grandi e colori differenziati (1. Compila il Questionario, 2. Parla con il Counselor, 3. Consulta il Libretto Personale).
    - Guida schematica in 3 passi con figure/illustrazioni minimali.
    - Toggle per passare dalla vista "Semplificata (Primo Accesso)" alla vista "Avanzata / Tutti gli strumenti".

### Punto 5: Tasto "Interrompi" nelle Chat Guidate (Stop Streaming & Salto Percorso)
- **Problema riscontrato**:
  Nelle chat guidate non è presente o non è visibile un tasto di interruzione immediata.
- **Intervento operativo**:
  - **Interruzione Streaming (Stop Generazione)**: pulsante quadrato rosso/slate ben visibile durante l'erogazione del testo in qualsiasi stato (anche durante i messaggi automatici di inizio step e durante la modalità vocale).
  - **Interruzione Percorso (Exit / Salta al Riepilogo)**: opzione esplicita "Interrompi percorso guidato e vai alle conclusioni", che permette di uscire dalla sequenza dei passi senza perdere quanto discusso finora e passare direttamente al riepilogo o alla chat libera.

### Punto 6: Distinzione Grafica dei Contenuti in Chat (Fattori vs Consigli vs Azioni)
- **Problema riscontrato**:
  Nel messaggio del counselor la descrizione del fattore, i consigli teorici e le azioni pratiche si fondono in un blocco di testo uniforme, rendendo difficile identificare cosa fare operativamente.
- **Intervento operativo**:
  - Istruire i prompt dei counselor ad emettere le risposte con blocchi semantici strutturati:
    - `[Diagnosi / Fattore]`: spiegazione del significato del punteggio.
    - `[Suggerimenti del Counselor]`: interpretazione e chiavi di lettura pedagogiche.
    - `[Piano d'Azione / Cosa fare adesso]`: lista puntata di passi operativi concreti.
  - Creare componenti visivi dedicati in frontend (`MessageSectionCard` o parsing Markdown a blocchi) con badge cromatici e icone:
    - 🟦 **Fattore**: tonalità indaco/blu con icona informativa o di grafico.
    - 🟨 **Suggerimento**: tonalità ambra/viola con icona lampadina.
    - 🟩 **Cosa fare adesso**: card verde/smeraldo con checkbox o icona target, focalizzata sulle priorità.

### Punto 7: Indicazione del Passo/Fattore Successivo nella Barra Inferiore
- **Problema riscontrato**:
  Attualmente la barra di navigazione inferiore dei passi mostra solo il passo attivo (es. "Passo 3/10: Presente Edonistico") e un pulsante generico di avanzamento ("Avanti"). L'utente non sa quale fattore o argomento verrà affrontato dopo, aumentando il senso di incertezza.
- **Intervento operativo**:
  - Nella barra inferiore (`stepNavigation` in `GuidedChatInterface.tsx`):
    - Mostrare chiaramente l'anteprima del prossimo passaggio:
      `Passo 3/10: Presente Edonistico` ➔ **Prossimo: Presente Fatalistico**
    - Nel pulsante o tooltip di avanzamento: indicare "Avanti: [Nome Prossimo Fattore]" invece di un generico "Avanti".
    - Mostrare una mini-timeline o pillola informativa che visualizzi a colpo d'occhio la sequenza: `[Precedente] ← [Attuale] → [Successivo]`.

---

## 3. Matrice dei File Coinvolti

| Ambito | Componenti Coinvolti | File da Modificare |
| :--- | :--- | :--- |
| **Navigazione Indietro (Punto 1)** | `BackButton`, `PageHeader`, `flow-history` | `frontend/src/components/ui/BackButton.tsx`<br>`frontend/src/app/page.tsx`<br>`frontend/src/components/qsa/GuidedChatInterface.tsx` |
| **Percorso Breve (Punto 2)** | `interview-path`, step generator, chat route | `frontend/src/lib/interview-path.ts`<br>`frontend/src/components/qsa/GuidedChatInterface.tsx`<br>`backend/routes/chat.py` |
| **Formato Risposta (Punto 3)** | `session-prefs`, `FormatSelector`, prompt counselor | `frontend/src/lib/session-prefs.ts`<br>`frontend/src/components/ui/FormatSelector.tsx`<br>`backend/ai_service.py` |
| **Homepage Visiva (Punto 4)** | Landing page layout, card visuali, icone | `frontend/src/app/page.tsx`<br>`frontend/src/components/home/*` |
| **Interruzione (Punto 5)** | `AbortController`, dialog stop & conclude early | `frontend/src/components/qsa/GuidedChatInterface.tsx`<br>`frontend/src/lib/chat-stream.ts` |
| **Distinzione Grafica (Punto 6)** | Parser Markdown semantico, `ChatBubble`, prompt | `frontend/src/components/ui/ChatBubble.tsx`<br>`frontend/src/components/qsa/GuidedChatInterface.tsx`<br>`backend/prompts/*` |
| **Fattore Successivo (Punto 7)** | `stepNavigation`, etichette avanzamento, preview badge | `frontend/src/components/qsa/GuidedChatInterface.tsx`<br>`frontend/src/lib/interview-path.ts`<br>`frontend/src/lib/i18n-steps.ts` |

---

## 4. Roadmap di Rilascio

### Fase 1: Controllo, Navigazione e Trasparenza del Percorso (Quick Wins)
1. **Punto 7**: Visualizzazione del fattore/passo successivo nella barra inferiore di navigazione.
2. **Punto 5**: Tasto stop per interrompere lo streaming ed esito rapido per concludere il percorso guidato.
3. **Punto 1**: Uniformazione dei pulsanti "Indietro" con indicazione chiara di ritorno.

### Fase 2: Formattazione e Leggibilità delle Risposte
4. **Punto 3**: Aggiunta del selettore formato (Punti elenco, Tabelle, Conversazionale).
5. **Punto 6**: Distinzione visiva e semantica tra Diagnosi del fattore, Suggerimenti e Azioni pratiche ("Cosa fare adesso").

### Fase 3: Ottimizzazione dei Percorsi e Onboarding
6. **Punto 2**: Implementazione della modalità "Short / Focus Version" per le chat guidate.
7. **Punto 4**: Semplificazione visiva della homepage con card illustrate e onboarding in 3 passi.
