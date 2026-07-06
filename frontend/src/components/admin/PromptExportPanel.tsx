'use client';

// Esporta in Markdown i prompt degli strumenti guidati: un file per singolo
// strumento (nome + meta + prompt + domande suggerite) oppure tutti insieme.

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { Download, FileText } from 'lucide-react';
import { toast } from '@/components/ui/Toast';

// Ordine di presentazione degli strumenti (gli altri seguono in coda).
const INSTRUMENT_ORDER = ['QSA', 'QSAr', 'ZTPI', 'SAVICKAS', 'QPCS', 'QPCC', 'QAP'];

interface GuidedStep {
    questionnaire_type: string;
}

export function PromptExportPanel() {
    const [instruments, setInstruments] = useState<string[]>([]);
    const [loading, setLoading] = useState<string | null>(null);

    useEffect(() => {
        void (async () => {
            try {
                const res = await apiFetch('/api/admin/guided-steps');
                if (!res.ok) return;
                const steps: GuidedStep[] = await res.json();
                const distinct = Array.from(new Set(steps.map((s) => s.questionnaire_type)));
                distinct.sort((a, b) => {
                    const ia = INSTRUMENT_ORDER.indexOf(a);
                    const ib = INSTRUMENT_ORDER.indexOf(b);
                    if (ia !== -1 && ib !== -1) return ia - ib;
                    if (ia !== -1) return -1;
                    if (ib !== -1) return 1;
                    return a.localeCompare(b);
                });
                setInstruments(distinct);
            } catch (e) {
                console.error('Failed to load instruments', e);
            }
        })();
    }, []);

    const download = useCallback(async (instrument?: string) => {
        const key = instrument ?? '__all__';
        setLoading(key);
        try {
            const url = instrument
                ? `/api/admin/guided-steps/export?instrument=${encodeURIComponent(instrument)}`
                : '/api/admin/guided-steps/export';
            const res = await apiFetch(url);
            if (!res.ok) throw new Error('export failed');
            const blob = await res.blob();
            const date = new Date().toISOString().slice(0, 10);
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = `counselorbot_prompts${instrument ? `_${instrument}` : ''}_${date}.md`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(objectUrl);
        } catch (e) {
            console.error('Failed to export prompts', e);
            toast.error('Export non riuscito');
        } finally {
            setLoading(null);
        }
    }, []);

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-bold text-slate-800">Esporta prompt</h2>
                <p className="mt-1 text-sm text-slate-500">
                    Scarica i prompt degli strumenti in Markdown, un file per strumento. Per ogni
                    step: nome, metadati (id, tipo di system prompt, tema), prompt e domande suggerite.
                </p>
            </div>

            <div className="glass-panel p-6 space-y-5">
                <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Per strumento</h3>
                    {instruments.length === 0 ? (
                        <p className="mt-2 text-sm text-slate-400">Nessuno strumento disponibile.</p>
                    ) : (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {instruments.map((instrument) => (
                                <button
                                    key={instrument}
                                    type="button"
                                    onClick={() => void download(instrument)}
                                    disabled={loading !== null}
                                    className="inline-flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
                                >
                                    <span className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-indigo-600" />
                                        {instrument}
                                    </span>
                                    <Download className="h-4 w-4 text-slate-400" />
                                    {loading === instrument && <span className="sr-only">…</span>}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="border-t border-slate-100 pt-4">
                    <button
                        type="button"
                        onClick={() => void download()}
                        disabled={loading !== null}
                        className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                    >
                        <Download className="h-4 w-4" />
                        {loading === '__all__' ? 'Preparazione…' : 'Scarica tutti (un unico .md)'}
                    </button>
                </div>
            </div>
        </div>
    );
}
