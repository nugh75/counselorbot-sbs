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
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface AvailabilityInstrument {
    questionnaire_type: string;
    submitted_at: string;
}

interface Availability {
    available: boolean;
    min_instruments: number;
    instruments: AvailabilityInstrument[];
}

export function CrossSynthesisCard({ showHeading = true }: { showHeading?: boolean }) {
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
        <Card as="section" className="p-6 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
                {showHeading && <div>
                    <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-link" />
                        {t('combined.title')}
                    </h2>
                    <p className="mt-1 text-sm text-ink-muted">{t('combined.desc')}</p>
                </div>}
                <div className="flex flex-wrap gap-2">
                    {(availability.instruments ?? []).map((inst) => (
                        <span
                            key={inst.questionnaire_type}
                            className="px-2 py-1 border border-line bg-surface-sunken text-ink-muted text-xs font-semibold rounded-full"
                        >
                            {inst.questionnaire_type}
                        </span>
                    ))}
                </div>
            </div>

            {!availability.available ? (
                <p className="text-sm text-ink-muted border border-dashed border-line rounded-card bg-surface px-4 py-6 text-center">
                    {t('combined.needTwo')}
                </p>
            ) : (
                <>
                    {!content && (
                        <Button
                            onClick={() => void generate()}
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {t('combined.generating')}
                                </>
                            ) : (
                                t('combined.generate')
                            )}
                        </Button>
                    )}
                    {error && (
                        <p className="text-sm text-danger">{t('combined.error')}</p>
                    )}
                    {content && (
                        <div className="bg-surface p-4 border border-line rounded-card prose prose-sm max-w-none prose-p:my-2 prose-headings:my-2 prose-ul:my-1 prose-li:my-1 text-ink">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                        </div>
                    )}
                </>
            )}
        </Card>
    );
}
