# Distinzione ruoli: docente, ricercatore, amministratore

> **Stato:** implementato in `feature/telegram-bot` (2026-07-03).
> **Ambito:** cosa può fare ciascun ruolo su gruppi/piani, dati studenti e strumenti di ricerca.
> **Prerequisito:** membership gruppi + dashboard docente (vedi `telegram-gruppi-docenti.md`).

## Decisioni prese (Daniele, 2026-07-03)

1. **Eliminazione piano**: chi l'ha creato, solo se senza risposte (regola attuale,
   da restringere: oggi può eliminare chiunque veda il piano, non solo il creatore).
2. **Transcript**: il docente può leggere le conversazioni AI degli studenti del suo
   gruppo, ma la pagina di invito deve dichiararlo esplicitamente allo studente.
3. **Anonimato ricerca**: il ricercatore vede gli username reali (spesso già
   pseudonimi ospite ai4auth), come ora.
4. **Creazione piani**: il docente crea le sue classi in autonomia.

## Matrice dei permessi (target)

| Azione | Docente | Ricercatore | Admin |
|---|---|---|---|
| Creare piani/classi | ✅ propri | ✅ propri | ✅ |
| Vedere piani | solo propri/referente | propri/referente | tutti |
| Modificare/archiviare piano | ✅ propri | ✅ propri | ✅ tutti |
| Eliminare piano | solo se creatore E senza risposte | idem | ✅ (senza risposte) |
| Link invito web/Telegram, elenco iscritti | ✅ | ✅ | ✅ |
| Profili, punteggi, learner model iscritti | ✅ | ✅ | ✅ |
| Transcript conversazioni iscritti | ✅ (con informativa) | ✅ (con informativa) | ✅ |
| Note e messaggi agli studenti | ✅ | ✅ | ✅ |
| Anagrafica contatti ricerca | ❌ | ✅ | ✅ |
| Export validazione / codici anonimi / risultati globali | ❌ | ✅ | ✅ |
| Console `/admin` (config AI, counselor, prompt, log, costi) | ❌ | solo tab ricerca | ✅ |
| Gestione/revoca collegamenti Telegram | ❌ | ❌ | ✅ |

## Implementazione completata

Delta chiusi nel progetto `counselorbot-sbs`:

1. **Delete piano ristretto al creatore**: i non-admin possono eliminare solo
   piani creati da loro e senza risposte; admin conserva la guardia "senza
   risposte".
2. **Informativa transcript**: presente nella pagina web `/gruppo` e nel
   messaggio Telegram `group_login`.
3. **Gate ricerca verificati**: contatti ricerca, export validazione e risultati
   globali restano su `get_current_active_admin` (admin+ricercatori), non su
   `get_current_plan_manager`.
4. **Classi autonome**: aggiunta pagina "Gruppi e classi" in `/admin` e
   `/docente`; la classe è entità autonoma, con link web/Telegram e codice
   inseribile dal profilo studente. I piani di somministrazione possono
   agganciarsi a una classe.
5. **Suggerimenti docente/ricercatore nel profilo**: la card studente è stata
   rinominata e alimentata dai messaggi/note visibili lasciati sulla classe.
6. **Compatibilità dati legacy**: migrazione idempotente da `plan_memberships`
   a `student_groups`/`group_memberships` per vecchie iscrizioni legate ai piani.
7. **Test smoke**: coperti delete non-creatore, classi autonome, join web,
   transcript, note/messaggi e deep link Telegram.

Fuori da questo repository resta solo l'eventuale informativa sulla landing
`/avvio` del repo ai4auth.

## Backlog aggiuntivo (Daniele, 2026-07-03) — completato in questo repo

1. **Pagina "Gruppi e classi" in `/admin`**: sezione dedicata a gruppi/classi come
   concetto proprio, indipendente dal tab "Somministrazioni" (oggi i gruppi vivono
   solo dentro i piani di somministrazione). Da chiarire in fase di design se la
   classe resta un piano sotto il cofano o diventa entità autonoma senza strumento
   associato.
2. **Sezione "Suggerimenti del docente/ricercatore" in `/profilo`**: evoluzione
   della card "Dal docente" — spazio esplicito per i suggerimenti che docente o
   ricercatore lasciano allo studente.

## Non cambia

- Visibilità per-piano (`_visible_plan_query`): già corretta per i tre ruoli.
- `get_current_plan_manager` (admin | ricercatore | docente) per le route piani.
- Username reali visibili a docente e ricercatore nei propri piani.
- Poteri admin esistenti (telegram links, config, counselor, ecc.).
