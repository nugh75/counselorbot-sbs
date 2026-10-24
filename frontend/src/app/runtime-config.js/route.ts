import { runtimeConfigFromEnv, runtimeConfigScript } from '@/lib/runtime-config';

// Letta a ogni richiesta dall'ambiente del processo: cambia con il riavvio
// del server (o del guscio desktop), mai con una nuova build (F1-03).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET() {
    return new Response(runtimeConfigScript(runtimeConfigFromEnv(process.env)), {
        headers: {
            'Content-Type': 'text/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
        },
    });
}
