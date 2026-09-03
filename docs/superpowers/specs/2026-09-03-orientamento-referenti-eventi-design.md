# Referenti ed eventi di orientamento: catalogo certificato, skill e directory

Data: 2026-09-03
Branch: `feature/orientation-referrals`
Parente stretto: `2026-08-21-skills-engine-design.md` (motore skill), catalogo
letture certificate (`certified_readings`)

## Problema

Il sistema sa consigliare una strategia e una lettura, ma non sa dire *a chi
rivolgersi*. Una parte consistente dell'orientamento non è un consiglio di
metodo: è sapere che esiste uno sportello d'ascolto, che il referente DSA
riceve il martedì, che l'open day è il 12 marzo e che le iscrizioni scadono il
20. Sono informazioni locali, verificabili e deperibili — le tre proprietà che
i cataloghi attuali non gestiscono.

Il modello non può inventarle. Un contatto sbagliato dato a uno studente che
chiede aiuto per un disagio non è un'imprecisione: è un danno. Quindi vale la
stessa regola dei cataloghi esistenti — entra solo materiale certificato da un
admin — più una regola nuova che i libri non richiedono: **il materiale scade**.

## Decisioni prese (2026-09-03)

| # | Decisione | Scelta |
|---|---|---|
| D1 | Come agganciare figure ed eventi all'istituto | entità `Institution` dedicata |
| D2 | Chi popola e certifica il catalogo | solo admin, come letture e strategie |
| D3 | Quando la skill entra in chat | su intent esplicito, su tutti gli strumenti |
| D4 | Da dove viene l'istituto dello studente | taccuino, con fallback sulla classe |

## 1. I dati

Tre tabelle nuove e una colonna. I testi rivolti allo studente stanno in campi
JSON per lingua (sei lingue), come `CertifiedReading` e non come
`CertifiedStrategy`: una colonna per lingua costringe a ricadere sull'italiano
per francese e tedesco, e qui il francese serve.

### `Institution`

```
id, slug (unique, index), name
kind                  school | university
website_url
orientation_page_url  la pagina istituzionale dell'orientamento
is_active
created_at, updated_at
```

Esiste perché l'URL della pagina istituto deve stare scritto una volta sola, e
perché un istituto con dieci classi non va ridichiarato dieci volte. Il testo
libero `student_groups.school`, che oggi è l'unico appiglio, non regge il
confronto fra «Liceo Galilei» e «L.S. Galilei».

### `OrientationReferral` — la figura

```
id, slug (unique, index)
institution_id        nullable; NULL = riga nazionale, valida per tutti
role_label_i18n       {lang: "Sportello d'ascolto"}   RUOLO o UFFICIO
person_name           nullable, opzionale
needs                 ["disagio-emotivo", ...]        chiave d'aggancio
audience              ["secondaria", "universita", "adulti"]
questionnaire_types   opzionale, limita a certi strumenti
contact_channel       {email, page_url, hours, location}
what_for_i18n         {lang: "cosa puoi chiedere a questa figura, una frase"}
how_to_reach_i18n     {lang: "come la raggiungi"}
source_reference, certified_by
status                draft | certified
is_active, sort_order, created_at, updated_at
```

L'identità primaria è il **ruolo**, non la persona: uno sportello sopravvive a
chi lo tiene, e una riga che nomina una persona invecchia in un anno.
`person_name` resta possibile ma facoltativo, e solo per figure già pubbliche
sul sito dell'istituto.

### `OrientationEvent` — l'evento

```
id, slug (unique, index)
institution_id        nullable; NULL = riga nazionale
kind                  open-day | workshop | sportello | fiera | scadenza | webinar
title_i18n, summary_i18n
starts_at, ends_at    timezone-aware; ends_at governa la scadenza
registration_deadline nullable
page_url              obbligatorio in certificazione
location, is_online
needs, audience
status, is_active, sort_order, created_at, updated_at
```

### Colonna nuova

`student_groups.institution_id INTEGER` — serve al fallback (§3).

## 2. Il vocabolario dei bisogni

Nuovo modulo `backend/referral_needs.py`, vocabolario chiuso sul modello di
`reading_themes.py`:

```
scelta-percorso · metodo-di-studio · disagio-emotivo · dsa-bes
tirocinio-lavoro · borse-e-tasse · mobilita-estero · iscrizioni-scadenze
```

I temi di lettura non sono riusabili. «ansia-e-prestazione» descrive di cosa
parla un romanzo, non quale servizio serve: sono due tassonomie che rispondono
a domande diverse, e sovrapporle produrrebbe agganci casuali.

Vale la regola dei cataloghi esistenti: **una riga senza `needs` non entra
mai**. Niente jolly.

## 3. Scoping — `backend/referral_scope.py`

```
1. taccuino.institution_slug risolve a un istituto attivo   → quello
2. altrimenti GroupMembership → StudentGroup.institution_id  (classi attive,
                                                              anche più d'una)
3. in aggiunta, sempre: le righe nazionali (institution_id IS NULL)
```

