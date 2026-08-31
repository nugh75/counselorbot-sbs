'use client';

import { useState } from 'react';
import { BookMarked, Check, FileText, FolderPlus, Loader2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';
import { toast } from '@/components/ui/Toast';
import {
    concludeIdea,
    ideaMapPdfUrl,
    type IdeaConclusion as Conclusion,
    type IdeaKeepTarget,
    type IdeaVariant,
} from '@/lib/idea-map';

interface IdeaConclusionProps {
    sessionId: string;
    locale: string;
    variant: IdeaVariant;
    onClose: () => void;
}

// Chiudere una sessione senza chiedere dove va il risultato lo butterebbe via:
// la mappa resta nel database e nessuno la ritrova. Qui si sceglie, e "da
// nessuna parte" e' una scelta come le altre.
export function IdeaConclusion({ sessionId, locale, variant, onClose }: IdeaConclusionProps) {
    const { t } = useI18n();
    const [targets, setTargets] = useState<IdeaKeepTarget[]>([]);
    const [saving, setSaving] = useState(false);
    const [done, setDone] = useState<Conclusion | null>(null);

    const toggle = (target: IdeaKeepTarget) => {
        setTargets((current) => (
            current.includes(target) ? current.filter((item) => item !== target) : [...current, target]
        ));
    };

    const save = async () => {
        setSaving(true);
        try {
            const result = await concludeIdea(sessionId, targets, locale, variant);
            if (result) setDone(result);
            else toast.error(t('toast.error'));
        } finally {
            setSaving(false);
        }
    };

    const option = (target: IdeaKeepTarget, icon: React.ReactNode, label: string, hint: string) => (
        <button
            type="button"
            onClick={() => toggle(target)}
            aria-pressed={targets.includes(target)}
            className={cn(
                'flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
                targets.includes(target)
                    ? 'border-teal-400 bg-teal-50'
                    : 'border-slate-200 bg-white hover:border-slate-300',
            )}
        >
            <span className="mt-0.5 shrink-0 text-slate-500">{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-slate-800">{label}</span>
                <span className="block text-xs text-slate-500">{hint}</span>
            </span>
            {targets.includes(target) && <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />}
        </button>
    );

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-lg space-y-4 rounded-xl bg-white p-5 shadow-xl">
                <div className="flex items-start gap-3">
                    <h2 className="min-w-0 flex-1 text-lg font-bold text-slate-900">
                        {done ? t('idea.conclude.doneTitle') : t('idea.conclude.title')}
                    </h2>
                    <button type="button" onClick={onClose} aria-label={t('idea.map.close')} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {done ? (
                    <div className="space-y-3">
                        <p className="text-sm text-slate-600">{done.description}</p>
                        <ul className="space-y-1 text-sm text-slate-700">
                            {Object.entries(done.kept).map(([target, outcome]) => (
                                <li key={target} className="flex items-center gap-2">
                                    {outcome.failed || outcome.skipped
                                        ? <X className="h-4 w-4 shrink-0 text-amber-600" />
                                        : <Check className="h-4 w-4 shrink-0 text-teal-600" />}
                                    <span>
                                        {t(target === 'notebook' ? 'idea.keep.notebook' : 'idea.keep.portfolio')}
                                        {(outcome.failed || outcome.skipped) && ` — ${outcome.skipped ?? t('toast.error')}`}
                                    </span>
                                </li>
                            ))}
                            {Object.keys(done.kept).length === 0 && (
                                <li className="text-slate-500">{t('idea.conclude.keptNothing')}</li>
                            )}
                        </ul>
                        <div className="flex flex-wrap gap-2 pt-1">
                            <a
                                href={ideaMapPdfUrl(sessionId, locale)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300"
                            >
                                <FileText className="h-3.5 w-3.5" />
                                {t('idea.keep.pdf')}
                            </a>
                            <button type="button" onClick={onClose} className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-medium text-white">
                                {t('idea.conclude.close')}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm text-slate-600">{t('idea.conclude.body')}</p>
                        <div className="space-y-2">
                            {variant !== 'research' && option(
                                'notebook',
                                <BookMarked className="h-4 w-4" />,
                                t('idea.keep.notebook'),
                                t('idea.conclude.notebookHint'),
                            )}
                            {option(
                                'portfolio',
                                <FolderPlus className="h-4 w-4" />,
                                t('idea.keep.portfolio'),
                                t('idea.conclude.portfolioHint'),
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => void save()}
                                disabled={saving}
                                className="inline-flex items-center gap-2 rounded-full bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                            >
                                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                                {targets.length > 0 ? t('idea.conclude.save') : t('idea.conclude.keepNothing')}
                            </button>
                            <a
                                href={ideaMapPdfUrl(sessionId, locale)}
                                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:border-slate-300"
                            >
                                <FileText className="h-3.5 w-3.5" />
                                {t('idea.keep.pdf')}
                            </a>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}
