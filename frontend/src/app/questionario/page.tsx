'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, Send } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n-context';
import { fetchCounselors, type PublicCounselor } from '@/lib/counselor';
import { PageHeader } from '@/components/ui/PageHeader';
import { StickyActions } from '@/components/ui/StickyActions';

const API_BASE = '/api';

// Options for demographics
const ETA_OPTIONS = ['< 14', '14-16', '17-18', '19-24', '25-34', '35-44', '45-54', '55+'];
const SESSO_OPTIONS = ['Maschio', 'Femmina', 'Altro', 'Preferisco non rispondere'];

const PAESE_OPTIONS = ['Italia', 'Svezia', 'Regno Unito (Inghilterra)', 'Spagna', 'Francia', 'Germania', 'Altro'];

const ISTRUZIONE_MAP: Record<string, string[]> = {
    'Italia': ['Scuola media', 'Diploma', 'Laurea triennale', 'Laurea magistrale', 'Dottorato', 'Altro'],
    'Svezia': ['Grundskola (år 7–9)', 'Gymnasium (nationellt program)', 'Kandidatexamen', 'Masterexamen', 'Doktorsexamen', 'Annat'],
    'Regno Unito (Inghilterra)': ['Secondary school (KS3–KS4, GCSE)', 'Sixth Form (A-level / T-level)', "Bachelor's degree", "Master's degree", 'PhD', 'Other'],
    'Spagna': ['ESO', 'Bachillerato / CFGM', 'Grado', 'Máster', 'Doctorado', 'Otro'],
    'Francia': ['Collège', 'Lycée (Bac)', 'Licence', 'Master', 'Doctorat', 'Autre'],
    'Germania': ['Sekundarstufe I (Haupt-/Realschule)', 'Gymnasium (Abitur) / Berufsschule', 'Bachelor', 'Master', 'Promotion', 'Sonstiges'],
    'Altro': ['Lower secondary', 'Upper secondary', "Bachelor's degree", "Master's degree", 'PhD', 'Other'],
};

const TIPO_ISTITUTO_MAP: Record<string, string[]> = {
    'Italia': ['Liceo', 'Istituto tecnico', 'Istituto professionale', 'Università', 'Altro'],
    'Svezia': ['Högskoleförberedande (gymnasieprogram)', 'Yrkesförberedande (gymnasieprogram)', 'Komvux / folkhögskola', 'Universitet / högskola', 'Annat'],
    'Regno Unito (Inghilterra)': ['Secondary school (comprehensive/grammar)', 'Sixth Form / FE college', 'University', 'Apprenticeship', 'Other'],
    'Spagna': ['Instituto de secundaria (IES)', 'Centro de FP', 'Universidad', 'Otro'],
    'Francia': ['Collège', 'Lycée général/technologique', 'Lycée professionnel', 'Université', 'Autre'],
    'Germania': ['Haupt-/Realschule', 'Gymnasium', 'Berufsschule / Fachschule', 'Universität / Hochschule', 'Sonstiges'],
    'Altro': ['General secondary', 'Vocational secondary', 'Higher education institution', 'Other'],
};

const PROVENIENZA_MAP: Record<string, string[]> = {
    'Italia': ['Nord Italia', 'Centro Italia', 'Sud Italia', 'Isole', 'Estero'],
    'Svezia': ['Östra Sverige', 'Södra Sverige', 'Norra Sverige', 'Utomlands'],
    'Regno Unito (Inghilterra)': ['North England', 'Midlands & East', 'South England', 'London', 'Wales', 'Scotland', 'Northern Ireland', 'Abroad'],
    'Spagna': ['Noroeste', 'Noreste', 'Comunidad de Madrid', 'Este', 'Sur', 'Canarias', 'Extranjero'],
    'Francia': ['Île-de-France', 'Nord-Ouest', 'Nord-Est', 'Sud-Ouest', 'Sud-Est', 'Outre-mer', 'Étranger'],
    'Germania': ['Nord', 'West', 'Süd', 'Ost', 'Ausland'],
    'Altro': ['Northern region', 'Central region', 'Southern region', 'Abroad'],
};
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
    paese: string;
    eta: string;
    sesso: string;
    istruzione: string;
    tipo_istituto: string;
    provenienza: string;
    area_studio: string;
    strumenti_utilizzati: string[];
    counselor_utilizzato: string;
    feedback_aperto: string;
    [key: string]: FormValue;
};

