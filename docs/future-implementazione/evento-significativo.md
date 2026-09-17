# Evento significativo — percorso guidato di rilettura di un evento

Data: 2026-09-17
Stato: proposta, nessun codice scritto
Strumenti: `EVENTO_STUDIO`, `EVENTO_PROFESSIONALE`
Nome visibile: Evento significativo (di studio / professionale)

## Problema

Gli strumenti narrativi attuali guardano la persona per intero: Savickas
ricostruisce la storia di vita, Idea mette a fuoco un pensiero ancora informe.
Manca il gesto opposto, stringere su **un solo episodio** e rileggerlo: una
lezione, un esame, una riunione, un colloquio, un lavoro di gruppo andato in un
certo modo.

`EVENTO_STUDIO` ed `EVENTO_PROFESSIONALE` esistono già come tipi di libretto
(commit `c06e88b`, `d3bbb12`), ma nel database non hanno nessuno step guidato:
la persona compila la scheda da sola, senza nessuno che la aiuti a separare il
fatto dal giudizio.

## Origine e perimetro

L'idea viene dal *Portfolio del docente in formazione* del percorso PeF60 di
Roma Tre (DPCM 4 agosto 2023). Di quello strumento prendiamo la filosofia, non
la forma: CounselorBot non si sovrappone al portfolio universitario e non lo
sostituisce.

Il percorso **non fa**:

- nessun campo anagrafico, nessun export nel formato dell'università;
- nessuna descrizione di casi di altre persone (alunni con BES, colleghi): la
  lente dell'inclusione vale per la propria esperienza, mai per dati di terzi;
- nessuna variante per pubblico: stesso percorso per studenti e adulti;
- il modello non scrive la riflessione: fa domande, restituisce, offre lenti.

## Principi presi dal portfolio

1. **L'evento significativo è l'unità di riflessione**, non "come sono in
   generale".
2. **Prima i fatti, poi il giudizio**: il diario descrive, il portfolio
   interpreta.
3. **Lettura bilanciata**: punti di forza e criticità dello stesso evento.
4. **Il sapere come lente**: si interpreta l'evento alla luce di ciò che si è
   imparato.
5. **Sguardo diacronico**: più eventi nel tempo mostrano come cambia la
   propria competenza.
6. **Inclusione come lettura del contesto**: barriere e facilitatori, non
   deficit.
7. **Chiudere il ciclo**: dal portfolio manca il passo "e la prossima volta";
   qui lo aggiungiamo (ciclo ALACT di Korthagen).

## Decisioni prese (2026-09-17)

| # | Decisione | Scelta |
|---|---|---|
| D1 | Codici | Due strumenti, `EVENTO_STUDIO` e `EVENTO_PROFESSIONALE`, con step propri. Si sceglie l'ambito dalla scheda del catalogo; le statistiche restano separate per codice |
| D2 | Nome | "Evento significativo", coerente con le etichette dei libretti esistenti |
| D3 | Varianti per pubblico | No |
| D4 | Esito | Libretto dell'evento compilato a fine percorso, salvato solo su conferma esplicita |

Costo noto di D1: gli step esistono due volte nel database e una modifica dal
pannello admin va fatta su entrambi. Per contenerlo, i testi di fabbrica
vivono una volta sola in `backend/prompts/` con un segnaposto d'ambito, e i due
elenchi di step si costruiscono dagli stessi file.

## Cornice teorica

Prompt meta `meta_evento_reflective_practice`, gemello di
`meta_savickas_career_construction`. Bozza:

