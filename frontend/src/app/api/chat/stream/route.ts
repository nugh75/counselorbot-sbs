// Proxy SSE verso il backend, in streaming reale.
// Sostituisce il rewrite di next.config (`/api/:path*`) che bufferizzava
// l'event-stream consegnando la risposta tutta insieme.
// Le route del filesystem hanno precedenza sugli `afterFiles` rewrites,
// quindi questa gestisce solo /api/chat/stream; il resto resta proxato.

import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BACKEND = process.env.BACKEND_INTERNAL_URL || 'http://backend:8000';

// Header di autenticazione da inoltrare al backend: senza cookie il logging
// di ricerca (username/email/codice anonimo) ricade su identita' anonima.
const AUTH_HEADERS = [
    'cookie',
    'x-forwarded-auth-secret',
    'x-forwarded-host',
    'remote-user',
    'remote-email',
    'remote-name',
    'remote-groups',
    // Anteprima profilo di prova: senza questo, le interazioni in streaming si
    // attribuirebbero all'admin invece che al profilo di prova selezionato.
    'x-view-as',
];

export async function POST(req: NextRequest) {
    const body = await req.text();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    for (const name of AUTH_HEADERS) {
        const value = req.headers.get(name);
        if (value) headers[name] = value;
    }

    const upstream = await fetch(`${BACKEND}/chat/stream`, {
        method: 'POST',
        headers,
        body,
    });

    if (!upstream.ok || !upstream.body) {
        return new Response(
            `data: ${JSON.stringify({ error: `Stream non disponibile (${upstream.status})` })}\n\n`,
            { status: upstream.status || 502, headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } },
        );
    }

    return new Response(upstream.body, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
