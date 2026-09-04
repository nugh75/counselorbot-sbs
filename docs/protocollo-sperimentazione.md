# Protocollo di sperimentazione — CounselorBot SBS

> Traccia da completare per ogni sperimentazione (scuola, classe, gruppo di utenti).
> I campi fra parentesi quadre `[...]` vanno compilati prima della distribuzione.

---

## 1. Il progetto in breve

**CounselorBot SBS** è una piattaforma web di supporto all'apprendimento e
all'orientamento, basata su intelligenza artificiale. Aiuta studenti e
studentesse a esplorare il proprio profilo di apprendimento — strategie di
studio, competenze strategiche, prospettiva temporale, adattabilità di carriera
— attraverso questionari validati seguiti da una **chat guidata** con
assistenti virtuali ("counselor") scelti dallo studente.

A cosa serve:

- far emergere punti di forza e aree di crescita del proprio modo di imparare;
- riflettere sui risultati con un dialogo guidato, non con un semplice report;
- costruire strumenti personali duraturi: **taccuino** (appunti su di sé),
  **libretto** (riflessioni per strumento), **portfolio**;
- orientarsi nella scelta degli strumenti tramite la **Bussola**, una chat
  iniziale di orientamento;
- per docenti e ricercatori: creare classi/gruppi, somministrare strumenti con
  piani dedicati e monitorare le attività in forma anonima.

La piattaforma è disponibile in sei lingue (italiano, inglese, spagnolo,
francese, tedesco, svedese). L'interazione è via web e, per gli studenti che lo
attivano, via Telegram.

---

## 2. Obiettivi della sperimentazione

La sperimentazione si valuta dalla prospettiva dello studente: ciò che conta è
se nella sua esperienza le cose funzionano.

- **"Mi torna?"** — verificare se il profilo emerso dalla chat e le riflessioni
  corrispondono a come lo studente si vede nello studio.
- **Facilità d'uso** — verificare che il percorso (Bussola, QSA, chat guidata,
  IDEA) sia semplice da usare e capire.
- **Adeguatezza dei consigli** — verificare che le strategie e i consigli
  ricevuti siano adatti alla situazione dello studente e applicabili.
- Raccolta dati sullo strumento **QSA** (strategie di apprendimento)
- [Obiettivo secondario, es. "osservare come gli studenti usano IDEA per sviluppare un'idea di studio o di carriera"]
- [Domande di ricerca, se previste]

---

## 3. Ruoli coinvolti

| Ruolo | Chi | Cosa fa |
|-------|-----|---------|
| Studente/partecipante | [classe/gruppo] | Compila questionari, usa la chat guidata, dà feedback |
| Docente | [nome] | Crea il gruppo, segue le attività, raccoglie osservazioni |
| Referente di istituto | [nome] | Coordina la somministrazione, contatto operativo |
| Ricercatore | [nome] | Definisce il piano, analizza dati e feedback |

---

## 4. Come si usa: percorso guidato

Passi per il partecipante:

1. **Accesso** — aprire [URL della piattaforma] e registrarsi/autenticarsi con
   il proprio account (login via ai4auth).
2. **Bussola** — al primo ingresso la piattaforma propone una chat di
   orientamento: lo studente ci parla, racconta il proprio momento e la
   Bussola aiuta a capire quale strumento fa per lui. Completarla sblocca
   tutti gli strumenti.
3. **QSA** — compilare il questionario assegnato sulle strategie di
   apprendimento (è lo strumento su cui si raccolgono i dati di questa
   sperimentazione). Durata indicativa: [minuti].
4. **Chat guidata QSA** — terminato il questionario si apre una conversazione
   con un counselor AI scelto dallo studente, che commenta il profilo emerso e
   accompagna la riflessione in più tappe.
5. **Taccuino** — prima della chat e a fine sessione lo studente rivede i
   propri appunti su di sé (profilo di apprendimento).
6. **IDEA** — in seguito lo studente usa la chat libera IDEA per mettere a
   fuoco un'idea di studio o di carriera. IDEA produce una **mappa** che
   cresce a ogni turno; a fine sessione lo studente decide dove conservarla
   (taccuino, portfolio, o nessuno dei due).

Per i docenti:

1. Creare la **classe/gruppo** dalla dashboard docente e condividere il codice
   di invito (`GR-XXXXXX`) con gli studenti.
2. Creare un **piano di somministrazione** collegato al gruppo per assegnare il
   **QSA** e tracciare le compilazioni (i dati raccolti arrivano al gruppo in
   forma anonima).