```text
[REFLECTIVE PRACTICE FRAME]
This path looks back at one significant event, in the reflective-practice
tradition: Schön's reflection-on-action, Tripp's critical incidents and
Korthagen's ALACT cycle (action, looking back, awareness of essential aspects,
creating alternatives, trial).
An event is not significant because it was dramatic: it becomes significant
through the meaning the person gives it. An ordinary lesson, meeting or
exchange can hold more than a crisis.
Four habits carry the path:
1. FACTS BEFORE JUDGEMENT — first what happened, then what it means. A
   judgement that arrives early closes the reading before it starts.
2. BOTH SIDES OF THE SAME EVENT — what worked and what did not live in the same
   event; neither cancels the other.
3. PERSON AND CONTEXT — difficulties and resources are the meeting of a person
   and a setting, with barriers and facilitators as in the ICF, never a flaw of
   the person or someone else's fault.
4. KNOWLEDGE AS A LENS — concepts, readings and profile results are offered as
   questions to look through, never as the verdict on what happened.
The person is the author of the reading: you keep the thread and give back
what you heard, in their words. Other people in the event are roles (a
classmate, the tutor, a colleague), never names.
```

## Il percorso

Stessa struttura di Savickas: presentazione, patto, cinque step di intervista,
sintesi. Id con prefisso per strumento (`evstudio-*`, `evprof-*`), modi
`evento-interview` ed `evento-summary`.

| # | Id (suffisso) | Etichetta | Cosa fa il counselor |
|---|---|---|---|
| -1 | `intro` | Presentazione | Spiega che si lavora su un evento solo, senza punteggi |
| 0 | `patto` | Patto di collaborazione | Obiettivo, durata, metodo, la regola sui ruoli; conferma esplicita |
| 1 | `evento` | L'evento | Quale evento, perché è rimasto, quando, che ruolo aveva la persona |
| 2 | `fatto` | Il fatto | Solo l'osservabile; poi, separato, cosa pensava e sentiva |
| 3 | `funzionato` | Cosa ha funzionato | Azioni proprie, delle altre persone, facilitatori del contesto |
| 4 | `criticita` | Cosa non ha funzionato | Scelte proprie e altrui, barriere del contesto, cosa mancava |
| 5 | `rilettura` | Rilettura | Cosa è essenziale; al massimo due lenti, formulate come domande |
| 6 | `final` | Sintesi e prossima volta | Ritratto, alternative, una cosa da provare |

Il ruolo nell'evento ha tre valori: **protagonista** (ha agito), **osservatore**
(ha guardato), **affiancato** (ha agito insieme a qualcuno). Nasce dalla
distinzione del portfolio tra esperienze nelle proprie classi e nel tirocinio,
ed è utile anche a uno studente: si impara guardando un compagno, un docente,
un collega.

### Bozze degli step prompt

`{domain}` vale `study` per `EVENTO_STUDIO` e `work` per `EVENTO_PROFESSIONALE`.
Ogni step termina come in Savickas: mini-sintesi e `[[AVANZA_STEP]]` sull'ultima
riga, con avanzamento deciso dalla persona tranne che nella sintesi.

**patto** — Start of the significant-event path: build the agreement. Briefly
explain the goal (looking back at one single event from their {domain}
experience to understand it, not to judge it), the duration (5 steps + summary),
the method (first the facts, then the reading), the roles (you ask and give
back, they interpret) and one rule: other people are named by role, never by
name, and nobody else's health information is written down. Ask for an explicit
confirmation ('If you agree, write: I accept'). Do NOT advance until there is a
clear confirmation. When it arrives, close the step and on the last line put
only [[AVANZA_STEP]].

**evento** — Significant event, step 1 of 5: the event. Ask which single event
from their {domain} experience they want to look back on, and why it stayed with
them. It does not need to be dramatic: it matters because they chose it. In a
later turn ask roughly when it happened and what their role was: did they act,
watch, or act alongside someone? When event, date and role are clear, restate
them in one sentence and on the last line put only [[AVANZA_STEP]].

