'use client';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import type { CatalogEntry } from '@/lib/goals';
import { Field, input } from './GoalUI';

export function GoalCatalogDialog({ catalog, onPick, onClose }: { catalog: CatalogEntry[]; onPick: (entry: CatalogEntry) => void; onClose: () => void }) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const dialog = useRef<HTMLDialogElement>(null);
    const [search, setSearch] = useState(''); const [area, setArea] = useState('');
    useEffect(() => { const node = dialog.current; if (node && !node.open) node.showModal(); }, []);
    const entries = catalog.filter(row => (!area || row.data.area === area) && `${row.data.title} ${row.data.description} ${row.data.audience}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    return <dialog ref={dialog} aria-labelledby="goal-catalog-title" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === dialog.current) onClose(); }}
        className="m-0 h-dvh max-h-none w-full max-w-none bg-white p-0 text-slate-900 backdrop:bg-slate-900/50 sm:m-auto sm:h-auto sm:max-h-[90vh] sm:max-w-4xl sm:rounded-xl">
        <div className="flex h-full max-h-[inherit] flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 sm:px-6"><h2 id="goal-catalog-title" className="text-xl font-bold">{l('catalog')}</h2><Button type="button" variant="ghost" aria-label={l('close')} onClick={onClose}><X className="h-5 w-5" aria-hidden /></Button></div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:px-6">
                <div className="grid gap-3 sm:grid-cols-2"><Field label={l('search')}><input className={input} value={search} onChange={e => setSearch(e.target.value)} /></Field><Field label={l('area')}><select className={input} value={area} onChange={e => setArea(e.target.value)}><option value="">{l('allAreas')}</option>{[...new Set(catalog.map(row => row.data.area).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</select></Field></div>
                {!entries.length && <p>{l('noResults')}</p>}
                <div className="grid gap-4 md:grid-cols-2">{entries.map(entry => <article key={entry.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5"><p className="text-xs text-slate-500">{entry.data.area} · {entry.data.language.toUpperCase()}{entry.data.audience && ` · ${entry.data.audience}`}</p><h3 className="break-words text-lg font-bold" lang={entry.data.language}>{entry.data.title}</h3><p className="whitespace-pre-wrap text-sm text-slate-600" lang={entry.data.language}>{entry.data.description}</p>{entry.data.suggestions && <details className="text-sm"><summary className="cursor-pointer py-2">{l('suggestions')}</summary><p className="whitespace-pre-wrap" lang={entry.data.language}>{entry.data.suggestions}</p></details>}<Button type="button" variant="secondary" className="mt-auto self-start" onClick={() => onPick(entry)}>{l('adopt')}</Button></article>)}</div>
            </div>
        </div>
    </dialog>;
}
