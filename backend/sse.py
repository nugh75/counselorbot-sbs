"""Keep POST SSE responses alive while a provider/retrieval step is silent."""
import asyncio
import math
from collections.abc import AsyncIterable, AsyncIterator, Iterable
from contextlib import suppress

HEARTBEAT_INTERVAL = 15.0
PING = ": ping\n\n"
_END = object()
# A blocking provider cannot be killed safely. Keep its cleanup alive until the
# current next() returns, without delaying the client's disconnect or reading on.
_closing: set[asyncio.Task] = set()


async def _finish_sync(pending, iterator):
    with suppress(Exception):
        await pending
    close = getattr(iterator, "close", None)
    if close is not None:
        with suppress(Exception):
            await asyncio.to_thread(close)


async def heartbeat(
    source: Iterable[str | bytes] | AsyncIterable[str | bytes],
    *, interval: float | None = None,
) -> AsyncIterator[str | bytes]:
    """Insert a comment every 15 seconds without a yielded application frame.

    There is exactly one pending next() and no producer queue. Waiting for a ping
    never cancels/restarts the provider. Sync generators run outside the event
    loop; async generators are cancelled and closed on disconnect. Each route
    must yield its initial event before doing model or retrieval work so headers
    and the first bytes reach the proxy immediately.
    """
    interval = HEARTBEAT_INTERVAL if interval is None else interval
    if not math.isfinite(interval) or interval <= 0:
        raise ValueError("SSE heartbeat interval must be positive and finite")
    asynchronous = isinstance(source, AsyncIterable)
    iterator = aiter(source) if asynchronous else iter(source)
    pending = None
    try:
        while True:
            if pending is None:
                pending = asyncio.create_task(
                    anext(iterator) if asynchronous else asyncio.to_thread(next, iterator, _END)
                )
            ready, _ = await asyncio.wait({pending}, timeout=interval)
            if not ready:
                yield PING
                continue
            finished, pending = pending, None
            try:
                item = finished.result()
            except StopAsyncIteration:
                break
            if item is _END:
                break
            yield item
    finally:
        if asynchronous:
            if pending is not None:
                pending.cancel()
                with suppress(asyncio.CancelledError, Exception):
                    await pending
            close = getattr(iterator, "aclose", None)
            if close is not None:
                await close()
        elif pending is not None:
            cleanup = asyncio.create_task(_finish_sync(pending, iterator))
            _closing.add(cleanup)
            cleanup.add_done_callback(_closing.discard)
        else:
            close = getattr(iterator, "close", None)
            if close is not None:
                await asyncio.to_thread(close)
