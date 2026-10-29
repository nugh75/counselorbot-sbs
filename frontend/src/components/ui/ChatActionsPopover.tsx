'use client';

import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { Tooltip, TooltipPortalContainer } from '@/components/ui/Tooltip';
import { ChatMenuLevel } from '@/components/ui/ChatOptionsMenu';

/** Native popovers escape the transcript's clipping and handle outside tap/Escape. */
export function ChatActionsPopover({ label, children, icon, disabled, onOpenChange }: {
    label: string;
    children: (close: () => void) => ReactNode;
    icon?: ReactNode;
    disabled?: boolean;
    onOpenChange?: (open: boolean) => void;
}) {
    const id = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const [tooltipContainer, setTooltipContainer] = useState<HTMLDivElement | null>(null);
    const attachPanel = useCallback((element: HTMLDivElement | null) => {
        panel.current = element;
        setTooltipContainer(element);
    }, []);
    const [open, setOpen] = useState(false);
    // Sottolivello aperto (id della riga che l'ha aperto) e suo contenitore.
    const [sub, setSub] = useState<string | null>(null);
    const [subContainer, setSubContainer] = useState<HTMLDivElement | null>(null);
    // Al ritorno il fuoco torna sulla riga che ha aperto il sottolivello.
    const returnFocus = useRef<string | null>(null);
    const back = useCallback(() => setSub(current => { returnFocus.current = current; return null; }), []);
    useLayoutEffect(() => {
        if (sub || !returnFocus.current) return;
        document.getElementById(returnFocus.current)?.focus({ preventScroll: true });
        returnFocus.current = null;
    }, [sub]);

    useLayoutEffect(() => {
        if (!open) return;
        const position = () => {
            const element = panel.current;
            const anchor = trigger.current;
            if (!element || !anchor) return;
            const viewport = window.visualViewport;
            const left = viewport?.offsetLeft ?? 0;
            const top = viewport?.offsetTop ?? 0;
            const width = viewport?.width ?? window.innerWidth;
            const height = viewport?.height ?? window.innerHeight;
            element.style.width = `${Math.min(260, width - 16)}px`;
            element.style.maxHeight = `${height - 16}px`;
            const rect = anchor.getBoundingClientRect();
            const above = rect.top - element.offsetHeight - 6;
            element.style.left = `${Math.max(left + 8, Math.min(rect.left, left + width - element.offsetWidth - 8))}px`;
            element.style.top = `${Math.max(top + 8, Math.min(above >= top + 8 ? above : rect.bottom + 6, top + height - element.offsetHeight - 8))}px`;
        };
        position();
        const observer = new ResizeObserver(position);
        if (panel.current) observer.observe(panel.current);
        window.addEventListener('scroll', position, true);
        window.addEventListener('resize', position);
        window.visualViewport?.addEventListener('resize', position);
        window.visualViewport?.addEventListener('scroll', position);
        return () => {
            observer.disconnect();
            window.removeEventListener('scroll', position, true);
            window.removeEventListener('resize', position);
            window.visualViewport?.removeEventListener('resize', position);
            window.visualViewport?.removeEventListener('scroll', position);
        };
    }, [open]);

    const close = () => {
        document.getElementById(id)?.hidePopover();
        document.getElementById(`${id}-trigger`)?.focus({ preventScroll: true });
    };

    return <div className="shrink-0">
            <Tooltip content={label}>
                <button ref={trigger} id={`${id}-trigger`} type="button" popoverTarget={id} aria-label={label} aria-expanded={open} aria-controls={id} disabled={disabled}
                    className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                    {icon ?? <MoreVertical className="h-5 w-5" aria-hidden="true" />}
                </button>
            </Tooltip>
            <div ref={attachPanel} id={id} popover="auto" role="group" aria-label={label}
                onToggle={event => { const next = event.newState === 'open'; setOpen(next); if (!next) setSub(null); onOpenChange?.(next); }}
                onKeyDown={event => { if (event.key === 'Escape' && sub) { event.preventDefault(); event.stopPropagation(); back(); } }}
                className="chat-options fixed m-0 overflow-visible rounded-lg border border-slate-200 bg-white text-slate-700 shadow-lg"
                style={{ inset: 'auto', visibility: open ? 'visible' : 'hidden' }}>
                <TooltipPortalContainer.Provider value={tooltipContainer}>
                    <ChatMenuLevel.Provider value={{ active: sub, open: setSub, back, container: subContainer }}>
                        <div className="overflow-y-auto p-2" style={{ maxHeight: 'inherit' }}>
                            <div hidden={!!sub}>{children(close)}</div>
                            <div ref={setSubContainer} hidden={!sub} />
                        </div>
                    </ChatMenuLevel.Provider>
                </TooltipPortalContainer.Provider>
            </div>
    </div>;
}
