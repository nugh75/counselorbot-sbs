'use client';

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/Button';
import { visualLabel } from '@/lib/i18n-visual-tools';

export function ConfirmActionDialog({ locale, title, onConfirm, onCancel }: {
    locale: string;
    title: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    const ref = useRef<HTMLDialogElement>(null);
    const id = useId();
    const l = (key: string) => visualLabel(locale, key);
    useEffect(() => {
        const opener = document.activeElement as HTMLElement | null;
        const dialog = ref.current;
        dialog?.showModal();
        return () => { dialog?.close(); if (opener?.isConnected) opener.focus(); };
    }, []);

    return createPortal(<dialog
        ref={ref}
        aria-labelledby={`${id}-question`}
        aria-describedby={`${id}-activity`}
        className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-slate-200 bg-white p-5 text-slate-800 shadow-xl backdrop:bg-slate-900/50"
        onCancel={event => { event.preventDefault(); onCancel(); }}
        onKeyDown={event => {
            event.stopPropagation();
            if (event.key !== 'Tab') return;
            const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button');
            const first = buttons[0], last = buttons[buttons.length - 1];
            if (event.shiftKey ? document.activeElement === first : document.activeElement === last) {
                event.preventDefault();
                (event.shiftKey ? last : first)?.focus();
            }
        }}
    >
        <h3 id={`${id}-question`} className="text-lg font-semibold">{l('confirmDeleteAction')}</h3>
        <p id={`${id}-activity`} className="mt-2 break-words text-sm text-slate-600">{title}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" autoFocus onClick={onCancel}>{l('deckCancel')}</Button>
            <Button type="button" variant="danger" onClick={onConfirm}>{l('remove')}</Button>
        </div>
    </dialog>, document.body);
}
