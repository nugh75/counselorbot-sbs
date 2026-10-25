# Diagnosi isolata del flake di disconnessione SSE

Responsabile: s15-fix-589-codex; bug Diario `5218df41-50eb-4164-bd04-22ffafe84a8c`.
Proposta da coordinare con il Timoniere: nessuna modifica al runtime o al test applicata in P10.

## Evidenze

- PR #589, head `fe891bb48eaabc9528ea0f141f04f13bf6de7331`, [run 40212637918, job Postgres](https://github.com/nugh75/counselorbot-sbs/actions/runs/40212637918/job/121227044687): 53 fallimenti noti, un unico inatteso, zero listed-passing.
- Unico inatteso: `test_sync_disconnect_returns_promptly_and_closes_after_the_pending_next`, riga 168, `assert not sse._closing`. Il set contiene un task **già terminato** con risultato `None`; le asserzioni precedenti sulla chiusura e sull’assenza di letture successive sono superate.
- `backend/sse.py` e `backend/tests/test_sse_heartbeat.py` identici a main `586d01b8`; medesimo fallimento sul precedente head `77e21b14`. La variabilità era già annotata in `3050d8b8`.
- Python 3.12.9, test originale estratto via AST, senza DB/provider: 95 fallimenti su 100 alla riga 168. Variante esclusivamente in memoria con un turno del loop prima dell’asserzione: 200/200 pass.
- Ripetuto il comando qui sotto: 86/100 fallimenti originali e 100/100 pass nella variante. Controllo negativo, sempre solo in memoria: un callback `discard` che non rimuove il task fa fallire anche la variante proposta.

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

## Causa verificata e proposta

La prova minima `task = create_task(sleep(0)); await task; closing = {task}; task.add_done_callback(closing.discard); await gather(*closing)` lascia il task nel set fino al successivo `await sleep(0)`.
La chiusura del generatore e il completamento del task non garantiscono che sia già stato eseguito il callback registrato con `add_done_callback`. In Python 3.12 `gather` ottimizza i future già terminati.

Proposta **solo test**, non applicata, da revisionare nel perimetro concordato col Timoniere:

```diff
         await asyncio.gather(*sse._closing)
         assert advances == [1]
+        await asyncio.sleep(0)  # esegue i done_callback già accodati
         assert not sse._closing
```

Restano le prove di disconnessione entro 0.2 s, chiusura entro 1 s, assenza di letture successive e set vuoto dopo il callback. Nessuna attesa temporale aggiuntiva o cambiamento funzionale SSE.

Il perimetro proposto è il solo test e, dopo prova verde su entrambi i DB, la **rimozione** della sua voce già presente in `backend/tests/sqlite_known_failures.txt`: il ratchet stretto rifiuterebbe una voce ora passante. Non si aggiunge alcuna eccezione Postgres. La deroga di revisione P10 non viene estesa a questa proposta; applicazione e revisione vanno coordinate col Timoniere.
