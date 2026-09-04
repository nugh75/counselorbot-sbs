# Report Analisi Interazioni CounselorBot — 4 Settembre 2026

## Riepilogo
Analisi approfondita delle ultime interazioni registrate nel database `counselorbot` (PostgreSQL) relative agli strumenti **QSA** e **IDEA**. L'obiettivo è identificare le cause profonde di errori di contenuto, ripetizioni e comportamenti anomali del chatbot.

---

## 1. Meccanismo: Confusione di Lingua e Sessione (QSA)
**ID Log:** 12351  
**Sintomo:** Risposta in inglese in una sessione che sembrava italiana.

### Analisi del Flusso (Ref: Codice)
Il parametro `language` viene normalizzato e iniettato nel system prompt tramite la direttiva `[LANGUAGE]` (vedi `chat_logic.py:457-550`). Tuttavia, esistono tre punti deboli nel meccanismo attuale:

1.  **Condivisione della Sessione:** I file di memoria di sessione sono indicizzati per `session_id`. Se l'utente `admin` e il `guest` condividono lo stesso ID (ad esempio durante test di sviluppo), i turni IT e EN si mescolano nello stesso file Markdown. Il modello carica la history (vedi `chat_logic.py:2547`) mescolando turni di lingue diverse.
2.  **Competizione nel Context Window:** La direttiva `[LANGUAGE]` viene aggiunta in coda al system prompt (`chat_logic.py:487`). Quando il modello vede 6+ turni precedenti in italiano nella history, la direttiva compete con il pattern forte della conversazione italiana nel contesto. Il modello può "scivolare" nella lingua della history o mescolare frasi all'inizio della risposta.
3.  **Mancanza di Tracciamento Per-Turn:** Il modello non riceve informazioni su *quale* lingua sia stata usata in ogni turno specifico della history (vedi `memory_service.py:275-339`), solo una direttiva globale finale "usa l'inglese".

### Conclusione
Il problema non è un bug del modello, ma una contaminazione dei dati di sessione (`session_memory`) che confonde il contesto linguistico, aggravata dalla posizione della direttiva di lingua.

---

## 2. Meccanismo: Ripetizioni e Tono Aggressivo (IDEA)
**ID Log:** 12339 - 12359  
**Sintomo:** Il bot risponde "Non te la ripeto" alla quarta domanda identica.

### Analisi del Flusso (Ref: Codice)
Il comportamento NON è un "hardcoded rule" nel codice Python, ma è un **comportamento emergente** della configurazione di Counseling:

1.  **Counselor Persona:** Il counselor configurato per IDEA (o il default) ha una persona (persona_prompt) che enfatizza "onestà e diretta". Questo testo viene iniettato nel system prompt.
2.  **Input Identici:** Il modello rileva che l'input testuale è identico al turno precedente. 
3.  **Sovrapposizione Istruzioni:** Le istruzioni di "onestà/direttezza" della persona si scontrano con l'istruzione di "essere utile". Il modello risolve il conflitto "sbloccando" la ripetizione con una chiusura diretta, che percepirisce come "umana" o "coerente" con la persona del coach, ma che risulta sterile per lo studente.

### Conclusione
È un trade-off della "persona". Per evitare questo comportamento, bisogna rafforzare il prompt di sistema con istruzioni specifiche per gestire le domande ripetute (es. "se l'utente ripete, riformula o aggancia con una domanda di riscontro").

---

## 3. Meccanismo: Risposte Identiche (QSA)
**ID Log:** 12320 vs 12323  
**Sintomo:** Risposte identiche a input diversi ("Most important summary" vs vuoto).

### Analisi del Flusso (Ref: Codice)
Questo è un comportamento noto dei modelli di linguaggio (LLM) quando si attiva la modalità di "auto-completamento" o "domanda successiva":

1.  **Prompt di Continuità (vedi `routes/chat.py:402`):** In alcune fasi (es. `factor-qa`), il sistema invia un input vuoto o una frase di "prossima domanda" per far proseguire l'analisi guidata (auto-avvio del turno successivo).
2.  **Priorità al Template:** Se l'input è vuoto o troppo generico, il modello dà priorità al pattern appreso nei turni precedenti (l'analisi del profilo appena iniziata) piuttosto che processare un nuovo input assente.
3.  **Latenza o "Salamoia":** A volte il modello "riempie il vuoto" ripetendo il punto precedente per sicurezza, soprattutto se la history è lunga e il modello ha "paura" di saltare un fattore o violare il template dell'analisi.

### Conclusione
Indica che la transizione tra i turni dell'analisi guidata potrebbe richiedere un prompt più aggressivo che costringa il modello a variare la struttura o a chiedere conferma prima di procedere, invece di "auto-procedere" in modo ripetitivo.

---

## 4. Punti di Forza e Riscontro
Le analisi "Second Level" (ID 12370 e 12371) dimostrano che il modello ha una comprensione eccellente del dominio. L'uso di metafore come "il serbatoio" e "il remo" per spiegare l'interazione tra Volizione e Perseveranza è efficace e corretto dal punto di vista psicometrico.

---

## Raccomandazioni per il Prossimo Sprint
1.  **Isolare le Sessioni di Test:** Assicurarsi che gli admin usino sessioni di sviluppo dedicate per evitare la contaminazione della history nei database di produzione.
2.  **Prompt IDEA Anti-Loop:** Inserire nel prompt di IDEA una gestione specifica per "User repeats the same question more than twice" per mantenere un tono di supporto.
3.  **Refine QSA Transition:** Indagare il meccanismo di "auto-avvio" dei turni per assicurare che il modello non cada nel loop di ripetizione del template di analisi.
