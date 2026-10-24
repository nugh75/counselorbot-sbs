// Origine della richiesta, tunnel o locale (ADR-0002 §2.7, F1-19).
// Unico punto che decide l'origine e firma le intestazioni verso il backend:
// lo usano il middleware (rewrite /api), il proxy di streaming e la rotta TTS.

const cloudflareHeaders = ['cf-connecting-ip', 'cf-ray', 'cf-visitor'];

export const originHeaders = ['x-counselorbot-origin', 'x-counselorbot-client-ip', 'x-counselorbot-frontend-secret'];

export type RequestOrigin = 'tunnel' | 'local';

// Cloudflare imposta sempre le cf-* sull'edge e un client non può toglierle.
export function requestOrigin(headers: Headers): RequestOrigin {
    return cloudflareHeaders.some((name) => headers.has(name)) ? 'tunnel' : 'local';
}

// Tunnel: l'IP visto da Cloudflare. Locale: l'indirizzo della connessione, che
// Next scrive in x-forwarded-for quando il client non lo manda (sul PC del
// docente il frontend ascolta solo su 127.0.0.1).
function clientIP(headers: Headers, origin: RequestOrigin): string {
    if (origin === 'tunnel') return headers.get('cf-connecting-ip')?.trim() || 'unknown';
    return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
}

// Cancella sempre le intestazioni di origine in arrivo (mai fidarsi del client).
// Le reimposta solo con COUNSELORBOT_FRONTEND_SECRET (app desktop): senza
// segreto, come in produzione Docker, non aggiunge nulla.
export function applyRequestOrigin(source: Headers, target: Headers, env: Record<string, string | undefined> = process.env): void {
    for (const name of originHeaders) target.delete(name);
    const secret = env.COUNSELORBOT_FRONTEND_SECRET;
    if (!secret) return;
    const origin = requestOrigin(source);
    target.set('x-counselorbot-origin', origin);
    target.set('x-counselorbot-client-ip', clientIP(source, origin));
    target.set('x-counselorbot-frontend-secret', secret);
}
