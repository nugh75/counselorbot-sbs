'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, Send } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n-context';
import { PageHeader } from '@/components/ui/PageHeader';

const API_BASE = '/api';

// Options for demographics
const ETA_OPTIONS = ['< 14', '14-16', '17-18', '19-24', '25-34', '35-44', '45-54', '55+'];
const SESSO_OPTIONS = ['Maschio', 'Femmina', 'Altro', 'Preferisco non rispondere'];
const ISTRUZIONE_OPTIONS = ['Scuola media', 'Diploma', 'Laurea triennale', 'Laurea magistrale', 'Dottorato', 'Altro'];
const TIPO_ISTITUTO_OPTIONS = ['Liceo', 'Istituto tecnico', 'Istituto professionale', 'Università', 'Altro'];
const PROVENIENZA_OPTIONS = ['Nord Italia', 'Centro Italia', 'Sud Italia', 'Isole', 'Estero'];
const TOOL_OPTIONS = ['QSA', 'QSAr', 'ZTPI', 'SAVICKAS', 'QPCS', 'QPCC', 'QAP'];

const QUESTIONS = [
    { key: 'q_utile', label: 'Il chatbot mi è stato utile' },
    { key: 'q_pertinente', label: 'Le risposte erano pertinenti' },
    { key: 'q_chiaro', label: 'Le risposte erano chiare' },
    { key: 'q_dettaglio', label: 'Il livello di dettaglio era adeguato' },
    { key: 'q_facile', label: 'È stato facile usarlo' },
    { key: 'q_veloce', label: 'Le risposte erano abbastanza veloci' },
    { key: 'q_fiducia', label: 'Mi fido delle informazioni fornite' },
    { key: 'q_riflettere', label: 'Mi ha aiutato a riflettere su di me' },
    { key: 'q_coinvolgente', label: "L'interazione è stata coinvolgente" },
    { key: 'q_consiglierei', label: 'Lo riutilizzerei / consiglierei' },
];

type FormValue = string | number | null | string[];

type FormData = {
    eta: string;
    sesso: string;
    istruzione: string;
    tipo_istituto: string;
    provenienza: string;
    area_studio: string;
    strumenti_utilizzati: string[];
    feedback_aperto: string;
    [key: string]: FormValue;
};

