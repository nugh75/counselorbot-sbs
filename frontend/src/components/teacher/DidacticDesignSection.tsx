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
            <h2 id="teacher-didactic-design-heading" className="border-b border-slate-200 pb-2 text-lg font-bold text-slate-800">
                {l('didacticDesign')}
            </h2>

            <div className="mt-3 rounded-2xl border border-indigo-200/90 bg-gradient-to-br from-indigo-50/70 via-white to-sky-50/40 p-4 sm:p-6 shadow-xs" data-testid="didactic-design-hero">
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-900">
                                <Sparkles className="h-3.5 w-3.5 text-indigo-700" aria-hidden />
                                {l('didacticDesignBadge')}
                            </span>
                        </div>

                        <div>
                            <h3 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                                {l('didacticDesignPrimaryTitle')}
                            </h3>
                            <p className="mt-2 text-sm leading-relaxed text-slate-700 sm:text-base">
                                {l('didacticDesignPrimaryDescription')}
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                            <span className="rounded-md border border-indigo-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-indigo-900">
                                {l('didacticDesignBloomTag')}
                            </span>
                            <span className="rounded-md border border-indigo-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-indigo-900">
                                {l('didacticDesignSmartTag')}
                            </span>
                            <span className="rounded-md border border-indigo-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-indigo-900">
                                {l('didacticDesignAlignmentTag')}
                            </span>
                        </div>

                        <div className="pt-2">
                            <Link
                                href="/?start=OBIETTIVO_DOCENZA"
                                data-testid="didactic-design-cta"
                                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 active:scale-[0.99]"
                            >
                                <Sparkles className="h-4 w-4 shrink-0 text-white" aria-hidden />
                                <span>{l('didacticDesignPrimaryCta')}</span>
                                <ArrowRight className="h-4 w-4 shrink-0 text-indigo-200" aria-hidden />
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
                            className="h-20 w-20 rounded-2xl object-contain sm:h-24 sm:w-24 md:h-28 md:w-28"
                        />
                    </div>
                </div>

                <div className="mt-6 border-t border-indigo-100/90 pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        {l('didacticDesignWorkflowNote')}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">
                        {l('didacticDesignWorkflowDescription')}
                    </p>

                    <nav aria-label={l('didacticDesignWorkflowNote')} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Link
                            href="/docente/catalogo-obiettivi"
                            data-testid="didactic-design-catalog-link"
                            className="group flex min-h-[44px] items-center gap-3 rounded-xl border border-slate-200/90 bg-white/90 p-3 shadow-xs transition hover:border-indigo-300 hover:bg-slate-50"
                        >
                            <Image
                                src="/images/cards/focus_goal.png"
                                alt=""
                                width={44}
                                height={44}
                                className="h-11 w-11 shrink-0 rounded-lg object-contain"
                            />
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-bold text-slate-900 group-hover:text-indigo-700">
                                    {l('didacticDesignCatalogLink')}
                                </span>
                                <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">
                                    {l('didacticDesignCatalogDesc')}
                                </span>
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-indigo-600" aria-hidden />
                        </Link>

                        <Link
                            href="/docente/percorsi"
                            data-testid="didactic-design-paths-link"
                            className="group flex min-h-[44px] items-center gap-3 rounded-xl border border-slate-200/90 bg-white/90 p-3 shadow-xs transition hover:border-indigo-300 hover:bg-slate-50"
                        >
                            <Image
                                src="/images/platform/percorsi-classe.png"
                                alt=""
                                width={44}
                                height={44}
                                className="h-11 w-11 shrink-0 rounded-lg object-contain"
                            />
                            <span className="min-w-0 flex-1">
                                <span className="block text-sm font-bold text-slate-900 group-hover:text-indigo-700">
                                    {l('didacticDesignPathsLink')}
                                </span>
                                <span className="mt-0.5 block text-xs leading-relaxed text-slate-600">
                                    {l('didacticDesignPathsDesc')}
                                </span>
                            </span>
                            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-indigo-600" aria-hidden />
                        </Link>
                    </nav>
                </div>
            </div>
        </section>
    );
}
