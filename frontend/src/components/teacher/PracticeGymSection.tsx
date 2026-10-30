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
            <div className="border-b border-line pb-2">
                <h2 id="teacher-practice-gym-heading" className="text-lg font-semibold text-ink">
                    {l('practiceGymTitle')}
                </h2>
            </div>

            <div
                className="mt-4 rounded-card border border-brand-line bg-surface p-4 sm:p-6 shadow-card"
                data-testid="practice-gym-card"
            >
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1 space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-2 rounded-full bg-surface-raised px-4 py-1 text-xs font-semibold text-ink">
                                <ShieldCheck className="h-3.5 w-3.5 text-link" aria-hidden />
                                {l('practiceGymBadge')}
                            </span>
                        </div>

                        <div>
                            <h3 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                                {l('practiceGymPrimaryTitle')}
                            </h3>
                            <p className="mt-2 text-sm leading-relaxed text-ink-body sm:text-base">
                                {l('practiceGymPrimaryDescription')}
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                            <span className="rounded-control border border-line bg-surface/80 px-2 py-1 text-xs font-semibold text-ink-body">
                                {l('practiceGymTagSimulatedStudents')}
                            </span>
                            <span className="rounded-control border border-line bg-surface/80 px-2 py-1 text-xs font-semibold text-ink-body">
                                {l('practiceGymTagPromptTesting')}
                            </span>
                            <span className="rounded-control border border-line bg-surface/80 px-2 py-1 text-xs font-semibold text-ink-body">
                                {l('practiceGymTagSafeEnvironment')}
                            </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 pt-2">
                            <Link
                                href="/docente/taccuini-prova"
                                data-testid="practice-gym-cta"
                                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-control bg-move px-6 py-2 text-sm font-semibold text-ink-on-brand shadow-card transition hover:bg-move-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.99]"
                            >
                                <FlaskConical className="h-4 w-4 shrink-0 text-ink-on-brand" aria-hidden />
                                <span>{l('practiceGymCta')}</span>
                                <ArrowRight className="h-4 w-4 shrink-0 text-ink-on-brand" aria-hidden />
                            </Link>

                            <Link
                                href="/docente/taccuini-prova"
                                data-testid="practice-gym-notebooks-link"
                                className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-link underline-offset-4 hover:underline"
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
                            className="h-20 w-20 rounded-card object-contain sm:h-24 sm:w-24 md:h-28 md:w-28"
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}
