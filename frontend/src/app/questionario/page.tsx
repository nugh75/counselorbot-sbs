'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Send, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const API_BASE = '/api';

// Options for demographics
const ETA_OPTIONS = ['< 14', '14-16', '17-18', '19-24', '25-34', '35-44', '45-54', '55+'];
const SESSO_OPTIONS = ['Maschio', 'Femmina', 'Altro', 'Preferisco non rispondere'];
const ISTRUZIONE_OPTIONS = ['Scuola media', 'Diploma', 'Laurea triennale', 'Laurea magistrale', 'Dottorato', 'Altro'];
const TIPO_ISTITUTO_OPTIONS = ['Liceo', 'Istituto tecnico', 'Istituto professionale', 'Università', 'Altro'];
const PROVENIENZA_OPTIONS = ['Nord Italia', 'Centro Italia', 'Sud Italia', 'Isole', 'Estero'];

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

type FormData = {
    eta: string;
    sesso: string;
    istruzione: string;
    tipo_istituto: string;
    provenienza: string;
    area_studio: string;
    [key: string]: string | number | null;
};

export default function QuestionarioPage() {
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!consent) {
            setError('Devi accettare le condizioni per inviare il questionario.');
            return;
        }

        // Check if all quantitative questions are answered
        const hasUnansweredQuestions = QUESTIONS.some(q => formData[q.key] === null);
        if (hasUnansweredQuestions) {
            setError('Devi rispondere a tutte le domande quantitative.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            // Convert empty strings to null for backend
            const payload: Record<string, string | number | null> = {};
            for (const [key, value] of Object.entries(formData)) {
                payload[key] = value === '' ? null : value;
            }

            const response = await fetch(`${API_BASE}/survey`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                throw new Error('Errore durante l\'invio. Riprova più tardi.');
            }

            setIsSubmitted(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Errore sconosciuto');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSubmitted) {
        return (
            <div className="max-w-2xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="glass-panel p-8 rounded-2xl text-center space-y-6"
                >
                    <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                        <CheckCircle className="w-10 h-10 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800">Grazie!</h2>
                    <p className="text-slate-500">
                        Il tuo feedback è stato inviato con successo. Le tue risposte ci aiuteranno a migliorare il servizio.
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Torna alla Home
                    </Link>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto">
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-8"
            >
                {/* Header */}
                <div className="flex items-center gap-4">
                    <Link href="/" className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6 text-slate-600" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-slate-800">Questionario Esperienza</h1>
                        <p className="text-slate-500">Anonimo - Puoi rispondere solo alle domande che preferisci</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* Dati di base */}
                    <div className="glass-panel p-6 rounded-2xl space-y-6">
                        <h2 className="text-xl font-semibold text-slate-800">Dati di base</h2>
                        <p className="text-sm text-slate-500">Richiesti per la parte quantitativa</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <SelectField
                                label="Età"
                                value={formData.eta}
                                options={ETA_OPTIONS}
                                onChange={(v) => handleDemographicChange('eta', v)}
                            />
                            <SelectField
                                label="Sesso"
                                value={formData.sesso}
                                options={SESSO_OPTIONS}
                                onChange={(v) => handleDemographicChange('sesso', v)}
                            />
                            <SelectField
                                label="Istruzione"
                                value={formData.istruzione}
                                options={ISTRUZIONE_OPTIONS}
                                onChange={(v) => handleDemographicChange('istruzione', v)}
                            />
                            <SelectField
                                label="Tipo istituto"
                                value={formData.tipo_istituto}
                                options={TIPO_ISTITUTO_OPTIONS}
                                onChange={(v) => handleDemographicChange('tipo_istituto', v)}
                            />
                            <SelectField
                                label="Provenienza"
                                value={formData.provenienza}
                                options={PROVENIENZA_OPTIONS}
                                onChange={(v) => handleDemographicChange('provenienza', v)}
                            />
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Area di studio (automatica)
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

                    {/* Valutazione quantitativa */}
                    <div className="glass-panel p-6 rounded-2xl space-y-6">
                        <h2 className="text-xl font-semibold text-slate-800">Valutazione quantitativa</h2>
                        <p className="text-sm text-slate-500">
                            Scala 1 = Per niente, 5 = Molto.
                        </p>

                        <div className="space-y-4">
                            {QUESTIONS.map((q) => (
                                <RatingField
                                    key={q.key}
                                    label={q.label}
                                    value={formData[q.key] as number | null}
                                    onChange={(v) => handleRatingChange(q.key, v)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Consenso */}
                    <div className="glass-panel p-6 rounded-2xl space-y-4">
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={consent}
                                onChange={(e) => setConsent(e.target.checked)}
                                className="mt-1 w-5 h-5 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-600">
                                Dichiaro di aver letto e compreso che le risposte sono raccolte in forma anonima senza alcun tracciamento.
                                Acconsento all'uso dei dati aggregati esclusivamente per scopi di ricerca e miglioramento del servizio.
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
                        className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2"
                    >
                        {isSubmitting ? (
                            <>Invio in corso...</>
                        ) : (
                            <>
                                <Send className="w-5 h-5" />
                                Invia Questionario
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
}: {
    label: string;
    value: string;
    options: string[];
    onChange: (value: string) => void;
}) {
    return (
        <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-slate-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
                <option value="">-- Seleziona --</option>
                {options.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
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
                        className={`w-10 h-10 text-sm font-medium rounded-lg transition-colors ${value === n
                            ? 'bg-blue-600 text-white'
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
