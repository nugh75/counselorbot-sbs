'use client';

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, ExternalLink, FileText, Plus, Search, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Spinner } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';
import { fetchIdeaBranches } from '@/lib/idea-map';
import {
    fetchIdeaKeptSources,
    ideaSourcePdfUrl,
    keepIdeaSources,
    removeIdeaSource,
    searchIdeaSources,
    type IdeaKeptSource,
    type IdeaSourceGroup,
    type IdeaSourceResult,
} from '@/lib/idea-sources';

interface IdeaSourcesPanelProps {
    sessionId: string;
    version: number;
    locale: string;
    // Il ramo su cui si sta lavorando: le fonti stanno con lui, non con la sessione.
    focus: string | null;
}

// Cercare fuori e' un gesto, non un automatismo: nessuna ricerca parte da sola
// a ogni turno. Si chiede, si guarda cosa e' venuto fuori, e resta attaccato al
// ramo solo quello che si sceglie di tenere.
export function IdeaSourcesPanel({ sessionId, version, locale, focus }: IdeaSourcesPanelProps) {
    const { t } = useI18n();
    const [group, setGroup] = useState<IdeaSourceGroup>('works');
    const [query, setQuery] = useState('');
    // Finche' non si tocca il campo, la domanda e' il nome del ramo: e' quasi
    // sempre quella giusta, e risparmia di riscriverla.
    const [touched, setTouched] = useState(false);
    const [yearFrom, setYearFrom] = useState('');
    const [oaOnly, setOaOnly] = useState(true);
    const [results, setResults] = useState<IdeaSourceResult[] | null>(null);
    const [kept, setKept] = useState<IdeaKeptSource[]>([]);
    const [busy, setBusy] = useState(false);
    const [keeping, setKeeping] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    const reloadKept = useCallback(async () => {
        if (!focus) return;
        setKept(await fetchIdeaKeptSources(sessionId, focus));
    }, [sessionId, focus]);

    useEffect(() => {
        if (!focus) return;
        let active = true;
        void fetchIdeaKeptSources(sessionId, focus).then((next) => { if (active) setKept(next); });
        return () => { active = false; };
    }, [sessionId, focus, version]);

    // Cambiare ramo cambia il lavoro: i risultati di prima non c'entrano piu'.
    const [resultsFocus, setResultsFocus] = useState(focus);
    if (resultsFocus !== focus) {
        setResultsFocus(focus);
        setResults(null);
        setTouched(false);
        setFailed(false);
    }

    useEffect(() => {
        if (touched || !focus) return;
        let alive = true;
        void fetchIdeaBranches(sessionId, locale).then((rows) => {
            const branch = rows.find((row) => row.id === focus);
            if (alive && branch) setQuery(branch.label);
        });
        return () => { alive = false; };
    }, [sessionId, locale, focus, touched, version]);

    const run = async () => {
        const text = query.trim();
        if (text.length < 3) return;
        setBusy(true);
        setFailed(false);
        try {
            const found = await searchIdeaSources(sessionId, {
                query: text,
                group,
                lang: locale,
                yearFrom: group === 'works' && yearFrom ? Number(yearFrom) : null,
                oaOnly: group === 'works' ? oaOnly : false,
            });
            if (found === null) setFailed(true);
            setResults(found ?? []);
        } finally {
            setBusy(false);
        }
    };

    const keepOne = async (item: IdeaSourceResult) => {
        if (!focus) return;
        setKeeping(item.url);
        try {
            if (await keepIdeaSources(sessionId, focus, [item]) === null) {
                setFailed(true);
                return;
            }
            await reloadKept();
        } finally {
            setKeeping(null);
        }
    };

    const drop = async (sourceId: number) => {
        if (await removeIdeaSource(sessionId, sourceId)) await reloadKept();
    };

    // Senza un ramo non c'e' un posto dove tenere le fonti.
    if (!focus) return null;

    const keptUrls = new Set(kept.map((row) => row.url));

    return (
        <section className="border-t border-slate-200 px-3 py-3">
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                {t('idea.sources.title')}
            </h4>

            <form
                className="mt-2 flex flex-wrap items-center gap-2"
                onSubmit={(event) => { event.preventDefault(); void run(); }}
            >
                <div className="inline-flex overflow-hidden rounded-control border border-slate-300">
                    {(['works', 'encyclopedia'] as IdeaSourceGroup[]).map((value) => (
                        <button
                            key={value}
                            type="button"
                            onClick={() => setGroup(value)}
                            aria-pressed={group === value}
                            className={cn(
                                'px-2.5 py-1 text-xs font-medium transition-colors',
                                group === value ? 'bg-brand text-ink-on-brand' : 'bg-white text-slate-600 hover:bg-slate-50',
                            )}
                        >
                            {t(`idea.sources.group.${value === 'works' ? 'works' : 'encyclopedia'}`)}
                        </button>
                    ))}
                </div>
                <input
                    value={query}
                    onChange={(event) => { setQuery(event.target.value); setTouched(true); }}
                    maxLength={200}
                    aria-label={t('idea.sources.query')}
                    placeholder={t('idea.sources.query')}
                    className="min-w-0 flex-1 rounded-control border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
                {group === 'works' && (
                    <>
                        <input
                            value={yearFrom}
                            onChange={(event) => setYearFrom(event.target.value.replace(/\D/g, '').slice(0, 4))}
                            inputMode="numeric"
                            aria-label={t('idea.sources.yearFrom')}
                            placeholder={t('idea.sources.yearFrom')}
                            className="w-20 rounded-control border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                        />
                        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                            <input
                                type="checkbox"
                                checked={oaOnly}
                                onChange={(event) => setOaOnly(event.target.checked)}
                                className="h-3.5 w-3.5 accent-brand"
                            />
                            {t('idea.sources.oaOnly')}
                        </label>
                    </>
                )}
                <Button
                    type="submit"
                    size="sm"
                    disabled={busy || query.trim().length < 3}
                    className="gap-1.5"
                >
                    {busy
                        ? <Spinner className="h-3.5 w-3.5" aria-hidden="true" />
                        : <Search className="h-3.5 w-3.5" aria-hidden="true" />}
                    {t('idea.sources.search')}
                </Button>
            </form>

            {failed && <p className="mt-2 text-xs text-danger-ink">{t('idea.sources.error')}</p>}

            {results !== null && (
                <div className="mt-3 space-y-2">
                    {results.length === 0 && (
                        <p className="text-xs text-slate-500">{t('idea.sources.none')}</p>
                    )}
                    {results.map((item) => (
                        <article key={item.url} className="rounded-control border border-slate-200 bg-white p-2.5">
                            <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                    <p className="break-words text-xs font-medium text-slate-800">{item.title}</p>
                                    <p className="mt-0.5 text-xs text-slate-500">
                                        {[item.authors, item.year, item.journal, item.source]
                                            .filter(Boolean).join(' · ')}
                                        {item.oa_status ? ` · ${item.oa_status}` : ''}
                                    </p>
                                    {item.abstract && (
                                        <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-600">
                                            {item.abstract}
                                        </p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void keepOne(item)}
                                    disabled={keptUrls.has(item.url) || keeping === item.url}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-control border border-brand-line px-2 py-1 text-xs font-medium text-link hover:bg-brand-soft disabled:opacity-40"
                                >
                                    {keeping === item.url
                                        ? <Spinner className="h-3 w-3" aria-hidden="true" />
                                        : <Plus className="h-3 w-3" aria-hidden="true" />}
                                    {t('idea.sources.keep')}
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            )}

            <h5 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t('idea.sources.kept')}
            </h5>
            {kept.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">{t('idea.sources.empty')}</p>
            ) : (
                <ul className="mt-1 space-y-1.5">
                    {kept.map((row) => (
                        <li key={row.id} className="flex items-start gap-2 rounded-control bg-slate-50 p-2">
                            <div className="min-w-0 flex-1">
                                <p className="break-words text-xs text-slate-800">{row.title}</p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                    <a
                                        href={row.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-link hover:underline"
                                    >
                                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                        {row.source}
                                    </a>
                                    {row.has_pdf && (
                                        <a
                                            href={ideaSourcePdfUrl(sessionId, row.id)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-link hover:underline"
                                        >
                                            <FileText className="h-3 w-3" aria-hidden="true" />
                                            {t('idea.sources.pdf')}
                                        </a>
                                    )}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => void drop(row.id)}
                                aria-label={t('idea.sources.remove')}
                                className="shrink-0 rounded-control p-1 text-slate-400 hover:bg-white hover:text-danger-ink"
                            >
                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <p className="mt-2 text-xs text-slate-400">{t('idea.sources.hint')}</p>
        </section>
    );
}
