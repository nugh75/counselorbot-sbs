// Proxy SSE verso il backend per il chatbot informativo del sito.
// Come /api/chat/stream: una route del filesystem evita il buffering del
// rewrite di next.config sugli event-stream.

import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BACKEND = process.env.BACKEND_INTERNAL_URL || 'http://backend:8000';

export async function POST(req: NextRequest) {
    const body = await req.text();

    const upstream = await fetch(`${BACKEND}/site-chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
