'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import type { AdminGuidedStepQuestion } from '@/lib/guided-step-questions';

const STEPS_BY_QUESTIONNAIRE: Record<string, string[]> = {
    QSA: ['intro', 'cognitive', 'affective', 'sl-elaboration', 'sl-selfcontrol', 'sl-motivation', 'sl-emotions', 'sl-attribution', 'sl-social', 'questions'],
    QSAr: ['qsar-intro', 'qsar-cognitive', 'qsar-affective', 'qsar-processing', 'qsar-selfcontrol', 'qsar-motivation', 'qsar-emotions', 'qsar-attributions', 'questions'],
    ZTPI: ['ztpi-intro', 'ztpi-t1', 'ztpi-t2', 'ztpi-t3', 'ztpi-t4', 'ztpi-t5', 'ztpi-btp', 'questions'],
    SAVICKAS: ['savickas-intro', 'savickas-patto', 'savickas-q1', 'savickas-q2', 'savickas-q3', 'savickas-q4', 'savickas-q5', 'savickas-final', 'questions'],
    QPCS: ['qpcs-intro', 'qpcs-welcome', 'qpcs-factors', 'qpcs-emozioni', 'qpcs-comunicazione', 'qpcs-volizione', 'qpcs-apprendimento', 'qpcs-fiducia', 'qpcs-sintesi', 'questions'],
    QPCC: ['qpcc-intro', 'qpcc-welcome', 'qpcc-factors', 'qpcc-comunicazione', 'qpcc-controllo', 'qpcc-volizione', 'qpcc-elaborazione', 'qpcc-convinzioni', 'qpcc-sintesi', 'questions'],
    QAP: ['qap-intro', 'qap-welcome', 'qap-factors', 'qap-preoccupazione', 'qap-controllo', 'qap-curiosita', 'qap-fiducia', 'qap-sintesi', 'questions'],
};

const LANGUAGES = ['it', 'en', 'es', 'fr', 'de', 'sv'] as const;

type FormState = {
    questionnaire_type: string;
    step_id: string;
    language: string;
    text: string;
    sort_order: number;
    is_active: boolean;
};

const EMPTY: FormState = {
    questionnaire_type: 'QSA',
    step_id: 'intro',
    language: 'it',
    text: '',
    sort_order: 0,
    is_active: true,
};

