"""F1-11 isolated HTTP/tunnel probe using the application's real SSE helper.

python -m scripts.spikes.sse_heartbeat_probe serve
python -m scripts.spikes.sse_heartbeat_probe check http://127.0.0.1:8791
No application startup, database, credentials, user text or model calls.
"""
import argparse
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import time
from urllib.request import Request, urlopen

from backend.sse import heartbeat

DURATION = 75
HEADERS = {"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"}


def fixture_app():
    from fastapi import FastAPI
    from fastapi.responses import StreamingResponse

    app = FastAPI()

    def sync_events():
        yield 'data: {"init":true}\n\n'
        time.sleep(DURATION)
        yield 'data: {"done":true}\n\n'

    async def async_events():
        yield 'data: {"init":true}\n\n'
        await asyncio.sleep(DURATION)
        yield 'data: {"done":true}\n\n'

    @app.post("/sync")
    async def sync_stream():
        return StreamingResponse(heartbeat(sync_events()), media_type="text/event-stream", headers=HEADERS)

    @app.post("/async")
    async def async_stream():
        return StreamingResponse(heartbeat(async_events()), media_type="text/event-stream", headers=HEADERS)

    return app


def check_stream(base, path, require_cloudflare=False):
    started = time.monotonic()
    frames, arrived = [], []
    request = Request(base.rstrip("/") + path, data=b"{}", method="POST",
                      headers={"Content-Type": "application/json", "Accept": "text/event-stream"})
    with urlopen(request, timeout=30) as response:
        headers_at = time.monotonic() - started
        assert response.status == 200
        assert "text/event-stream" in response.headers.get("Content-Type", "")
        if require_cloudflare:
            assert response.headers.get("Cf-Ray"), "response did not traverse Cloudflare"
        assert headers_at < 10, f"headers delayed: {headers_at:.1f}s"
        frame = b""
        for line in response:
            frame += line
            if line != b"\n":
                continue
            elapsed = time.monotonic() - started
            assert elapsed < DURATION + 20, "stream did not finish on time"
            frames.append(frame)
            arrived.append(elapsed)
            frame = b""
        assert not frame, "truncated SSE frame"
    assert frames[0] == b'data: {"init":true}\n\n'
    assert frames[-1] == b'data: {"done":true}\n\n', "missing completion event"
    assert all(frame == b": ping\n\n" for frame in frames[1:-1])
    assert len(frames[1:-1]) >= 4, "missing periodic heartbeats"
    assert arrived[0] < 10, "initial frame was buffered"
    gaps = [later - earlier for earlier, later in zip(arrived, arrived[1:])]
    assert max(gaps) < 25, f"buffered/late heartbeats: largest gap {max(gaps):.1f}s"
    assert arrived[-1] >= DURATION - 1, "fixture ended early"
    result = {"path": path, "headers_s": round(headers_at, 2), "duration_s": round(arrived[-1], 2),
              "pings": len(frames) - 2, "max_gap_s": round(max(gaps), 2)}
    print(json.dumps(result), flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve")
    serve.add_argument("--port", type=int, default=8791)
    check = sub.add_parser("check")
    check.add_argument("url")
    check.add_argument("--require-cloudflare", action="store_true")
    args = parser.parse_args()
    if args.command == "serve":
        import uvicorn
        uvicorn.run(fixture_app(), host="127.0.0.1", port=args.port)
    else:
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(check_stream, args.url, path, args.require_cloudflare) for path in ("/sync", "/async")]
            for future in futures:
                future.result()


if __name__ == "__main__":
    main()
