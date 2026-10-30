'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    BarChart3,
    Briefcase,
    Check,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    ChevronDown,
    ChevronUp,
    Clock,
    Compass,
    Lightbulb,
    Loader2,
    Sparkles,
    Target,
    X,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';
import {
    buildInitialSteps,
    executeCreateInstrument,
    INITIAL_WIZARD_FORM,
    sanitizeInstrumentCode,
    validateInstrumentCode,
    type CounselorSummary,
    type InstrumentWizardForm,
    type StepTemplateKey,
} from '@/lib/instrument-wizard';
import { Button } from '@/components/ui/Button';

const ICONS = [
    { id: 'compass', icon: Compass, labelKey: 'compass' },
    { id: 'briefcase', icon: Briefcase, labelKey: 'briefcase' },
    { id: 'lightbulb', icon: Lightbulb, labelKey: 'lightbulb' },
    { id: 'target', icon: Target, labelKey: 'target' },
    { id: 'clock', icon: Clock, labelKey: 'clock' },
    { id: 'clipboard', icon: ClipboardList, labelKey: 'clipboard' },
    { id: 'chart', icon: BarChart3, labelKey: 'chart' },
] as const;

const COLOR_THEMES = [
    'blue', 'purple', 'indigo', 'pink', 'orange', 'teal',
    'green', 'red', 'amber', 'cyan', 'slate', 'rose',
] as const;

const COLOR_SWATCH: Record<string, string> = {
    blue: 'bg-blue-500',
    purple: 'bg-purple-500',
    indigo: 'bg-indigo-500',
    pink: 'bg-pink-500',
    orange: 'bg-orange-500',
    teal: 'bg-teal-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
    amber: 'bg-amber-500',
    cyan: 'bg-cyan-500',
    slate: 'bg-slate-500',
    rose: 'bg-rose-500',
};

export interface CreateInstrumentDialogProps {
    open: boolean;
    onClose: () => void;
    onCreated: (instrumentCode: string) => void;
}

