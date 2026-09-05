'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Maximize2, Minimize2, PanelLeft, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import { chatLayoutLabel } from '@/lib/i18n-chat-layout';

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
    hasSidebar: boolean;
    sidebar: (closeOnMobile: () => void) => ReactNode;
    tools: ReactNode;
    children: ReactNode;
};

export function ChatWorkspace({ locale, subtitle, headerClassName = '', resourceCount, hasSidebar, sidebar, tools, children }: Props) {
    const l = (key: string) => chatLayoutLabel(locale, key);
    const id = useId();
    const desktop = useSyncExternalStore(subscribeDesktop, desktopSnapshot, serverSnapshot);
    const [preferences, setPreferences] = useState(readPreferences);
    const { open: desktopOpen, width } = preferences;
    const [mobileOpen, setMobileOpen] = useState(false);
    const [limit, setLimit] = useState(maxWidth);
    const grid = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLElement>(null);
    const drag = useRef<{ x: number; width: number } | null>(null);
    const visible = hasSidebar && (desktop ? desktopOpen : mobileOpen);
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
    const togglePanel = () => {
        if (desktop) { setPreferences(previous => ({ ...previous, open: !previous.open })); return; }
        setMobileOpen(value => !value);
        if (!mobileOpen) window.requestAnimationFrame(() => panel.current?.scrollIntoView({ block: 'start' }));
    };
    const panelContent = <aside ref={panel} id={id} aria-label={l('panelTitle')} hidden={desktop && !visible} className={desktop ? 'min-h-0 min-w-0 overflow-y-auto pr-1' : 'order-2 mt-4 rounded-xl border border-slate-200 bg-white p-3'}>
        {desktop ? <div className="mb-3 flex flex-wrap items-center justify-between gap-1">
            <h2 className="text-sm font-semibold text-slate-700">{l('panelTitle')}</h2>
            <div className="flex gap-1">
                    <Tooltip content={l('narrow')}><Button type="button" variant="ghost" className="min-h-[44px] min-w-[44px] px-2" aria-label={l('narrow')} disabled={actualWidth <= minWidth} onClick={() => resize(actualWidth - 40)}><Minimize2 className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
                    <Tooltip content={l('widen')}><Button type="button" variant="ghost" className="min-h-[44px] min-w-[44px] px-2" aria-label={l('widen')} disabled={actualWidth >= limit} onClick={() => resize(actualWidth + 40)}><Maximize2 className="h-4 w-4" aria-hidden="true" /></Button></Tooltip>
            </div>
        </div> : <button type="button" aria-expanded={visible} aria-controls={`${id}-content`} onClick={() => setMobileOpen(value => !value)} className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left text-sm font-semibold text-slate-700">
            {l('panelTitle')}<ChevronDown className={`h-4 w-4 shrink-0 ${visible ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>}
        <div id={`${id}-content`} hidden={!visible} className="space-y-4">{sidebar(() => setMobileOpen(false))}</div>
    </aside>;

    return <div ref={grid} className="grid min-w-0 lg:h-chat" style={{ gridTemplateColumns: desktop && visible ? `${actualWidth}px 16px minmax(0, 1fr)` : 'minmax(0, 1fr)' }}>
        {hasSidebar && panelContent}
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
        <section aria-labelledby="guided-chat-title" className="order-1 flex h-chat min-h-[28rem] min-w-0 flex-col lg:order-none lg:h-full lg:min-h-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <header className={`flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-3 ${headerClassName}`}>
                <div className="min-w-0"><h3 id="guided-chat-title" className="font-bold text-slate-800">CounselorBot AI</h3><p className="text-xs font-medium text-slate-500">{subtitle}</p></div>
                <div className="flex max-w-full flex-wrap items-center gap-1">
                    {hasSidebar && <Tooltip content={l(visible ? 'hide' : 'show')}><button type="button" aria-label={l(visible ? 'hide' : 'show')} aria-expanded={visible} aria-controls={id}
                        onClick={togglePanel}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                        <PanelLeft className="h-4 w-4" aria-hidden="true" />{l('panel')}
                        {!visible && resourceCount > 0 && <span aria-label={`${l('resources')}: ${resourceCount}`} className="rounded-full bg-indigo-50 px-1.5 text-xs text-indigo-700">{resourceCount}</span>}
                    </button></Tooltip>}
                    {tools}
                </div>
            </header>
            {children}
        </section>
    </div>;
}
