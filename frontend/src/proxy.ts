import { NextResponse, type NextRequest } from 'next/server';
import { isShellInternalPath } from './lib/shell-internal';

// Identità di SVILUPPO: inietta gli header Remote-* fidati dal proxy /api,
// così lo sviluppatore entra senza passare da ai4auth (il suo cookie è sul
// dominio .ai4educ.org e localhost non può mai presentarlo).
// In produzione il middleware è un no-op: non tocca nessuna richiesta.
export default function proxy(request: NextRequest) {
    // Le rotte /internal/* del backend servono solo al guscio desktop: il
    // rewrite /api/:path* non deve mai inoltrarle (ADR-0002 §2.6).
    if (isShellInternalPath(request.nextUrl.pathname)) return new NextResponse(null, { status: 404 });
    if (process.env.NODE_ENV !== 'development') return NextResponse.next();
    if (!request.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();

    const user = process.env.DEV_AUTH_USER || 'dev';
    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-Auth-Secret', process.env.DEV_AUTH_SECRET || '');
    headers.set('Remote-User', user);
    headers.set('Remote-Email', `${user}@dev.local`);
    headers.set('Remote-Name', process.env.DEV_AUTH_NAME || user);
    headers.set('Remote-Groups', process.env.DEV_AUTH_GROUPS || 'studenti');
    return NextResponse.next({ request: { headers } });
}

export const config = {
    matcher: '/api/:path*',
};
