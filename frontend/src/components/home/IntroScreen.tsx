'use client';

import Image from 'next/image';
import Link from 'next/link';
import { CompassEntry } from '@/components/home/CompassEntry';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

const activities = [
    { key: 'profiles', anchor: 'tools-assessment' },
    { key: 'paths', anchor: 'tools-guided' },
    { key: 'workspace', anchor: null },
] as const;
const sections = [
    { id: 'start', title: 'start.title', paragraphs: ['start.p1', 'start.p2'] },
    { id: 'personal', title: 'personal.title', paragraphs: ['personal.p1', 'personal.p2', 'personal.p3'] },
    { id: 'resources', title: 'resources.title', paragraphs: ['resources.p1', 'resources.p2', 'resources.p3'] },
    { id: 'questionnaires', title: 'questionnaires', paragraphs: ['questionnaires.p1', 'questionnaires.p2', 'questionnaires.p3'] },
] as const;

export function IntroScreen({
    onStart,
    onOpenTools,
}: {
    onStart: () => void;
    onOpenTools?: (anchor?: string) => void;
}) {
    const { t } = useI18n();

    return (
        <div className="mx-auto max-w-4xl space-y-7 py-4" data-testid="intro-screen">
            <header className="mx-auto max-w-2xl text-center">
                <h1 className="font-display text-4xl font-bold text-slate-900 sm:text-5xl">CounselorBot</h1>
                <p className="mx-auto mt-3 max-w-xl text-lg leading-relaxed text-slate-600">{t('app.intro.subtitle')}</p>
                <p className="mt-3 text-sm text-slate-500">{t('app.intro.compact.about')}</p>
            </header>

            <section aria-label={t('app.home.contains')} className="grid gap-3 sm:grid-cols-3 sm:gap-5">
                {activities.map((activity) => (
                    <article
                        key={activity.key}
                        className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-4 rounded-xl border border-slate-200 bg-white p-4 text-left sm:flex sm:flex-col sm:items-start sm:p-5"
                    >
                        <Image
                            src={activity.key === 'workspace' ? '/images/intro/tools.png' : `/images/intro/${activity.key}.png`}
                            alt=""
                            width={144}
                            height={144}
                            sizes="(min-width: 640px) 128px, 72px"
                            className="row-span-2 h-18 w-18 object-contain sm:mb-3 sm:h-32 sm:w-32 sm:self-center"
                        />
                        <h2 className="font-display w-full break-words text-lg font-semibold text-slate-900">{t(`app.intro.compact.${activity.key}.title`)}</h2>
                        <p className="mt-1 text-sm leading-relaxed text-slate-600 sm:grow">{t(`app.intro.compact.${activity.key}.body`)}</p>
                        {activity.key === 'workspace' ? (
                            <Link href="/profilo" className="col-start-2 mt-3 inline-flex min-h-11 items-center font-semibold text-indigo-700 hover:underline">{t('app.intro.compact.workspace.open')}</Link>
                        ) : (
                            <button type="button" onClick={() => onOpenTools?.(activity.anchor)} className="col-start-2 mt-3 inline-flex min-h-11 items-center text-left font-semibold text-indigo-700 hover:underline">{t('app.intro.compact.explore')}</button>
                        )}
                    </article>
                ))}
            </section>

            <section aria-label={t('app.intro.actions.label')} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                    <CompassEntry onOpen={onStart} />
                    <button
                        type="button"
                        onClick={() => onOpenTools?.()}
                        className="relative flex cursor-pointer flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 text-left transition-colors hover:border-indigo-300 sm:flex-row sm:items-center"
                    >
                        <Image src="/images/intro/tools.png" alt="" width={144} height={144} sizes="96px" className="h-18 w-18 shrink-0 self-center object-contain sm:h-24 sm:w-24" />
                        <div>
                            <h3 className="font-display text-lg font-bold text-slate-900">{t('app.intro.action.tools.label')}</h3>
                            <p className="mt-1 text-sm leading-relaxed text-slate-600">{t('app.intro.action.tools.desc')}</p>
                        </div>
                    </button>
                </div>

                <div className="space-y-1.5 text-center">
                    <p className="text-sm text-slate-600">{t('app.intro.compact.pace')}</p>
                    <p className="text-sm text-slate-500">{t('app.intro.compact.limits')}</p>
                </div>
            </section>

            <div className="divide-y divide-slate-200 border-y border-slate-200">
                {sections.map((section) => (
                    <details key={section.id} className="group" data-section={section.id}>
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md py-4 text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 [&::-webkit-details-marker]:hidden">
                            {t(`app.intro.compact.${section.title}`)}
                            <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 group-open:rotate-180" />
                        </summary>
                        <div className="max-w-3xl space-y-3 pb-5 text-sm leading-relaxed text-slate-600">
                            {section.paragraphs.map((key) => {
                                const [before, after] = t(`app.intro.compact.${key}`).split('competenzestrategiche.it');
                                return (
                                    <p key={key}>
                                        {before}
                                        {after !== undefined && <><a href="https://www.competenzestrategiche.it/" target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-700 underline underline-offset-2">competenzestrategiche.it</a>{after}</>}
                                    </p>
                                );
                            })}
                        </div>
                    </details>
                ))}
            </div>

            <div className="text-center">
                <Link href="/guide/dati-riservatezza" className="inline-flex min-h-[44px] items-center text-sm font-medium text-indigo-700 underline underline-offset-2">{t('app.intro.compact.privacy.title')}</Link>
            </div>

            <footer className="text-center text-sm text-slate-500">
                <p>{t('app.intro.compact.contact')}</p>
                <p className="mt-1">Daniele Dragoni <span aria-hidden="true">· </span><a href="mailto:daniele.dragoni@uniroma3.it" className="font-medium text-indigo-700 hover:underline">daniele.dragoni@uniroma3.it</a></p>
            </footer>
        </div>
    );
}
