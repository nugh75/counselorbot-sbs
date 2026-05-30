# Manuale Operativo per la Validazione del QSAr (Inglese in Svezia)

Questo manuale pratico ti guiderà passo-passo nella procedura per validare la versione **inglese (EN)** del **QSAr** (Questionario sulle Strategie di Apprendimento - Ridotto) nel contesto scolastico svedese.

---

## 💡 Perché ti conviene partire dal QSAr?

Se hai poco tempo, il **QSAr** è la scelta migliore rispetto al QSA completo per tre motivi principali:
1.  **Meno Item (46 contro 100)**: Il tempo di compilazione si riduce da ~25-30 minuti a soli **10-12 minuti**, riducendo drasticamente il tasso di abbandono degli studenti.
2.  **Meno Fattori (8 contro 14)**: Analisi statistiche più semplici e stabili anche su campioni non enormi.
3.  **Meno Fatica per gli Studenti**: La minor fatica mentale garantisce risposte di qualità superiore, soprattutto se gli studenti svedesi compilano in inglese (che non è la loro lingua madre).

---

## 🏃‍♂️ I 6 Passi Operativi per la Validazione

### Passo 1: Preparazione e Consenso (Tempo stimato: 1 settimana)
Prima di raccogliere qualsiasi risposta, devi definire la parte burocratica ed etica:
*   **Target**: Identifica le classi. Per il QSAr, il target ottimale sono gli studenti degli ultimi anni della scuola dell'obbligo svedese (*Grundskola*, fascia 12-15 anni).
*   **Privacy**: Assicurati di non raccogliere nomi, cognomi o email. Usa solo un codice identificativo anonimo (es. `SE-001`, `SE-002`).
*   **Consenso informato**: Predisponi un modulo di assenso/consenso. Se gli studenti hanno meno di 15 anni in Svezia, è necessario il consenso scritto dei genitori (secondo le linee guida della *Etikprövningsmyndigheten*).

---

