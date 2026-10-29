'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { GitBranch, Loader2, RotateCcw, Send } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { DiagramBlock } from '@/components/ui/DiagramBlock';
import { getSelectedCounselorId } from '@/lib/counselor';
import { parseDiagramSpec, type DiagramSpec } from '@/lib/diagram-content';
import { buildDiagramFromMessageRequest, messageDiagramKey } from '@/lib/diagram-request';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/auth';
import { diagramRequestLabel } from '@/lib/i18n-diagram';

export interface SavedMessageDiagram { source_text: string; source_key: string; instruction: string; spec: DiagramSpec }

interface MessageDiagramButtonProps {
    text: string;
    locale: string;
    label: string;
    failedLabel: string;
    placeholder: string;
    submitLabel: string;
    sessionId: string;
    sourceText: string;
    savedDiagrams: Record<string, SavedMessageDiagram>;
    onSaved: (diagram: SavedMessageDiagram) => void;
    disabled?: boolean;
    renderTrigger?: (toggle: () => void, open: boolean) => ReactNode;
}

type State = 'idle' | 'loading' | 'done' | 'failed';

/**
 * Chiede su richiesta il diagramma di un messaggio gia' scritto.
 *
 * Il bottone apre un campo: lo studente puo' dire che disegno vuole, o lasciarlo
 * vuoto e prendere il diagramma di cio' che il messaggio gia' dice. Il campo
 * resta aperto dopo il disegno e diventa una correzione: il testo dice cosa
 * cambiare nel disegno visibile; vuoto, il diagramma si rifa' da capo.
 *
 * Il disegno appartiene al messaggio da cui nasce: se la riga mostra un altro
 * messaggio (nuovo turno, risposta rigenerata) il disegno precedente sparisce.
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
    sessionId,
    sourceText,
    savedDiagrams,
    onSaved,
    disabled,
    renderTrigger,
}: MessageDiagramButtonProps) {
    const [open, setOpen] = useState(false);
    const [instruction, setInstruction] = useState('');
    const [status, setStatus] = useState<{ key: string; state: State }>({ key: '', state: 'idle' });
    const [result, setResult] = useState<{ key: string; spec: DiagramSpec } | null>(null);
    const [error, setError] = useState('');
    const [sourceKey, setSourceKey] = useState('');
    useEffect(() => {
        let active = true;
        void messageDiagramKey(sourceText).then(key => { if (active) setSourceKey(key); });
        return () => { active = false; };
    }, [sourceText]);
    const savedDiagram = savedDiagrams[sourceKey];
    const requestRef = useRef<AbortController | null>(null);
    useEffect(() => () => requestRef.current?.abort(), []);
    const spec = result && result.key === sourceKey ? result.spec : null;
    const visibleSpec = spec || savedDiagram?.spec;
    const correcting = !!visibleSpec;
    const state = status.key === sourceKey ? status.state : 'idle';

    const request = async () => {
        const key = sourceKey;
        if (state === 'loading' || disabled || !key) return;
        const controller = new AbortController();
        requestRef.current = controller;
        const timeout = window.setTimeout(() => controller.abort(), 120000);
        const setState = (next: State) => setStatus({ key, state: next });
        setState('loading');
        try {
            const counselorId = getSelectedCounselorId();
            if (counselorId === null) throw new Error(diagramRequestLabel('disabled', locale));
            const response = await apiFetch('/api/diagram/from-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildDiagramFromMessageRequest(
                    text,
                    locale,
                    instruction,
                    counselorId,
                    sessionId,
                    sourceText,
                    visibleSpec,
                )),
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(diagramRequestLabel(response.status === 422 ? 'unsuitable' : [401, 403, 404].includes(response.status) ? 'disabled' : 'unavailable', locale));
            }
            const parsed = parseDiagramSpec(await response.json());
            if (!parsed) throw new Error(diagramRequestLabel('unsuitable', locale));
            setResult({ key, spec: parsed });
            onSaved({ source_text: sourceText.trim(), source_key: key, instruction, spec: parsed });
            setInstruction('');
            setState('done');
        } catch (error) {
            setError(error instanceof DOMException && error.name === 'AbortError' ? diagramRequestLabel('unavailable', locale) : error instanceof Error ? error.message : failedLabel);
            setState('failed');
        } finally {
            window.clearTimeout(timeout);
        }
    };

    const toggle = () => setOpen(value => !value);

    return (
        <>
            {renderTrigger ? renderTrigger(toggle, open) : <Tooltip content={label}><button
                type="button"
                onClick={toggle}
                disabled={disabled}
                aria-label={label}
                aria-expanded={open}
                className={cn(
                    'inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md transition-colors',
                    open ? 'bg-slate-100 text-slate-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-600',
                )}
            >
                <GitBranch className="h-4 w-4" aria-hidden="true" />
            </button></Tooltip>}
            {open && (
                <form
                    onSubmit={(event) => {
                        event.preventDefault();
                        void request();
                    }}
                    className="flex min-w-0 w-full basis-full items-center gap-1.5 py-1"
                >
                    <input
                        type="text"
                        value={instruction}
                        onChange={(event) => setInstruction(event.target.value)}
                        placeholder={correcting ? diagramRequestLabel('correct', locale) : placeholder}
                        aria-label={correcting ? diagramRequestLabel('correct', locale) : placeholder}
                        maxLength={400}
                        autoFocus
                        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17747a]"
                    />
                    <Tooltip content={correcting ? diagramRequestLabel('correctSend', locale) : submitLabel}><button
                        type="submit"
                        disabled={state === 'loading' || disabled}
                        aria-label={correcting ? diagramRequestLabel('correctSend', locale) : submitLabel}
                        className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-50 hover:text-[#17747a] disabled:opacity-50"
                    >
                        {state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button></Tooltip>
                </form>
            )}
            {state === 'failed' && <div role="alert" className="flex w-full flex-wrap items-center gap-2 text-xs text-slate-600">
                <span>{error || failedLabel}</span>
                <Tooltip content={diagramRequestLabel('retry', locale)}><button type="button" aria-label={diagramRequestLabel('retry', locale)} onClick={() => void request()} className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"><RotateCcw className="h-4 w-4" aria-hidden="true" /></button></Tooltip>
            </div>}
            {visibleSpec && (
                <div className="min-w-0 w-full basis-full">
                    <DiagramBlock spec={visibleSpec} locale={locale} />
                    <p className="text-2xs text-slate-500" role="status">{diagramRequestLabel('saved', locale)}</p>
                </div>
            )}
        </>
    );
}
