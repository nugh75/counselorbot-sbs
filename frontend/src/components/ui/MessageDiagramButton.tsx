'use client';

import { useState } from 'react';
import { GitBranch, Loader2, Send } from 'lucide-react';
import { DiagramBlock } from '@/components/ui/DiagramBlock';
import { parseDiagramSpec, type DiagramSpec } from '@/lib/diagram-content';
import { cn } from '@/lib/utils';

interface MessageDiagramButtonProps {
    text: string;
    locale: string;
    label: string;
    failedLabel: string;
    placeholder: string;
    submitLabel: string;
}

type State = 'idle' | 'loading' | 'done' | 'failed';

/**
 * Chiede su richiesta il diagramma di un messaggio gia' scritto.
 *
 * Il bottone apre un campo: lo studente puo' dire che disegno vuole, o lasciarlo
 * vuoto e prendere il diagramma di cio' che il messaggio gia' dice. Il campo
 * resta aperto dopo il disegno, cosi' si puo' rifare chiedendo altro.
 *
 * Il server torna lo spec, non l'immagine, e il disegno finisce nella stessa
 * card degli altri: titolo, legenda, zoom, trascinamento, schermo intero.
 */
export function MessageDiagramButton({
    text,
    locale,
    label,
    failedLabel,
    placeholder,
    submitLabel,
}: MessageDiagramButtonProps) {
    const [open, setOpen] = useState(false);
    const [instruction, setInstruction] = useState('');
    const [state, setState] = useState<State>('idle');
    const [spec, setSpec] = useState<DiagramSpec | null>(null);

    const request = async () => {
        if (state === 'loading') return;
        setState('loading');
        try {
            const response = await fetch('/api/diagram/from-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text.slice(0, 8000),
                    lang: locale,
                    spec_only: true,
                    instruction: instruction.trim().slice(0, 400),
                }),
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
                onClick={() => setOpen((value) => !value)}
                title={label}
                aria-expanded={open}
                className={cn(
                    'flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-2xs font-medium transition-colors',
                    open ? 'bg-slate-100 text-slate-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-600',
                )}
            >
                <GitBranch className="h-3 w-3" />
                {label}
            </button>
            {open && (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void request();
                    }}
                    className="flex w-full basis-full items-center gap-1.5 py-1"
                >
                    <input
                        type="text"
                        value={instruction}
                        onChange={(event) => setInstruction(event.target.value)}
                        placeholder={placeholder}
                        maxLength={400}
                        autoFocus
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17747a]"
                    />
                    <button
                        type="submit"
                        disabled={state === 'loading'}
                        title={submitLabel}
                        aria-label={submitLabel}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-50 hover:text-[#17747a] disabled:opacity-50"
                    >
                        {state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                </form>
            )}
            {open && state === 'failed' && <span className="basis-full text-2xs text-slate-500">{failedLabel}</span>}
            {state === 'done' && spec && (
                <div className="w-full basis-full">
                    <DiagramBlock spec={spec} locale={locale} />
                </div>
            )}
        </>
    );
}
