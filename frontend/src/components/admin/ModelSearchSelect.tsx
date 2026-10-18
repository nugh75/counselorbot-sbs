'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { modelSearchOptions } from '@/lib/model-search';

export function ModelSearchSelect({ id, models, value, onChange, disabled = false, loading = false, emptyLabel, labels = {} }: {
    id: string;
    models: readonly string[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    loading?: boolean;
    emptyLabel?: string;
    labels?: Readonly<Record<string, string>>;
}) {
    const { t } = useI18n();
    const [query, setQuery] = useState('');
    const { matches, total, selectedHidden } = modelSearchOptions(models, value, query, labels);
    const noMatches = !!query.trim() && matches.length === 0;
    const inputClass = 'min-h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60';

    return (
        <div className="min-w-0 space-y-2">
            <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                    id={`${id}_search`}
                    type="search"
                    aria-label={t('admin.config.searchModelPlaceholder')}
                    aria-controls={id}
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setQuery(''); } }}
                    disabled={disabled}
                    placeholder={t('admin.config.searchModelPlaceholder')}
                    className={`${inputClass} pl-9 pr-10`}
                />
                {query && (
                    <button type="button" aria-label={t('admin.config.clearSearch')} onClick={() => setQuery('')} className="absolute right-0 top-0 inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-500 hover:text-slate-900">
                        <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                )}
            </div>
            <select id={id} aria-label={t('admin.presets.model')} value={value} onChange={event => onChange(event.target.value)} disabled={disabled || loading} aria-busy={loading} className={inputClass}>
                {/* Keep the controlled value even when it falls outside the filter. */}
                {selectedHidden && <option hidden value={value}>{value}</option>}
                {!value && <option value="">{emptyLabel || '—'}</option>}
                {matches.map(model => <option key={model} value={model}>{labels[model] || model}</option>)}
            </select>
            <p id={`${id}_status`} role="status" className="text-xs font-normal text-slate-500">
                {loading ? '…' : noMatches ? t('admin.config.noModelsFound', { query: query.trim() }) : t('admin.config.modelsFiltered', { n: matches.length, total })}
            </p>
        </div>
    );
}
