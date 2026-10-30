'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText } from '@/lib/i18n-teacher-area';

export function DidacticDesignSection() {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof teacherAreaText>[1]) => teacherAreaText(lang, key);

    return (
        <section aria-labelledby="teacher-didactic-design-heading" data-testid="teacher-didactic-design-section">
            <h2 id="teacher-didactic-design-heading" className="border-b border-line pb-2 text-lg font-semibold text-ink">
                {l('didacticDesign')}
            </h2>

            <div className="mt-4 rounded-card border border-brand-line bg-brand-soft p-4 sm:p-6 shadow-card" data-testid="didactic-design-hero">
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1 space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft px-4 py-1 text-xs font-semibold text-ink">
                                <Sparkles className="h-3.5 w-3.5 text-link" aria-hidden />
                                {l('didacticDesignBadge')}
                            </span>
                        </div>

                        <div>
                            <h3 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                                {l('didacticDesignPrimaryTitle')}
                            </h3>
                            <p className="mt-2 text-sm leading-relaxed text-ink-body sm:text-base">
                                {l('didacticDesignPrimaryDescription')}
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                            <span className="rounded-control border border-brand-line bg-surface/80 px-2 py-1 text-xs font-semibold text-ink">
                                {l('didacticDesignBloomTag')}
                            </span>
                            <span className="rounded-control border border-brand-line bg-surface/80 px-2 py-1 text-xs font-semibold text-ink">
                                {l('didacticDesignSmartTag')}
                            </span>
                            <span className="rounded-control border border-brand-line bg-surface/80 px-2 py-1 text-xs font-semibold text-ink">
                                {l('didacticDesignAlignmentTag')}
                            </span>
                        </div>

                        <div className="pt-2">
                            <Link
                                href="/?start=OBIETTIVO_DOCENZA"
                                data-testid="didactic-design-cta"
                                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-control bg-brand px-6 py-2 text-sm font-semibold text-ink-on-brand shadow-card transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.99]"
                            >
                                <Sparkles className="h-4 w-4 shrink-0 text-ink-on-brand" aria-hidden />
                                <span>{l('didacticDesignPrimaryCta')}</span>
                                <ArrowRight className="h-4 w-4 shrink-0 text-ink-on-brand" aria-hidden />
                            </Link>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-center self-center md:self-start">
                        <Image
                            src="/images/platform/obiettivi-classe.png"
                            alt=""
                            width={112}
                            height={112}
                            sizes="(min-width: 768px) 112px, 80px"
                            className="h-20 w-20 rounded-card object-contain sm:h-24 sm:w-24 md:h-28 md:w-28"
                        />
                    </div>
                </div>

                <div className="mt-6 border-t border-brand-line/90 pt-4">
                    <p className="text-xs font-semibold text-ink-muted">
                        {l('didacticDesignWorkflowNote')}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                        {l('didacticDesignWorkflowDescription')}
                    </p>

                    <nav aria-label={l('didacticDesignWorkflowNote')} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Link
                            href="/docente/catalogo-obiettivi"
                            data-testid="didactic-design-catalog-link"
                            className="group flex min-h-[44px] items-center gap-4 rounded-card border border-line/90 bg-surface/90 p-4 shadow-card transition hover:border-brand-line hover:bg-surface-sunken"
                        >
                            <Image
                                src="/images/cards/focus_goal.png"
                                alt=""
                                width={44}
                                height={44}
                                className="h-control w-control shrink-0 rounded-lg object-contain"
                            />
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-ink group-hover:text-link">
                                    {l('didacticDesignCatalogLink')}
                                </span>
                                <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                                    {l('didacticDesignCatalogDesc')}
                                </span>
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-ink-muted group-hover:text-link" aria-hidden />
                        </Link>

                        <Link
                            href="/docente/piani-operativi"
                            data-testid="didactic-design-paths-link"
                            className="group flex min-h-[44px] items-center gap-4 rounded-card border border-line/90 bg-surface/90 p-4 shadow-card transition hover:border-brand-line hover:bg-surface-sunken"
                        >
                            <Image
                                src="/images/platform/percorsi-classe.png"
                                alt=""
                                width={44}
                                height={44}
                                className="h-control w-control shrink-0 rounded-lg object-contain"
                            />
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold text-ink group-hover:text-link">
                                    {l('didacticDesignPathsLink')}
                                </span>
                                <span className="mt-1 block text-xs leading-relaxed text-ink-muted">
                                    {l('didacticDesignPathsDesc')}
                                </span>
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-ink-muted group-hover:text-link" aria-hidden />
                        </Link>
                    </nav>
                </div>
            </div>
        </section>
    );
}