### Passo 2: Verifica Linguistica e Interviste Cognitive (Tempo stimato: 1 settimana)
Sebbene i testi inglesi del QSAr siano già presenti nel database ([backend/questionnaire_catalog.py](file:///home/nugh75/counselorbot-sbs/backend/questionnaire_catalog.py#L134)), devi verificare se gli studenti svedesi li capiscono correttamente.

*   **Azione**: Recluta **10-15 studenti** per fare delle brevi interviste individuali con la tecnica del *Think Aloud* (pensare ad alta voce).
*   **Cosa fare**: Fai compilare il questionario stampato o a schermo in inglese davanti a te. Chiedi loro:
    *   *“Cosa intendi per questo termine?”*
    *   *“Questa frase ti sembra naturale o strana?”*
*   **Obiettivo**: Identificare se ci sono parole in inglese non familiari per studenti svedesi di quell'età.

---

### Passo 3: Studio Pilota (Tempo stimato: 1 settimana)
Prima di aprire la somministrazione a centinaia di studenti, fai un test generale di funzionamento tecnico e di prima pulizia dati.

*   **Azione**: Fai compilare il questionario online in inglese a un gruppo ristretto di **60-100 studenti**.
*   **Analisi dei dati**:
    *   Verifica che i tempi di compilazione siano coerenti (se qualcuno ci mette meno di 4 minuti, probabilmente ha cliccato a caso e i suoi dati vanno esclusi).
    *   Controlla che non ci siano item a cui nessuno risponde o risposte identiche su tutti i 46 item.

---

### Passo 4: La Raccolta Dati Principale (Tempo stimato: 2-3 settimane)
Questo è il cuore della validazione. Hai bisogno di raccogliere un campione sufficientemente numeroso per poter calcolare le norme.

*   **Dimensione del campione (n)**: Per il QSAr, punta a raccogliere almeno **400 risposte valide** in inglese da studenti in Svezia.
*   **Somministrazione**: Avviene in classe durante l'orario scolastico (garantisce serietà e tassi di completamento vicini al 100%).
*   **Retest (Opzionale ma consigliato)**: Fai ricompilare lo stesso questionario a una parte degli studenti (circa 75-100) dopo 2 settimane per misurare la stabilità del test nel tempo.

---

### Passo 5: Analisi Psicometriche (Tempo stimato: 1 settimana)
Con i dati estratti in formato CSV/Excel, si eseguono le analisi statistiche per confermare che il test funzioni scientificamente. Di solito si usa il software statistico **R** con il pacchetto `lavaan`:

1.  **Analisi di Affidabilità (Reliability)**: Si calcola l'indice *Alpha di Cronbach* o l'*Omega di McDonald* per ognuno degli 8 fattori. Devono idealmente essere $> 0.70$ per dimostrare che le domande dello stesso fattore misurano coerentemente la stessa cosa.
2.  **Confirmatory Factor Analysis (CFA)**: Si verifica se le risposte reali si raggruppano negli 8 fattori teorici ipotizzati dal QSAr. Si osservano gli indici di bontà del modello:
    *   **CFI** e **TLI** dovrebbero essere $> 0.90$ (meglio se $> 0.95$).
    *   **RMSEA** dovrebbe essere $< 0.08$ (meglio se $< 0.05$).

---

### Passo 6: Costruzione e Caricamento delle Norme Stanine
Una volta confermata la validità scientifica, trasformi i punteggi grezzi dello studio in punteggi standardizzati **Stanine (1-9)** da inserire nella tabella [NormThreshold](file:///home/nugh75/counselorbot-sbs/backend/models.py#L171) del database dell'applicazione.

#### Come si calcolano i range di Stanine per ciascun fattore:
Per ognuno degli 8 fattori del QSAr (es. `A4r` - Percezione di competenza):
1.  **Calcola il punteggio grezzo totale** ottenuto da ciascuno studente per quel fattore (sommando i punti degli item che lo compongono, ricordandoti di invertire i reverse-item).
2.  Ordina tutti i punteggi grezzi dei tuoi 400+ studenti dal più basso al più alto.
3.  Usa i **percentili cumulati standard** per trovare i valori di taglio (*cutoff*):

| Stanine | Percentile di Taglio | Procedura Pratica |
| :---: | :---: | :--- |
| **1** | Fino al 4° percentile | Prendi il punteggio del ragazzo al 4% del campione ordinato. Questo è il valore massimo per lo Stanine 1. |
| **2** | Dal 4° all'11° percentile | Da sopra il valore precedente fino al punteggio all'11% del campione. |
| **3** | Dall'11° al 23° percentile | Fino al punteggio al 23% del campione. |
| **4** | Dal 23° al 40° percentile | Fino al punteggio al 40% del campione. |
| **5** | Dal 40° al 60° percentile | Fino al punteggio al 60% del campione (fascia centrale). |
| **6** | Dal 60° al 77° percentile | Fino al punteggio al 77% del campione. |
| **7** | Dal 77° al 89° percentile | Fino al punteggio al 89% del campione. |
| **8** | Dall'89° al 96° percentile | Fino al punteggio al 96% del campione. |
| **9** | Dal 96° al 100° percentile | Tutti i punteggi superiori al 96% del campione. |

4.  **Carica le soglie nel database**:
    Inserisci i record nella tabella `norm_thresholds` tramite l'API o uno script di migrazione:
    *   `instrument_code`: `"QSAr"`
    *   `locale`: `"en"`
    *   `factor_code`: `"A4r"`
    *   `raw_min`: *Punteggio minimo del range*
    *   `raw_max`: *Punteggio massimo del range*
    *   `stanine`: *Valore da 1 a 9*
    *   `status`: `"validated"`

---

## 🏁 Cosa succede quando hai finito?

Appena carichi queste righe nel database:
1.  Il backend dell'applicazione riconosce la presenza delle norme validate per `QSAr` in `en`.
2.  I profili calcolati smetteranno di essere marcati come "sperimentali".
3.  L'applicazione attiverà automaticamente la **Modalità Counseling**, sbloccando la chat guidata con l'AI che interpreterà i punteggi standardizzati degli studenti svedesi con assoluta precisione statistica.
