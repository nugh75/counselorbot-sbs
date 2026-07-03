# Distinzione ruoli: docente, ricercatore, amministratore

> **Stato:** piano approvato nelle decisioni chiave (Daniele, 2026-07-03), da implementare.
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

## Stato attuale vs target — cosa manca

Gran parte della matrice è già vera. Delta da implementare:

1. **Delete piano ristretto al creatore**: in `delete_administration_plan`
   aggiungere `created_by_username == user` per i non-admin (oggi basta la
   visibilità). Admin resta con la sola guardia "senza risposte".
2. **Informativa transcript** nelle superfici di invito:
   - pagina web `/gruppo` (riga sotto il titolo del gruppo);
   - messaggio Telegram `group_login`/`group_enrolled`;
   - eventualmente landing `/avvio` (repo ai4auth, fuori da questo progetto).
3. **Verifica gate ricerca**: confermare che export validazione, risultati
   globali e codici anonimi usino `get_current_active_admin` (admin+ricercatori)
   e mai `get_current_plan_manager`. Audit rapido dei router `validation`,
   `survey` (risultati globali), `research_contacts`.
4. **UI per ruolo in `/docente`**: nascondere ai docenti ciò che fallirebbe
   comunque a backend (selettore contatti ricercatori nel form piano — già
   tollerato con lista vuota; nessun'altra superficie ricerca è montata lì).
5. **Test smoke**: delete negato a non-creatore; docente 403 su
   research-contacts e validazione; informativa presente nella pagina invito.

## Backlog aggiuntivo (Daniele, 2026-07-03)

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
