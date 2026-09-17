# CompassBot — Proposta di rebranding

Stato: **proposta** (2026-09-17, da validare con chi ha sollevato il problema e con i docenti/ricercatori).

## 1. Perché rebranding

Il nome attuale **"CounselorBot SBS"** presenta tre problemi, soprattutto per un pubblico inglese:

1. **"Counselor" evoca la terapia.** Per un madrelingua inglese "counselor" significa in primis *therapist* o un ruolo scolastico certificato (*guidance counselor*). "CounselorBot" si legge come "un bot che fa terapia", e obbliga l'utente a un over-promise sia clinico sia umano — che è esattamente il contrario di ciò che il progetto dichiara ("un supporto alla riflessione, in collegamento con l'accompagnamento umano").
2. **"Bot" da solo svende il prodotto**, ma il suffisso "-bot" è una scelta voluta (comunica subito che si tratta di un assistente AI) e va conservato: il problema non è il "-bot", è il prefisso.
3. **"SBS" collide con un brand noto** all'estero (l'emittente pubblica australiana Special Broadcasting Service) ed è confondibile — va tolto dal naming pubblico.

## 2. Il nuovo nome: CompassBot

**Scelta: CompassBot.**

| Criterio | CompassBot |
|---|---|
| Connotazione clinica in inglese | Assente: "compass" non tocca il territorio terapista/consulente |
| Coerenza col prodotto | La "Bussola" è già il tool di orientamento dell'app: il prodotto si chiama come il suo cuore |
| Semplice e internazionale | Leggibile e dicibile in tutte le 6 lingue supportate; l'icona a bussola traduce il significato da sola |
| Calore | "Compensa" il freddo di "-bot": un compasso ti orienta, non ti robotizza |
| "Bot" finale richiesto | ✓ conservato |

### Tagline (bozza)

| Lingua | Tagline |
|---|---|
| IT | CompassBot — trova la tua direzione negli studi e nella vita |
| EN | CompassBot — find your direction in study and life |
| ES | CompassBot — encuentra tu dirección en los estudios y en la vida |
| FR | CompassBot — trouve ta direction dans les études et dans la vie |
| DE | CompassBot — finde deine Richtung in Studium und Leben |
| SV | CompassBot — hitta din riktning i studierna och i livet |

### Backup (se il dominio/marchio "CompassBot" fosse occupato)

- **HelmsBot** (coerente coi timonieri: "helmsman" + "bot"; mette il ruolo al timone al centro del nome)
- **NorthBot** (stessa metafora di orientamento, più vocativo)
- **LumenBot** (luce/insight, meno esplicito sull'orientamento)

## 3. I "timonieri" al posto dei "counselor"

Con la metafora della bussola, le persone AI non sono "counselor": sono **timonieri**, chi tiene la barra e aiuta a tracciare la rotta. Nomi propri invariati (Clio, Giulio, Iride, …).

| Lingua | Ruolo (singolare) |
|---|---|
| IT | Timoniere |
| EN | Helmsman |
| ES | Timonel |
| FR | Timonier |
| DE | Steuermann / Steuerfrau |
| SV | Rorgängare |

> Nota: in inglese "helmsman" è corretto ma marcatamente nautico/arcaico. Si può usare anche
> il più semplice "helmsman / helmswoman" o, in contesti informali, "helmsmate". Da verificare
> in un test con studenti prima di fissare la traduzione EN definitiva.

Esempi di nuove frasi utente:

- IT: "Con quale timoniere vuoi parlare?" / "Scegli il tuo timoniere"
- EN: "Which helmsman would you like to talk to?" / "Choose your helmsman"
- IT: "Timoniere utilizzato" (survey), "Timoniere del tavolo" (Tavolo di lavoro), "Chiedi al timoniere"

## 4. Cosa cambia e cosa resta (ambito del refactor)

### Cambia (superficie visibile)

- Stringhe utente nei file i18n del frontend (`i18n-orientation.ts`, `i18n-survey.ts`, `i18n-tavolo.ts` e altre che espongono "counselor") → **timoniere**
- Titoli di pagina e meta (`- CounselorBot` → `- CompassBot`)
- Nome pubblico in README, docs pubbliche, protocolli di sperimentazione, presentazioni
- Località: `counselorbot` → `compassbot` solo dove è *visibile* (l'URL di produzione è già dietro proxy e `/counselorbot` reindirizza alla radice: per ora non si tocca la rotta)

### Resta (internals, non visibile all'utente)

- Identificatori di codice: `counselor_id`, modello `Counselor`, `backend/counselor_scope.py`
- Chiavi in localStorage (`counselorbot_selected_counselor`, etc.) e nomi evento
- Tabelle DB e valori interni
- La parola "counselor" nei testi per **docenti/ricercatori** (se si decide così, vedi open questions): lì il termine è un'etichetta di lavoro corretta

## 5. Identità visiva (direzione — allineare con `docs/design.md`)

- Icona/marchio: **rosa dei venti / ago della bussola**, eredita il simbolo già usato per la Bussola
- Colori/tipografia: invariati, salvo indicazioni di `docs/design.md`

## 6. Passi di validazione

1. Verifica dominio (compassbot.com / .it / .eu / .ai) e collisioni di marca (CompassBot, NorthBot, LumenBot)
2. Invio della mail di feedback a chi ha sollevato il problema (bozza in `rebranding-compassbot-feedback-email.md`)
3. [Opzionale] Mini-test con studenti: il nome + icona dicono "orientamento" senza leggersi "terapia"?
4. Se confermato: refactor solo delle stringhe UI (sezione 4)

## 7. Open questions

- "CompassBot" suona a chi conosce già l'app come "la Bussola" — male? o è un vantaggio (coesione)?
- Tenere "counselor" nei testi interni per docenti/ricercatori, o uniformare tutto a "timoniere"?
- Confermare l'abbandono di "SBS" dal nome pubblico (il repo può restare `counselorbot-sbs`).