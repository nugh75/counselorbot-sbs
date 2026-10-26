'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { classPathText } from '@/lib/i18n-class-paths';
import { stepKindText } from '@/lib/i18n-step-kinds';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { Button } from '@/components/ui/Button';

export type ResourceDraft = (dirty: boolean, busy: boolean) => void;

/** The plan stays mounted while its shared class resource is edited. */
export function PathResourceDialog({ title, planDirty, onClose, children }: {
    title: string; planDirty: boolean; onClose: () => void;
    children: (controls: { onDraft: ResourceDraft; close: () => void }) => ReactNode;
}) {
    const { lang } = useI18n();
    const id = useId();
    const root = useRef<HTMLDivElement>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    const [draft, setDraft] = useState({dirty: false, busy: false});
    const liveDraft = useRef(draft);
    const onDraft = useCallback<ResourceDraft>((dirty, busy) => {
        liveDraft.current = {dirty, busy};
        setDraft(previous => previous.dirty === dirty && previous.busy === busy ? previous : {dirty, busy});
    }, []);
    const close = () => {
        const current = liveDraft.current;
        if (!current.busy && (!current.dirty || window.confirm(classPathText(lang, 'discard')))) onClose();
    };
    const closeRef = useRef(close);
    useEffect(() => { closeRef.current = close; });
    useDraftGuard(planDirty || draft.dirty || draft.busy, classPathText(lang, 'discard'), {blocked: draft.busy});

    useEffect(() => {
        const previousFocus = document.activeElement;
        const siblings = Array.from(document.body.children)
            .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== root.current)
            .map(node => ({node, inert: node.inert}));
        siblings.forEach(({node}) => { node.inert = true; });
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        heading.current?.focus();
        const keydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
            if (event.key !== 'Tab') return;
            const controls = Array.from(root.current?.querySelectorAll<HTMLElement>(
                'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
            ) ?? []).filter(node => node.getClientRects().length > 0);
            const first = controls[0], last = controls[controls.length - 1];
            if (!first) { event.preventDefault(); heading.current?.focus(); return; }
            const outside = !controls.includes(document.activeElement as HTMLElement);
            if (event.shiftKey && (document.activeElement === first || outside)) { event.preventDefault(); last.focus(); }
            if (!event.shiftKey && (document.activeElement === last || outside)) { event.preventDefault(); first.focus(); }
        };
        document.addEventListener('keydown', keydown);
        return () => {
            document.removeEventListener('keydown', keydown);
            siblings.forEach(({node, inert}) => { node.inert = inert; });
            document.body.style.overflow = overflow;
            if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        };
    }, []);

    // The render prop forwards these callbacks to event handlers/effects only.
    // eslint-disable-next-line react-hooks/refs -- No callback is invoked during rendering; the live draft guards immediate Escape.
    const content = children({onDraft, close});
    return createPortal(<div ref={root} className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3">
        <section role="dialog" aria-modal="true" aria-labelledby={id}
            className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
                <h2 ref={heading} id={id} tabIndex={-1} className="text-lg font-semibold text-slate-900">{title}</h2>
                <Button variant="ghost" disabled={draft.busy} onClick={close} aria-label={stepKindText(lang, 'close')}>
                    <X className="h-5 w-5" aria-hidden />
                </Button>
            </div>
            {content}
        </section>
    </div>, document.body);
}
