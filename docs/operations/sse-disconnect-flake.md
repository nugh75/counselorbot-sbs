# Diagnosi e correzione del flake di disconnessione SSE

Responsabile: S15 (sostituto); bug Diario `5218df41-50eb-4164-bd04-22ffafe84a8c`; issue #599.
Correzione applicata in PR #601, solo test: runtime SSE e builder #595 invariati.

## Evidenze

- PR #589, head `88e873e69ad5e0cd5e9fb9b3ec207d05b3612878`, [run 40231539939, job Postgres 121284133754](https://github.com/nugh75/counselorbot-sbs/actions/runs/40231539939/job/121284133754): 53 noti, **1 inatteso**, 0 listed-passing; 54 failed/5862 passed/15 skipped.
- PR #595 (builder), [run 40232418743, job Postgres 121286778608](https://github.com/nugh75/counselorbot-sbs/actions/runs/40232418743/job/121286778608): stesso unico inatteso; 53 noti, **1 inatteso**, 0 listed-passing; 54 failed/5865 passed/15 skipped.
- Unico inatteso in entrambe: `test_sync_disconnect_returns_promptly_and_closes_after_the_pending_next`, riga 168, `assert not sse._closing`. Il set contiene un task **già terminato** con risultato `None`; le asserzioni precedenti sulla chiusura e sull’assenza di letture successive sono superate.
- `backend/sse.py` e il test sono identici a main `586d01b8`; medesimo fallimento sui precedenti head. La variabilità era già annotata in `3050d8b8`.
- Python 3.12.9, test originale estratto via AST, senza DB/provider: 80/100 fallimenti alla riga 168 (95/100 in una prova precedente). Variante esclusivamente in memoria con un turno del loop prima dell’asserzione: 200/200 pass.
- Pytest reale, 20 processi separati sullo stesso Python: 17 exit 0, 3 exit 1, sempre `AssertionError` alla riga 168. Il controllo negativo in memoria (callback `discard` che non rimuove il task) fa fallire anche la variante.
- Dopo la correzione: 100/100 run singoli, poi 50/50 con le dipendenze backend complete e 10/10 esecuzioni dell’intero `test_sse_heartbeat.py` (16 passed); gate finale `FULL_FILE_EXIT=0`, `SINGLE_EXIT=0`, `DIFF_CHECK_EXIT=0`. La matrice CI `backend-db` di PR #601 è la verifica autorevole su SQLite e PostgreSQL.

## Riproduzione senza dipendenze applicative

Dalla radice del worktree, con Python 3.12 (in CI: 3.12.15):

```bash
python3.12 - <<'PY'
import ast, asyncio, copy, importlib.util, threading
from pathlib import Path
name = 'test_sync_disconnect_returns_promptly_and_closes_after_the_pending_next'
node = next(n for n in ast.parse(Path('backend/tests/test_sse_heartbeat.py').read_text()).body
            if isinstance(n, ast.FunctionDef) and n.name == name)
for callback_turn in (False, True):
    spec = importlib.util.spec_from_file_location('s15_sse_probe', 'backend/sse.py')
    sse = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(sse)
    candidate = copy.deepcopy(node)
    if callback_turn:
        inner = next(n for n in candidate.body if isinstance(n, ast.AsyncFunctionDef))
        inner.body.insert(-1, ast.parse('await asyncio.sleep(0)').body[0])
    module = ast.fix_missing_locations(ast.Module(body=[candidate], type_ignores=[]))
    namespace = dict(asyncio=asyncio, threading=threading, sse=sse)
    exec(compile(module, 's15-sse-probe', 'exec'), namespace)
    failed = 0
    for _ in range(100):
        try:
            namespace[name]()
        except AssertionError:
            failed += 1
    print(dict(callback_turn=callback_turn, passed=100-failed, failed=failed))
PY
```

La frequenza del fallimento originale dipende dallo scheduling; un’esecuzione verde non smentisce il flake.
Il probe carica soltanto `backend/sse.py` e il corpo del test; non inizializza database, HTTP, provider o processi.

## Causa verificata e correzione applicata

La prova minima `task = create_task(sleep(0)); await task; closing = {task}; task.add_done_callback(closing.discard); await gather(*closing)` lascia il task nel set fino al successivo `await sleep(0)`.
La chiusura del generatore e il completamento del task non garantiscono che sia già stato eseguito il callback registrato con `add_done_callback`. In Python 3.12 `gather` ottimizza i future già terminati. Il runtime SSE è quindi corretto: cambia solo il punto di osservazione del test.

Correzione **solo test** applicata in [PR #601](https://github.com/nugh75/counselorbot-sbs/pull/601), branch `fix/sse-disconnect-done-callback` da main `586d01b8`:

```diff
         await asyncio.gather(*sse._closing)
         assert advances == [1]
+        await asyncio.sleep(0)  # esegue i done_callback già accodati
         assert not sse._closing
```

Restano le prove di disconnessione entro 0.2 s, chiusura entro 1 s, assenza di letture successive e set vuoto dopo il callback. Nessuna attesa temporale aggiuntiva o cambiamento funzionale SSE.

Il perimetro è il solo test: rimossa la voce ormai passante da `backend/tests/sqlite_known_failures.txt` (il ratchet stretto rifiuterebbe una voce verde). Nessuna voce aggiunta a `postgres_known_failures.txt` e nessuna modifica a `backend/sse.py` o al builder #595. Dopo il merge di #601, #589 e #595 possono riallinearsi a main e girare una sola volta; nessun rerun manuale e nessun ampliamento del ratchet.
