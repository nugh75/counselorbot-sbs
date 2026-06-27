// Proxy SSE verso il backend per il chatbot informativo del sito.
// Come /api/chat/stream: una route del filesystem evita il buffering del
// rewrite di next.config sugli event-stream.

import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BACKEND = process.env.BACKEND_INTERNAL_URL || 'http://backend:8000';

// Header di autenticazione da inoltrare al backend: il cookie (verificato
// direttamente con ai4auth) e gli header del percorso fidato del proxy.
// Senza questi /site-chat/stream risponde 401 (richiede get_current_user).
const AUTH_HEADERS = [
    'cookie',
    'x-forwarded-auth-secret',
    'x-forwarded-host',
    'remote-user',
    'remote-email',
    'remote-name',
    'remote-groups',
];

export async function POST(req: NextRequest) {
    const body = await req.text();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    for (const name of AUTH_HEADERS) {
        const value = req.headers.get(name);
        if (value) headers[name] = value;
    }

    const upstream = await fetch(`${BACKEND}/site-chat/stream`, {
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
