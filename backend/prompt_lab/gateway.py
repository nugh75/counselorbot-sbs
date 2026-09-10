"""Ollama-only gateway: no arbitrary URL, redirect, pull, filesystem or admin route."""
import os
from urllib.parse import urlparse
import ipaddress
import socket
import time
import json

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


def upstream():
    url = os.environ.get('PROMPT_LAB_OLLAMA_UPSTREAM', 'http://host.docker.internal:11434').rstrip('/')
    parsed = urlparse(url)
    if parsed.scheme != 'http' or not parsed.hostname or parsed.port != 11434 or parsed.path or parsed.username or parsed.query:
        raise ValueError('Only a local Ollama endpoint on port 11434 is supported')
    addresses = socket.getaddrinfo(parsed.hostname, 11434, type=socket.SOCK_STREAM)
    if not addresses or any(not (ipaddress.ip_address(a[4][0]).is_private or ipaddress.ip_address(a[4][0]).is_loopback) for a in addresses):
        raise ValueError('Public upstream is not allowed')
    return url


@app.api_route('/api/{operation}', methods=['GET', 'POST'])
async def proxy(operation: str, request: Request):
    if (request.method, operation) not in {('GET', 'tags'), ('POST', 'chat'), ('POST', 'show')} or request.url.query:
        raise HTTPException(404, 'Endpoint not available')
    data = None
    if request.method == 'POST':
        body = await request.body()
        if len(body) > 512_000:
            raise HTTPException(413, 'Request too large')
        try:
            data = await request.json()
        except ValueError:
            raise HTTPException(400, 'Invalid JSON')
        allowed = {'model', 'messages', 'stream', 'options', 'think', 'format', 'keep_alive'} if operation == 'chat' else {'model', 'verbose'}
        if not isinstance(data, dict) or set(data) - allowed or not isinstance(data.get('model'), str):
            raise HTTPException(400, 'Invalid request')
        if operation == 'chat':
            data['stream'] = False
            data['keep_alive'] = '2m'
    try:
        started = time.monotonic()
        seconds = max(0.001, min(120, float(request.headers.get('x-lab-timeout', '120'))))
        async with httpx.AsyncClient(trust_env=False, follow_redirects=False, timeout=seconds) as client:
            base = upstream()
            if operation == 'chat':
                if 'cloud' in data['model'].lower():
                    raise HTTPException(400, 'Remote models are not allowed')
                info = await client.post(base + '/api/show', json={'model': data['model']}, timeout=min(seconds, 5))
                if not info.is_success:
                    raise HTTPException(502, 'Model metadata unavailable')
                metadata = info.json()
                if (metadata.get('remote_model') or metadata.get('remote_host') or
                    (metadata.get('details') or {}).get('format') != 'gguf' or not metadata.get('model_info')):
                    raise HTTPException(400, 'Only verified local model weights are allowed')
            remaining = seconds - (time.monotonic() - started)
            if remaining <= 0:
                raise HTTPException(504, 'Call budget exhausted')
            reply = await client.request(request.method, base + '/api/' + operation, json=data, timeout=remaining)
        if reply.is_redirect:
            raise HTTPException(502, 'Redirect rejected')
        if not reply.is_success:
            raise HTTPException(502, 'Local model service unavailable')
        if operation == 'tags':
            body = reply.json()
            body['models'] = [m for m in body.get('models', [])
                              if (m.get('details') or {}).get('format') == 'gguf'
                              and not m.get('remote_model') and not m.get('remote_host')
                              and 'cloud' not in str(m.get('name', '')).lower()]
            return Response(json.dumps(body), media_type='application/json')
        return Response(reply.content, media_type='application/json')
    except (httpx.HTTPError, ValueError, OSError):
        raise HTTPException(503, 'Local model service unavailable')
