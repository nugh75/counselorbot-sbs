import { NextResponse, type NextRequest } from 'next/server';

import { applyRequestOrigin } from '@/lib/request-origin';

// Su ogni richiesta /api (rewrite verso il backend e rotte di streaming):
// - origine tunnel/locale firmata per il backend (ADR-0002 §2.7), in ogni
//   ambiente; senza COUNSELORBOT_FRONTEND_SECRET cancella solo le intestazioni
//   X-CounselorBot-Origin/Client-IP/Frontend-Secret inviate dal client;
// - identità di SVILUPPO: inietta gli header Remote-* fidati dal proxy /api,
//   così lo sviluppatore entra senza passare da ai4auth (il suo cookie è sul
//   dominio .ai4educ.org e localhost non può mai presentarlo).
export default function proxy(request: NextRequest) {
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
    return NextResponse.next({ request: { headers } });
}

export const config = {
    matcher: '/api/:path*',
};
