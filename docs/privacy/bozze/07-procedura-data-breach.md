# Procedura di gestione delle violazioni dei dati — CounselorBot

> [!CAUTION]
> **Bozza tecnica, non consulenza legale.** Questa procedura è stata preparata dal progetto CounselorBot per aiutare
> la scuola o l'università a gestire le violazioni dei dati personali (artt. 33-34 GDPR). **Non** è un parere legale e
> **non** attesta la conformità al GDPR: decidere, adattare e approvare il testo spetta al **Titolare** con il **DPO**.
> Le voci **[DA VALIDARE]** e **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** vanno decise prima di usare il documento.
> I riferimenti normativi non sono stati verificati sul testo ufficiale ([04 §Fonti](../04-decisioni-titolare-dpo.md#fonti-normative-e-stato-della-verifica)).

Versione: bozza 0.1 (2026-10-24). Decisione di riferimento: 04-D12.

---

## 1. Che cos'è una violazione

Una violazione di sicurezza che porta, per errore o illecitamente, a distruzione, perdita, modifica, divulgazione o
accesso non autorizzato a dati personali (art. 4(12)). Riguarda riservatezza, integrità e **disponibilità**: anche la
perdita di una chiave senza copia è una violazione.

## 2. Ruoli e contatti

| Ruolo | Chi | Recapito |
|---|---|---|
| Titolare (decide su notifica e comunicazione) | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** |
| DPO | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** |
| Referente tecnico L1 (server) | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** |
| Docente che usa l'app desktop (L2) | il docente stesso | — |
| Responsabili del trattamento (art. 28, obbligo di avvisare il titolare, art. 33(2)) | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO, 04-D2]** | **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** |

## 3. Scenari tipici

| Scenario | Livello | Primo contenimento | Elementi per valutare il rischio |
|---|---|---|---|
| Furto o perdita del PC del docente | L2 | revoca delle sessioni e del token del tunnel nominativo; cambio delle chiavi API nel portachiavi | cifratura del disco attiva? (i backup SQLite dell'app non sono cifrati) |
| Accesso abusivo al server o al database | L1 | isolare il server, ruotare `FORWARD_AUTH_SHARED_SECRET`, chiavi API e chiave Fernet, revocare le sessioni | i contenuti nel DB oggi sono in chiaro (P11 non attivo) |
| Testo con dati personali inviato a un provider di AI esterno | gateway | disattivare il provider o passare a un modello locale; chiedere al provider la cancellazione **[DA VALIDARE: possibilità contrattuale]** | il filtro non garantisce l'anonimato; ruolo e condizioni del provider (04-D10) |
| Docente che vede dati fuori dall'ambito | L1/L2 | sospendere l'accesso | oggi il sistema non limita i risultati alla classe (G5) né registra le consultazioni |
| Token del tunnel o sessione docente rubati | rete | rigenerare il token, riavviare il tunnel, revocare le sessioni | Cloudflare vede il traffico in chiaro |
| Perdita della chiave KEK senza kit di recupero | crittografia | cercare il kit (04-D14) | violazione di disponibilità dei dati cifrati |
| Backup copiato o smarrito | L1/L2 | individuare la copia, ruotare le chiavi contenute | backup L2 non cifrati; L1 non verificato |
| Errore di invio (Telegram, export) | L1/L2 | richiedere la cancellazione al destinatario | contenuto del messaggio |

## 4. Fasi

Tempi interni: **[DA VALIDARE 04-D12]**. Termini di legge: **[DA VALIDARE]** (riportati sotto come da GDPR, da
verificare sul testo ufficiale).

### Fase 1 — Segnalazione e contenimento

1. Chi nota il problema avvisa subito il referente tecnico e il DPO (§2), entro **[DA VALIDARE: termine interno]**.
2. Contenimento senza distruggere le prove: conservare i log prima di riavviare; annotare l'ora della scoperta.
3. Nessuna comunicazione esterna prima della decisione del Titolare, salvo urgenze **[DA VALIDARE]**.

### Fase 2 — Valutazione del rischio

Elementi da considerare:

- tipo di dati: identificativi, profili di apprendimento (QSA/ZTPI), testi liberi, possibili dati sulla salute (art. 9);
- **interessati minorenni**;
- numero di persone e di record;
- misure in essere: cifratura e posizione delle chiavi, pseudonimizzazione (che riduce ma non elimina il rischio);
- possibili danni: discriminazione, danno alla reputazione, disagio, furto d'identità.

Esito: nessun rischio probabile / rischio / rischio elevato. La motivazione va scritta in ogni caso.

### Fase 3 — Notifica al Garante (art. 33)

Se è probabile un rischio: notifica entro **[DA VALIDARE: 72 ore dalla conoscenza, art. 33(1)]**, con i motivi
dell'eventuale ritardo. Canale: **[DA VALIDARE: procedura telematica del Garante, indirizzo da verificare]**.
Contenuto minimo (art. 33(3)): natura della violazione, categorie e numero approssimativo di interessati e record,
contatti del DPO, conseguenze probabili, misure adottate o proposte. Si può completare in più fasi (art. 33(4)).

### Fase 4 — Comunicazione agli interessati (art. 34)

Se il rischio è elevato: comunicazione senza ingiustificato ritardo, in linguaggio semplice e adatto ai minori e alle
famiglie, con contatti del DPO, conseguenze probabili, misure adottate e consigli pratici. Esenzioni dell'art. 34(3)
(per esempio dati resi incomprensibili con cifratura e chiavi non compromesse): valutazione del Titolare **[DA VALIDARE]**.

### Fase 5 — Chiusura e registro (art. 33(5))

Ogni violazione, anche non notificata, va nel registro interno **[DA COMPILARE DA PARTE DEL TITOLARE/DPO: dove è tenuto]**
con i fatti, le conseguenze, le misure e la motivazione delle decisioni. Revisione della procedura dopo ogni evento.

---

## Allegato — Scheda del registro delle violazioni

```text
ID violazione: __________          Compilata da: __________
Data/ora dell'evento (presunta): __________   Data/ora della scoperta: __________
Livello: [ ] L1 server  [ ] L2 PC docente  [ ] L4 web  [ ] provider esterno  [ ] chiavi/backup
Tipo: [ ] riservatezza  [ ] integrità  [ ] disponibilità
Descrizione: ______________________________________________
Interessati (stima): ______  di cui minorenni: ______
Categorie di dati: [ ] account  [ ] risultati/profili  [ ] conversazioni  [ ] taccuino  [ ] art. 9  [ ] altro ____
Misure in essere (cifratura, chiavi, pseudonimizzazione): ______________________
Rischio: [ ] improbabile  [ ] rischio  [ ] rischio elevato   Motivazione: ____________
Notifica al Garante: [ ] sì, data ______ rif. ______   [ ] no, motivo ______
Comunicazione agli interessati: [ ] sì, data ______   [ ] no, motivo ______
Misure correttive: ______________________________________________
Chiusura: data ______   Titolare ______   DPO ______
```

---

*Bozza P16 — da adottare solo dopo la revisione del Titolare e del DPO.*
