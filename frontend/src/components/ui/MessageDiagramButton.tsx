'use client';

import { useState } from 'react';
import { GitBranch, Loader2 } from 'lucide-react';
import { DiagramBlock } from '@/components/ui/DiagramBlock';
import { parseDiagramSpec, type DiagramSpec } from '@/lib/diagram-content';
import { cn } from '@/lib/utils';

interface MessageDiagramButtonProps {
    text: string;
    locale: string;
    label: string;
    failedLabel: string;
}

type State = 'idle' | 'loading' | 'done' | 'failed';

/**
 * Chiede su richiesta il diagramma di un messaggio gia' scritto.
 *
 * Il diagramma dentro la risposta lo decide il modello; qui lo decide lo
 * studente. Il server torna lo spec, non l'immagine, cosi' il disegno finisce
 * nella stessa card degli altri e ne eredita titolo, legenda, zoom e schermo
 * intero invece di essere una figura a parte.
 */
export function MessageDiagramButton({ text, locale, label, failedLabel }: MessageDiagramButtonProps) {
    const [state, setState] = useState<State>('idle');
    const [spec, setSpec] = useState<DiagramSpec | null>(null);

    const request = async () => {
        if (state === 'loading') return;
        setState('loading');
        try {
            const response = await fetch('/api/diagram/from-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text.slice(0, 8000), lang: locale, spec_only: true }),
            });
            if (!response.ok) throw new Error(`diagram failed: ${response.status}`);
            const parsed = parseDiagramSpec(await response.json());
            if (!parsed) throw new Error('diagram spec rejected');
            setSpec(parsed);
            setState('done');
        } catch {
            setState('failed');
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={request}
                disabled={state === 'loading'}
                title={label}
                className={cn(
                    'flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-2xs font-medium text-slate-500 transition-colors',
                    'hover:bg-slate-50 hover:text-slate-600 disabled:opacity-60',
                )}
            >
                {state === 'loading' ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitBranch className="h-3 w-3" />}
                {label}
            </button>
            {state === 'failed' && <span className="text-2xs text-slate-500">{failedLabel}</span>}
            {state === 'done' && spec && (
                <div className="w-full basis-full">
                    <DiagramBlock spec={spec} locale={locale} />
                </div>
            )}
        </>
    );
}
