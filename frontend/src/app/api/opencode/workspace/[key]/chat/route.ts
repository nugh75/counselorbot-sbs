import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BACKEND = process.env.BACKEND_INTERNAL_URL || 'http://backend:8000';

export async function POST(
    req: NextRequest,
    context: { params: Promise<{ key: string }> },
) {
    const { key } = await context.params;
    const body = await req.text();
    const headers = new Headers({ 'Content-Type': 'application/json' });
    for (const name of [
        'cookie',
        'remote-user',
        'remote-email',
        'remote-name',
        'remote-groups',
        'x-forwarded-auth-secret',
        'x-forwarded-host',
    ]) {
        const value = req.headers.get(name);
        if (value) headers.set(name, value);
    }
    const upstream = await fetch(
        `${BACKEND}/opencode/workspace/${encodeURIComponent(key)}/chat`,
        {
            method: 'POST',
            headers,
            body,
        },
    );

    if (!upstream.ok || !upstream.body) {
        return new Response(
            `data: ${JSON.stringify({ error: `Stream non disponibile (${upstream.status})` })}\n\n`,
            {
                status: upstream.status || 502,
                headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
            },
        );
    }

    return new Response(upstream.body, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}
