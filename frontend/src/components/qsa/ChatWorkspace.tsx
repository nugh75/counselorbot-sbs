'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { chatLayoutLabel } from '@/lib/i18n-chat-layout';
import { useI18n } from '@/lib/i18n-context';

const preferenceKey = 'cb_chat_panel';
const minWidth = 260;
const maxWidth = 480;
const desktopQuery = '(min-width: 1024px)';
const desktopSnapshot = () => window.matchMedia(desktopQuery).matches;
const serverSnapshot = () => false;
const subscribeDesktop = (notify: () => void) => {
    const media = window.matchMedia(desktopQuery);
    media.addEventListener('change', notify);
    return () => media.removeEventListener('change', notify);
};
function readPreferences() {
    try {
        const saved = JSON.parse(localStorage.getItem(preferenceKey) || 'null');
        return {
            open: typeof saved?.open === 'boolean' ? saved.open : true,
            width: typeof saved?.width === 'number' && Number.isFinite(saved.width) ? Math.max(minWidth, Math.min(maxWidth, saved.width)) : 300,
        };
    } catch { return { open: true, width: 300 }; }
}

type MobilePanel = 'path' | 'scores' | 'resources';
type Props = {
    locale: string;
    subtitle: string;
    headerClassName?: string;
    onBack?: () => void;
    sidebar: (closeOnMobile: () => void, mobilePanel: MobilePanel | null) => ReactNode;
    tools: ReactNode;
    advancement?: ReactNode;
    children: (openPanel: (panel?: MobilePanel) => void) => ReactNode;
};

