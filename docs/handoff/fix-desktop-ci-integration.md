# Handoff — ripristino CI desktop PostgreSQL e auth locale

- **Data**: 26 ottobre 2026
- **Branch**: `fix/desktop-ci-integration`
- **PR**: [#620 — fix: ripristina build desktop PostgreSQL con auth locale](https://github.com/nugh75/counselorbot-sbs/pull/620)
- **Stato PR**: OPEN, bozza; nessun merge effettuato
- **HEAD salvato e pubblicato**: `0619565f5592533743e8862b4c7a50f4407bd388`
**Worktree usato**: `/private/tmp/counselorbot-desktop-ci-worktree`

## Ripresa rapida

```bash
cd /private/tmp/counselorbot-desktop-ci-worktree
git status --short --branch
gh pr view 620 --json state,isDraft,url,headRefOid
gh pr checks 620
```

Al momento dell'handoff il working tree è pulito e HEAD locale/remoto coincide.
Tutto il lavoro è su GitHub: il riavvio del Mac non lo perde. Se il worktree
temporaneo non esistesse più, recuperare la branch remota in un nuovo worktree;
non serve ricostruire modifiche locali.

Run correnti al momento dell'handoff:

```bash
# Backend PostgreSQL/SQLite
gh run watch 40391091691 --exit-status --interval 30

# Installer e lifecycle desktop su quattro sistemi
gh run watch 40391092001 --exit-status --interval 30
```

Se i run sono già terminati, usare `gh pr checks 620`; per un errore leggere il
job con `gh run view --job <JOB_ID> --log-failed`.

## Stato CI

### Verde sul commit `0619565f`

- **Desktop PostgreSQL (ADR-0004), run `40391091911`** interamente verde:
  download/checksum su quattro target, 51 test Rust, avvio PostgreSQL, accesso
  con ruolo applicativo, arresto e secondo avvio su macOS arm64, macOS x64,
  Windows x64 e Linux x64. Anche il riepilogo è verde.
- Backend: `startup (postgres)`, `startup (sqlite)` e `portability` verdi.
- Documentazione, allineamento versione e Release Drafter verdi.

### Ancora da attendere al momento dell'handoff

- Run `40391091691` (`backend-db`): `tests (postgres)` e `tests (sqlite)`.
- Run `40391092001` (`desktop-teacher`): build e lifecycle sui quattro target.

I run precedenti annullati dopo un nuovo push non sono regressioni da correggere.
Non fare altri push finché non si è letto l'esito dei run correnti, salvo nuovo
fix necessario.

## Lavoro completato nella ripresa dopo Codex

1. **Converter SQLite → PostgreSQL** (`a9a0f9f1`)
   - sostituite le liste posizionali non accettate da `TextClause` con dizionari
     di parametri nominati SQLAlchemy;
   - la verifica dei conteggi ora considera solo le tabelle migrate dalla
     sorgente, non seed o receipt tecnici già presenti nel target;
   - fixture estesa con una tabella di seed presente solo nel target;
   - **5 test del converter superati**, inclusi import e ripresa.

2. **PostgreSQL nativo su Windows CI** (`5fe0ceae`, `0619565f`)
   - i runner Windows elevati eseguono smoke/lifecycle con token ristretto di
     utente normale, come l'app reale non elevata;
   - aggiunto `desktop/teacher/scripts/run-windows-restricted.sh`;
   - ACL temporanee soltanto sulle cartelle di test;
   - `MSYS2_ARG_CONV_EXCL='*'` impedisce a Git Bash di trasformare `/grant` in
     `C:/Program Files/Git/grant`;
   - workflow nativo Windows ora verde.

3. **Documentazione** (`99d0d856`)
   - aggiornati `docs/operations/desktop-ci-recovery.md`,
     `docs-counselorbot/funzionalita-counselorbot.md` e il manifest guidance;
   - `make guidance-check` e `make version-check` superati.

## Verifiche locali già disponibili

Dalla sessione Codex e dalla ripresa:

- 715 test frontend;
- 240 test PostgreSQL mirati riportati nella PR;
- 51 test Rust;
- 16 test Node del guscio nella prima parte del lavoro; 2 test del pannello
  ripetuti nella ripresa;
- 29 test sidecar/script e 6 test download;
- 9 test browser di abbinamento contro la build Docker isolata;
- type check TypeScript, build frontend Docker, doppio avvio PostgreSQL nativo;
- 80 test auth/abbinamento/profilo superati su PostgreSQL; i 2 fallimenti residui
  riguardavano il converter ed è stata applicata e verificata la correzione
  successiva con i 5 test dedicati;
- YAML dei workflow, `bash -n`, `cargo fmt --check`, `git diff --check`,
  guidance e versione allineati.

Il container Docker temporaneo `counselorbot-desktop-ci-backend-db` è stato
fermato. Nessun dev server o container di prova deve essere riavviato per leggere
la CI. Le porte 3170/3171 erano libere al momento della ripresa.

## File principali toccati nell'ultimo giro

- `backend/sqlite_to_postgres_converter.py`
- `backend/tests/test_sqlite_to_postgres_converter.py`
- `.github/workflows/desktop-postgres.yml`
- `.github/workflows/desktop-teacher.yml`
- `desktop/teacher/scripts/run-windows-restricted.sh`
- `docs/operations/desktop-ci-recovery.md`
- `docs-counselorbot/funzionalita-counselorbot.md`
- `docs/operations/platform-guidance-state.json`

L'intera PR contiene anche il precedente ripristino dei controlli d'accesso,
JSX, import TypeScript, packaging PostgreSQL, lifecycle e auth locale. Il corpo
della PR elenca il quadro completo.

## Prossimi passi

1. Leggere l'esito dei due run ancora attivi con `gh pr checks 620`.
2. Se falliscono, scaricare il log del job, correggere sulla stessa branch con
   modifiche minime e aggiungere/aggiornare i test pertinenti.
3. Dopo modifiche a `backend/` o `frontend/src/`, aggiornare anche
   `docs-counselorbot/funzionalita-counselorbot.md`, rieseguire
   `make guidance-refresh && make guidance-check` e committare il manifest.
4. A CI completamente verde, aggiornare il corpo della PR sostituendo
   «CI installer multipiattaforma in esecuzione» con l'esito finale e togliere
   la bozza con `gh pr ready 620`.
5. Non fare merge senza richiesta esplicita dell'utente.

## Limiti e sicurezza operativa

- Nessun deploy effettuato o richiesto; nessun comando `sudo` necessario.
- Non riavviare/rebuildare i container dell'istanza Mac/Console portable: sono
  esclusi dall'attività e non sono stati modificati.
- Le immagini/tag `desktop-ci-validation` e i database temporanei sono soltanto
  prove isolate, non dati di produzione.
- macOS 15+ è il nuovo requisito degli archivi upstream.
- L'upgrade guidato dai profili SQLite resta bloccato finché converter,
  backup/restore e updater non sono integrati: la CI verde non certifica una
  migrazione dati reale né una release pronta.
