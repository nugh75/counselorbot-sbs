'use client';

import { Children, createContext, useContext, useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { chatLayoutLabel } from '@/lib/i18n-chat-layout';

// Sezioni titolate e sottolivello del menù «⋮» (#682). ChatActionsPopover
// fornisce il livello attivo; il sottolivello va in un contenitore accanto al
// livello principale, che resta nel DOM ma nascosto.
export const ChatMenuLevel = createContext<{
    active: string | null;
    open: (id: string) => void;
    back: () => void;
    container: HTMLElement | null;
} | null>(null);

export function ChatMenuSection({ title, children }: { title: string; children: ReactNode }) {
    const id = useId();
    if (Children.toArray(children).length === 0) return null;
    return <div role="group" aria-labelledby={id} className="py-2 first:pt-0 last:pb-0">
        <h3 id={id} className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        <div className="space-y-1">{children}</div>
    </div>;
}

// Riga «Etichetta  valore ›»: il tocco apre il sottolivello con il selettore.
export function ChatMenuSetting({ icon, label, value, title, disabled, children }: {
    icon: ReactNode;
    label: string;
    value: string;
    title: string;
    disabled?: boolean;
    children: ReactNode;
}) {
    const id = useId();
    const level = useContext(ChatMenuLevel);
    const { lang } = useI18n();
    const backButton = useRef<HTMLButtonElement>(null);
    const active = level?.active === id;
    useLayoutEffect(() => { if (active) backButton.current?.focus({ preventScroll: true }); }, [active]);
    return <>
        <button type="button" id={id} aria-label={`${label}: ${value}`} disabled={disabled} onClick={() => level?.open(id)}
            className="flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            {icon}
            <span className="min-w-0 flex-1">{label}</span>
            <span className="truncate text-slate-500">{value}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </button>
        {active && level.container && createPortal(<div role="group" aria-labelledby={`${id}-title`}>
            <div className="flex items-center gap-1 border-b border-slate-200 pb-1">
                <button ref={backButton} type="button" aria-label={chatLayoutLabel(lang, 'menuBack')} onClick={level.back}
                    className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <h3 id={`${id}-title`} className="min-w-0 text-sm font-semibold text-slate-700">{title}</h3>
            </div>
            <div className="space-y-2 pt-2">{children}</div>
        </div>, level.container)}
    </>;
}

// Variante a elenco dei selettori esistenti, usata nel sottolivello.
export const listRadioGroupClass = 'flex w-full flex-col gap-1';
export function listRadioClass(active: boolean) {
    return `flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${active ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`;
}
export function ListRadioMark({ active }: { active: boolean }) {
    return <span aria-hidden="true" className={`h-4 w-4 shrink-0 rounded-full ${active ? 'border-[5px] border-slate-700' : 'border border-slate-400'}`} />;
}
