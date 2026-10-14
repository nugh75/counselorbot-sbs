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
            <div className="border-b border-slate-200 pb-2">
                <h2 id="teacher-resources-heading" className="text-lg font-bold text-slate-800">
                    {l('resources')}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                    {l('resourcesSubtitle')}
                </p>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs" data-testid="teacher-resources-card">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <Link
                        href="/docente/risorse"
                        data-testid="teacher-resources-main-link"
                        className="group flex flex-1 items-center gap-3 sm:gap-4 rounded-xl transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                        <Image
                            src={teacherAreaImages.risorse}
                            alt=""
                            width={72}
                            height={72}
                            sizes="(min-width: 768px) 72px, 64px"
                            className="h-16 w-16 shrink-0 rounded-xl object-contain md:h-18 md:w-18"
                        />
                        <div className="min-w-0 flex-1 break-words">
                            <span className="block font-bold text-slate-900 group-hover:text-indigo-700">
                                {teacherAreaName(lang, 'risorse')}
                            </span>
                            <span className="mt-1 block text-sm leading-relaxed text-slate-600">
                                {teacherAreaDescription(lang, 'risorse')}
                            </span>
                        </div>
                        <ArrowRight className="h-5 w-5 shrink-0 text-slate-400 group-hover:text-indigo-600" aria-hidden />
                    </Link>
                </div>

                {/* Sub-links congiunti diretti alle due collezioni */}
                <nav aria-label={l('resources')} className="mt-4 border-t border-slate-100 pt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <Link
                        href="/docente/strategie"
                        data-testid="teacher-resources-strategies-link"
                        className="group flex min-h-[44px] items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2.5 text-sm transition hover:border-indigo-300 hover:bg-indigo-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                        <span className="flex items-center gap-2 font-medium text-slate-800 group-hover:text-indigo-900">
                            <Sparkles className="h-4 w-4 text-indigo-600 shrink-0" aria-hidden />
                            <span>{teacherAreaName(lang, 'strategie')}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 shrink-0" aria-hidden />
                    </Link>

                    <Link
                        href="/docente/materiali"
                        data-testid="teacher-resources-materials-link"
                        className="group flex min-h-[44px] items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/60 px-3.5 py-2.5 text-sm transition hover:border-indigo-300 hover:bg-indigo-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                        <span className="flex items-center gap-2 font-medium text-slate-800 group-hover:text-indigo-900">
                            <BookOpen className="h-4 w-4 text-indigo-600 shrink-0" aria-hidden />
                            <span>{teacherAreaName(lang, 'materiali')}</span>
                        </span>
                        <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-indigo-600 shrink-0" aria-hidden />
                    </Link>
                </nav>
            </div>
        </section>
    );
}
