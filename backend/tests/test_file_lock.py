"""Portable file lock: exclusion, probing and cross-process concurrency."""

import multiprocessing
import threading
import time

from backend import file_lock


def _increment(lock_path, counter_path, rounds):
    for _ in range(rounds):
        with open(lock_path, "a") as lockf:
            file_lock.lock(lockf)
            with open(counter_path) as f:
                value = int(f.read())
            time.sleep(0.001)  # Widen the race window an unlocked update would lose.
            with open(counter_path, "w") as f:
                f.write(str(value + 1))


def _hold(lock_path, held, release):
    with open(lock_path, "a") as lockf:
        file_lock.lock(lockf)
        held.set()
        release.wait(30)


def test_non_blocking_lock_fails_while_held_and_succeeds_after_release(tmp_path):
    path = tmp_path / "x.lock"
    with open(path, "a") as holder:
        assert file_lock.lock(holder, blocking=False)
        with open(path, "a") as other:
            assert not file_lock.lock(other, blocking=False)
    with open(path, "a") as other:
        assert file_lock.lock(other, blocking=False)


def test_is_locked_reports_holder_and_does_not_keep_the_lock(tmp_path):
    path = tmp_path / "x.lock"
    path.touch()
    with open(path, "r") as probe:
        assert not file_lock.is_locked(probe)
        with open(path, "a") as other:
            assert file_lock.lock(other, blocking=False)
            assert file_lock.is_locked(probe)


def test_blocking_lock_waits_for_release(tmp_path):
    path = tmp_path / "x.lock"
    acquired = threading.Event()
    with open(path, "a") as holder:
        file_lock.lock(holder)

        def waiter():
            with open(path, "a") as lockf:
                file_lock.lock(lockf)
                acquired.set()

        thread = threading.Thread(target=waiter)
        thread.start()
        assert not acquired.wait(0.3)
    thread.join(5)
    assert acquired.is_set()


def test_lock_excludes_other_processes(tmp_path):
    ctx = multiprocessing.get_context("spawn")
    path = str(tmp_path / "x.lock")
    held, release = ctx.Event(), ctx.Event()
    process = ctx.Process(target=_hold, args=(path, held, release))
    process.start()
    try:
        assert held.wait(30)
        with open(path, "r") as probe:
            assert file_lock.is_locked(probe)
        with open(path, "a") as lockf:
            assert not file_lock.lock(lockf, blocking=False)
    finally:
        release.set()
        process.join(30)
    with open(path, "a") as lockf:
        assert file_lock.lock(lockf, blocking=False)


def test_concurrent_processes_never_lose_an_update(tmp_path):
    ctx = multiprocessing.get_context("spawn")
    lock_path, counter_path = str(tmp_path / "x.lock"), tmp_path / "counter"
    counter_path.write_text("0")
    workers = [ctx.Process(target=_increment, args=(lock_path, str(counter_path), 25))
               for _ in range(4)]
    for worker in workers:
        worker.start()
    for worker in workers:
        worker.join(60)
        assert worker.exitcode == 0
    assert counter_path.read_text() == "100"