export default function QuestionarioPage() {
    const { t, tf } = useI18n();
    const [formData, setFormData] = useState<FormData>({
        eta: '',
        sesso: '',
        istruzione: '',
        tipo_istituto: '',
        provenienza: '',
        area_studio: '',
        q_utile: null,
        q_pertinente: null,
        q_chiaro: null,
        q_dettaglio: null,
        q_facile: null,
        q_veloce: null,
        q_fiducia: null,
        q_riflettere: null,
        q_coinvolgente: null,
        q_consiglierei: null,
        strumenti_utilizzati: [],
        feedback_aperto: '',
    });

    const [consent, setConsent] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Compute area_studio based on tipo_istituto and istruzione
    const computeAreaStudio = (istruzione: string, tipo_istituto: string) => {
        if (tipo_istituto === 'Università') return 'Universitario';
        if (tipo_istituto === 'Liceo') return 'Liceale';
        if (tipo_istituto === 'Istituto tecnico') return 'Tecnico';
        if (tipo_istituto === 'Istituto professionale') return 'Professionale';
        if (istruzione === 'Dottorato') return 'Post-laurea';
        return 'Altro';
    };

    const handleDemographicChange = (field: string, value: string) => {
        const updated = { ...formData, [field]: value };
        // Auto-compute area_studio
        if (field === 'istruzione' || field === 'tipo_istituto') {
            updated.area_studio = computeAreaStudio(
                field === 'istruzione' ? value : formData.istruzione,
                field === 'tipo_istituto' ? value : formData.tipo_istituto
            );
        }
        setFormData(updated);
    };

    const handleRatingChange = (key: string, value: number | null) => {
        setFormData({ ...formData, [key]: value });
    };

    const handleToolToggle = (tool: string) => {
        const selected = formData.strumenti_utilizzati;
        const next = selected.includes(tool)
            ? selected.filter((item) => item !== tool)
            : [...selected, tool];
        setFormData({ ...formData, strumenti_utilizzati: next });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!consent) {
            setError(t('survey.err.consent'));
            return;
        }

        // Check if all quantitative questions are answered
        const hasUnansweredQuestions = QUESTIONS.some(q => formData[q.key] === null);
        if (hasUnansweredQuestions) {
            setError(t('survey.err.unanswered'));
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            // Convert empty strings to null for backend
            const payload: Record<string, FormValue> = {};
            for (const [key, value] of Object.entries(formData)) {
                if (Array.isArray(value)) {
                    payload[key] = value.length > 0 ? value : null;
                } else if (typeof value === 'string') {
                    payload[key] = value.trim() === '' ? null : value;
                } else {
                    payload[key] = value;
                }
            }

            const response = await fetch(`${API_BASE}/survey`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error(t('survey.err.send'));
            }

            setIsSubmitted(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('survey.err.unknown'));
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSubmitted) {
        return (
            <div className="page-narrow">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="glass-panel p-8 text-center space-y-6"
                >
                    <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                        <CheckCircle className="w-10 h-10 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800">{t('survey.thanks.title')}</h2>
                    <p className="text-slate-500">
                        {t('survey.thanks.body')}
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-md transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        {t('survey.backHome')}
                    </Link>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="page-narrow">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
            >
                <PageHeader title={t('survey.title')} subtitle={t('survey.subtitle')} backHref="/" />

                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Dati di base */}
                    <div className="glass-panel p-6 space-y-6">
                        <h2 className="text-xl font-semibold text-slate-800">{t('survey.basic.title')}</h2>
                        <p className="text-sm text-slate-500">{t('survey.basic.sub')}</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <SelectField
                                label={t('survey.field.eta')}
                                placeholder={t('survey.select.placeholder')}
                                value={formData.eta}
                                options={ETA_OPTIONS}
                                onChange={(v) => handleDemographicChange('eta', v)}
                            />
                            <SelectField
                                label={t('survey.field.sesso')}
                                placeholder={t('survey.select.placeholder')}
                                value={formData.sesso}
                                options={SESSO_OPTIONS}
                                optionLabel={(v) => tf(`survey.opt.${v}`, v)}
                                onChange={(v) => handleDemographicChange('sesso', v)}
                            />
                            <SelectField
                                label={t('survey.field.istruzione')}
                                placeholder={t('survey.select.placeholder')}
                                value={formData.istruzione}
                                options={ISTRUZIONE_OPTIONS}
                                optionLabel={(v) => tf(`survey.opt.${v}`, v)}
                                onChange={(v) => handleDemographicChange('istruzione', v)}
                            />
                            <SelectField
                                label={t('survey.field.tipoIstituto')}
                                placeholder={t('survey.select.placeholder')}
                                value={formData.tipo_istituto}
                                options={TIPO_ISTITUTO_OPTIONS}
                                optionLabel={(v) => tf(`survey.opt.${v}`, v)}
                                onChange={(v) => handleDemographicChange('tipo_istituto', v)}
                            />
                            <SelectField
                                label={t('survey.field.provenienza')}
                                placeholder={t('survey.select.placeholder')}
                                value={formData.provenienza}
                                options={PROVENIENZA_OPTIONS}
                                optionLabel={(v) => tf(`survey.opt.${v}`, v)}
                                onChange={(v) => handleDemographicChange('provenienza', v)}
                            />
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    {t('survey.field.area')}
                                </label>
                                <input
                                    type="text"
                                    value={formData.area_studio}
                                    readOnly
                                    className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Strumenti utilizzati */}
                    <div className="glass-panel p-6 space-y-4">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-800">{t('survey.tools.title')}</h2>
                            <p className="text-sm text-slate-500 mt-1">{t('survey.tools.sub')}</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {TOOL_OPTIONS.map((tool) => {
                                const checked = formData.strumenti_utilizzati.includes(tool);
                                return (
                                    <label
                                        key={tool}
                                        className={`flex items-center gap-3 rounded-md border px-3 py-3 cursor-pointer transition-colors ${checked
                                            ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => handleToolToggle(tool)}
                                            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                                        />
                                        <span className="text-sm font-medium">{tf(`survey.tool.${tool}`, tool)}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    {/* Valutazione quantitativa */}
                    <div className="glass-panel p-6 space-y-6">
                        <h2 className="text-xl font-semibold text-slate-800">{t('survey.quant.title')}</h2>
                        <p className="text-sm text-slate-500">
                            {t('survey.quant.sub')}
                        </p>

                        <div className="space-y-4">
                            {QUESTIONS.map((q) => (
                                <RatingField
                                    key={q.key}
                                    label={tf(`survey.q.${q.key}`, q.label)}
                                    value={formData[q.key] as number | null}
                                    onChange={(v) => handleRatingChange(q.key, v)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Feedback aperto */}
                    <div className="glass-panel p-6 space-y-4">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-800">{t('survey.open.title')}</h2>
                            <p className="text-sm text-slate-500 mt-1">{t('survey.open.sub')}</p>
                        </div>
                        <textarea
                            value={formData.feedback_aperto}
                            onChange={(e) => setFormData({ ...formData, feedback_aperto: e.target.value })}
                            placeholder={t('survey.open.placeholder')}
                            rows={5}
                            maxLength={2000}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-y"
                        />
                        <p className="text-xs text-slate-500">{t('survey.open.note')}</p>
                    </div>

                    {/* Consenso */}
                    <div className="glass-panel p-6 space-y-4">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={consent}
                                onChange={(e) => setConsent(e.target.checked)}
                                className="mt-1 w-5 h-5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                            />
                            <span className="text-sm text-slate-600">
                                {t('survey.consent')}
                            </span>
                        </label>

                        {error && (
                            <p className="text-red-600 text-sm">{error}</p>
                        )}
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={isSubmitting || !consent}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-md transition-colors flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <>{t('survey.submitting')}</>
                        ) : (
                            <>
                                <Send className="w-5 h-5" />
                                {t('survey.submit')}
                            </>
                        )}
                    </button>
                </form>
            </motion.div>
        </div>
    );
}

// Select field component
function SelectField({
    label,
    value,
    options,
    onChange,
    placeholder = '-- Seleziona --',
    optionLabel,
}: {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
    placeholder?: string;
    optionLabel?: (value: string) => string;
}) {
    return (
        <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-md text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
                <option value="">{placeholder}</option>
                {options.map((opt) => (
                    <option key={opt} value={opt}>{optionLabel ? optionLabel(opt) : opt}</option>
                ))}
            </select>
        </div>
    );
}

// Rating field component with 1-5 + NR
function RatingField({
    label,
    value,
    onChange,
}: {
    label: string;
    value: number | null;
    onChange: (value: number | null) => void;
}) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 border-b border-slate-100 last:border-0">
            <span className="text-slate-700 sm:flex-1">{label}</span>
            <div className="flex gap-2">

                {[1, 2, 3, 4, 5].map((n) => (
                    <button
                        key={n}
                        type="button"
                        onClick={() => onChange(n)}
                        className={`w-10 h-10 text-sm font-medium rounded-md transition-colors ${value === n
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                    >
                        {n}
                    </button>
                ))}
            </div>
        </div>
    );
}
