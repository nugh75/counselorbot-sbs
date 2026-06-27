# pQBL (Pure Question-Based Learning) in Counselorbot

Basato sul metodo di Jemstedt & Bälter (2024), *Less to produce and less to consume: the advantage of pure question-based learning*.

---

## Principio

Il corso pQBL è composto **solo da domande a scelta multipla + feedback formativo dettagliato**. Niente testi esplicativi, niente lezioni. L'apprendimento avviene attraverso il ciclo domanda → risposta → feedback.

## Adattamento a Counselorbot

Oggi Counselorbot *presenta* ciascun fattore del profilo QSA, *ne discute* il significato e *suggerisce* strategie. È un flusso dichiarativo: il bot spiega, lo studente ascolta/legge.

La versione pQBL invertirebbe il flusso: il bot **chiede**, lo studente **risponde**, il bot **dà feedback**.

## Flusso proposto

### Fase 1 — Domanda sul fattore
Il bot mostra il fattore (es. "Ansietà di base: il tuo punteggio è 7, sopra la media") e pone una domanda strutturata:

> "Il tuo profilo mostra un livello di ansietà di base superiore alla media. Secondo te, in quali situazioni di studio questa ansia si manifesta di più? Scegli l'opzione più vicina alla tua esperienza:
> A) Prima di un compito in classe o un esame
> B) Quando devo parlare davanti alla classe
> C) Quando non capisco subito un argomento
> D) Non credo di avere questo problema"

### Fase 2 — Feedback formativo
In base alla risposta, il bot dà un feedback immediato che:
- **Conferma** se la risposta è allineata al profilo (validazione)
- **Corregge delicatamente** se la risposta contraddice il profilo (rielaborazione)
- **Approfondisce** spiegando perché quel fattore è importante

> "Hai scelto A. L'ansia pre-esame è comune e, con un punteggio di 7, è probabile che tu la sperimenti in modo significativo. Questo è collegato al fattore 'Interferenze emotive' che vedremo dopo. Una strategia utile è la preparazione strutturata: suddividere il materiale in piccole parti e fissare obiettivi giornalieri."

### Fase 3 — Domanda sul collegamento tra fattori
Il bot chiede di mettere in relazione due fattori:

> "Il tuo profilo mostra anche una bassa 'Percezione di competenza' (punteggio 3). Pensi che questi due aspetti siano collegati? Cioè, il fatto di sentirti ansioso può influenzare quanto ti senti competente?
> A) Sì, l'ansia mi fa sentire meno capace
> B) No, sono due cose separate
> C) Non ci ho mai pensato"

### Fase 4 — Sintesi riflessiva
A conclusione di ogni fattore, una domanda aperta (facoltativa) stimola la metacognizione:

> "C'è una strategia che usi già per gestire questa area e che potresti potenziare? Prova a descriverla in poche parole."

## Vantaggi rispetto al flusso attuale

| Aspetto | Flusso attuale (dichiarativo) | Flusso pQBL (interrogativo) |
|---------|------------------------------|-----------------------------|
| Ruolo studente | Lettore/ascoltatore | Partecipante attivo |
| Cognizione | Ricezione passiva | Recupero attivo (testing effect) |
| Metacognizione | Il bot dice cosa pensare | Lo studente riflette e scopre |
| Engagement | Moderato | Alto (domanda → attesa → feedback) |
| Feedback | Dopo la chat, nessuno | Immediato, su ogni risposta |
| Tempo di interazione | Lungo (tutto spiegato) | Piu breve (solo domande mirate) |

## Implementazione tecnica

A livello di `guided_steps` nel database, ogni passo diventerebbe:
- `step_type`: `pQBL_choice` o `pQBL_open`
- `prompt`: la domanda da mostrare (con opzioni A/B/C/D)
- `feedback_correct`: template feedback per risposta attesa
- `feedback_alternative`: template feedback per deviazione
- `factor`: il fattore QSA a cui si riferisce (per iniettare lo score nel prompt)

Il backend (AIService) dovrebbe:
1. Mostrare la domanda predeterminata (non generata dal LLM — per avere controllo)
2. Aspettare la risposta dello studente
3. Generare il feedback con LLM, contestualizzando risposta + punteggio + fattore
4. Passare al passo successivo

Il frontend dovrebbe supportare bottoni per le opzioni (A/B/C/D) nella chat, non solo input libero.

## Riferimento

Jemstedt, A., Bälter, O., Gavel, A., Glassey, R., & Bosk, D. (2025). Less to produce and less to consume: the advantage of pure question-based learning. *Interactive Learning Environments, 33*(2), 1040–1061. DOI: 10.1080/10494820.2024.2362830
