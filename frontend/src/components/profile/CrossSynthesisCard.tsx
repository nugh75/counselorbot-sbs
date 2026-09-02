'use client';

// Sintesi cross-strumento: lettura integrata di secondo livello TRA strumenti
// (QSA/QSAr/ZTPI). Il backend assembla il profilo multi-strumento dai risultati
// persistiti e genera la sintesi; qui solo trigger + rendering markdown.

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';
import { Sparkles, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AvailabilityInstrument {
    questionnaire_type: string;
    submitted_at: string;
}

interface Availability {
    available: boolean;
    min_instruments: number;
    instruments: AvailabilityInstrument[];
}

export function CrossSynthesisCard() {
    const { t, lang } = useI18n();
    const [availability, setAvailability] = useState<Availability | null>(null);
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        apiFetch('/api/user/cross-synthesis/availability')
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => setAvailability(data as Availability | null))
            .catch(() => setAvailability(null));
    }, []);

    if (!availability) return null;

    const generate = async () => {
        setLoading(true);
        setError(false);
        try {
            const res = await apiFetch('/api/user/cross-synthesis', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ language: lang }),
            });
            if (!res.ok) throw new Error('cross-synthesis failed');
            const data = (await res.json()) as { content: string };
            setContent(data.content);
        } catch (e) {
            console.error('Cross-synthesis generation failed', e);
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <section className="glass-panel p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-600" />
                        {t('combined.title')}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">{t('combined.desc')}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {availability.instruments.map((inst) => (
                        <span
                            key={inst.questionnaire_type}
                            className="px-2.5 py-0.5 border border-slate-200 bg-slate-50 text-slate-600 text-xs font-bold rounded-full uppercase"
                        >
                            {inst.questionnaire_type}
                        </span>
                    ))}
                </div>
            </div>

            {!availability.available ? (
                <p className="text-sm text-slate-500 border border-dashed border-slate-200 rounded-xl bg-white px-4 py-6 text-center">
                    {t('combined.needTwo')}
                </p>
            ) : (
                <>
                    {!content && (
                        <button
                            onClick={() => void generate()}
                            disabled={loading}
                            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {t('combined.generating')}
                                </>
                            ) : (
                                t('combined.generate')
                            )}
                        </button>
                    )}
                    {error && (
                        <p className="text-sm text-red-600">{t('combined.error')}</p>
                    )}
                    {content && (
                        <div className="bg-white p-4 border border-slate-100 rounded-xl prose prose-sm max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1 prose-li:my-0.5 text-slate-800">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
