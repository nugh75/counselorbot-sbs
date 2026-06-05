'use client';

import { useEffect, useMemo, useState } from 'react';
import { BrainCircuit, Check, Download, Filter, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { LANGUAGES } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { cn } from '@/lib/utils';

interface TrainingSummary {
    total: number;
    by_status: Record<string, number>;
    by_locale: Record<string, number>;
    by_phase: Record<string, number>;
}

interface TrainingExample {
    id: number;
    instrument_code: string;
    locale: string;
    phase: string;
    step_label: string | null;
    scores: Record<string, number> | null;
    scores_context: string;
    student_message: string;
    assistant_answer: string;
    status: 'pending' | 'approved' | 'rejected' | 'edited';
    review_notes: string | null;
    auto_score: Record<string, unknown> | null;
    source: string;
    created_at: string;
    updated_at: string | null;
}

const PHASES = [
    'cognitive',
    'affective',
    'sl-elaboration',
    'sl-selfcontrol',
    'sl-motivation',
    'sl-emotions',
    'sl-attribution',
    'sl-social',
    'questions',
    'conclusion',
];

const STATUSES = ['', 'pending', 'approved', 'edited', 'rejected'];

function queryString(filters: { instrument: string; locale: string; phase: string; status: string }) {
    const params = new URLSearchParams();
    if (filters.instrument) params.set('instrument_code', filters.instrument);
    if (filters.locale) params.set('locale', filters.locale);
    if (filters.phase) params.set('phase', filters.phase);
    if (filters.status) params.set('status', filters.status);
    const qs = params.toString();
    return qs ? `?${qs}` : '';
}

function statusClass(status: TrainingExample['status']) {
    if (status === 'approved') return 'bg-green-100 text-green-700';
    if (status === 'edited') return 'bg-blue-100 text-blue-700';
    if (status === 'rejected') return 'bg-red-100 text-red-700';
    return 'bg-amber-100 text-amber-700';
}

export function TrainingDatasetPanel() {
    const { t } = useI18n();
    const [locale, setLocale] = useState('it');
    const [phase, setPhase] = useState('cognitive');
    const [status, setStatus] = useState('pending');
    const [count, setCount] = useState(5);
    const [summary, setSummary] = useState<TrainingSummary | null>(null);
    const [examples, setExamples] = useState<TrainingExample[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [draftAnswer, setDraftAnswer] = useState('');
    const [draftNotes, setDraftNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [message, setMessage] = useState('');

    const filters = useMemo(() => ({ instrument: 'QSA', locale, phase, status }), [locale, phase, status]);
    const selected = examples.find((item) => item.id === selectedId) || examples[0] || null;

    useEffect(() => {
        const nextSelected = examples.find((item) => item.id === selectedId) || examples[0] || null;
        if (!nextSelected) {
            setSelectedId(null);
            setDraftAnswer('');
            setDraftNotes('');
            return;
        }
        setSelectedId(nextSelected.id);
        setDraftAnswer(nextSelected.assistant_answer);
        setDraftNotes(nextSelected.review_notes || '');
    }, [examples, selectedId]);

    const load = async () => {
        setLoading(true);
        setMessage('');
        try {
            const qs = queryString(filters);
            const [summaryRes, rowsRes] = await Promise.all([
                fetch(`/api/admin/training-dataset/summary${qs}`),
                fetch(`/api/admin/training-dataset/examples${qs}`),
            ]);
            if (!summaryRes.ok || !rowsRes.ok) throw new Error('load failed');
            const nextRows = await rowsRes.json();
            setSummary(await summaryRes.json());
            setExamples(nextRows);
            setSelectedId(nextRows[0]?.id ?? null);
        } catch {
            setMessage(t('admin.training.loadError'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [locale, phase, status]);

    const generate = async () => {
        setGenerating(true);
        setMessage('');
        try {
            const res = await fetch('/api/admin/training-dataset/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instrument_code: 'QSA', locale, phase, count }),
            });
            if (!res.ok) throw new Error('generate failed');
            await load();
            setMessage(t('admin.training.generated'));
        } catch {
            setMessage(t('admin.training.generateError'));
        } finally {
            setGenerating(false);
        }
    };

    const updateSelected = async (nextStatus?: TrainingExample['status']) => {
        if (!selected) return;
        setMessage('');
        const statusToSave = nextStatus || (draftAnswer !== selected.assistant_answer ? 'edited' : selected.status);
        try {
            const res = await fetch(`/api/admin/training-dataset/examples/${selected.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assistant_answer: draftAnswer,
                    review_notes: draftNotes,
                    status: statusToSave,
                }),
            });
            if (!res.ok) throw new Error('save failed');
            const saved = await res.json();
            setExamples((prev) => prev.map((item) => item.id === saved.id ? saved : item));
            setMessage(t('admin.training.saved'));
        } catch {
            setMessage(t('admin.training.saveError'));
        }
    };

    const deleteSelected = async () => {
        if (!selected || !window.confirm(t('admin.training.confirmDelete'))) return;
        try {
            const res = await fetch(`/api/admin/training-dataset/examples/${selected.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('delete failed');
            await load();
        } catch {
            setMessage(t('admin.training.deleteError'));
        }
    };

    const exportUrl = `/api/admin/training-dataset/export.jsonl${queryString({ instrument: 'QSA', locale, phase, status: '' })}`;
    const approvedCount = (summary?.by_status.approved || 0) + (summary?.by_status.edited || 0);

    return (
        <div className="space-y-5">
            <section className="rounded-md border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-relaxed text-sky-950">
                {t('admin.training.notice')}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Filter className="h-4 w-4 text-indigo-600" />
                    {t('admin.training.filters')}
                </div>
                <div className="grid gap-4 md:grid-cols-5">
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">{t('admin.training.instrument')}</span>
                        <input
                            readOnly
                            value="QSA"
                            className="mt-1 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">{t('admin.training.language')}</span>
                        <select
                            value={locale}
                            onChange={(event) => setLocale(event.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        >
                            {LANGUAGES.map((item) => (
                                <option key={item.code} value={item.code}>{item.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">{t('admin.training.phase')}</span>
                        <select
                            value={phase}
                            onChange={(event) => setPhase(event.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        >
                            {PHASES.map((item) => (
                                <option key={item} value={item}>{t(`admin.training.phase.${item}`)}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">{t('admin.training.status')}</span>
                        <select
                            value={status}
                            onChange={(event) => setStatus(event.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        >
                            {STATUSES.map((item) => (
                                <option key={item || 'all'} value={item}>{item ? t(`admin.training.status.${item}`) : t('admin.training.status.all')}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">{t('admin.training.count')}</span>
                        <input
                            type="number"
                            min={1}
                            max={50}
                            value={count}
                            onChange={(event) => setCount(Number(event.target.value))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                    </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={load}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
                        {t('admin.training.refresh')}
                    </button>
                    <button
                        type="button"
                        onClick={generate}
                        disabled={generating}
                        className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                        <Plus className="h-4 w-4" />
                        {generating ? t('admin.training.generating') : t('admin.training.generate')}
                    </button>
                    <a
                        href={exportUrl}
                        className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                    >
                        <Download className="h-4 w-4" />
                        {t('admin.training.export')}
                    </a>
                </div>
                {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
            </section>

            <section className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">{t('admin.training.total')}</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{summary?.total ?? 0}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">{t('admin.training.pending')}</p>
                    <p className="mt-2 text-3xl font-bold text-amber-700">{summary?.by_status.pending ?? 0}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">{t('admin.training.exportable')}</p>
                    <p className="mt-2 text-3xl font-bold text-green-700">{approvedCount}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">{t('admin.training.rejected')}</p>
                    <p className="mt-2 text-3xl font-bold text-red-700">{summary?.by_status.rejected ?? 0}</p>
                </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
                <div className="rounded-lg border border-slate-200 bg-white">
                    <div className="border-b border-slate-200 px-4 py-3">
                        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <BrainCircuit className="h-4 w-4 text-indigo-600" />
                            {t('admin.training.queue')}
                        </h2>
                    </div>
                    <div className="max-h-[680px] overflow-y-auto">
                        {examples.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setSelectedId(item.id)}
                                className={cn(
                                    'block w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50',
                                    selected?.id === item.id && 'bg-indigo-50'
                                )}
                            >
                                <div className="mb-2 flex items-center justify-between gap-2">
                                    <span className="font-mono text-xs text-slate-500">#{item.id}</span>
                                    <span className={cn('rounded px-2 py-1 text-xs font-semibold', statusClass(item.status))}>
                                        {t(`admin.training.status.${item.status}`)}
                                    </span>
                                </div>
                                <p className="text-sm font-semibold text-slate-800">{t(`admin.training.phase.${item.phase}`)}</p>
                                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{item.student_message}</p>
                            </button>
                        ))}
                        {!examples.length && (
                            <div className="px-4 py-8 text-center text-sm text-slate-500">
                                {t('admin.training.empty')}
                            </div>
                        )}
                    </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white">
                    {selected ? (
                        <div>
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                                <div>
                                    <h2 className="text-sm font-semibold text-slate-900">
                                        {t('admin.training.reviewTitle', { id: selected.id })}
                                    </h2>
                                    <p className="text-xs text-slate-500">{selected.locale} · {selected.phase} · {selected.source}</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => updateSelected('approved')}
                                        className="inline-flex items-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
                                    >
                                        <Check className="h-4 w-4" />
                                        {t('admin.training.approve')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => updateSelected('rejected')}
                                        className="inline-flex items-center gap-2 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
                                    >
                                        <X className="h-4 w-4" />
                                        {t('admin.training.reject')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => updateSelected()}
                                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                        <Save className="h-4 w-4" />
                                        {t('admin.training.save')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={deleteSelected}
                                        className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        {t('admin.training.delete')}
                                    </button>
                                </div>
                            </div>

                            <div className="grid gap-4 p-4 xl:grid-cols-2">
                                <div className="space-y-4">
                                    <label className="block">
                                        <span className="text-xs font-semibold uppercase text-slate-500">{t('admin.training.scoresContext')}</span>
                                        <textarea
                                            readOnly
                                            value={selected.scores_context}
                                            className="mt-1 h-52 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-semibold uppercase text-slate-500">{t('admin.training.studentMessage')}</span>
                                        <textarea
                                            readOnly
                                            value={selected.student_message}
                                            className="mt-1 h-24 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                                        />
                                    </label>
                                    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                                        <p className="text-xs font-semibold uppercase text-slate-500">{t('admin.training.rubric')}</p>
                                        <pre className="mt-2 overflow-x-auto text-xs text-slate-700">
                                            {JSON.stringify(selected.auto_score || {}, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <label className="block">
                                        <span className="text-xs font-semibold uppercase text-slate-500">{t('admin.training.assistantAnswer')}</span>
                                        <textarea
                                            value={draftAnswer}
                                            onChange={(event) => setDraftAnswer(event.target.value)}
                                            className="mt-1 h-80 w-full rounded-md border border-slate-300 px-3 py-2 text-sm leading-relaxed text-slate-800"
                                        />
                                    </label>
                                    <label className="block">
                                        <span className="text-xs font-semibold uppercase text-slate-500">{t('admin.training.reviewNotes')}</span>
                                        <textarea
                                            value={draftNotes}
                                            onChange={(event) => setDraftNotes(event.target.value)}
                                            className="mt-1 h-24 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-800"
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="px-4 py-12 text-center text-sm text-slate-500">
                            {t('admin.training.selectEmpty')}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
}
