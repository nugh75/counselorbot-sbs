import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const BACKEND = process.env.BACKEND_INTERNAL_URL || 'http://backend:8000';

// A filesystem route is necessary: the general Next rewrite buffers SSE.
export async function POST(request: NextRequest) {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    for (const name of ['cookie', 'x-forwarded-auth-secret', 'x-forwarded-host', 'remote-user', 'remote-email', 'remote-name', 'remote-groups', 'x-view-as']) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
    }
    try {
        const upstream = await fetch(`${BACKEND}/tts/stream`, {
            method: 'POST', headers, body: await request.text(), signal: request.signal,
        });
        return new Response(upstream.body, {
            status: upstream.status,
            headers: {
                'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
                'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no',
            },
        });
    } catch {
        return Response.json({ error: 'Speech unavailable' }, { status: 502 });
    }
}
