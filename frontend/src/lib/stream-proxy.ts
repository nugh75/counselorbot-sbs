// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { backendOrigin } from './backend-origin.ts';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { chatHTTPErrorCode } from './chat-errors.ts';

const authHeaders = ['cookie', 'x-forwarded-auth-secret', 'x-forwarded-host', 'remote-user', 'remote-email', 'remote-name', 'remote-groups', 'x-view-as', 'x-counselorbot-language'];

export async function proxyChatStream(request: Request, path: string): Promise<Response> {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    for (const name of authHeaders) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
    }
    try {
        const upstream = await fetch(`${backendOrigin()}${path}`, {
            method: 'POST', headers, body: await request.text(), signal: request.signal,
        });
        if (!upstream.ok || !upstream.body) {
            const data: unknown = await upstream.json().catch(() => null);
            return Response.json({ error: 'Chat request unavailable.', error_code: chatHTTPErrorCode(upstream.status, data) }, {
                status: upstream.ok ? 502 : upstream.status,
                headers: { 'Cache-Control': 'no-store' },
            });
        }
        return new Response(upstream.body, {
            status: upstream.status,
            headers: {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
            },
        });
    } catch {
        return Response.json({ error: 'Chat service unavailable.', error_code: 'chat.errors.connection' }, {
            status: 502, headers: { 'Cache-Control': 'no-store' },
        });
    }
}
