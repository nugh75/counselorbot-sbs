'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import type { AdminGuidedStepQuestion } from '@/lib/guided-step-questions';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';

const STEPS_BY_QUESTIONNAIRE: Record<string, string[]> = {
    QSA: ['intro', 'cognitive', 'affective', 'sl-elaboration', 'sl-selfcontrol', 'sl-motivation', 'sl-emotions', 'sl-attribution', 'sl-social', 'sl-strategies', 'questions'],
    QSAr: ['qsar-intro', 'qsar-cognitive', 'qsar-affective', 'qsar-processing', 'qsar-selfcontrol', 'qsar-motivation', 'qsar-emotions', 'qsar-attributions', 'qsar-strategies', 'questions'],
    ZTPI: ['ztpi-intro', 'ztpi-t1', 'ztpi-t2', 'ztpi-t3', 'ztpi-t4', 'ztpi-t5', 'ztpi-btp', 'ztpi-strategies', 'questions'],
    SAVICKAS: ['savickas-intro', 'savickas-patto', 'savickas-q1', 'savickas-q2', 'savickas-q3', 'savickas-q4', 'savickas-q5', 'savickas-final', 'questions'],
    EVENTO_STUDIO: ['evstudio-intro', 'evstudio-patto', 'evstudio-evento', 'evstudio-fatto', 'evstudio-funzionato', 'evstudio-criticita', 'evstudio-rilettura', 'evstudio-prossima', 'evstudio-final', 'questions'],
    EVENTO_PROFESSIONALE: ['evprof-intro', 'evprof-patto', 'evprof-evento', 'evprof-fatto', 'evprof-funzionato', 'evprof-criticita', 'evprof-rilettura', 'evprof-prossima', 'evprof-final', 'questions'],
    OBIETTIVO_STUDIO: ['obbstudio-intro', 'obbstudio-patto', 'obbstudio-partenza', 'obbstudio-livello', 'obbstudio-smart', 'obbstudio-sfida', 'obbstudio-piano', 'obbstudio-verifica', 'obbstudio-final', 'questions'],
    OBIETTIVO_DOCENZA: ['obbdocenza-intro', 'obbdocenza-patto', 'obbdocenza-partenza', 'obbdocenza-livello', 'obbdocenza-smart', 'obbdocenza-sfida', 'obbdocenza-piano', 'obbdocenza-verifica', 'obbdocenza-final', 'questions'],
    QPCS: ['qpcs-intro', 'qpcs-welcome', 'qpcs-factors', 'qpcs-emozioni', 'qpcs-comunicazione', 'qpcs-volizione', 'qpcs-apprendimento', 'qpcs-fiducia', 'qpcs-sintesi', 'qpcs-strategie', 'questions'],
    QPCC: ['qpcc-intro', 'qpcc-welcome', 'qpcc-factors', 'qpcc-comunicazione', 'qpcc-controllo', 'qpcc-volizione', 'qpcc-elaborazione', 'qpcc-convinzioni', 'qpcc-sintesi', 'qpcc-strategie', 'questions'],
    QAP: ['qap-intro', 'qap-welcome', 'qap-factors', 'qap-preoccupazione', 'qap-controllo', 'qap-curiosita', 'qap-fiducia', 'qap-sintesi', 'qap-strategie', 'questions'],
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
    const allowedFormSteps = STEPS_BY_QUESTIONNAIRE[form.questionnaire_type] ?? [];
    if (allowedFormSteps.length > 0 && !allowedFormSteps.includes(form.step_id)) {
        setForm((f) => ({ ...f, step_id: allowedFormSteps[0] }));
    }

    // Automatically correct step in filter if questionnaire changes
    const [stepFilterQuestionnaire, setStepFilterQuestionnaire] = useState(filterQuestionnaire);
    if (stepFilterQuestionnaire !== filterQuestionnaire) {
        setStepFilterQuestionnaire(filterQuestionnaire);
        setFilterStep('all');
    }

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

    const [confirmDelete, setConfirmDelete] = useState<string | number | null>(null);
    const remove = async (q: AdminGuidedStepQuestion) => {
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

    const inputCls = 'mt-1 h-9 w-full rounded-control border border-line-strong bg-surface px-4 text-sm text-ink outline-none focus:border-brand';

    const renderForm = () => (
        <section className="rounded-lg border border-brand-line bg-brand-soft/40 p-4">
            <div className="grid gap-4 md:grid-cols-4">
                <label className="text-xs font-semibold text-ink-muted">
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
                <label className="text-xs font-semibold text-ink-muted">
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
                <label className="text-xs font-semibold text-ink-muted">
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
                <label className="text-xs font-semibold text-ink-muted">
                    {t('admin.gsq.form.order')}
                    <input
                        type="number"
                        className={inputCls}
                        value={form.sort_order}
                        onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })}
                    />
                </label>
            </div>
            <label className="mt-4 block text-xs font-semibold text-ink-muted">
                {t('admin.gsq.form.text')}
                <textarea
                    className="mt-1 min-h-[80px] w-full rounded-control border border-line-strong bg-surface px-4 py-2 text-sm text-ink outline-none focus:border-brand"
                    value={form.text}
                    onChange={(e) => setForm({ ...form, text: e.target.value })}
                    placeholder={t('admin.gsq.form.textPlaceholder')}
                />
            </label>
            <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink-body">
                <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                {t('admin.gsq.form.active')}
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}>
                    <Check className="h-4 w-4" />
                    {t('admin.gsq.save')}
                </Button>
                <Button variant="secondary"
                    type="button"
                    onClick={cancel}>
                    <X className="h-4 w-4" />
                    {t('admin.gsq.cancel')}
                </Button>
            </div>
        </section>
    );

    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-ink">{t('admin.gsq.title')}</h2>
                        <p className="mt-1 max-w-2xl text-sm text-ink-muted">{t('admin.gsq.subtitle')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Button variant="secondary"
                            type="button"
                            onClick={() => void refresh()}>
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            {t('admin.gsq.refresh')}
                        </Button>
                        {editingId === null && (
                            <Button
                                type="button"
                                onClick={startNew}>
                                <Plus className="h-4 w-4" />
                                {t('admin.gsq.new')}
                            </Button>
                        )}
                    </div>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-7">
                    {Object.keys(STEPS_BY_QUESTIONNAIRE).map((code) => (
                        <div key={code} className="rounded-control border border-line bg-surface-sunken p-4">
                            <p className="text-xs font-semibold text-ink-muted">{code}</p>
                            <p className="mt-1 text-2xl font-semibold text-ink">{countsByQuestionnaire[code] ?? 0}</p>
                            <p className="text-xs text-ink-muted">{t('admin.gsq.activeIt')}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="rounded-lg border border-line bg-surface p-4">
                <div className="grid gap-4 sm:grid-cols-3">
                    <label className="text-xs font-semibold text-ink-muted">
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
                    <label className="text-xs font-semibold text-ink-muted">
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
                    <label className="text-xs font-semibold text-ink-muted">
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
            {message && <Callout variant="danger">{message}</Callout>}

            <div className="space-y-2">
                {loading && (
                    <section className="rounded-lg border border-line bg-surface p-8 text-center text-ink-muted">
                        {t('admin.gsq.loading')}
                    </section>
                )}
                {!loading && filtered.length === 0 && editingId !== 'new' && (
                    <section className="rounded-lg border border-line bg-surface p-8 text-center text-ink-muted">
                        {t('admin.gsq.empty')}
                    </section>
                )}
                {filtered.map((q) => (
                    editingId === q.id ? (
                        <div key={q.id}>{renderForm()}</div>
                    ) : (
                        <section
                            key={q.id}
                            className="flex items-start justify-between gap-4 rounded-lg border border-line bg-surface p-4 shadow-card"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-brand-soft px-2 py-1 text-xs font-semibold text-link">
                                        {q.questionnaire_type}
                                    </span>
                                    <span className="rounded-full bg-surface-raised px-2 py-1 text-xs font-semibold text-ink-muted">
                                        {q.step_id}
                                    </span>
                                    <span className="rounded-full bg-surface-raised px-2 py-1 text-xs font-semibold text-ink-muted">
                                        {q.language.toUpperCase()}
                                    </span>
                                    <span className="text-xs text-ink-muted">#{q.sort_order}</span>
                                    {!q.is_active && (
                                        <span className="rounded-full bg-warning-soft px-2 py-1 text-xs font-semibold text-warning">
                                            {t('admin.gsq.inactive')}
                                        </span>
                                    )}
                                </div>
                                <p className={`mt-1 text-sm leading-relaxed ${q.is_active ? 'text-ink' : 'text-ink-muted line-through'}`}>
                                    {q.text}
                                </p>
                            </div>
                            <div className="flex shrink-0 gap-1">
                                <button
                                    type="button"
                                    onClick={() => void toggleActive(q)}
                                    className="min-h-control rounded-control px-2 py-1 text-xs font-semibold text-ink-muted hover:bg-surface-raised"
                                    title={t('admin.gsq.toggle')}
                                >
                                    {q.is_active ? t('admin.gsq.disable') : t('admin.gsq.enable')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => startEdit(q)}
                                    className="inline-flex min-h-control min-w-control items-center justify-center rounded-control p-2 text-ink-muted hover:bg-surface-raised hover:text-ink"
                                    title={t('admin.gsq.edit')}
                                >
                                    <Pencil className="h-4 w-4" />
                                </button>
                                {confirmDelete === q.id
                                    ? <ConfirmInline question={t('admin.gsq.confirmDelete')} onConfirm={() => { setConfirmDelete(null); void remove(q); }} onCancel={() => setConfirmDelete(null)} />
                                    : <button
                                          type="button"
                                          onClick={() => setConfirmDelete(q.id)}
                                          className="inline-flex min-h-control min-w-control items-center justify-center rounded-control p-2 text-danger hover:bg-danger-soft"
                                          title={t('admin.gsq.delete')}
                                      >
                                          <Trash2 className="h-4 w-4" />
                                      </button>}
                            </div>
                        </section>
                    )
                ))}
            </div>
        </div>
    );
}