3. Seguire le attività dal pannello (risultati e conversazioni in forma
   anonima) e annotare osservazioni (`[cosa osservare: es. difficoltà ricorrenti, tempo di compilazione]`).

---

## 5. Strumenti disponibili

| Codice | Strumento |
|--------|-----------|
| QSA / QSAr | Strategie di apprendimento (versione completa e ridotta) |
| ZTPI | Prospettiva temporale (Zimbardo) |
| SAVICKAS | Intervista di costruzione di carriera (narrativa) |
| QPCS | Competenze strategiche percepite |
| QPCC | Competenze e convinzioni percepite |
| QAP | Adattabilità di carriera |
| EVENTO_STUDIO / EVENTO_PROFESSIONALE | Eventi significativi (narrativi) |
| IDEA | Chat libera per mettere a fuoco un'idea (produce una mappa) |

> La sperimentazione riguarda in particolare: **QSA** (raccolta dati) e
> **IDEA** (esplorazione libera).

---

## 6. Tempistiche

| Fase | Quando | Note |
|------|--------|------|
| Formazione/illustrazione ai partecipanti | [data] | [modalità] |
| Bussola (orientamento iniziale) | [data–data] | [in classe o autonomamente] |
| QSA + chat guidata | [data–data] | [orari, aula, dispositivi] |
| IDEA (esplorazione libera) | [data–data] | [in classe o autonomamente] |
| Raccolta feedback | [data–data] | vedi §8 |
| Restituzione/analisi | [data] | [a chi] |

---

## 7. Dati e privacy

- L'accesso ai dati è per ruolo: i docenti vedono solo i propri gruppi, in
  forma anonima dove previsto.
- La piattaforma redige i log rimuovendo email, telefoni e codici fiscali
  (redazione PII attiva di default).
- Le comunicazioni verso provider AI esterni usano anonimizzazione reversibile
  dei dati personali.
- Per la ricerca: `[consenso informato, codici anonimi, modalità di conservazione]`.

---

## 8. Raccolta feedback

Il feedback si raccoglie dalla prospettiva dello studente. Feedback in-app:

- **Questionario di gradimento**: al termine del percorso lo studente compila
  il questionario di feedback integrato (`/questionario`).
- **Feedback sulle strategie**: nella chat guidata ogni strategia consigliata
  può essere valutata dallo studente (utile/non utile).
- **Risposte alla chat**: gli studenti possono segnalare se una risposta è
  stata utile.

Questionario finale per lo studente (scala 1–5: 1 = per niente, 5 =
moltissimo):

**"Mi torna?"**

1. Il profilo che la piattaforma ha descritto corrisponde a come mi vedo nello
   studio?
2. La chat ha capito quello che le dicevo?
3. Quello che ho scoperto mi aiuta a capire come studio?

**Facilità d'uso**

4. Registrazione e accesso sono stati semplici?
5. La Bussola è stata facile da usare per capire quale strumento fa per me?
6. Il questionario QSA era chiaro e scorrevole?
7. La chat guidata era facile da seguire?
8. IDEA è stata facile da usare per costruire la mia mappa?
9. (aperta) Cosa è stato difficile o confuso?

**Adeguatezza dei consigli**

10. I consigli ricevuti nella chat erano adatti alla mia situazione?
11. Riuscirei a metterli in pratica nel mio studio?
12. (aperta) Quale consiglio ti porti a casa, e perché?

Domande aperte finali:

- Cosa ti è piaciuto di più dell'esperienza?
- Cosa cambieresti?

Feedback organizzativo:

- `[Osservazioni del docente — griglia da compilare: es. funzionamento tecnico, chiarezza delle istruzioni, reazioni degli studenti]`
- `[Sessione di restituzione in classe: domande guida, es. "Cosa hai capito di nuovo su come studi?", "Cosa miglioreresti?"]`
- `[Canale per segnalazioni tecniche: email/telegram del referente]`

---

## 9. Contatti e supporto

| Riferimento | Recapito |
|-------------|----------|
| Referente di istituto | [nome, email] |
| Referente di progetto | [nome, email] |
| Supporto tecnico | [email o canale] |
| Piattaforma | [URL] |

---

## 10. Checklist di avvio

- [ ] Date e aule confermate
- [ ] Account dei partecipanti pronti / procedura di registrazione verificata
- [ ] Gruppo classe creato e codice di invito distribuito
- [ ] Piano di somministrazione configurato
- [ ] Consenso informato raccolto
- [ ] Canale di segnalazione problemi comunicato