Il taccuino vince perché è la persona a dichiararlo, e uno studente può
appartenere a una classe creata da un ricercatore esterno che non è la sua
scuola. La classe è il fallback perché copre chi il taccuino non lo apre mai.

**Caso di bordo, deciso esplicitamente.** La voce «non trovo il mio istituto»
viene salvata come sentinella perché l'interfaccia non richieda la scelta a
ogni apertura del taccuino, ma **la risoluzione la ignora**: non trovarlo in
elenco non significa che la propria classe non lo sappia, quindi il fallback
scatta lo stesso.

## 4. Retrieval — `backend/orientation_referral_service.py`

Gemello di `certified_reading_service`, con due differenze sostanziali.

Filtri comuni: `status == "certified"`, `is_active`, `needs ∩ richiesti ≠ ∅`,
`audience_allows()` (riuso di `reading_audience.py`),
`institution_id ∈ {istituti risolti} ∪ {NULL}`. In più, per le sole figure,
`questionnaire_types` quando dichiarato: un evento non si limita a uno strumento.

**Gli eventi scadono.** `ends_at >= now()`, ordinati per `starts_at`
crescente: il prossimo per primo. Un open day passato sparisce senza che
nessuno lo cancelli, e il catalogo non richiede manutenzione periodica.

**Niente embedding.** Le letture usano `memory_embedder` perché il catalogo è
grande e il match è sfumato. Qui i bisogni sono otto e discreti: il match
insiemistico basta, e un embedding aggiungerebbe latenza e non-determinismo su
un problema che non ce l'ha.

`render_context(entries, language)` produce il blocco `[REFERRALS]`, con figure
ed eventi separati.

## 5. La skill `referral-guide`

### Handler

`orientation_referrals` in `skills/handlers.py`, whitelisted come gli altri,
`slot="knowledge"`. Chiama `referral_scope` per gli istituti, poi il servizio
di retrieval. `applicable=False` con motivo quando il catalogo non ha nulla per
quel bisogno: le istruzioni statiche cadono con lui, come per ogni skill.

Parametri: `limit_referrals` (default 2), `limit_events` (default 2).

### Istruzioni

`REFERRAL_GUIDE_INSTRUCTIONS_EN` in `skills_seed.py`, contratto in inglese come
tutte le altre:

```
## Referral and event guidance

- Name only the people, offices and events listed in [REFERRALS]. Never invent
  a name, an address, an email, an opening time or a date.
- Suggest at most two figures and two events.
- For each figure, say in one sentence what the student can bring to them, then
  how to reach them, in their words.
- A referral is an option, never an instruction: the student decides.
- If the catalogue holds nothing for what they asked, say so plainly and point
  to the institution's orientation page. Do not fill the gap from memory.
- A referral never replaces urgent help. If the student describes something
  that cannot wait, say that first and do not turn it into a list of offices.
- Never show internal identifiers, slugs or need codes.
```

### Attivazione

Nuovo intent `referral` in `skills/intents.py`, multilingua sul modello degli
altri pattern: *a chi (mi) posso rivolgere*, *sportello*, *tutor*, *open day*,
*orientamento*, *who can I talk to*, *help desk*, *quién puede ayudarme*,
*à qui m'adresser*, *an wen kann ich mich wenden*, *vem kan jag prata med*.

```
conditions: {"intents": ["referral"]}
routing:    optional
slot:       knowledge
```

Aggancio `GuidedStepSkill` su tutti gli `ENGINE_INSTRUMENTS` con
`step_id = "*"`. La skill entra solo quando lo studente chiede davvero: nessun
turno si riempie di contatti non richiesti.

### Seed

Marker nuovo `skills_orientation_referral_v1`. Il seed è **append-only**: non
tocca righe esistenti, come impone la regola sui prompt degli step.

## 6. Admin

`routes/institutions.py` — CRUD minimo.

`routes/orientation_referrals.py` — CRUD per figure ed eventi, più
`_guard_certification` sul modello di `routes/certified_readings.py`. Una riga
non diventa `certified` se:

- ha `needs` fuori vocabolario, o non ne ha nessuno;
- non ha `what_for_i18n` in italiano o in inglese (figura);
- non ha un canale di contatto (figura);
- non ha `page_url` o `ends_at` (evento).

Avviso non bloccante quando l'email del contatto non sta su un dominio
dell'istituto: un blocco duro sbaglierebbe sui servizi consorziati fra scuole.

`OrientationReferralsPanel.tsx` ricalcato su `CertifiedReadingsPanel.tsx`: due
schede (figure | eventi), selettore istituto, filtro per bisogno. Più il
selettore istituto nel pannello classi del docente.

## 7. Il taccuino

