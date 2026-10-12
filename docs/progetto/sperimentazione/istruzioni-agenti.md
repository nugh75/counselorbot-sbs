# Istruzioni per gli agenti — aggiornamento del Diario della sperimentazione

Come mantenere [`diario-sperimentazione.md`](diario-sperimentazione.md). Leggere
tutto il file prima di modificarlo.

## Quando aggiornare

- Dopo ogni nuova mail/comunicazione archiviata in `../comunicazioni/`.
- Dopo ogni presentazione o evento KTH (nuovi copioni in `docs/`).
- Dopo sviluppi rilevanti per la validazione (git log / PR).
- Mai per refactoring o fix irrilevanti per la sperimentazione.

## Formato di una voce

```markdown
### <data> — <titolo breve>

- **<Cosa>**: <2–3 righe di sintesi> Documenti: [<nome>](<link relativo>).
- Fonte secondaria se serve: [`../diario.md`](../diario.md) o PR/git log.
```

Regole:

1. **Bilingue**: ogni voce va scritta in italiano E in inglese (due sezioni del file).
2. **Cronologico**: inserisci la voce nella posizione temporale corretta, non in coda.
3. **Fonti citate**: ogni fatto ha un link relativo al documento (`../comunicazioni/...`,
   `../../presentazione-....md`) oppure `git log --oneline` / numero PR.
4. **Niente segreti**: mai password, credenziali, indirizzi email o altri dati
   personali; i testi integrali delle mail vanno nel repo privato
   `counselorbot-sbs-private` (stessi percorsi), qui solo schede depurate
   (ruolo, data, oggetto, sintesi) con puntatore al file privato.
5. **Niente date inventate**: se la data non è nel documento, usa "data dal commit"
   (verificata con `git log`) o "s.d.".
6. **Sintesi, non copia**: 2–3 righe per fatto; i testi integrali restano nei documenti citati.
7. **Link verificati**: dopo la modifica, controlla che ogni link relativo esista
   (apri il file di destinazione).

## Esempio

```markdown
### 14 ottobre 2026 — Risposta dal KTH

- **Risposta KTH**: il docente accetta un incontro pilota con gli studenti.
  Scheda: [`risposta-kth-2026-10-14.md`](../comunicazioni/risposta-kth-2026-10-14.md);
  testo integrale nel repo privato (stesso percorso).
```

## Verifiche prima del commit

- `git status --short`: in staging solo i file di `docs/progetto/sperimentazione/`.
- Nessuna modifica a codice, `.env`, comunicazioni esistenti o altri docs.
- Aggiorna anche il `README.md` della cartella solo se cambia la struttura o l'elenco fonti.

---

# Agent instructions — updating the Experimentation journal

How to maintain [`diario-sperimentazione.md`](diario-sperimentazione.md). Read the
whole file before editing it.

## When to update

- After every new email/communication archived in `../comunicazioni/`.
- After every KTH presentation or event (new scripts in `docs/`).
- After validation-relevant developments (git log / PRs).
- Never for refactors or fixes irrelevant to the experimentation.

## Entry format

```markdown
### <date> — <short title>

- **<What>**: <2–3 line summary> Documents: [<name>](<relative link>).
- Secondary source if needed: [`../diario.md`](../diario.md) or PR/git log.
```

Rules:

1. **Bilingual**: every entry in Italian AND English (both file sections).
2. **Chronological**: insert the entry at the right time position, not at the end.
3. **Cited sources**: every fact links to a document (`../comunicazioni/...`,
   `../../presentazione-....md`) or to `git log --oneline` / PR number.
4. **No secrets**: never passwords, credentials, email addresses or other
   personal data; full email texts go to the private repo
   `counselorbot-sbs-private` (same paths), here only redacted sheets
   (role, date, subject, summary) with a pointer to the private file.
5. **No invented dates**: when the date is not in the document, use "date from
   commit" (verified with `git log`) or "n.d.".
6. **Summaries, not copies**: 2–3 lines per fact; full texts stay in the cited documents.
7. **Verified links**: after editing, check that every relative link resolves
   (open the target file).

## Checks before committing

- `git status --short`: only `docs/progetto/sperimentazione/` files staged.
- No changes to code, `.env`, existing communications or other docs.
- Update the folder `README.md` only when structure or source list changes.
