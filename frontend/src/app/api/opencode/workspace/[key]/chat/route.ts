import type { NextRequest } from 'next/server';
import { proxyChatStream } from '@/lib/stream-proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest, context: { params: Promise<{ key: string }> }) {
    const { key } = await context.params;
    return proxyChatStream(request, `/opencode/workspace/${encodeURIComponent(key)}/chat`);
}
