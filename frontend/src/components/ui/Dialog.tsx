'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

// Modal on the native <dialog>: full screen on mobile, a card from `sm`. Mounted
// means open: the parent unmounts it to close. Esc, the backdrop and the close
// button all call `onClose`, so the parent can confirm unsaved work first.
// Focus goes back to the opener on unmount.
const WIDTHS = { md: 'sm:max-w-3xl', lg: 'sm:max-w-4xl' } as const;

interface DialogProps {
    title: ReactNode;
    closeLabel: string;
    onClose: () => void;
    width?: keyof typeof WIDTHS;
    children: ReactNode;
}

export function Dialog({ title, closeLabel, onClose, width = 'md', children }: DialogProps) {
    const dialog = useRef<HTMLDialogElement>(null);
    const titleId = useId();
    useEffect(() => {
        const node = dialog.current; const opener = document.activeElement as HTMLElement | null;
        if (node && !node.open) node.showModal();
        return () => opener?.focus?.();
    }, []);
    return (
        <dialog ref={dialog} aria-labelledby={titleId}
            onCancel={event => { event.preventDefault(); onClose(); }}
            onClick={event => { if (event.target === dialog.current) onClose(); }}
            className={cn('m-0 h-dvh max-h-none w-full max-w-none bg-surface p-0 text-ink shadow-modal backdrop:bg-backdrop sm:m-auto sm:h-auto sm:max-h-[90vh] sm:rounded-card', WIDTHS[width])}>
            <div className="flex h-full max-h-[inherit] flex-col">
                <div className="flex items-start justify-between gap-4 border-b border-line p-4 sm:px-6">
                    <h2 id={titleId} className="min-w-0 break-words text-xl font-semibold">{title}</h2>
                    <Button type="button" variant="ghost" aria-label={closeLabel} onClick={onClose}><X className="h-5 w-5" aria-hidden /></Button>
                </div>
                {children}
            </div>
        </dialog>
    );
}

/** The scrolling middle of a Dialog. */
export function DialogBody({ className, children }: { className?: string; children: ReactNode }) {
    return <div className={cn('min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:px-6', className)}>{children}</div>;
}

/** The action row of a Dialog, under a rule. */
export function DialogFooter({ className, children }: { className?: string; children: ReactNode }) {
    return <div className={cn('flex flex-wrap items-center gap-2 border-t border-line bg-surface p-4 sm:px-6', className)}>{children}</div>;
}