`institution_slug` entra in `LEARNER_PROFILE_FIELDS` e in `LearnerProfileSave`.
Nell'interfaccia è il primo campo non testuale del taccuino: `FIELDS` in
`LearnerProfileCard.tsx` prende un `type: 'select'`, con opzioni da un endpoint
pubblico `GET /institutions` (id, slug, nome, tipo, nient'altro).

**Slug e non id.** Le revisioni del taccuino sono append-only e sono storia:
fra due anni la riga deve restare leggibile. `liceo-galilei-roma` resta
significativo, `47` no. E il valore passa così com'è dalla pipeline esistente,
che tratta ogni campo come stringa con cap a 600 caratteri.

**«Non trovo il mio istituto» è un'opzione, non un campo libero.** Un testo
libero riporterebbe dentro il matching fragile che l'entità `Institution`
esiste per evitare.

**L'istituto non entra nel prompt.** Il taccuino viene iniettato nell'envelope
della chat, e il nome dell'istituto di un minorenne è un dato
quasi-identificante. `institution_slug` va escluso dalla serializzazione del
learner model verso il modello: è una chiave di retrieval, non un fatto da
raccontare al counselor. Al modello arrivano le figure già filtrate, mai la
scuola.

## 8. Sezione «Orientamento» nell'area personale

Voce nuova in `PERSONAL_AREAS` (`frontend/src/app/profilo/page.tsx`), slug
`orientamento`, accanto a taccuino e libretto.

```
Il tuo istituto: Liceo Galilei — pagina orientamento ↗   [cambia → taccuino]

── Prossimi appuntamenti ─────────────────────────
  12 mar  Open day                    [scelta-percorso]
          in presenza · aula magna · pagina ↗
  20 mar  Scadenza iscrizioni         [iscrizioni-scadenze]

── A chi rivolgerti ──────────────────────────────
  Sportello d'ascolto                 [disagio-emotivo]
    Cosa puoi chiedere: ...
    mar e gio 10-12 · aula 12 · sportello@liceogalilei.it

  [filtro per bisogno: chips dal vocabolario]
```

Endpoint `GET /orientation-directory?lang=` → `{institution, events[], referrals[]}`.

Riusa lo stesso servizio **senza il gate sui bisogni**. Quel gate esiste perché
la chat non inietti materiale non pertinente al turno; una directory invece
deve mostrare tutto quello che riguarda il proprio istituto. Restano attivi
`audience`, `status` e la scadenza degli eventi.

Effetto utile: gli eventi che nessun bisogno mappa bene — una fiera, una
scadenza amministrativa — hanno finalmente un posto dove essere visti anche
quando la chat non li tira mai fuori.

Stato vuoto onesto e utile: chi non ha scelto l'istituto legge *«scegli il tuo
istituto nel taccuino per vedere i referenti della tua scuola»*, con il link.

## 9. PII e minori

Il modello non riceve mai un contatto personale. Lo schema accetta il canale
istituzionale — email d'ufficio, pagina, orari, stanza — e `person_name` resta
opzionale, per figure già pubbliche sul sito dell'istituto.

`disagio-emotivo` è il bisogno dove un rimando sbagliato fa danno vero: il
contratto della skill dice esplicitamente che un referente non sostituisce un
aiuto urgente, e che davanti a qualcosa che non può aspettare non si risponde
con un elenco di uffici.

Si innesta sulla policy di anonimizzazione già attiva verso i provider esterni.

## 10. Migrazione

`create_all` crea da sé le tre tabelle nuove. Per la colonna serve una riga
nella lista di `ALTER` idempotenti allo startup (`main.py`, ~riga 342):

```python
("student_groups", "ADD COLUMN institution_id INTEGER"),
```

## 11. Test

`backend/tests/test_orientation_referrals.py`

- un evento con `ends_at` passato non viene mai restituito;
- gli eventi escono ordinati per `starts_at` crescente;
- una riga senza `needs` non entra mai, nemmeno con l'istituto giusto;
- il filtro `audience` esclude la fascia sbagliata;
- catalogo vuoto per quel bisogno → `applicable=False` con motivo;
- `needs` fuori vocabolario → certificazione rifiutata con 400;
- evento senza `page_url` → certificazione rifiutata.

`backend/tests/test_referral_scope.py`

- taccuino valorizzato → vince sull'istituto della classe;
- taccuino vuoto → istituti delle classi attive;
- sentinella «non trovo il mio istituto» → il fallback scatta lo stesso;
- nessun taccuino e nessuna classe → solo righe nazionali;
- istituto disattivato → trattato come non dichiarato.

Più il parity test delle skill, già presente, che va esteso alla skill nuova.

## 12. Fuori scope

Niente notifiche o promemoria sugli eventi. Niente import da calendari o dai
siti delle scuole. Niente eventi ricorrenti. Niente prenotazione dello
sportello. Niente embedding sul catalogo. Niente creazione di istituti o
referenti da parte del docente: D2 dice admin, e allargarlo è una decisione
sui permessi da prendere insieme al piano ruoli, non qui.