export function ChatWorkspace({ locale, subtitle, headerClassName = '', onBack, sidebar, tools, advancement, children }: Props) {
    const { t } = useI18n();
    const l = (key: string) => chatLayoutLabel(locale, key);
    const id = useId();
    const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, serverSnapshot);
    const [preferences, setPreferences] = useState(readPreferences);
    const { open: desktopOpen, width } = preferences;
    const [mobileOpen, setMobileOpen] = useState(false);
    const [mobilePanel, setMobilePanel] = useState<MobilePanel>('path');
    const dialog = useRef<HTMLDialogElement>(null);
    const [limit, setLimit] = useState(maxWidth);
    const grid = useRef<HTMLDivElement>(null);
    const drag = useRef<{ x: number; width: number } | null>(null);
    const visible = desktopOpen;
    const actualWidth = Math.min(width, limit);

    useEffect(() => {
        const observer = new ResizeObserver(entries => {
            setLimit(Math.max(minWidth, Math.min(maxWidth, entries[0].contentRect.width - 440)));
        });
        if (grid.current) observer.observe(grid.current);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch { /* Storage can be unavailable. */ }
    }, [preferences]);

    useEffect(() => {
        const element = dialog.current;
        if (!mobileOpen || desktop || !element) return;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        element.showModal();
        return () => { element.close(); document.body.style.overflow = overflow; };
    }, [mobileOpen, desktop]);

    const resize = (value: number) => setPreferences(previous => ({ ...previous, width: Math.max(minWidth, Math.min(limit, value)) }));
    const openPanel = (panel: MobilePanel = 'path') => {
        if (desktop) setPreferences(previous => ({ ...previous, open: true }));
        else { setMobilePanel(panel); setMobileOpen(true); return; }
        window.requestAnimationFrame(() => {
            const panel = document.getElementById(id);
            panel?.scrollIntoView({ block: 'start' });
            panel?.focus({ preventScroll: true });
        });
    };
    const panelContent = <aside id={id} tabIndex={-1} aria-label={l('panelTitle')} hidden={!desktop || !visible} className="min-h-0 min-w-0 overflow-y-auto pr-1">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-1">
            <h2 className="text-sm font-semibold text-slate-700">{l('panelTitle')}</h2>
            <Tooltip content={l('hide')}><button type="button" className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-md text-slate-600 hover:bg-slate-100" aria-label={l('hide')} aria-controls={id} aria-expanded={true} onClick={() => setPreferences(previous => ({ ...previous, open: false }))}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button></Tooltip>
        </div>
        <div id={`${id}-content`} className="space-y-4">{desktop && sidebar(() => {}, null)}{tools}</div>
    </aside>;

    return <div ref={grid} className="grid min-w-0 lg:h-chat" style={{ gridTemplateColumns: desktop ? visible ? `${actualWidth}px 16px minmax(0, 1fr)` : '44px minmax(0, 1fr)' : 'minmax(0, 1fr)' }}>
        {panelContent}
        {!desktop && <dialog ref={dialog} aria-modal="true" aria-labelledby={`${id}-title`} onCancel={() => setMobileOpen(false)}
            onKeyDown={event => {
                if (event.key !== 'Tab') return;
                const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex="0"]')]
                    .filter(element => element.getClientRects().length && element.tabIndex >= 0);
                const first = controls[0], last = controls[controls.length - 1];
                if (first && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
                    event.preventDefault(); (event.shiftKey ? last : first).focus();
                }
            }}
            className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-700 shadow-xl backdrop:bg-slate-950/60 open:flex">
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
                <h2 id={`${id}-title`} className="text-base font-semibold">{t(mobilePanel === 'resources' ? 'recommendations.title' : `guided.${mobilePanel}`)}</h2>
                <button type="button" autoFocus aria-label={l('close')} onClick={() => setMobileOpen(false)} className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md hover:bg-slate-100"><X className="h-5 w-5" aria-hidden="true" /></button>
            </header>
            <div className="min-h-0 overflow-y-auto overscroll-contain p-3">{sidebar(() => setMobileOpen(false), mobilePanel)}</div>
        </dialog>}
        {desktop && !visible && <div><Tooltip content={l('show')}><button type="button" className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-md text-slate-600 hover:bg-slate-100" aria-label={l('show')} aria-controls={id} aria-expanded={false} onClick={() => setPreferences(previous => ({ ...previous, open: true }))}><ChevronRight className="h-4 w-4" aria-hidden="true" /></button></Tooltip></div>}
        {desktop && visible && <div role="separator" tabIndex={0} aria-label={l('resize')} aria-orientation="vertical" aria-controls={id} aria-valuemin={minWidth} aria-valuemax={limit} aria-valuenow={Math.round(actualWidth)}
            className="group flex cursor-col-resize touch-none items-stretch justify-center rounded focus-visible:outline-2 focus-visible:outline-indigo-500"
            onPointerDown={event => { if (event.button !== 0) return; drag.current = { x: event.clientX, width: actualWidth }; event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus(); event.preventDefault(); }}
            onPointerMove={event => { if (drag.current) resize(drag.current.width + event.clientX - drag.current.x); }}
            onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
            onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
            onKeyDown={event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault(); resize(event.key === 'Home' ? minWidth : event.key === 'End' ? limit : actualWidth + (event.key === 'ArrowLeft' ? -20 : 20));
            }}><span className="w-px bg-slate-200 group-hover:bg-indigo-400" /></div>}
        <div className="guided-chat-column order-1 flex h-chat min-h-0 min-w-0 flex-col lg:order-none lg:h-full lg:gap-2">
        <section aria-labelledby="guided-chat-title" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <header className={`flex shrink-0 items-center gap-3 border-b border-slate-100 px-3 py-2 ${headerClassName}`}>
                {onBack && <BackButton onClick={onBack} label={t('nav.back')} />}
                <div className="min-w-0"><h3 id="guided-chat-title" className="font-bold text-slate-800">CounselorBot AI</h3><p className={`text-xs font-medium text-slate-500 ${advancement ? 'lg:hidden' : ''}`}>{subtitle}</p></div>
            </header>
            {children(openPanel)}
        </section>
        {advancement && <div className="hidden shrink-0 lg:block">{advancement}</div>}
        </div>
    </div>;
}
