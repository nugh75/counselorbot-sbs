'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogBody } from '@/components/ui/Dialog';
import { Field, Input, Select } from '@/components/ui/Field';
import { useI18n } from '@/lib/i18n-context';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import type { CatalogEntry } from '@/lib/goals';

export function GoalCatalogDialog({ catalog, onPick, onClose }: { catalog: CatalogEntry[]; onPick: (entry: CatalogEntry) => void; onClose: () => void }) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const [search, setSearch] = useState(''); const [area, setArea] = useState('');
    const entries = catalog.filter(row => (!area || row.data.area === area) && `${row.data.title} ${row.data.description} ${row.data.audience}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
    return <Dialog title={l('catalog')} closeLabel={l('close')} onClose={onClose} width="lg">
        <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2"><Field label={l('search')}><Input value={search} onChange={e => setSearch(e.target.value)} /></Field><Field label={l('area')}><Select value={area} onChange={e => setArea(e.target.value)}><option value="">{l('allAreas')}</option>{[...new Set(catalog.map(row => row.data.area).filter(Boolean))].sort().map(value => <option key={value}>{value}</option>)}</Select></Field></div>
            {!entries.length && <p>{l('noResults')}</p>}
            <div className="grid gap-4 md:grid-cols-2">{entries.map(entry => <article key={entry.id} className="flex min-w-0 flex-col gap-4 rounded-card border border-line bg-surface p-6"><p className="text-xs text-ink-muted">{entry.data.area} · {entry.data.language.toUpperCase()}{entry.data.audience && ` · ${entry.data.audience}`}</p><h3 className="break-words text-lg font-semibold" lang={entry.data.language}>{entry.data.title}</h3><p className="whitespace-pre-wrap text-sm text-ink-muted" lang={entry.data.language}>{entry.data.description}</p>{entry.data.suggestions && <details className="text-sm"><summary className="cursor-pointer py-2">{l('suggestions')}</summary><p className="whitespace-pre-wrap" lang={entry.data.language}>{entry.data.suggestions}</p></details>}<Button type="button" variant="secondary" className="mt-auto self-start" onClick={() => onPick(entry)}>{l('adopt')}</Button></article>)}</div>
        </DialogBody>
    </Dialog>;
}
