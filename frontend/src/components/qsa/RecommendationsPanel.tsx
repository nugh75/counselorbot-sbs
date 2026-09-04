'use client';

import { BookOpen, ChevronRight, Target } from 'lucide-react';
import { useState } from 'react';

import { useI18n } from '@/lib/i18n-context';
import type { RecommendationCatalog } from '@/lib/recommendations';
import { cn } from '@/lib/utils';

type Tab = 'reading' | 'strategy';

export function RecommendationsPanel({ catalog }: { catalog: RecommendationCatalog }) {
    const { t } = useI18n();
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>(catalog.reading.length ? 'reading' : 'strategy');
    const total = catalog.reading.length + catalog.strategy.length;
    const visibleTab: Tab = activeTab === 'reading' && !catalog.reading.length && catalog.strategy.length
        ? 'strategy'
        : activeTab === 'strategy' && !catalog.strategy.length && catalog.reading.length
            ? 'reading'
            : activeTab;

    if (!total) return null;

    return (
        <section className="glass-panel overflow-hidden border-l-4 border-l-indigo-400" aria-label={t('recommendations.title')}>
            <button
                type="button"
                onClick={() => setIsOpen((open) => !open)}
                aria-expanded={isOpen}
                aria-controls="guided-recommendations-panel"
                className="flex w-full items-center gap-2 p-4 text-left lg:hidden"
            >
                <BookOpen className="h-4 w-4 text-indigo-600" />
                <span id="recommendations-title" className="min-w-0 flex-1 text-sm font-semibold text-slate-700">
                    {t('recommendations.title')}
                </span>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{total}</span>
                <ChevronRight className={cn('h-4 w-4 text-slate-500 transition-transform', isOpen && 'rotate-90')} />
            </button>

            <div
                id="guided-recommendations-panel"
                className={cn('space-y-3 px-4 pb-4 lg:block lg:p-4', !isOpen && 'hidden lg:block')}
            >
                <div className="hidden items-center gap-2 lg:flex">
                    <BookOpen className="h-4 w-4 text-indigo-600" />
                    <h3 id="recommendations-title-desktop" className="text-sm font-semibold text-slate-700">
                        {t('recommendations.title')}
                    </h3>
                    <span className="ml-auto rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{total}</span>
                </div>

                <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
                    <TabButton
                        active={visibleTab === 'reading'}
                        count={catalog.reading.length}
                        label={t('recommendations.reading')}
                        onClick={() => setActiveTab('reading')}
                    />
                    <TabButton
                        active={visibleTab === 'strategy'}
                        count={catalog.strategy.length}
                        label={t('recommendations.strategy')}
                        onClick={() => setActiveTab('strategy')}
                    />
                </div>

                {visibleTab === 'reading' ? (
                    <div className="space-y-2" role="tabpanel">
                        {catalog.reading.length ? catalog.reading.map((item) => (
                            <article key={item.slug} className="rounded-lg border border-cyan-100 bg-cyan-50/50 p-3">
                                <div className="text-2xs font-semibold uppercase tracking-wide text-cyan-700">
                                    {item.kind_label || item.kind}
                                </div>
                                <h4 className="mt-0.5 text-sm font-semibold leading-snug text-slate-800">{item.title || item.slug}</h4>
                                {(item.creators || item.year) && (
                                    <p className="mt-0.5 text-xs text-slate-500">
                                        {[item.creators, item.year].filter(Boolean).join(' · ')}
                                    </p>
                                )}
                                {(item.why || item.summary || item.synopsis) && (
                                    <LabeledText label={t('recommendations.why')} text={item.why || item.summary || item.synopsis || ''} />
                                )}
                                {item.languages?.length ? (
                                    <LabeledText label={t('recommendations.availableIn')} text={item.languages.join(', ')} />
                                ) : null}
                                {item.where ? <LabeledText label={t('recommendations.where')} text={item.where} /> : null}
                                {item.warning ? <LabeledText label={t('recommendations.warning')} text={item.warning} warning /> : null}
                            </article>
                        )) : <EmptyState text={t('recommendations.noneReading')} />}
                    </div>
                ) : (
                    <div className="space-y-2" role="tabpanel">
                        {catalog.strategy.length ? catalog.strategy.map((item) => (
                            <article key={item.slug} className="rounded-lg border border-violet-100 bg-violet-50/50 p-3">
                                <div className="flex items-start gap-2">
                                    <Target className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                                    <h4 className="text-sm font-semibold leading-snug text-slate-800">{item.name || item.slug}</h4>
                                </div>
                                {item.recommended_when ? (
                                    <LabeledText label={t('recommendations.recommendedWhen')} text={item.recommended_when} />
                                ) : null}
                                {item.description ? <p className="mt-2 text-xs leading-relaxed text-slate-600">{item.description}</p> : null}
                            </article>
                        )) : <EmptyState text={t('recommendations.noneStrategy')} />}
                    </div>
                )}
            </div>
        </section>
    );
}

function TabButton({ active, count, label, onClick }: { active: boolean; count: number; label: string; onClick: () => void }) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onClick}
            className={cn(
                'min-w-0 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                active ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
        >
            <span className="block truncate">{label}</span>
            <span className="text-2xs tabular-nums">{count}</span>
        </button>
    );
}

function LabeledText({ label, text, warning = false }: { label: string; text: string; warning?: boolean }) {
    return (
        <p className={cn('mt-2 text-xs leading-relaxed text-slate-600', warning && 'text-amber-800')}>
            <span className="font-semibold">{label}:</span> {text}
        </p>
    );
}

function EmptyState({ text }: { text: string }) {
    return <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">{text}</p>;
}
