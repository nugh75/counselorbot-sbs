# Politica di conservazione e cancellazione — CounselorBot

> [!CAUTION]
> **Bozza tecnica, non consulenza legale.** Questo documento è stato preparato dal progetto CounselorBot per aiutare
> la scuola o l'università a fissare i tempi di conservazione (art. 5(1)(e) GDPR) e a gestire i diritti degli
> interessati (artt. 12, 15-22). **Non** è un parere legale e **non** attesta la conformità al GDPR: decidere, adattare
> e approvare il testo spetta al **Titolare** con il **DPO**. Le voci **[DA VALIDARE]** e
> **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]** vanno decise prima di usare il documento. I riferimenti normativi non sono
> stati verificati sul testo ufficiale ([04 §Fonti](../04-decisioni-titolare-dpo.md#fonti-normative-e-stato-della-verifica)).

Versione: bozza 0.1 (2026-10-24). Decisione di riferimento: 04-D5. Attuazione tecnica: blocco P14.

---

## 1. Stato attuale

- L'unica conservazione automatica riguarda la tabella `logs`: `log_retention_days`, default **90 giorni**
  (`backend/chat_logic.py:165`), modificabile dall'amministratore.
- La memoria di sessione in `SESSION_MEMORY_DIR` ha una pulizia delle sessioni scadute.
- Per risultati, taccuini, portfolio, upload, backup e dati di ricerca **non c'è** una cancellazione automatica.
- Non esistono ancora l'esportazione self-service dei propri dati né la cancellazione dell'account dall'app (P14).

## 2. Tempi proposti per categoria

Tutti i termini sono **[DA VALIDARE 04-D5]**. La colonna «Proposta tecnica» è solo un punto di partenza.

| # | Categoria | Dove | Proposta tecnica | Decorrenza | Termine deciso |
|---|---|---|---|---|---|
| 1 | Account studente | `users`, `user_display_names`, `group_memberships` | fine del ciclo di studi o uscita dall'istituto | uscita | **[DA VALIDARE]** |
| 2 | Account docente | idem, `institution_teachers` | fine del servizio presso l'istituto | cessazione | **[DA VALIDARE]** |
| 3 | Risultati e profili (QSA, ZTPI, …) | `questionnaire_results`, `result_readings` | fine dell'anno o del percorso di orientamento | chiusura anno | **[DA VALIDARE]** |
| 4 | Conversazioni e registri chat | `logs`, `orientation_sessions`, `frozen_sessions` | 90 giorni (valore attuale di `logs`) | data della sessione | **[DA VALIDARE]** |
| 5 | Taccuino, obiettivi, portfolio, mappe, tavoli | `learner_profile_*`, `personal_goals`, `portfolio_items`, `idea_map_revisions`, `tavoli` | fine dell'anno o richiesta dell'interessato | chiusura anno | **[DA VALIDARE]** |
| 6 | Note e messaggi del docente | `teacher_notes` | fine dell'anno | chiusura anno | **[DA VALIDARE]** |
| 7 | Mappe dei segnaposto | `privacy_pseudonym_maps` | come la conversazione a cui appartengono, cancellate con essa (02 §3.3) | — | **[DA VALIDARE]** |
| 8 | Eventi privacy e audit | `privacy_events` (P8 eventi, da fare) | **[DA VALIDARE]** | data evento | **[DA VALIDARE]** |
| 9 | Log tecnici | log applicativi, `logs/*.log` su L2 | breve (giorni o settimane) | scrittura | **[DA VALIDARE]** |
| 10 | Upload e memoria di sessione | `DATA_DIR/uploads/…`, `SESSION_MEMORY_DIR` | memoria: fine sessione; scansioni: dopo l'estrazione | evento | **[DA VALIDARE]** |
| 11 | Backup | dump Postgres (L1), `backups/*.sqlite3` (L2) | rotazione breve | creazione | **[DA VALIDARE]** |
| 12 | Dati di ricerca | `validation_responses`, `anonymous_research_codes`, `research_contacts` | secondo il protocollo di ricerca ([05](05-informativa-consenso-ricerca.md)) | fine progetto | **[DA VALIDARE]** |
| 13 | Questionario di gradimento | `survey_responses` | **[DA VALIDARE]** | — | **[DA VALIDARE]** |
| 14 | Collegamenti Telegram | `telegram_account_links`, `telegram_conversation_states` | fino alla revoca o all'uscita | revoca | **[DA VALIDARE]** |
| 15 | Credenziali di servizio | `personal_api_connections`, `chatgpt_connections` | fino alla revoca da parte dell'utente | revoca | **[DA VALIDARE]** |

Obblighi di conservazione di atti scolastici che prevalgono su questi termini: **[DA VALIDARE: massimario di scarto applicabile]**.

## 3. Come si cancella (progetto P14)

1. **Politiche come dati**: ogni categoria ha una chiave di conservazione nella configurazione, non nel codice.
2. **Job di cancellazione** periodico su database, file e mappe; registra solo conteggi, mai contenuti.
3. **Cancellazione coerente** su L1 e L2 (e L3 quando esisterà).
4. **Cancellazione crittografica** dove i dati sono cifrati (dopo P11): distruggere la chiave rende illeggibili anche
   le copie residue. Oggi le colonne di contenuto **non sono ancora cifrate**, quindi questa misura non è disponibile.

### Backup

- Oggi: i backup SQLite su L2 **non sono cifrati**; per L1 la cifratura dei backup **non è verificata** (01 §3.3).
- Proposta **[DA VALIDARE]**: non modificare i backup alla singola richiesta; rotazione entro il termine della riga 11;
  dopo un ripristino, riapplicare le cancellazioni registrate prima della data del backup.

## 4. Diritti degli interessati

| Diritto | Articolo | Come si soddisfa oggi | Dopo P14 |
|---|---|---|---|
| Accesso e copia | 15 | richiesta al Titolare; estrazione manuale dell'amministratore | esportazione JSON + PDF dall'app |
| Rettifica | 16 | lo studente modifica taccuino e lavori; altro su richiesta | idem |
| Cancellazione | 17 | richiesta; cancellazione manuale | cancellazione dell'account dall'app |
| Limitazione | 18 | richiesta | **[DA VALIDARE]** |
| Portabilità | 20 | richiesta | esportazione JSON, se la base lo prevede **[DA VALIDARE]** |
| Opposizione | 21 | richiesta | **[DA VALIDARE]** |
| Revoca del consenso | 7(3) | oggi i consensi non sono registrati (01 §10) | impostazioni privacy (P9, P10) |

### Procedura proposta

1. **Ricezione**: email **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**, PEC **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**, DPO **[DA COMPILARE DA PARTE DEL TITOLARE/DPO]**.
2. **Verifica dell'identità** con mezzi proporzionati **[DA VALIDARE]**; per i minori, verifica di chi esercita la
   responsabilità genitoriale **[DA VALIDARE 04-D7]**.
3. **Registrazione** nel registro interno delle richieste **[DA COMPILARE DA PARTE DEL TITOLARE/DPO: dove è tenuto]**.
4. **Esecuzione tecnica** da parte di **[DA COMPILARE DA PARTE DEL TITOLARE/DPO: amministratore L1 / docente su L2]**,
   su tutte le copie: server, PC del docente, file di upload, mappe, backup secondo §3.
5. **Risposta** entro **[DA VALIDARE: un mese, prorogabile di due mesi, art. 12(3)]**; gratuita salvo i casi
   dell'art. 12(5) **[DA VALIDARE]**.

Su L2 i dati della classe stanno sul PC del docente: la cancellazione richiede il suo intervento **[DA VALIDARE 04-D1]**.

---

*Bozza P16 — da adottare solo dopo la revisione del Titolare e del DPO.*