**fatto** — Significant event, step 2 of 5: what happened. Ask them to tell it
as a camera would have recorded it: where, who (by role), what was done and
said, in what order. Do not interpret, judge or advise. If they judge ("it went
badly", "he was unfair"), acknowledge it and ask what someone present would have
seen. Only after the facts, in a later turn, ask what they were thinking and
feeling at the time, kept apart from the facts. Then give a short factual
mini-summary and on the last line put only [[AVANZA_STEP]].

**funzionato** — Significant event, step 3 of 5: what worked. Ask what worked:
what they did, what other people did, and what in the setting helped (time,
space, tools, rules, climate). Look for at least one facilitator outside
themselves. Do not turn it into praise: stay with what they name. Give a
mini-summary and on the last line put only [[AVANZA_STEP]].

**criticita** — Significant event, step 4 of 5: what did not work. Ask what did
not work or was missing: their choices, other people's, and what in the setting
got in the way. Read each difficulty as the meeting of a person and a setting,
never as a flaw of the person or a verdict on someone else. No advice yet. Give a
mini-summary and on the last line put only [[AVANZA_STEP]].

**rilettura** — Significant event, step 5 of 5: reading it again. Ask what,
looking back, seems essential in this event. Then offer at most two lenses, each
as a question, drawn from what you know of the person (their notebook, a profile
if they have one, readings or concepts they have met) or from general ideas about
learning and working with others. They choose the lens and do the interpreting:
you do not supply the meaning. When their reading is in their own words, give it
back and on the last line put only [[AVANZA_STEP]].

**final** — Final summary of the significant-event path. Give back, in the
person's words: 1) the event in one sentence, with date and role; 2) what
worked; 3) what did not; 4) their reading; 5) two or three alternative ways to
act in a similar situation; 6) the one thing they choose to try, and when.
Distinguish proposals from commitments: an alternative they did not choose is
not a commitment. On the last line put only [[AVANZA_STEP]].

### Domande suggerite

Frasi di avvio per step, seminate in `guided_step_questions_seed.py` nelle sei
lingue. Esempi in italiano:

- evento: "L'evento che mi è rimasto è…", "Mi è rimasto perché…"
- fatto: "È successo che…", "Io ho detto/fatto…", "In quel momento pensavo…"
- funzionato: "Ha aiutato che…", "Una cosa che ho fatto bene…"
- criticità: "Mi è mancato…", "Nel contesto ha ostacolato…"
- rilettura: "Guardandolo oggi, l'essenziale è…"
- sintesi: "La prossima volta provo a…"

## Esito: il libretto dell'evento

Alla fine della sintesi il modello emette un blocco privato, rimosso dalla
risposta prima dello streaming, dei log e degli export, come già il blocco
`recommendations` (`backend/recommendation_blocks.py`) e la patch della mappa
Idea. La conclusione mostra un modulo precompilato e modificabile; si salva
solo con conferma esplicita e crea una nuova scheda del libretto con
`POST /user/student-booklets/instrument/{type}`, che esiste già.

| Contenuto | Campo `StudentBooklet.data` |
|---|---|
| Titolo dell'evento | `title` |
| Data | `bio_date` |
| Contesto | `bio_context` |
| Ruolo (protagonista / osservatore / affiancato) | `event_role` (nuova chiave JSON, nessuna migrazione) |
| Cosa ha funzionato | `strength[]` |
| Cosa non ha funzionato | `growth_area[]` |
| Rilettura | `discovery` |
| Cosa provo | `objective` |
| Come e quando | `strategy` |

Se il blocco manca o non è valido, il modulo si apre vuoto: nessuna scrittura
automatica, nessuna chiamata AI aggiuntiva.

## Cosa tocca nel codice

L'appartenenza di uno strumento vive in liste sparse (vedi
`test_every_gate_that_would_silently_exclude_idea_lets_it_through`). Savickas
compare in circa 24 file backend e 26 frontend.

**Backend**

- `prompt_config.py`: `DEFAULT_EVENTO_STUDIO_GUIDED_STEPS`,
  `DEFAULT_EVENTO_PROFESSIONALE_GUIDED_STEPS`, modi in
  `MODE_TO_SYSTEM_PROMPT_KEY`, voci di config per i prompt di sistema e meta;
  testi in `backend/prompts/` una volta sola con `{domain}`.
