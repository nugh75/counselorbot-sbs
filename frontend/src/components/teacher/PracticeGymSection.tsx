'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ShieldCheck, FlaskConical, ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText } from '@/lib/i18n-teacher-area';

export function PracticeGymSection() {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof teacherAreaText>[1]) => teacherAreaText(lang, key);

    return (
        <section aria-labelledby="teacher-practice-gym-heading" data-testid="teacher-practice-gym-section">
            <div className="border-b border-slate-200 pb-2">
                <h2 id="teacher-practice-gym-heading" className="text-lg font-bold text-slate-800">
                    {l('practiceGymTitle')}
                </h2>
            </div>

            <div
                className="mt-3 rounded-2xl border border-indigo-200/90 bg-gradient-to-br from-indigo-50/50 via-white to-white p-4 sm:p-6 shadow-xs"
                data-testid="practice-gym-card"
            >
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800">
                                <ShieldCheck className="h-3.5 w-3.5 text-indigo-700" aria-hidden />
                                {l('practiceGymBadge')}
                            </span>
                        </div>

                        <div>
                            <h3 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                                {l('practiceGymPrimaryTitle')}
                            </h3>
                            <p className="mt-2 text-sm leading-relaxed text-slate-700 sm:text-base">
                                {l('practiceGymPrimaryDescription')}
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                            <span className="rounded-md border border-slate-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                                {l('practiceGymTagSimulatedStudents')}
                            </span>
                            <span className="rounded-md border border-slate-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                                {l('practiceGymTagPromptTesting')}
                            </span>
                            <span className="rounded-md border border-slate-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700">
                                {l('practiceGymTagSafeEnvironment')}
                            </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 pt-2">
                            <Link
                                href="/docente/taccuini-prova"
                                data-testid="practice-gym-cta"
                                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-ochre-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-ochre-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre-600 active:scale-[0.99]"
                            >
                                <FlaskConical className="h-4 w-4 shrink-0 text-white" aria-hidden />
                                <span>{l('practiceGymCta')}</span>
                                <ArrowRight className="h-4 w-4 shrink-0 text-ochre-100" aria-hidden />
                            </Link>

                            <Link
                                href="/docente/taccuini-prova"
                                data-testid="practice-gym-notebooks-link"
                                className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-indigo-700 underline-offset-4 hover:underline"
                            >
                                <span>{l('practiceGymManageNotebooks')}</span>
                                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                            </Link>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-center self-center md:self-start">
                        <Image
                            src="/images/platform/chat-guidata.png"
                            alt=""
                            width={112}
                            height={112}
                            sizes="(min-width: 768px) 112px, 80px"
                            className="h-20 w-20 rounded-2xl object-contain sm:h-24 sm:w-24 md:h-28 md:w-28"
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}
