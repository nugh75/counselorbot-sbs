'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AccountSetup } from '@/components/profile/AccountSetup';
import { useI18n } from '@/lib/i18n-context';

const CounselorNavigationContext = createContext<(() => void) | null>(null);
export const useCounselorNavigation = () => useContext(CounselorNavigationContext);

// Keep the workspace mounted: a route change would discard in-memory steps,
// unsent messages and the current Compass conversation.
export function CounselorNavigation({ children }: { children: React.ReactNode }) {
    const [open, setOpen] = useState(false);
    const [opener, setOpener] = useState<HTMLElement | null>(null);
    return <CounselorNavigationContext.Provider value={() => {
        setOpener(document.activeElement as HTMLElement);
        setOpen(true);
    }}>
        <div inert={open} aria-hidden={open || undefined}>{children}</div>
        {open && <CounselorPage onReturn={() => setOpen(false)} opener={opener} />}
    </CounselorNavigationContext.Provider>;
}

function CounselorPage({ onReturn, opener }: { onReturn: () => void; opener: HTMLElement | null }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const { t } = useI18n();
    useEffect(() => {
        const element = dialog.current;
        element?.showModal();
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            element?.close();
            document.body.style.overflow = overflow;
            const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>('button[aria-controls="mobile-menu"]');
            target?.focus({ preventScroll: true });
        };
    }, [opener]);
    return <dialog ref={dialog} aria-modal="true" aria-label={t('setup.counselor')} onCancel={event => { event.preventDefault(); onReturn(); }}
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto border-0 bg-slate-50 px-4 py-6 text-slate-900 sm:px-6">
        <AccountSetup counselorOnly onReturn={onReturn} />
    </dialog>;
}