- `main.py`: seed se non esistono step per il tipo (come il blocco Savickas).
- `chat_logic.py`: `_ensure_questionnaire_guided_steps`, eventuale famiglia in
  `_INSTRUMENT_FAMILIES`; `evento-summary` **non** entra nell'elenco dei modi
  con consigli certificati (non esiste materiale certificato per gli eventi).
- `guided_step_label_i18n.py`, `guided_step_questions_seed.py`: sei lingue.
- `routes/survey.py`: `_final_step_summary` (id di sintesi);
  `STUDENT_BOOKLET_TYPES` contiene già i due codici.
- `routes/memory.py` (`MEMORY_QUESTIONNAIRE_TYPES`), `schemas.py`
  (`FROZEN_SESSION_TYPES`), `skills_seed.py` (`ENGINE_INSTRUMENTS` sì,
  `SEEDED_INSTRUMENTS` no, come Idea).
- `orientation.py`, `tool_brief_seed.py`: la Bussola deve saperli descrivere e
  proporre (parole chiave: evento, episodio, tirocinio, "è successo").
- `prompt_audit.py`: applicabilità di `[[AVANZA_STEP]]`.
- `pdf_generator.py`: il ramo narrativo già include i due codici; verificare il
  report di sessione.
- `telegram_state.py`: da decidere (vedi questioni aperte).

**Frontend**

- `lib/questionnaires.ts`: i due codici entrano in `QuestionnaireType`; oggi
  `EVENT_BOOKLET_TYPES` in `StudentBookletCard.tsx` li tiene fuori, e
  `isQuestionnaireType` decide le opzioni fattore del libretto (riga 133 esclude
  solo SAVICKAS): va esteso agli eventi.
- `lib/tool-catalog.ts`: categoria `guided`.
- `GuidedChatInterface.tsx`: il comportamento da intervista narrativa è cablato
  su `'SAVICKAS'` e sugli id `savickas-patto` / `savickas-final` (accettazione
  del patto senza AI, istruzioni di step nel messaggio, avanzamento deciso
  dall'utente, risposte rapide, step di riserva, riga punteggi). Va
  generalizzato in un helper per la famiglia "intervista narrativa" con id di
  patto e sintesi per strumento. È il punto più rischioso: Savickas deve
  restare identico.
- Liste sparse: `questionario/page.tsx`, `strumenti/[id]/page.tsx`,
  `profilo/page.tsx`, `ProfileVisualization.tsx`, `profile-tracker.ts`, pannelli
  admin (`LogViewer`, `PromptExportPanel`, `SkillsPanel`, `CounselorsPanel`,
  `QuestionnaireResultsViewer`, `ConfigForm`).
- `i18n.ts`, `i18n-survey.ts`, `i18n-admin.ts` nelle sei lingue;
  `npm run i18n:check`.

**Test**

- Estendere il test dei cancelli ai due codici (o generalizzarlo per strumento).
- Savickas invariato dopo la generalizzazione della famiglia narrativa.
- Il blocco privato del libretto non arriva allo studente, ai log, agli export.
- Nessuna scrittura del libretto senza conferma.

## Fasi

1. **Backend**: step, prompt, modi, cancelli, seed. La sessione si apre con
   `/?start=EVENTO_STUDIO`.
2. **Frontend**: famiglia "intervista narrativa" in `GuidedChatInterface`,
   catalogo, liste, i18n.
3. **Libretto**: blocco privato, modulo precompilato, salvataggio confermato.
4. **Bussola**: descrizione e proposta dei due strumenti.
5. **Dopo**: sintesi di secondo livello su più eventi della stessa persona (fili
   che ritornano, criticità che scompaiono), da agganciare a
   `/profilo/cambiamenti`.

## Questioni aperte

- Telegram nella prima versione, o solo web?
- Collegamento inverso: dalla scheda libretto in area personale, "rileggi con
  il counselor"?
- Le lenti del passo 5 possono citare le letture certificate, o solo concetti
  generali e ciò che la persona ha già incontrato?
- Una sessione per evento: confermare che non serve rileggere più eventi nella
  stessa sessione.
