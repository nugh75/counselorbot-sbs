// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { backendOrigin } from './backend-origin.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { applyRequestOrigin } from './request-origin.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { isShellInternalPath } from './shell-internal.ts';

const hopHeaders = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade'];

function cleanHeaders(source: Headers): Headers {
    const headers = new Headers(source);
    for (const name of (headers.get('connection') || '').split(',')) {
        if (name.trim()) headers.delete(name.trim());
    }
    for (const name of hopHeaders) headers.delete(name);
    headers.delete('content-length');
    return headers;
}

// The standalone routes manifest freezes next.config rewrites at build time.
// This fallback handler resolves the upstream on every request, after Next has
// matched the more specific chat/TTS/OpenCode streaming routes.
export async function proxyAPI(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (isShellInternalPath(url.pathname)) return new Response(null, { status: 404 });
    const headers = cleanHeaders(request.headers);
    headers.delete('host');
    headers.set('accept-encoding', 'identity');
    applyRequestOrigin(request.headers, headers);
    const init: RequestInit & { duplex?: 'half' } = {
        method: request.method, headers, signal: request.signal,
        cache: 'no-store', redirect: 'manual',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = request.body;
        init.duplex = 'half';
    }
    try {
        const upstream = await fetch(`${backendOrigin()}${url.pathname.slice(4)}${url.search}`, init);
        const responseHeaders = cleanHeaders(upstream.headers);
        // Node fetch decodes compressed responses even if the upstream ignores identity.
        responseHeaders.delete('content-encoding');
        return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch {
        return Response.json({ detail: 'Backend unavailable' }, { status: 502 });
    }
}