export default function QuestionarioPage() {
    const { t, tf, lang } = useI18n();
    const [counselors, setCounselors] = useState<PublicCounselor[]>([]);
    const [formData, setFormData] = useState<FormData>({
        paese: '',
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
        counselor_utilizzato: '',
        feedback_aperto: '',
    });

    useEffect(() => {
        fetchCounselors(lang).then((list) => setCounselors(list.filter((c) => c.is_active !== false)));
    }, [lang]);

    const [consent, setConsent] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Wizard: il form lungo è spezzato in 4 passi (anagrafica / strumenti /
    // valutazioni / aperto+consenso). Meno scroll, più completamenti.
    const [wizardStep, setWizardStep] = useState(0);
    const TOTAL_STEPS = 4;

    const computeAreaStudio = (paese: string, istruzione: string, tipo_istituto: string) => {
        const doctorates: Record<string, string[]> = {
            'Italia': ['Dottorato'],
            'Svezia': ['Doktorsexamen'],
            'Regno Unito (Inghilterra)': ['PhD'],
            'Spagna': ['Doctorado'],
            'Francia': ['Doctorat'],
            'Germania': ['Promotion'],
            'Altro': ['PhD'],
        };
        if (doctorates[paese]?.includes(istruzione)) return 'Post-laurea';

        const universities: Record<string, string[]> = {
            'Italia': ['Università'],
            'Svezia': ['Universitet / högskola'],
            'Regno Unito (Inghilterra)': ['University'],
            'Spagna': ['Universidad'],
            'Francia': ['Université'],
            'Germania': ['Universität / Hochschule'],
            'Altro': ['Higher education institution'],
        };
        if (universities[paese]?.includes(tipo_istituto)) return 'Universitario';

        const academics: Record<string, string[]> = {
            'Italia': ['Liceo'],
            'Svezia': ['Högskoleförberedande (gymnasieprogram)'],
            'Regno Unito (Inghilterra)': ['Secondary school (comprehensive/grammar)', 'Sixth Form / FE college'],
            'Spagna': ['Instituto de secundaria (IES)'],
            'Francia': ['Lycée général/technologique', 'Collège'],
            'Germania': ['Gymnasium'],
            'Altro': ['General secondary'],
        };
        if (academics[paese]?.includes(tipo_istituto)) return 'Liceale';

        const technicals: Record<string, string[]> = {
            'Italia': ['Istituto tecnico'],
            'Svezia': ['Komvux / folkhögskola'],
            'Regno Unito (Inghilterra)': ['Apprenticeship'],
            'Spagna': [],
            'Francia': [],
            'Germania': ['Haupt-/Realschule'],
            'Altro': [],
        };
        if (technicals[paese]?.includes(tipo_istituto)) return 'Tecnico';

        const vocationals: Record<string, string[]> = {
            'Italia': ['Istituto professionale'],
            'Svezia': ['Yrkesförberedande (gymnasieprogram)'],
            'Regno Unito (Inghilterra)': [],
            'Spagna': ['Centro de FP'],
            'Francia': ['Lycée professionnel'],
            'Germania': ['Berufsschule / Fachschule'],
            'Altro': ['Vocational secondary'],
        };
        if (vocationals[paese]?.includes(tipo_istituto)) return 'Professionale';

        return 'Altro';
    };

    const handleDemographicChange = (field: string, value: string) => {
        const updated = { ...formData, [field]: value };
        if (field === 'paese') {
            updated.istruzione = '';
            updated.tipo_istituto = '';
            updated.provenienza = '';
            updated.area_studio = '';
        }
        if (field === 'istruzione' || field === 'tipo_istituto' || field === 'paese') {
            const istruzione = field === 'istruzione' ? value : updated.istruzione;
            const tipo_istituto = field === 'tipo_istituto' ? value : updated.tipo_istituto;
            const paese = field === 'paese' ? value : updated.paese;
            updated.area_studio = computeAreaStudio(paese, istruzione, tipo_istituto);
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
        // Domande di valutazione (passo 3) mancanti: porta lì e segnala.
        const hasUnansweredQuestions = QUESTIONS.some(q => formData[q.key] === null);
        if (hasUnansweredQuestions) {
            setError(t('survey.err.unanswered'));
            setWizardStep(2);
            return;
        }
        if (!consent) {
            setError(t('survey.err.consent'));
            setWizardStep(3);
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
                className="space-y-6"
            >
                <PageHeader title={t('survey.title')} subtitle={t('survey.subtitle')} backHref="/" />

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Progresso wizard */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                            <span>{t('survey.wizard.step', { current: wizardStep + 1, total: TOTAL_STEPS })} · {[t('survey.basic.title'), t('survey.tools.title'), t('survey.quant.title'), t('survey.open.title')][wizardStep]}</span>
                            <span>{Math.round(((wizardStep + 1) / TOTAL_STEPS) * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${((wizardStep + 1) / TOTAL_STEPS) * 100}%` }} />
                        </div>
                    </div>

                    {/* Passo 1 — Dati di base */}
                    {wizardStep === 0 && (
                    <div className="glass-panel p-6 space-y-6">
                        <h2 className="text-xl font-semibold text-slate-800">{t('survey.basic.title')}</h2>
                        <p className="text-sm text-slate-500">{t('survey.basic.sub')}</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <SelectField
                                label={t('survey.field.paese')}
                                placeholder={t('survey.select.placeholder')}
                                value={formData.paese}
                                options={PAESE_OPTIONS}
                                optionLabel={(v) => tf(`survey.paese.${v}`, v)}
                                onChange={(v) => handleDemographicChange('paese', v)}
                            />
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
                            {formData.paese && (
                                <>
                                <SelectField
                                    label={t('survey.field.istruzione')}
                                    placeholder={t('survey.select.placeholder')}
                                    value={formData.istruzione}
                                    options={ISTRUZIONE_MAP[formData.paese] || []}
                                    onChange={(v) => handleDemographicChange('istruzione', v)}
                                />
                                <SelectField
                                    label={t('survey.field.tipoIstituto')}
                                    placeholder={t('survey.select.placeholder')}
                                    value={formData.tipo_istituto}
                                    options={TIPO_ISTITUTO_MAP[formData.paese] || []}
                                    onChange={(v) => handleDemographicChange('tipo_istituto', v)}
                                />
                                <SelectField
                                    label={t('survey.field.provenienza')}
                                    placeholder={t('survey.select.placeholder')}
                                    value={formData.provenienza}
                                    options={PROVENIENZA_MAP[formData.paese] || []}
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
                                </>
                            )}
                        </div>
                    </div>
                    )}

                    {/* Passo 2 — Strumenti */}
                    {wizardStep === 1 && (
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

                        {counselors.length > 0 && (
                            <div className="pt-4 border-t border-slate-100">
                                <h3 className="text-base font-semibold text-slate-800">{t('survey.counselor.title')}</h3>
                                <p className="text-sm text-slate-500 mt-1 mb-3">{t('survey.counselor.sub')}</p>
                                <SelectField
                                    label={t('survey.counselor.label')}
                                    placeholder={t('survey.counselor.placeholder')}
                                    value={formData.counselor_utilizzato}
                                    options={counselors.map((c) => c.name)}
                                    onChange={(v) => setFormData({ ...formData, counselor_utilizzato: v })}
                                />
                            </div>
                        )}
                    </div>
                    )}

                    {/* Passo 3 — Valutazione quantitativa */}
                    {wizardStep === 2 && (
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
                    )}

                    {/* Passo 4 — Feedback aperto + consenso */}
                    {wizardStep === 3 && (
                    <>
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

                    </div>
                    </>
                    )}

                    {/* Navigazione wizard: Indietro / Avanti / Invia, ancorata in fondo */}
                    <StickyActions>
                        {error && <p className="text-red-600 text-sm mb-2 text-center">{error}</p>}
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => { setError(null); setWizardStep((s) => Math.max(0, s - 1)); }}
                                disabled={wizardStep === 0}
                                className="px-5 py-2.5 rounded-md border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                {t('survey.wizard.back')}
                            </button>
                            {wizardStep < TOTAL_STEPS - 1 ? (
                                <button
                                    type="button"
                                    onClick={() => { setError(null); setWizardStep((s) => Math.min(TOTAL_STEPS - 1, s + 1)); }}
                                    className="ml-auto inline-flex items-center px-6 py-2.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors shadow-md shadow-indigo-600/20"
                                >
                                    {t('survey.wizard.next')}
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !consent}
                                    className="ml-auto inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-md transition-colors shadow-md shadow-indigo-600/20"
                                >
                                    {isSubmitting ? t('survey.submitting') : (<><Send className="w-4 h-4" /> {t('survey.submit')}</>)}
                                </button>
                            )}
                        </div>
                    </StickyActions>
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
