'use client';

import { useState } from 'react';
import { BookMarked, Check, FileText, FolderPlus, X } from 'lucide-react';
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
import { Button, buttonClasses } from '@/components/ui/Button';

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
                'flex min-h-control w-full items-start gap-3 rounded-control border px-3 py-2.5 text-left transition-colors',
                targets.includes(target)
                    ? 'border-brand bg-brand-soft'
                    : 'border-line bg-surface hover:border-line-strong',
            )}
        >
            <span className="mt-0.5 shrink-0 text-ink-muted">{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{label}</span>
                <span className="block text-xs text-ink-muted">{hint}</span>
            </span>
            {targets.includes(target) && <Check className="mt-0.5 h-4 w-4 shrink-0 text-link" />}
        </button>
    );

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-lg space-y-4 rounded-card bg-surface p-5 shadow-modal">
                <div className="flex items-start gap-3">
                    <h2 className="min-w-0 flex-1 text-lg font-semibold text-ink">
                        {done ? t('idea.conclude.doneTitle') : t('idea.conclude.title')}
                    </h2>
                    <button type="button" onClick={onClose} aria-label={t('idea.map.close')} className="inline-flex h-control w-control shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-raised">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {done ? (
                    <div className="space-y-3">
                        <p className="text-sm text-ink-muted">{done.description}</p>
                        <ul className="space-y-1 text-sm text-ink-body">
                            {Object.entries(done.kept).map(([target, outcome]) => (
                                <li key={target} className="flex items-center gap-2">
                                    {outcome.failed || outcome.skipped
                                        ? <X className="h-4 w-4 shrink-0 text-warning" />
                                        : <Check className="h-4 w-4 shrink-0 text-link" />}
                                    <span>
                                        {t(target === 'notebook' ? 'idea.keep.notebook' : 'idea.keep.portfolio')}
                                        {(outcome.failed || outcome.skipped) && ` — ${outcome.skipped ?? t('toast.error')}`}
                                    </span>
                                </li>
                            ))}
                            {Object.keys(done.kept).length === 0 && (
                                <li className="text-ink-muted">{t('idea.conclude.keptNothing')}</li>
                            )}
                        </ul>
                        <div className="flex flex-wrap gap-2 pt-1">
                            <a href={ideaMapPdfUrl(sessionId, locale)} className={buttonClasses('secondary')}>
                                <FileText className="h-4 w-4" />
                                {t('idea.keep.pdf')}
                            </a>
                            <Button type="button" onClick={onClose}>
                                {t('idea.conclude.close')}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm text-ink-muted">{t('idea.conclude.body')}</p>
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
                            <Button type="button" onClick={() => void save()} busy={saving}>
                                {targets.length > 0 ? t('idea.conclude.save') : t('idea.conclude.keepNothing')}
                            </Button>
                            <a href={ideaMapPdfUrl(sessionId, locale)} className={buttonClasses('secondary')}>
                                <FileText className="h-4 w-4" />
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
