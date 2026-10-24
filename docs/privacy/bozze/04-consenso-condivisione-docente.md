# Modulo di consenso alla condivisione con il docente — CounselorBot

> [!CAUTION]
> **Bozza tecnica, non consulenza legale.** Questo modulo è stato preparato dal progetto CounselorBot per aiutare la
> scuola o l'università. **Non** è un parere legale e **non** attesta la conformità al GDPR: decidere, adattare e
> approvare il testo spetta al **Titolare** con il **DPO**. Le voci **[DA VALIDARE]** e
> **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** vanno decise prima di usare il documento. I riferimenti normativi non sono
> stati verificati sul testo ufficiale ([04 §Fonti](../04-decisioni-titolare-dpo.md#fonti-normative-e-stato-della-verifica)).

Versione: bozza 0.1 (2026-10-24).

> [!IMPORTANT]
> **Serve solo se la base giuridica della condivisione è il consenso** (04-D3). Se il Titolare sceglie un'altra base,
> questo modulo non va usato e la condivisione si descrive nell'informativa.
> **Stato tecnico**: oggi il docente vede già l'ultima versione del taccuino degli studenti delle sue classi
> (`backend/routes/groups.py:827`). Il consenso diventa effettivo solo con i grant (P7) e la registrazione dei consensi
> (P9, P10): **non usare questo modulo prima di quei rilasci** **[DA VALIDARE]**.

---

## Che cosa ti chiediamo

Alcune cose che scrivi su CounselorBot sono **tue**: il taccuino, gli obiettivi personali, il portfolio. Puoi scegliere
di mostrarle a un insegnante, così può aiutarti meglio.

- È **facoltativo**. Se dici di no, puoi usare CounselorBot come prima e **non ci sono conseguenze** su voti e giudizi.
- Puoi scegliere **una cosa sì e un'altra no**.
- Puoi **cambiare idea quando vuoi**.

Prima di firmare leggi l'[informativa per gli studenti](01-informativa-studente.md).

## 1. Chi sei e con chi condividi

- Nome utente su CounselorBot: ____________________ Classe: __________ Anno: **[DA COMPILARE]**
- Docente o docenti che possono vedere: **[DA COMPILARE: nome e materia]**
- Titolare del trattamento: **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** — DPO: **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**

Non servono altri dati personali (data di nascita, codice fiscale): il modulo raccoglie solo il necessario
**[DA VALIDARE: identificazione del firmatario]**.

## 2. Le tue scelte

Nessuna casella è già spuntata. Una casella vuota vale come «no».

| Che cosa | Che cosa vede il docente | Sì | No |
|---|---|---|---|
| **A. Taccuino** | obiettivo, difficoltà, punti di forza, contesto che hai scritto | ☐ | ☐ |
| **B. Obiettivi personali** | i tuoi obiettivi e come stanno andando | ☐ | ☐ |
| **C. Portfolio** | i lavori che hai salvato nel portfolio | ☐ | ☐ |
| **D. Sintesi di orientamento** | i riassunti delle conversazioni di orientamento | ☐ | ☐ |

Il docente **non** può modificare questi contenuti e **non** può mandarli all'AI senza una regola apposita
**[DA VALIDARE 04-D6]**.

## 3. Quanto dura

Fino a **[DA VALIDARE: fine dell'anno scolastico / fine dell'iscrizione alla classe]**, oppure finché non la ritiri.

## 4. Come ritirare il consenso

- Dalle impostazioni privacy di CounselorBot **[DA VALIDARE: disponibile dopo P10]**;
- oppure scrivendo a **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**.

Da quel momento il docente non vede più i contenuti. Quello che ha già visto prima resta lecito (art. 7(3) GDPR).

## 5. Firma

Luogo e data: ____________________

Firma della studentessa o dello studente: ____________________

### Per chi è minorenne

Chi deve firmare: **[DA VALIDARE 04-D7]**. La soglia dei 14 anni dell'art. 2-quinquies del Codice privacy riguarda i
servizi della società dell'informazione basati sul consenso: se si applichi qui dipende dalla base scelta (04-D3).

Genitore o tutore: ____________________ Firma: ____________________

**[DA VALIDARE: regole per la firma di un solo genitore]**

---

## Nota tecnica per la registrazione (P9)

Ogni scelta è un evento distinto `consent_given` / `consent_refused` / `consent_withdrawn` in `privacy_events`, con
finalità `teacher_sharing` **[DA VALIDARE: chiave]**, categoria (A-D), versione di questo documento, data e
`subject_pid`; nessun testo libero né nome. Un consenso dato crea un grant con base `consent` limitato alle categorie
scelte (02 §5.1); la revoca chiude il grant subito.

---

*Bozza P16 — da adottare solo dopo la revisione del Titolare e del DPO.*