export function CreateInstrumentDialog({ open, onClose, onCreated }: CreateInstrumentDialogProps) {
    const { t, lang } = useI18n();
    const titleId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const openerRef = useRef<HTMLElement | null>(null);

    const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
    const [form, setForm] = useState<InstrumentWizardForm>(INITIAL_WIZARD_FORM);
    const [counselors, setCounselors] = useState<CounselorSummary[]>([]);
    const [loadingCounselors, setLoadingCounselors] = useState(false);
    const [showTranslations, setShowTranslations] = useState(false);
    const [codeError, setCodeError] = useState('');
    const [nameError, setNameError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

    // Focus restore & opener element reference
    useEffect(() => {
        if (open) {
            openerRef.current = document.activeElement as HTMLElement | null;
            setCurrentStep(1);
            setForm(INITIAL_WIZARD_FORM);
            setCodeError('');
            setNameError('');
            setSubmitError('');
            setShowTranslations(false);
        } else if (openerRef.current?.isConnected) {
            openerRef.current.focus({ preventScroll: true });
        }
    }, [open]);

    // Carica counselor disponibili all'apertura
    useEffect(() => {
        if (!open) return;
        setLoadingCounselors(true);
        apiFetch('/api/admin/counselors')
            .then(res => res.ok ? res.json() : [])
            .then((data: CounselorSummary[]) => {
                setCounselors(data);
                // Pre-seleziona i counselor attivi per comodità
                const activeIds = data.filter(c => c.is_active !== false).map(c => c.id);
                setForm(prev => ({
                    ...prev,
                    selected_counselor_ids: activeIds.length > 0 ? activeIds : data.map(c => c.id),
                }));
            })
            .catch(() => setCounselors([]))
            .finally(() => setLoadingCounselors(false));
    }, [open]);

    // Focus trap & Escape key handler
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (!submitting) onClose();
                return;
            }

            if (event.key === 'Tab') {
                const container = dialogRef.current;
                if (!container) return;
                const focusable = container.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
                );
                if (!focusable.length) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];

                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose, submitting]);

    const validateStep1 = useCallback((): boolean => {
        let valid = true;
        const codeValidation = validateInstrumentCode(form.code);
        if (!codeValidation.valid) {
            setCodeError(t(`admin.instrumentWizard.${codeValidation.errorKey || 'codeInvalid'}`));
            valid = false;
        } else {
            setCodeError('');
        }

        if (!form.name_it.trim()) {
            setNameError(t('admin.instrumentWizard.nameRequired'));
            valid = false;
        } else {
            setNameError('');
        }

        return valid;
    }, [form.code, form.name_it, t]);

    const handleNext = () => {
        if (currentStep === 1) {
            if (!validateStep1()) return;
            setCurrentStep(2);
        } else if (currentStep === 2) {
            setCurrentStep(3);
        }
    };

    const handleBack = () => {
        if (currentStep > 1) {
            setCurrentStep((prev) => (prev - 1) as 1 | 2);
        }
    };

    const handleSubmit = async () => {
        if (!validateStep1()) {
            setCurrentStep(1);
            return;
        }
        setSubmitting(true);
        setSubmitError('');

        try {
            const result = await executeCreateInstrument(form, counselors, (url, init) => apiFetch(url, init));
            if (!result.ok) {
                setSubmitError(result.error ? `${t('admin.instrumentWizard.errorCreating')}: ${result.error}` : t('admin.instrumentWizard.errorCreating'));
                return;
            }
            onCreated(result.code);
            onClose();
        } catch {
            setSubmitError(t('admin.instrumentWizard.errorCreating'));
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    const previewSteps = buildInitialSteps(form.code || 'CODE', form.template, form.color_theme);

    return createPortal(
        <div
            className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !submitting) onClose();
            }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-surface shadow-modal sm:rounded-2xl"
            >
                {/* Header */}
                <header className="flex items-start justify-between gap-4 border-b border-line bg-surface-sunken px-4 py-4">
                    <div className="min-w-0">
                        <h3 id={titleId} className="flex items-center gap-2 text-base font-semibold text-ink">
                            <Sparkles className="h-5 w-5 text-brand shrink-0" aria-hidden="true" />
                            {t('admin.instrumentWizard.title')}
                        </h3>
                        <p className="mt-1 text-xs text-ink-muted">
                            {t('admin.instrumentWizard.subtitle')}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        aria-label={t('admin.instrumentWizard.close')}
                        className="inline-flex min-h-control min-w-control items-center justify-center rounded-lg p-2 text-ink-muted hover:bg-line hover:text-ink-body disabled:opacity-50"
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </header>

                {/* Step Navigation Tabs */}
                <nav aria-label={t('admin.instrumentWizard.stepsAriaLabel')} className="flex border-b border-line bg-surface px-4 pt-2">
                    {[
                        { step: 1 as const, key: 'step1.tab' },
                        { step: 2 as const, key: 'step2.tab' },
                        { step: 3 as const, key: 'step3.tab' },
                    ].map(({ step, key }) => {
                        const isActive = currentStep === step;
                        const isPast = currentStep > step;
                        return (
                            <button
                                key={step}
                                type="button"
                                disabled={submitting}
                                onClick={() => {
                                    if (step === 1) setCurrentStep(1);
                                    else if (step === 2 && validateStep1()) setCurrentStep(2);
                                    else if (step === 3 && validateStep1()) setCurrentStep(3);
                                }}
                                aria-current={isActive ? 'step' : undefined}
                                className={`min-h-control flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors sm:px-4 ${
                                    isActive
                                        ? 'border-brand text-link'
                                        : isPast
                                        ? 'border-transparent text-ink-body hover:text-brand'
                                        : 'border-transparent text-ink-muted'
                                }`}
                            >
                                <span
                                    className={`flex h-5 w-5 items-center justify-center rounded-full text-2xs font-semibold ${
                                        isActive
                                            ? 'bg-brand text-ink-on-brand'
                                            : isPast
                                            ? 'bg-success-soft text-success-ink'
                                            : 'bg-surface-raised text-ink-muted'
                                    }`}
                                >
                                    {isPast ? <Check className="h-3 w-3" /> : step}
                                </span>
                                <span>{t(`admin.instrumentWizard.${key}`)}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* Body Content */}
                <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
                    {/* STEP 1: DATI BASE */}
                    {currentStep === 1 && (
                        <div className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                {/* Codice slug */}
                                <div>
                                    <label className="block text-xs font-semibold text-ink-body">
                                        {t('admin.instrumentWizard.code')} <span className="text-danger">*</span>
                                        <input
                                            type="text"
                                            required
                                            value={form.code}
                                            onChange={(e) => {
                                                setForm({ ...form, code: sanitizeInstrumentCode(e.target.value) });
                                                setCodeError('');
                                            }}
                                            placeholder={t('admin.instrumentWizard.codePlaceholder')}
                                            className={`mt-1 w-full rounded-control border font-mono text-xs px-4 py-2 outline-none focus:ring-2 ${
                                                codeError
                                                    ? 'border-danger-line ring-danger-line'
                                                    : 'border-line-strong focus:border-brand focus:ring-brand-line'
                                            }`}
                                        />
                                    </label>
                                    <p className="mt-1 text-2xs text-ink-muted">
                                        {t('admin.instrumentWizard.codeHint')}
                                    </p>
                                    {codeError && (
                                        <p role="alert" className="mt-1 text-xs text-danger font-semibold">
                                            {codeError}
                                        </p>
                                    )}
                                </div>

                                {/* Titolo in italiano */}
                                <div>
                                    <label className="block text-xs font-semibold text-ink-body">
                                        {t('admin.instrumentWizard.name')} <span className="text-danger">*</span>
                                        <input
                                            type="text"
                                            required
                                            value={form.name_it}
                                            onChange={(e) => {
                                                setForm({ ...form, name_it: e.target.value });
                                                setNameError('');
                                            }}
                                            placeholder={t('admin.instrumentWizard.namePlaceholder')}
                                            className={`mt-1 w-full rounded-control border text-xs px-4 py-2 outline-none focus:ring-2 ${
                                                nameError
                                                    ? 'border-danger-line ring-danger-line'
                                                    : 'border-line-strong focus:border-brand focus:ring-brand-line'
                                            }`}
                                        />
                                    </label>
                                    <p className="mt-1 text-2xs text-ink-muted">
                                        {t('admin.instrumentWizard.nameHint')}
                                    </p>
                                    {nameError && (
                                        <p role="alert" className="mt-1 text-xs text-danger font-semibold">
                                            {nameError}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Descrizione in italiano */}
                            <div>
                                <label className="block text-xs font-semibold text-ink-body">
                                    {t('admin.instrumentWizard.description')}
                                    <textarea
                                        rows={2}
                                        value={form.description_it}
                                        onChange={(e) => setForm({ ...form, description_it: e.target.value })}
                                        placeholder={t('admin.instrumentWizard.descPlaceholder')}
                                        className="mt-1 w-full rounded-control border border-line-strong px-4 py-2 text-xs leading-relaxed outline-none focus:border-brand focus:ring-2 focus:ring-brand-line"
                                    />
                                </label>
                                <p className="mt-1 text-2xs text-ink-muted">
                                    {t('admin.instrumentWizard.descriptionHint')}
                                </p>
                            </div>

                            {/* Accordion Traduzioni multilingua */}
                            <div className="rounded-lg border border-line bg-surface-sunken/60 p-4">
                                <button
                                    type="button"
                                    onClick={() => setShowTranslations(!showTranslations)}
                                    className="min-h-control flex w-full items-center justify-between text-xs font-semibold text-ink-body hover:text-brand"
                                >
                                    <span>{t('admin.instrumentWizard.translationsToggle')}</span>
                                    <span className="inline-flex items-center gap-1 text-2xs font-normal text-ink-muted">
                                        {showTranslations ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
                                        {showTranslations ? t('admin.instrumentWizard.collapseTranslations') : t('admin.instrumentWizard.expandTranslations')}
                                    </span>
                                </button>
                                {showTranslations && (
                                    <div className="mt-4 space-y-4 border-t border-line pt-4">
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {(['en', 'es', 'fr', 'de', 'sv'] as const).map((l) => (
                                                <div key={`name-${l}`}>
                                                    <label className="block text-2xs font-semibold text-ink-muted">
                                                        {t('admin.instrumentWizard.titleLanguage', { lang: l.toUpperCase() })}
                                                        <input
                                                            type="text"
                                                            value={form[`name_${l}` as keyof InstrumentWizardForm] as string}
                                                            onChange={(e) =>
                                                                setForm({ ...form, [`name_${l}`]: e.target.value })
                                                            }
                                                            className="mt-1 w-full rounded border border-line-strong bg-surface px-2 py-1 text-xs"
                                                        />
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {(['en', 'es', 'fr', 'de', 'sv'] as const).map((l) => (
                                                <div key={`desc-${l}`}>
                                                    <label className="block text-2xs font-semibold text-ink-muted">
                                                        {t('admin.instrumentWizard.descLanguage', { lang: l.toUpperCase() })}
                                                        <textarea
                                                            rows={2}
                                                            value={form[`description_${l}` as keyof InstrumentWizardForm] as string}
                                                            onChange={(e) =>
                                                                setForm({ ...form, [`description_${l}`]: e.target.value })
                                                            }
                                                            className="mt-1 w-full rounded border border-line-strong bg-surface px-2 py-1 text-xs leading-normal"
                                                        />
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Categoria strumento */}
                            <fieldset>
                                <legend className="mb-1 text-xs font-semibold text-ink-body">
                                    {t('admin.instrumentWizard.category')}
                                </legend>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <label
                                        className={`flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors ${
                                            form.tool_category === 'guided'
                                                ? 'border-brand bg-brand-soft/50 ring-1 ring-focus'
                                                : 'border-line bg-surface hover:bg-surface-sunken'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="tool_category"
                                            value="guided"
                                            checked={form.tool_category === 'guided'}
                                            onChange={() => setForm({ ...form, tool_category: 'guided' })}
                                            className="mt-1 text-brand"
                                        />
                                        <div>
                                            <p className="text-xs font-semibold text-ink">
                                                {t('admin.instrumentWizard.categoryGuided')}
                                            </p>
                                            <p className="mt-1 text-2xs text-ink-muted">
                                                {t('admin.instrumentWizard.categoryGuidedDesc')}
                                            </p>
                                        </div>
                                    </label>
                                    <label
                                        className={`flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors ${
                                            form.tool_category === 'assessment'
                                                ? 'border-brand bg-brand-soft/50 ring-1 ring-focus'
                                                : 'border-line bg-surface hover:bg-surface-sunken'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="tool_category"
                                            value="assessment"
                                            checked={form.tool_category === 'assessment'}
                                            onChange={() => setForm({ ...form, tool_category: 'assessment' })}
                                            className="mt-1 text-brand"
                                        />
                                        <div>
                                            <p className="text-xs font-semibold text-ink">
                                                {t('admin.instrumentWizard.categoryAssessment')}
                                            </p>
                                            <p className="mt-1 text-2xs text-ink-muted">
                                                {t('admin.instrumentWizard.categoryAssessmentDesc')}
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            </fieldset>

                            {/* Destinatari & Modalità intervista */}
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="block text-xs font-semibold text-ink-body">
                                        {t('admin.instrumentWizard.targetAudience')}
                                        <select
                                            value={form.target_audience}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    target_audience: e.target.value as 'student' | 'teacher' | 'both',
                                                })
                                            }
                                            className="mt-1 w-full rounded-control border border-line-strong bg-surface px-4 py-2 text-xs font-semibold text-ink outline-none focus:border-brand"
                                        >
                                            <option value="student">{t('admin.instrumentWizard.audienceStudent')}</option>
                                            <option value="teacher">{t('admin.instrumentWizard.audienceTeacher')}</option>
                                            <option value="both">{t('admin.instrumentWizard.audienceBoth')}</option>
                                        </select>
                                    </label>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-ink-body">
                                        {t('admin.instrumentWizard.interviewMode')}
                                        <select
                                            value={form.interview_mode}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    interview_mode: e.target.value as 'interactive' | 'direct',
                                                })
                                            }
                                            className="mt-1 w-full rounded-control border border-line-strong bg-surface px-4 py-2 text-xs font-semibold text-ink outline-none focus:border-brand"
                                        >
                                            <option value="interactive">
                                                {t('admin.instrumentWizard.interviewModeInteractive')}
                                            </option>
                                            <option value="direct">
                                                {t('admin.instrumentWizard.interviewModeDirect')}
                                            </option>
                                        </select>
                                    </label>
                                </div>
                            </div>

                            {/* Icona & Colore tema */}
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-ink-body">
                                        {t('admin.instrumentWizard.icon')}
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {ICONS.map(({ id, icon: IconComponent }) => (
                                            <button
                                                key={id}
                                                type="button"
                                                onClick={() => setForm({ ...form, icon: id })}
                                                aria-label={id}
                                                aria-pressed={form.icon === id}
                                                className={`flex min-h-control min-w-control items-center justify-center rounded-lg border transition-colors ${
                                                    form.icon === id
                                                        ? 'border-brand bg-brand-soft text-link ring-2 ring-focus'
                                                        : 'border-line bg-surface text-ink-muted hover:bg-surface-sunken'
                                                }`}
                                            >
                                                <IconComponent className="h-4 w-4" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-ink-body">
                                        {t('admin.instrumentWizard.color')}
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                        {COLOR_THEMES.map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setForm({ ...form, color_theme: c })}
                                                aria-label={t(`admin.color.${c}`)}
                                                aria-pressed={form.color_theme === c}
                                                className={`flex min-h-control min-w-control items-center justify-center rounded-full border transition-transform ${
                                                    form.color_theme === c
                                                        ? 'scale-110 border-brand ring-2 ring-focus'
                                                        : 'border-transparent hover:scale-105'
                                                }`}
                                            >
                                                <span className={`h-5 w-5 rounded-full ${COLOR_SWATCH[c]}`} />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Salva come Bozza checkbox */}
                            <label className="flex items-center gap-2 rounded-lg border border-line bg-surface-sunken p-4 text-xs text-ink-body cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={!form.is_active}
                                    onChange={(e) => setForm({ ...form, is_active: !e.target.checked })}
                                    className="h-4 w-4 rounded border-line-strong text-brand focus:ring-focus"
                                />
                                <span>{t('admin.instrumentWizard.statusDraft')}</span>
                            </label>
                        </div>
                    )}

                    {/* STEP 2: TEMPLATE STEP INIZIALI */}
                    {currentStep === 2 && (
                        <div className="space-y-4">
                            <p className="text-xs font-semibold text-ink-body">
                                {t('admin.instrumentWizard.templateSelect')}
                            </p>

                            <div className="space-y-4">
                                {[
                                    {
                                        key: 'three_steps' as StepTemplateKey,
                                        titleKey: 'template3Steps',
                                        descKey: 'template3StepsDesc',
                                    },
                                    {
                                        key: 'single_step' as StepTemplateKey,
                                        titleKey: 'template1Step',
                                        descKey: 'template1StepDesc',
                                    },
                                    {
                                        key: 'empty' as StepTemplateKey,
                                        titleKey: 'templateEmpty',
                                        descKey: 'templateEmptyDesc',
                                    },
                                ].map(({ key, titleKey, descKey }) => {
                                    const isSelected = form.template === key;
                                    return (
                                        <label
                                            key={key}
                                            className={`flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors ${
                                                isSelected
                                                    ? 'border-brand bg-brand-soft/60 ring-1 ring-focus'
                                                    : 'border-line bg-surface hover:bg-surface-sunken'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="template"
                                                value={key}
                                                checked={isSelected}
                                                onChange={() => setForm({ ...form, template: key })}
                                                className="mt-1 text-brand"
                                            />
                                            <div>
                                                <p className="text-xs font-semibold text-ink">
                                                    {t(`admin.instrumentWizard.${titleKey}`)}
                                                </p>
                                                <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                                                    {t(`admin.instrumentWizard.${descKey}`)}
                                                </p>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>

                            {/* Anteprima dei passaggi */}
                            <div className="rounded-lg border border-line bg-surface-sunken p-4">
                                <p className="mb-2 text-xs font-semibold text-ink-muted">
                                    {t('admin.instrumentWizard.stepPreview')}
                                </p>
                                {previewSteps.length === 0 ? (
                                    <p className="text-xs text-ink-muted italic">
                                        {t('admin.instrumentWizard.noStepsPreview')}
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {previewSteps.map((step, idx) => (
                                            <div
                                                key={step.id}
                                                className="rounded-control border border-line bg-surface p-2 shadow-card"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-soft text-2xs font-semibold text-link">
                                                        {idx + 1}
                                                    </span>
                                                    <span className="text-xs font-semibold text-ink">
                                                        {step.label_i18n?.[lang] || step.label}
                                                    </span>
                                                    <span className="rounded bg-surface-raised px-2 py-1 font-mono text-2xs text-ink-muted">
                                                        {step.id}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-2xs text-ink-muted line-clamp-2">
                                                    {step.prompt}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* STEP 3: COUNSELOR & RIEPILOGO */}
                    {currentStep === 3 && (
                        <div className="space-y-4">
                            <div>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <p className="text-xs font-semibold text-ink">
                                            {t('admin.instrumentWizard.counselorsTitle')}
                                        </p>
                                        <p className="text-2xs text-ink-muted">
                                            {t('admin.instrumentWizard.counselorsHint')}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setForm({
                                                    ...form,
                                                    selected_counselor_ids: counselors.map((c) => c.id),
                                                })
                                            }
                                            className="min-h-control rounded border border-line bg-surface px-2 py-1 text-2xs font-semibold text-ink-muted hover:bg-surface-sunken"
                                        >
                                            {t('admin.instrumentWizard.selectAll')}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setForm({
                                                    ...form,
                                                    selected_counselor_ids: [],
                                                })
                                            }
                                            className="min-h-control rounded border border-line bg-surface px-2 py-1 text-2xs font-semibold text-ink-muted hover:bg-surface-sunken"
                                        >
                                            {t('admin.instrumentWizard.deselectAll')}
                                        </button>
                                    </div>
                                </div>

                                {loadingCounselors ? (
                                    <div className="mt-4 flex items-center gap-2 text-xs text-ink-muted">
                                        <Loader2 className="h-4 w-4 animate-spin text-brand" />
                                        {t('admin.instrumentWizard.loadingCounselors')}
                                    </div>
                                ) : counselors.length === 0 ? (
                                    <p className="mt-4 text-xs text-ink-muted italic">
                                        {t('admin.instrumentWizard.noCounselors')}
                                    </p>
                                ) : (
                                    <div className="mt-2 grid max-h-48 gap-2 overflow-y-auto rounded-lg border border-line bg-surface-sunken p-2 sm:grid-cols-2">
                                        {counselors.map((c) => {
                                            const checked = form.selected_counselor_ids.includes(c.id);
                                            return (
                                                <label
                                                    key={c.id}
                                                    className={`flex cursor-pointer items-center gap-2 rounded-control border p-2 text-xs transition-colors ${
                                                        checked
                                                            ? 'border-brand bg-surface shadow-card'
                                                            : 'border-transparent bg-surface/60 text-ink-muted hover:bg-surface'
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setForm({
                                                                    ...form,
                                                                    selected_counselor_ids: [
                                                                        ...form.selected_counselor_ids,
                                                                        c.id,
                                                                    ],
                                                                });
                                                            } else {
                                                                setForm({
                                                                    ...form,
                                                                    selected_counselor_ids:
                                                                        form.selected_counselor_ids.filter(
                                                                            (id) => id !== c.id,
                                                                        ),
                                                                });
                                                            }
                                                        }}
                                                        className="h-3.5 w-3.5 rounded border-line-strong text-brand focus:ring-focus"
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-semibold text-ink truncate">
                                                            {c.name}
                                                        </p>
                                                        <p className="font-mono text-2xs text-ink-muted truncate">
                                                            {c.slug}
                                                        </p>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Card Riepilogo */}
                            <div className="rounded-lg border border-brand-line bg-brand-soft/40 p-4">
                                <h4 className="text-xs font-semibold text-link">
                                    {t('admin.instrumentWizard.summaryTitle')}
                                </h4>
                                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                    <div>
                                        <dt className="text-ink-muted">{t('admin.instrumentWizard.summaryCode')}</dt>
                                        <dd className="font-mono font-semibold text-ink">{form.code || '—'}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-ink-muted">{t('admin.instrumentWizard.summaryName')}</dt>
                                        <dd className="font-semibold text-ink">{form.name_it || '—'}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-ink-muted">{t('admin.instrumentWizard.summaryCategory')}</dt>
                                        <dd className="font-semibold text-ink">
                                            {form.tool_category === 'guided'
                                                ? t('admin.instrumentWizard.categoryGuided')
                                                : t('admin.instrumentWizard.categoryAssessment')}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-ink-muted">{t('admin.instrumentWizard.summaryAudience')}</dt>
                                        <dd className="font-semibold text-ink">
                                            {t(`admin.instrumentWizard.audience${form.target_audience === 'both' ? 'Both' : form.target_audience === 'teacher' ? 'Teacher' : 'Student'}`)}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-ink-muted">{t('admin.instrumentWizard.summarySteps')}</dt>
                                        <dd className="font-semibold text-ink">{previewSteps.length}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-ink-muted">{t('admin.instrumentWizard.summaryCounselors')}</dt>
                                        <dd className="font-semibold text-link">
                                            {t('admin.instrumentWizard.counselorSelectedCount', {
                                                count: form.selected_counselor_ids.length,
                                            })}
                                        </dd>
                                    </div>
                                </dl>
                            </div>

                            {submitError && (
                                <p role="alert" className="rounded-control border border-danger-line bg-danger-soft p-2 text-xs text-danger-ink font-semibold">
                                    {submitError}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-line bg-surface-sunken px-4 py-4">
                    <Button variant="secondary"
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="text-xs">
                        {t('admin.instrumentWizard.cancel')}
                    </Button>

                    <div className="flex gap-2">
                        {currentStep > 1 && (
                            <Button variant="secondary"
                                type="button"
                                onClick={handleBack}
                                disabled={submitting}
                                className="gap-1 text-xs">
                                <ChevronLeft className="h-4 w-4" />
                                {t('admin.instrumentWizard.back')}
                            </Button>
                        )}

                        {currentStep < 3 ? (
                            <Button
                                type="button"
                                onClick={handleNext}
                                disabled={submitting}
                                className="gap-1 text-xs">
                                {t('admin.instrumentWizard.next')}
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                onClick={() => void handleSubmit()}
                                disabled={submitting}
                                className="text-xs">
                                {submitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        {t('admin.instrumentWizard.submitting')}
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-4 w-4" />
                                        {t('admin.instrumentWizard.submit')}
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </footer>
            </div>
        </div>,
        document.body,
    );
}
