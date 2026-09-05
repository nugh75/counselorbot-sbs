'use client';

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

/** Native popovers escape the transcript's clipping and handle outside tap/Escape. */
export function ChatActionsPopover({ label, children }: {
    label: string;
    children: (close: () => void) => ReactNode;
}) {
    const id = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);

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
                <button ref={trigger} id={`${id}-trigger`} type="button" popoverTarget={id} aria-label={label} aria-expanded={open} aria-controls={id}
                    className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-md text-slate-500 hover:bg-slate-100">
                    <MoreVertical className="h-5 w-5" aria-hidden="true" />
                </button>
            </Tooltip>
            <div ref={panel} id={id} popover="auto" role="group" aria-label={label}
                onToggle={event => setOpen(event.newState === 'open')}
                className="chat-options fixed m-0 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 text-slate-700 shadow-lg"
                style={{ inset: 'auto', visibility: open ? 'visible' : 'hidden' }}>
                {children(close)}
            </div>
    </div>;
}
