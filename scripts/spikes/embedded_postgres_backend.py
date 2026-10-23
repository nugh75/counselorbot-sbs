"""Boot the real backend on 127.0.0.1:<port> for the F0-02 embedded Postgres probe.

On Windows, backend/rag_index.py and backend/rag_reindex_job.py import the
Unix-only fcntl module; a no-op stand-in lets the spike reach the database
code. The real fix belongs to the desktop packaging work (F1-04).
"""
import os
import sys
import types

import uvicorn

if os.name == "nt" and "fcntl" not in sys.modules:
    fcntl = types.ModuleType("fcntl")
    fcntl.LOCK_EX, fcntl.LOCK_SH, fcntl.LOCK_NB, fcntl.LOCK_UN = 2, 1, 4, 8
    fcntl.flock = lambda *args, **kwargs: None
    fcntl.lockf = lambda *args, **kwargs: None
    sys.modules["fcntl"] = fcntl

uvicorn.run("backend.main:app", host="127.0.0.1", port=int(sys.argv[1]), log_level="warning")
