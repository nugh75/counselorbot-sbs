'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Sparkles, BookOpen } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText, teacherAreaName, teacherAreaDescription } from '@/lib/i18n-teacher-area';
import { teacherAreaImages } from '@/lib/teacher-area';

export function TeacherResourcesSection() {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof teacherAreaText>[1]) => teacherAreaText(lang, key);

    return (
        <section aria-labelledby="teacher-resources-heading" data-testid="teacher-resources-library-section">
            <div className="border-b border-line pb-2">
                <h2 id="teacher-resources-heading" className="text-lg font-semibold text-ink">
                    {l('resources')}
                </h2>
                <p className="mt-1 text-xs text-ink-muted">
                    {l('resourcesSubtitle')}
                </p>
            </div>

            <div className="mt-4 rounded-card border border-line bg-surface p-4 sm:p-6 shadow-card" data-testid="teacher-resources-card">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <Link
                        href="/docente/risorse"
                        data-testid="teacher-resources-main-link"
                        className="group flex flex-1 items-center gap-4 sm:gap-4 rounded-card transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                        <Image
                            src={teacherAreaImages.risorse}
                            alt=""
                            width={72}
                            height={72}
                            sizes="(min-width: 768px) 72px, 64px"
                            className="h-16 w-16 shrink-0 rounded-card object-contain md:h-18 md:w-18"
                        />
                        <div className="min-w-0 flex-1 break-words">
                            <span className="block font-semibold text-ink group-hover:text-link">
                                {teacherAreaName(lang, 'risorse')}
                            </span>
                            <span className="mt-1 block text-sm leading-relaxed text-ink-muted">
                                {teacherAreaDescription(lang, 'risorse')}
                            </span>
                        </div>
                        <ArrowRight className="h-5 w-5 shrink-0 text-ink-muted group-hover:text-link" aria-hidden />
                    </Link>
                </div>

                {/* Sub-links congiunti diretti alle due collezioni */}
                <nav aria-label={l('resources')} className="mt-4 border-t border-line pt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Link
                        href="/docente/strategie"
                        data-testid="teacher-resources-strategies-link"
                        className="group flex min-h-[44px] items-center justify-between rounded-card border border-line/80 bg-surface-sunken/60 px-4 py-2 text-sm transition hover:border-brand-line hover:bg-brand-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                        <span className="flex items-center gap-2 font-semibold text-ink group-hover:text-ink">
                            <Sparkles className="h-4 w-4 text-link shrink-0" aria-hidden />
                            <span>{teacherAreaName(lang, 'strategie')}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 text-ink-muted group-hover:text-link shrink-0" aria-hidden />
                    </Link>

                    <Link
                        href="/docente/materiali"
                        data-testid="teacher-resources-materials-link"
                        className="group flex min-h-[44px] items-center justify-between rounded-card border border-line/80 bg-surface-sunken/60 px-4 py-2 text-sm transition hover:border-brand-line hover:bg-brand-soft/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    >
                        <span className="flex items-center gap-2 font-semibold text-ink group-hover:text-ink">
                            <BookOpen className="h-4 w-4 text-link shrink-0" aria-hidden />
                            <span>{teacherAreaName(lang, 'materiali')}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 text-ink-muted group-hover:text-link shrink-0" aria-hidden />
                    </Link>
                </nav>
            </div>
        </section>
    );
}
