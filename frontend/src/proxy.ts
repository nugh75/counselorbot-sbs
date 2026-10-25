import { NextResponse, type NextRequest } from 'next/server';
import { isShellInternalPath } from './lib/shell-internal';
import { backendOrigin } from './lib/backend-origin';

import { applyRequestOrigin } from '@/lib/request-origin';

// Su ogni richiesta /api (rewrite verso il backend e rotte di streaming):
// - origine tunnel/locale firmata per il backend (ADR-0002 §2.7), in ogni
//   ambiente; senza COUNSELORBOT_FRONTEND_SECRET cancella solo le intestazioni
//   X-CounselorBot-Origin/Client-IP/Frontend-Secret inviate dal client;
// - identità di SVILUPPO: inietta gli header Remote-* fidati dal proxy /api,
//   così lo sviluppatore entra senza passare da ai4auth (il suo cookie è sul
//   dominio .ai4educ.org e localhost non può mai presentarlo).
export default function proxy(request: NextRequest) {
    // Le rotte /internal/* del backend servono solo al guscio desktop: il
    // rewrite /api/:path* non deve mai inoltrarle (ADR-0002 §2.6).
    if (isShellInternalPath(request.nextUrl.pathname)) return new NextResponse(null, { status: 404 });
    if (!request.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();

    const headers = new Headers(request.headers);
    applyRequestOrigin(request.headers, headers);
    if (process.env.NODE_ENV === 'development') {
        const user = process.env.DEV_AUTH_USER || 'dev';
        headers.set('X-Forwarded-Auth-Secret', process.env.DEV_AUTH_SECRET || '');
        headers.set('Remote-User', user);
        headers.set('Remote-Email', `${user}@dev.local`);
        headers.set('Remote-Name', process.env.DEV_AUTH_NAME || user);
        headers.set('Remote-Groups', process.env.DEV_AUTH_GROUPS || 'studenti');
    }
    // Upgrades must reach the backend before the API catch-all filesystem
    // route matches: Next cannot upgrade a connection handled by an app route.
    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
        const upstream = `${backendOrigin()}${request.nextUrl.pathname.slice(4)}${request.nextUrl.search}`;
        return NextResponse.rewrite(new URL(upstream), { request: { headers } });
    }
    return NextResponse.next({ request: { headers } });
}

export const config = {
    matcher: '/api/:path*',
};
