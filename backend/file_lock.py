"""Advisory inter-process file locks on POSIX (flock) and Windows (msvcrt).

The lock is held by an open file object and released when it is closed.
POSIX keeps the previous flock semantics exactly. Windows has no shared lock
in msvcrt, so it locks the first byte exclusively; `is_locked` releases its
probe at once so it never blocks a real holder for long.
"""
from __future__ import annotations

import sys
import time

if sys.platform == "win32":
    import msvcrt

    def _try_lock(f) -> bool:
        f.seek(0)
        try:
            msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            return False
        return True

    def _unlock(f):
        f.seek(0)
        msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)

    def lock(f, blocking: bool = True) -> bool:
        """Exclusive lock on `f`; False only when non-blocking and already held."""
        while not _try_lock(f):
            if not blocking:
                return False
            time.sleep(0.05)
        return True

    def is_locked(f) -> bool:
        """True when another open file holds the lock."""
        if not _try_lock(f):
            return True
        _unlock(f)
        return False

else:
    import fcntl

    def lock(f, blocking: bool = True) -> bool:
        """Exclusive lock on `f`; False only when non-blocking and already held."""
        try:
            fcntl.flock(f, fcntl.LOCK_EX if blocking else fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return False
        return True

    def is_locked(f) -> bool:
        """True when another open file holds the lock."""
        try:
            fcntl.flock(f, fcntl.LOCK_SH | fcntl.LOCK_NB)
        except BlockingIOError:
            return True
        fcntl.flock(f, fcntl.LOCK_UN)
        return False
