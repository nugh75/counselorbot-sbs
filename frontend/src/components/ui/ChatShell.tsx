'use client';

import type { ComponentProps, Dispatch, HTMLAttributes, SetStateAction } from 'react';
import { Send, Square } from 'lucide-react';
import { AutoGrowTextarea } from '@/components/ui/AutoGrowTextarea';
import { cn } from '@/lib/utils';

// Guscio condiviso delle superfici di conversazione (chat guidata, Bussola,
// assistente), estratto dalla chat guidata: trascritto, riga del messaggio,
// campo di scrittura e pulsante invio/stop. Ogni superficie tiene la propria
// disposizione e le proprie azioni; qui stanno le parti che devono restare
// uguali ovunque. L'audio resta un componente a parte (AudioInput) che la
// superficie mette accanto al campo quando lo offre.

// Il trascritto è un role="log": va bene per navigarlo, ma da solo non dice
// nulla mentre la risposta arriva. Un aria-live sul contenitore riannuncerebbe
// a ogni token dello streaming, quindi l'annuncio vive in una regione a parte
// che porta due soli stati: l'attesa e poi la risposta finita.
export function ChatTranscript({ announcement, children, ...rest }: ComponentProps<'div'> & { announcement: string }) {
    return (
        <>
            <p className="sr-only" aria-live="polite">{announcement}</p>
            <div role="log" {...rest}>{children}</div>
        </>
    );
}

const JUSTIFY = { user: 'justify-end', assistant: 'justify-start', system: 'justify-center' } as const;

// Riga del messaggio: la colonna porta la larghezza massima unica della bolla e
// le azioni che le stanno sotto. I messaggi di sistema restano centrati, senza.
export function ChatRow({ role, className, children, ...rest }: Omit<HTMLAttributes<HTMLDivElement>, 'role'> & { role: keyof typeof JUSTIFY }) {
    return (
        <div {...rest} className={cn('flex min-w-0', JUSTIFY[role], className)}>
            {role === 'system' ? children : (
                <div className={cn('flex min-w-0 max-w-full flex-col gap-1 lg:max-w-[90%]', role === 'user' ? 'items-end' : 'items-start')}>
                    {children}
                </div>
            )}
        </div>
    );
}

// Invio spedisce il modulo, Maiusc+Invio va a capo. La superficie gestisce
// l'invio nell'onSubmit del suo <form>.
export function ChatComposerInput({ className, ...rest }: ComponentProps<typeof AutoGrowTextarea>) {
    return (
        <AutoGrowTextarea
            minRows={1}
            maxRows={6}
            onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                }
            }}
            {...rest}
            className={cn('min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-500 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50', className)}
        />
    );
}

// La radice del sito è 15px: h-11 da solo darebbe 41px, sotto l'area minima.
const BUTTON = 'inline-flex h-11 min-h-[44px] w-11 min-w-[44px] shrink-0 items-center justify-center rounded-md text-white transition-colors';

// Mentre la risposta arriva il primario ferma, non invia, se la superficie sa
// interrompere la richiesta (onStop); altrimenti resta l'invio disabilitato.
export function ChatSendButton({ loading = false, disabled, onStop, sendLabel, stopLabel }: {
    loading?: boolean;
    disabled?: boolean;
    onStop?: () => void;
    sendLabel: string;
    stopLabel?: string;
}) {
    if (loading && onStop) {
        return (
            <button type="button" onClick={onStop} aria-label={stopLabel} title={stopLabel} className={cn(BUTTON, 'bg-slate-700 hover:bg-slate-800')}>
                <Square className="h-5 w-5 fill-current" />
            </button>
        );
    }
    return (
        <button type="submit" disabled={disabled || loading} aria-label={sendLabel} className={cn(BUTTON, 'bg-indigo-600 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50')}>
            <Send className="h-5 w-5" />
        </button>
    );
}

// Suggerimenti rapidi sopra il campo, chiusi per non spingere giù il
// trascritto. Un suggerimento si aggiunge alla bozza invece di cancellarla; se
// finisce con «…» è un inizio di frase, e il cursore resta lì per completarla.
export function ChatSuggestions({ label, items, composerId, onInsert }: {
    label: string;
    items: string[];
    composerId: string;
    onInsert: Dispatch<SetStateAction<string>>;
}) {
    if (items.length === 0) return null;
    return (
        <details className="mb-2 text-xs text-slate-600">
            <summary className="min-h-9 cursor-pointer py-2">{label}</summary>
            <div className="flex flex-wrap gap-1.5 pb-2">
                {items.map((text) => (
                    <button key={text} type="button"
                        onClick={() => {
                            const draft = text.endsWith('…') ? text.slice(0, -1) + ' ' : text;
                            onInsert(previous => previous.trim() ? `${previous}\n\n${draft}` : draft);
                            window.requestAnimationFrame(() => document.getElementById(composerId)?.focus());
                        }}
                        className="min-h-9 max-w-full whitespace-normal break-words rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-left hover:bg-indigo-50">
                        {text}
                    </button>
                ))}
            </div>
        </details>
    );
}
