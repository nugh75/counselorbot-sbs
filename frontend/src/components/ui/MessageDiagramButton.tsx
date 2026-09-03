'use client';

import { useEffect, useRef, useState } from 'react';
import { GitBranch, Loader2 } from 'lucide-react';
import { useDarkMode } from '@/lib/use-dark-mode';
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
 * studente, e il disegno arriva con titolo e legenda incorporati perche' vive
 * fuori dalla card che altrove glieli fornisce.
 */
export function MessageDiagramButton({ text, locale, label, failedLabel }: MessageDiagramButtonProps) {
    const isDark = useDarkMode();
    const [state, setState] = useState<State>('idle');
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const objectUrlRef = useRef<string | null>(null);

    useEffect(() => () => {
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    }, []);

    const request = async () => {
        if (state === 'loading') return;
        setState('loading');
        try {
            const response = await fetch('/api/diagram/from-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text.slice(0, 8000),
                    theme: isDark ? 'dark' : 'light',
                    lang: locale,
                    embed_title: true,
                }),
            });
            if (!response.ok) throw new Error(`diagram failed: ${response.status}`);
            const blob = await response.blob();
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = URL.createObjectURL(blob);
            setImageUrl(objectUrlRef.current);
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
            {state === 'failed' && (
                <span className="text-2xs text-slate-500">{failedLabel}</span>
            )}
            {state === 'done' && imageUrl && (
                <figure className="my-2 w-full min-w-0 max-w-full basis-full overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="flex w-full min-w-0 max-w-full justify-center overflow-hidden p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={imageUrl} alt={label} className="block h-auto max-h-[26rem] w-auto max-w-full object-contain" />
                    </div>
                </figure>
            )}
        </>
    );
}
