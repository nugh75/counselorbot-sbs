// Forward SSE without buffering, using the same backend as all other APIs.
import type { NextRequest } from 'next/server';
import { proxyChatStream } from '@/lib/stream-proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
    return proxyChatStream(request, '/site-chat/stream');
}
