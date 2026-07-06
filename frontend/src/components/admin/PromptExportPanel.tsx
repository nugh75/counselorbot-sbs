'use client';

// Esporta in un unico file Markdown tutti i prompt degli strumenti guidati:
// per ogni strumento, in ordine di step, nome + meta + prompt + domande suggerite.

import { useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { Download, FileText } from 'lucide-react';
import { toast } from '@/components/ui/Toast';

export function PromptExportPanel() {
    const [loading, setLoading] = useState(false);

    const download = async () => {
        setLoading(true);
        try {
            const res = await apiFetch('/api/admin/guided-steps/export');
            if (!res.ok) throw new Error('export failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `counselorbot_prompts_${new Date().toISOString().slice(0, 10)}.md`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Failed to export prompts', e);
            toast.error('Export non riuscito');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <h2 className="text-lg font-bold text-slate-800">Esporta prompt</h2>
                <p className="mt-1 text-sm text-slate-500">
                    Scarica un unico file Markdown con tutti i prompt degli strumenti. Per ogni
                    strumento, in ordine di step: nome, metadati (id, tipo di system prompt, tema),
                    prompt e domande suggerite.
                </p>
            </div>
            <div className="glass-panel p-6 space-y-4">
                <div className="flex items-center gap-3 text-slate-600">
                    <FileText className="h-5 w-5 text-indigo-600" />
                    <span className="text-sm">counselorbot_prompts_YYYYMMDD.md</span>
                </div>
                <button
                    type="button"
                    onClick={() => void download()}
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                >
                    <Download className="h-4 w-4" />
                    {loading ? 'Preparazione…' : 'Scarica tutti i prompt (.md)'}
                </button>
            </div>
        </div>
    );
}
