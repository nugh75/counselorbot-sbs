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
            className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-xs sm:items-center sm:p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !submitting) onClose();
            }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            >
                {/* Header */}
                <header className="flex items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
                    <div className="min-w-0">
                        <h3 id={titleId} className="flex items-center gap-2 text-base font-bold text-slate-800">
                            <Sparkles className="h-5 w-5 text-indigo-600 shrink-0" aria-hidden="true" />
                            {t('admin.instrumentWizard.title')}
                        </h3>
                        <p className="mt-0.5 text-xs text-slate-500">
                            {t('admin.instrumentWizard.subtitle')}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        aria-label={t('admin.instrumentWizard.close')}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50"
                    >
                        <X className="h-5 w-5" aria-hidden="true" />
                    </button>
                </header>

                {/* Step Navigation Tabs */}
                <nav aria-label={t('admin.instrumentWizard.stepsAriaLabel')} className="flex border-b border-slate-200 bg-white px-5 pt-2">
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
                                className={`flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors sm:px-4 ${
                                    isActive
                                        ? 'border-indigo-600 text-indigo-700'
                                        : isPast
                                        ? 'border-transparent text-slate-700 hover:text-indigo-600'
                                        : 'border-transparent text-slate-400'
                                }`}
                            >
                                <span
                                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
                                        isActive
                                            ? 'bg-indigo-600 text-white'
                                            : isPast
                                            ? 'bg-emerald-100 text-emerald-800'
                                            : 'bg-slate-100 text-slate-500'
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
                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                    {/* STEP 1: DATI BASE */}
                    {currentStep === 1 && (
                        <div className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                {/* Codice slug */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700">
                                        {t('admin.instrumentWizard.code')} <span className="text-red-500">*</span>
                                        <input
                                            type="text"
                                            required
                                            value={form.code}
                                            onChange={(e) => {
                                                setForm({ ...form, code: sanitizeInstrumentCode(e.target.value) });
                                                setCodeError('');
                                            }}
                                            placeholder={t('admin.instrumentWizard.codePlaceholder')}
                                            className={`mt-1 w-full rounded-md border font-mono text-xs uppercase px-3 py-2 outline-none focus:ring-2 ${
                                                codeError
                                                    ? 'border-red-300 ring-red-200'
                                                    : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                                            }`}
                                        />
                                    </label>
                                    <p className="mt-1 text-[11px] text-slate-500">
                                        {t('admin.instrumentWizard.codeHint')}
                                    </p>
                                    {codeError && (
                                        <p role="alert" className="mt-1 text-xs text-red-600 font-medium">
                                            {codeError}
                                        </p>
                                    )}
                                </div>

                                {/* Titolo in italiano */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700">
                                        {t('admin.instrumentWizard.name')} <span className="text-red-500">*</span>
                                        <input
                                            type="text"
                                            required
                                            value={form.name_it}
                                            onChange={(e) => {
                                                setForm({ ...form, name_it: e.target.value });
                                                setNameError('');
                                            }}
                                            placeholder={t('admin.instrumentWizard.namePlaceholder')}
                                            className={`mt-1 w-full rounded-md border text-xs px-3 py-2 outline-none focus:ring-2 ${
                                                nameError
                                                    ? 'border-red-300 ring-red-200'
                                                    : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                                            }`}
                                        />
                                    </label>
                                    <p className="mt-1 text-[11px] text-slate-500">
                                        {t('admin.instrumentWizard.nameHint')}
                                    </p>
                                    {nameError && (
                                        <p role="alert" className="mt-1 text-xs text-red-600 font-medium">
                                            {nameError}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Descrizione in italiano */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700">
                                    {t('admin.instrumentWizard.description')}
                                    <textarea
                                        rows={2}
                                        value={form.description_it}
                                        onChange={(e) => setForm({ ...form, description_it: e.target.value })}
                                        placeholder={t('admin.instrumentWizard.descPlaceholder')}
                                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-xs leading-relaxed outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
                                    />
                                </label>
                                <p className="mt-1 text-[11px] text-slate-500">
                                    {t('admin.instrumentWizard.descriptionHint')}
                                </p>
                            </div>

                            {/* Accordion Traduzioni multilingua */}
                            <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                                <button
                                    type="button"
                                    onClick={() => setShowTranslations(!showTranslations)}
                                    className="flex w-full items-center justify-between text-xs font-semibold text-slate-700 hover:text-indigo-600"
                                >
                                    <span>{t('admin.instrumentWizard.translationsToggle')}</span>
                                    <span className="text-[11px] font-normal text-slate-500">
                                        {showTranslations ? t('admin.instrumentWizard.collapseTranslations') : t('admin.instrumentWizard.expandTranslations')}
                                    </span>
                                </button>
                                {showTranslations && (
                                    <div className="mt-3 space-y-3 border-t border-slate-200 pt-3">
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {(['en', 'es', 'fr', 'de', 'sv'] as const).map((l) => (
                                                <div key={`name-${l}`}>
                                                    <label className="block text-[11px] font-medium text-slate-600 uppercase">
                                                        {t('admin.instrumentWizard.titleLanguage', { lang: l.toUpperCase() })}
                                                        <input
                                                            type="text"
                                                            value={form[`name_${l}` as keyof InstrumentWizardForm] as string}
                                                            onChange={(e) =>
                                                                setForm({ ...form, [`name_${l}`]: e.target.value })
                                                            }
                                                            className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                                                        />
                                                    </label>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="grid gap-2 sm:grid-cols-2">
                                            {(['en', 'es', 'fr', 'de', 'sv'] as const).map((l) => (
                                                <div key={`desc-${l}`}>
                                                    <label className="block text-[11px] font-medium text-slate-600 uppercase">
                                                        {t('admin.instrumentWizard.descLanguage', { lang: l.toUpperCase() })}
                                                        <textarea
                                                            rows={2}
                                                            value={form[`description_${l}` as keyof InstrumentWizardForm] as string}
                                                            onChange={(e) =>
                                                                setForm({ ...form, [`description_${l}`]: e.target.value })
                                                            }
                                                            className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs leading-normal"
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
                                <legend className="mb-1 text-xs font-semibold text-slate-700">
                                    {t('admin.instrumentWizard.category')}
                                </legend>
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label
                                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                                            form.tool_category === 'guided'
                                                ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-500'
                                                : 'border-slate-200 bg-white hover:bg-slate-50'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="tool_category"
                                            value="guided"
                                            checked={form.tool_category === 'guided'}
                                            onChange={() => setForm({ ...form, tool_category: 'guided' })}
                                            className="mt-0.5 text-indigo-600"
                                        />
                                        <div>
                                            <p className="text-xs font-bold text-slate-800">
                                                {t('admin.instrumentWizard.categoryGuided')}
                                            </p>
                                            <p className="mt-0.5 text-[11px] text-slate-500">
                                                {t('admin.instrumentWizard.categoryGuidedDesc')}
                                            </p>
                                        </div>
                                    </label>
                                    <label
                                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                                            form.tool_category === 'assessment'
                                                ? 'border-indigo-600 bg-indigo-50/50 ring-1 ring-indigo-500'
                                                : 'border-slate-200 bg-white hover:bg-slate-50'
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="tool_category"
                                            value="assessment"
                                            checked={form.tool_category === 'assessment'}
                                            onChange={() => setForm({ ...form, tool_category: 'assessment' })}
                                            className="mt-0.5 text-indigo-600"
                                        />
                                        <div>
                                            <p className="text-xs font-bold text-slate-800">
                                                {t('admin.instrumentWizard.categoryAssessment')}
                                            </p>
                                            <p className="mt-0.5 text-[11px] text-slate-500">
                                                {t('admin.instrumentWizard.categoryAssessmentDesc')}
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            </fieldset>

                            {/* Destinatari & Modalità intervista */}
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700">
                                        {t('admin.instrumentWizard.targetAudience')}
                                        <select
                                            value={form.target_audience}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    target_audience: e.target.value as 'student' | 'teacher' | 'both',
                                                })
                                            }
                                            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500"
                                        >
                                            <option value="student">{t('admin.instrumentWizard.audienceStudent')}</option>
                                            <option value="teacher">{t('admin.instrumentWizard.audienceTeacher')}</option>
                                            <option value="both">{t('admin.instrumentWizard.audienceBoth')}</option>
                                        </select>
                                    </label>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700">
                                        {t('admin.instrumentWizard.interviewMode')}
                                        <select
                                            value={form.interview_mode}
                                            onChange={(e) =>
                                                setForm({
                                                    ...form,
                                                    interview_mode: e.target.value as 'interactive' | 'direct',
                                                })
                                            }
                                            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500"
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
                                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                                        {t('admin.instrumentWizard.icon')}
                                    </label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {ICONS.map(({ id, icon: IconComponent }) => (
                                            <button
                                                key={id}
                                                type="button"
                                                onClick={() => setForm({ ...form, icon: id })}
                                                aria-label={id}
                                                aria-pressed={form.icon === id}
                                                className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                                                    form.icon === id
                                                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-400'
                                                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                                }`}
                                            >
                                                <IconComponent className="h-4 w-4" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                                        {t('admin.instrumentWizard.color')}
                                    </label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {COLOR_THEMES.map((c) => (
                                            <button
                                                key={c}
                                                type="button"
                                                onClick={() => setForm({ ...form, color_theme: c })}
                                                aria-label={t(`admin.color.${c}`)}
                                                aria-pressed={form.color_theme === c}
                                                className={`flex h-7 w-7 items-center justify-center rounded-full border transition-transform ${
                                                    form.color_theme === c
                                                        ? 'scale-110 border-indigo-700 ring-2 ring-indigo-400'
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
                            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={!form.is_active}
                                    onChange={(e) => setForm({ ...form, is_active: !e.target.checked })}
                                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span>{t('admin.instrumentWizard.statusDraft')}</span>
                            </label>
                        </div>
                    )}

                    {/* STEP 2: TEMPLATE STEP INIZIALI */}
                    {currentStep === 2 && (
                        <div className="space-y-4">
                            <p className="text-xs font-semibold text-slate-700">
                                {t('admin.instrumentWizard.templateSelect')}
                            </p>

                            <div className="space-y-3">
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
                                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3.5 transition-colors ${
                                                isSelected
                                                    ? 'border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-500'
                                                    : 'border-slate-200 bg-white hover:bg-slate-50'
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="template"
                                                value={key}
                                                checked={isSelected}
                                                onChange={() => setForm({ ...form, template: key })}
                                                className="mt-0.5 text-indigo-600"
                                            />
                                            <div>
                                                <p className="text-xs font-bold text-slate-800">
                                                    {t(`admin.instrumentWizard.${titleKey}`)}
                                                </p>
                                                <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                                                    {t(`admin.instrumentWizard.${descKey}`)}
                                                </p>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>

                            {/* Anteprima dei passaggi */}
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-600">
                                    {t('admin.instrumentWizard.stepPreview')}
                                </p>
                                {previewSteps.length === 0 ? (
                                    <p className="text-xs text-slate-400 italic">
                                        {t('admin.instrumentWizard.noStepsPreview')}
                                    </p>
                                ) : (
                                    <div className="space-y-2">
                                        {previewSteps.map((step, idx) => (
                                            <div
                                                key={step.id}
                                                className="rounded-md border border-slate-200 bg-white p-2.5 shadow-2xs"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">
                                                        {idx + 1}
                                                    </span>
                                                    <span className="text-xs font-bold text-slate-800">
                                                        {step.label_i18n?.[lang] || step.label}
                                                    </span>
                                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                                                        {step.id}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-[11px] text-slate-600 line-clamp-2">
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
                                        <p className="text-xs font-bold text-slate-800">
                                            {t('admin.instrumentWizard.counselorsTitle')}
                                        </p>
                                        <p className="text-[11px] text-slate-500">
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
                                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
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
                                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                                        >
                                            {t('admin.instrumentWizard.deselectAll')}
                                        </button>
                                    </div>
                                </div>

                                {loadingCounselors ? (
                                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                                        <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                                        {t('admin.instrumentWizard.loadingCounselors')}
                                    </div>
                                ) : counselors.length === 0 ? (
                                    <p className="mt-3 text-xs text-slate-500 italic">
                                        {t('admin.instrumentWizard.noCounselors')}
                                    </p>
                                ) : (
                                    <div className="mt-2.5 grid max-h-48 gap-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 sm:grid-cols-2">
                                        {counselors.map((c) => {
                                            const checked = form.selected_counselor_ids.includes(c.id);
                                            return (
                                                <label
                                                    key={c.id}
                                                    className={`flex cursor-pointer items-center gap-2.5 rounded-md border p-2 text-xs transition-colors ${
                                                        checked
                                                            ? 'border-indigo-400 bg-white shadow-2xs'
                                                            : 'border-transparent bg-white/60 text-slate-500 hover:bg-white'
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
                                                        className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-semibold text-slate-800 truncate">
                                                            {c.name}
                                                        </p>
                                                        <p className="font-mono text-[10px] text-slate-400 truncate">
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
                            <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-4">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                                    {t('admin.instrumentWizard.summaryTitle')}
                                </h4>
                                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                    <div>
                                        <dt className="text-slate-500">{t('admin.instrumentWizard.summaryCode')}</dt>
                                        <dd className="font-mono font-bold text-slate-800">{form.code || '—'}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-slate-500">{t('admin.instrumentWizard.summaryName')}</dt>
                                        <dd className="font-medium text-slate-800">{form.name_it || '—'}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-slate-500">{t('admin.instrumentWizard.summaryCategory')}</dt>
                                        <dd className="font-medium text-slate-800">
                                            {form.tool_category === 'guided'
                                                ? t('admin.instrumentWizard.categoryGuided')
                                                : t('admin.instrumentWizard.categoryAssessment')}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-slate-500">{t('admin.instrumentWizard.summaryAudience')}</dt>
                                        <dd className="font-medium text-slate-800">
                                            {t(`admin.instrumentWizard.audience${form.target_audience === 'both' ? 'Both' : form.target_audience === 'teacher' ? 'Teacher' : 'Student'}`)}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-slate-500">{t('admin.instrumentWizard.summarySteps')}</dt>
                                        <dd className="font-bold text-slate-800">{previewSteps.length}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-slate-500">{t('admin.instrumentWizard.summaryCounselors')}</dt>
                                        <dd className="font-bold text-indigo-700">
                                            {t('admin.instrumentWizard.counselorSelectedCount', {
                                                count: form.selected_counselor_ids.length,
                                            })}
                                        </dd>
                                    </div>
                                </dl>
                            </div>

                            {submitError && (
                                <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 font-medium">
                                    {submitError}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                    >
                        {t('admin.instrumentWizard.cancel')}
                    </button>

                    <div className="flex gap-2">
                        {currentStep > 1 && (
                            <button
                                type="button"
                                onClick={handleBack}
                                disabled={submitting}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                            >
                                <ChevronLeft className="h-4 w-4" />
                                {t('admin.instrumentWizard.back')}
                            </button>
                        )}

                        {currentStep < 3 ? (
                            <button
                                type="button"
                                onClick={handleNext}
                                disabled={submitting}
                                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-60"
                            >
                                {t('admin.instrumentWizard.next')}
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => void handleSubmit()}
                                disabled={submitting}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-700 disabled:opacity-60"
                            >
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
                            </button>
                        )}
                    </div>
                </footer>
            </div>
        </div>,
        document.body,
    );
}
