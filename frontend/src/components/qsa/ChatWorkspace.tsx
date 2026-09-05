'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
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

type Props = {
    locale: string;
    subtitle: string;
    headerClassName?: string;
    resourceCount: number;
    onBack?: () => void;
    sidebar: (closeOnMobile: () => void) => ReactNode;
    tools: ReactNode;
    advancement?: ReactNode;
    children: (openPanel: () => void) => ReactNode;
};

export function ChatWorkspace({ locale, subtitle, headerClassName = '', resourceCount, onBack, sidebar, tools, advancement, children }: Props) {
    const { t } = useI18n();
    const l = (key: string) => chatLayoutLabel(locale, key);
    const id = useId();
    const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, serverSnapshot);
    const [preferences, setPreferences] = useState(readPreferences);
    const { open: desktopOpen, width } = preferences;
    const [mobileOpen, setMobileOpen] = useState(false);
    const [limit, setLimit] = useState(maxWidth);
    const grid = useRef<HTMLDivElement>(null);
    const drag = useRef<{ x: number; width: number } | null>(null);
    const visible = desktop ? desktopOpen : mobileOpen;
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

    const resize = (value: number) => setPreferences(previous => ({ ...previous, width: Math.max(minWidth, Math.min(limit, value)) }));
    const openPanel = () => {
        if (desktop) setPreferences(previous => ({ ...previous, open: true }));
        else setMobileOpen(true);
        window.requestAnimationFrame(() => {
            const panel = document.getElementById(id);
            panel?.scrollIntoView({ block: 'start' });
            panel?.focus({ preventScroll: true });
        });
    };
    const panelContent = <aside id={id} tabIndex={-1} aria-label={l('panelTitle')} hidden={desktop && !visible} className={desktop ? 'min-h-0 min-w-0 overflow-y-auto pr-1' : 'order-2 mt-4 rounded-xl border border-slate-200 bg-white p-3'}>
        {desktop ? <div className="mb-3 flex flex-wrap items-center justify-between gap-1">
            <h2 className="text-sm font-semibold text-slate-700">{l('panelTitle')}</h2>
            <Tooltip content={l('hide')}><button type="button" className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-md text-slate-600 hover:bg-slate-100" aria-label={l('hide')} aria-controls={id} aria-expanded={true} onClick={() => setPreferences(previous => ({ ...previous, open: false }))}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button></Tooltip>
        </div> : <button type="button" aria-expanded={visible} aria-controls={`${id}-content`} onClick={() => setMobileOpen(value => !value)} className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left text-sm font-semibold text-slate-700">
            <span>{l('panelTitle')}{resourceCount > 0 && <span className="ml-2 text-xs text-slate-500">({resourceCount})</span>}</span><ChevronDown className={`h-4 w-4 shrink-0 ${visible ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>}
        <div id={`${id}-content`} hidden={!visible} className="space-y-4">{sidebar(() => setMobileOpen(false))}{tools}</div>
    </aside>;

    return <div ref={grid} className="grid min-w-0 lg:h-chat" style={{ gridTemplateColumns: desktop ? visible ? `${actualWidth}px 16px minmax(0, 1fr)` : '44px minmax(0, 1fr)' : 'minmax(0, 1fr)' }}>
        {panelContent}
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