export function GuidedStepQuestionsPanel() {
    const { t } = useI18n();
    const [items, setItems] = useState<AdminGuidedStepQuestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [message, setMessage] = useState('');
    
    // Filters
    const [filterQuestionnaire, setFilterQuestionnaire] = useState<string>('all');
    const [filterStep, setFilterStep] = useState<string>('all');
    const [filterLang, setFilterLang] = useState<string>('all');

    const refresh = useCallback(async () => {
        setLoading(true);
        setMessage('');
        try {
            const res = await fetch('/api/admin/guided-step-questions');
            if (res.status === 401 || res.status === 403) {
                window.location.href = '/';
                return;
            }
            if (!res.ok) throw new Error('load failed');
            setItems(await res.json());
        } catch (e) {
            console.error('Failed to load guided step questions', e);
            setMessage(t('admin.gsq.error.load'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const filtered = useMemo(() => {
        return items.filter((q) =>
            (filterQuestionnaire === 'all' || q.questionnaire_type === filterQuestionnaire) &&
            (filterStep === 'all' || q.step_id === filterStep) &&
            (filterLang === 'all' || q.language === filterLang),
        );
    }, [items, filterQuestionnaire, filterStep, filterLang]);

    const countsByQuestionnaire = useMemo(() => {
        const map: Record<string, number> = {};
        for (const q of items) {
            if (q.is_active) {
                map[q.questionnaire_type] = (map[q.questionnaire_type] ?? 0) + 1;
            }
        }
        return map;
    }, [items]);

    const stepOptionsForForm = useMemo(() => {
        return STEPS_BY_QUESTIONNAIRE[form.questionnaire_type] ?? [];
    }, [form.questionnaire_type]);

    const stepOptionsForFilter = useMemo(() => {
        if (filterQuestionnaire === 'all') return [];
        return STEPS_BY_QUESTIONNAIRE[filterQuestionnaire] ?? [];
    }, [filterQuestionnaire]);

    // Automatically correct step_id in form if questionnaire_type changes
    useEffect(() => {
        const allowed = STEPS_BY_QUESTIONNAIRE[form.questionnaire_type] ?? [];
        if (allowed.length > 0 && !allowed.includes(form.step_id)) {
            setForm((f) => ({ ...f, step_id: allowed[0] }));
        }
    }, [form.questionnaire_type, form.step_id]);

    // Automatically correct step in filter if questionnaire changes
    useEffect(() => {
        setFilterStep('all');
    }, [filterQuestionnaire]);

    const startNew = () => {
        const lang = filterLang === 'all' ? 'it' : filterLang;
        const qType = filterQuestionnaire === 'all' ? 'QSA' : filterQuestionnaire;
        const step = filterStep === 'all' ? (STEPS_BY_QUESTIONNAIRE[qType]?.[0] ?? 'intro') : filterStep;
        
        // Find max order
        const maxOrder = items
            .filter((q) => q.questionnaire_type === qType && q.step_id === step && q.language === lang)
            .reduce((m, q) => Math.max(m, q.sort_order), -1);

        setForm({
            questionnaire_type: qType,
            step_id: step,
            language: lang,
            text: '',
            sort_order: maxOrder + 1,
            is_active: true,
        });
        setEditingId('new');
        setMessage('');
    };

    const startEdit = (q: AdminGuidedStepQuestion) => {
        setForm({
            questionnaire_type: q.questionnaire_type,
            step_id: q.step_id,
            language: q.language,
            text: q.text,
            sort_order: q.sort_order,
            is_active: q.is_active,
        });
        setEditingId(q.id);
        setMessage('');
    };

    const cancel = () => {
        setEditingId(null);
        setForm(EMPTY);
        setMessage('');
    };

    const save = async () => {
        if (!form.text.trim()) {
            setMessage(t('admin.gsq.error.textRequired'));
            return;
        }
        setSaving(true);
        setMessage('');
        try {
            const body = {
                questionnaire_type: form.questionnaire_type,
                step_id: form.step_id,
                language: form.language,
                text: form.text.trim(),
                sort_order: form.sort_order,
                is_active: form.is_active,
            };
            const url = editingId === 'new' ? '/api/admin/guided-step-questions' : `/api/admin/guided-step-questions/${editingId}`;
            const method = editingId === 'new' ? 'POST' : 'PUT';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(await res.text());
            cancel();
            await refresh();
        } catch (e) {
            console.error('Failed to save guided step question', e);
            setMessage(t('admin.gsq.error.save'));
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (q: AdminGuidedStepQuestion) => {
        try {
            const res = await fetch(`/api/admin/guided-step-questions/${q.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !q.is_active }),
            });
            if (!res.ok) throw new Error('toggle failed');
            await refresh();
        } catch (e) {
            console.error('Failed to toggle guided step question', e);
            setMessage(t('admin.gsq.error.save'));
        }
    };

    const remove = async (q: AdminGuidedStepQuestion) => {
        if (!window.confirm(t('admin.gsq.confirmDelete'))) return;
        setMessage('');
        try {
            const res = await fetch(`/api/admin/guided-step-questions/${q.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('delete failed');
            await refresh();
        } catch (e) {
            console.error('Failed to delete guided step question', e);
            setMessage(t('admin.gsq.error.delete'));
        }
    };

    const inputCls = 'mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-400';

    const renderForm = () => (
        <section className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
            <div className="grid gap-3 md:grid-cols-4">
                <label className="text-xs font-semibold uppercase text-slate-500">
                    {t('admin.gsq.form.questionnaire')}
                    <select
                        className={inputCls}
                        value={form.questionnaire_type}
                        onChange={(e) => setForm({ ...form, questionnaire_type: e.target.value })}
                    >
                        {Object.keys(STEPS_BY_QUESTIONNAIRE).map((code) => (
                            <option key={code} value={code}>{code}</option>
                        ))}
                    </select>
                </label>
                <label className="text-xs font-semibold uppercase text-slate-500">
                    {t('admin.gsq.form.step')}
                    <select
                        className={inputCls}
                        value={form.step_id}
                        onChange={(e) => setForm({ ...form, step_id: e.target.value })}
                    >
                        {stepOptionsForForm.map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </label>
                <label className="text-xs font-semibold uppercase text-slate-500">
                    {t('admin.gsq.form.language')}
                    <select
                        className={inputCls}
                        value={form.language}
                        onChange={(e) => setForm({ ...form, language: e.target.value })}
                    >
                        {LANGUAGES.map((lang) => (
                            <option key={lang} value={lang}>{lang.toUpperCase()}</option>
                        ))}
                    </select>
                </label>
                <label className="text-xs font-semibold uppercase text-slate-500">
                    {t('admin.gsq.form.order')}
                    <input
                        type="number"
                        className={inputCls}
                        value={form.sort_order}
                        onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })}
                    />
                </label>
            </div>
            <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
                {t('admin.gsq.form.text')}
                <textarea
                    className="mt-1 min-h-[80px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400"
                    value={form.text}
                    onChange={(e) => setForm({ ...form, text: e.target.value })}
                    placeholder={t('admin.gsq.form.textPlaceholder')}
                />
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                {t('admin.gsq.form.active')}
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    <Check className="h-4 w-4" />
                    {t('admin.gsq.save')}
                </button>
                <button
                    type="button"
                    onClick={cancel}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                    <X className="h-4 w-4" />
                    {t('admin.gsq.cancel')}
                </button>
            </div>
        </section>
    );

    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">{t('admin.gsq.title')}</h2>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500">{t('admin.gsq.subtitle')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => void refresh()}
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            {t('admin.gsq.refresh')}
                        </button>
                        {editingId === null && (
                            <button
                                type="button"
                                onClick={startNew}
                                className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700"
                            >
                                <Plus className="h-4 w-4" />
                                {t('admin.gsq.new')}
                            </button>
                        )}
                    </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-7">
                    {Object.keys(STEPS_BY_QUESTIONNAIRE).map((code) => (
                        <div key={code} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-semibold uppercase text-slate-500">{code}</p>
                            <p className="mt-1 text-2xl font-bold text-slate-900">{countsByQuestionnaire[code] ?? 0}</p>
                            <p className="text-xs text-slate-400">{t('admin.gsq.activeIt')}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-xs font-semibold uppercase text-slate-500">
                        {t('admin.gsq.filter.questionnaire')}
                        <select
                            className={inputCls}
                            value={filterQuestionnaire}
                            onChange={(e) => setFilterQuestionnaire(e.target.value)}
                        >
                            <option value="all">{t('admin.gsq.filter.all')}</option>
                            {Object.keys(STEPS_BY_QUESTIONNAIRE).map((code) => (
                                <option key={code} value={code}>{code}</option>
                            ))}
                        </select>
                    </label>
                    <label className="text-xs font-semibold uppercase text-slate-500">
                        {t('admin.gsq.filter.step')}
                        <select
                            className={inputCls}
                            value={filterStep}
                            disabled={filterQuestionnaire === 'all'}
                            onChange={(e) => setFilterStep(e.target.value)}
                        >
                            <option value="all">{t('admin.gsq.filter.all')}</option>
                            {stepOptionsForFilter.map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </label>
                    <label className="text-xs font-semibold uppercase text-slate-500">
                        {t('admin.gsq.filter.language')}
                        <select
                            className={inputCls}
                            value={filterLang}
                            onChange={(e) => setFilterLang(e.target.value)}
                        >
                            <option value="all">{t('admin.gsq.filter.all')}</option>
                            {LANGUAGES.map((lang) => (
                                <option key={lang} value={lang}>{lang.toUpperCase()}</option>
                            ))}
                        </select>
                    </label>
                </div>
            </section>

            {editingId === 'new' && renderForm()}
            {message && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}

            <div className="space-y-2">
                {loading && (
                    <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400">
                        {t('admin.gsq.loading')}
                    </section>
                )}
                {!loading && filtered.length === 0 && editingId !== 'new' && (
                    <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400">
                        {t('admin.gsq.empty')}
                    </section>
                )}
                {filtered.map((q) => (
                    editingId === q.id ? (
                        <div key={q.id}>{renderForm()}</div>
                    ) : (
                        <section
                            key={q.id}
                            className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                                        {q.questionnaire_type}
                                    </span>
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                        {q.step_id}
                                    </span>
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                        {q.language.toUpperCase()}
                                    </span>
                                    <span className="text-xs text-slate-400">#{q.sort_order}</span>
                                    {!q.is_active && (
                                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                                            {t('admin.gsq.inactive')}
                                        </span>
                                    )}
                                </div>
                                <p className={`mt-1 text-sm leading-relaxed ${q.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                                    {q.text}
                                </p>
                            </div>
                            <div className="flex shrink-0 gap-1">
                                <button
                                    type="button"
                                    onClick={() => void toggleActive(q)}
                                    className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
                                    title={t('admin.gsq.toggle')}
                                >
                                    {q.is_active ? t('admin.gsq.disable') : t('admin.gsq.enable')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => startEdit(q)}
                                    className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                    title={t('admin.gsq.edit')}
                                >
                                    <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void remove(q)}
                                    className="rounded-md p-2 text-red-500 hover:bg-red-50"
                                    title={t('admin.gsq.delete')}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </section>
                    )
                ))}
            </div>
        </div>
    );
}
