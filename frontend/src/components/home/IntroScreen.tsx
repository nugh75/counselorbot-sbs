'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

const activities = [
    { key: 'compass', image: 'compass', title: 'app.intro.action.compass.label', action: 'app.intro.action.compass.open', anchor: null },
    { key: 'profiles', image: 'profiles', title: 'base.category.assessment', action: 'app.intro.entry.profiles.open', anchor: 'tools-assessment' },
    { key: 'paths', image: 'paths', title: 'app.intro.compact.paths.title', action: 'app.intro.entry.paths.open', anchor: 'tools-guided' },
    { key: 'workspace', image: 'tools', title: 'app.intro.compact.workspace.title', action: 'app.intro.compact.workspace.open', anchor: null },
] as const;
const sections = [
    { id: 'questionnaires', title: 'app.intro.compact.questionnaires', paragraphs: ['questionnaires.p1', 'questionnaires.p2', 'questionnaires.p3'] },
    { id: 'personal', title: 'app.intro.entry.personalDetails', paragraphs: ['personal.p1', 'personal.p2', 'personal.p3'] },
    { id: 'resources', title: 'app.intro.compact.resources.title', paragraphs: ['resources.p1', 'resources.p2', 'resources.p3'] },
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
                <h1 className="font-display text-3xl font-bold leading-tight text-slate-900 sm:text-4xl">{t('app.intro.entry.headline')}</h1>
                <p className="mt-3 text-sm text-slate-500">{t('app.intro.compact.about')}</p>
            </header>

            <section aria-labelledby="intro-start-title" className="space-y-4">
                <h2 id="intro-start-title" className="font-display text-xl font-semibold text-slate-900">{t('app.intro.entry.choose')}</h2>
                <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
                    {activities.map((activity) => (
                        <article key={activity.key} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5">
                            <div className="flex items-center gap-4 sm:flex-col sm:items-start sm:gap-3">
                                <Image
                                    src={`/images/intro/${activity.image}.png`}
                                    alt=""
                                    width={96}
                                    height={96}
                                    sizes="(min-width: 640px) 96px, 64px"
                                    className="h-16 w-16 shrink-0 object-contain sm:h-24 sm:w-24"
                                />
                                <h3 className="font-display min-w-0 break-words text-lg font-semibold text-slate-900">{t(activity.title)}</h3>
                            </div>
                            <p className="mt-3 grow text-sm leading-relaxed text-slate-600">{t(`app.intro.entry.${activity.key}.body`)}</p>
                            {activity.key === 'workspace' ? (
                                <Link href="/profilo" className="mt-3 inline-flex min-h-11 items-center self-start rounded-md font-semibold text-indigo-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">{t(activity.action)}</Link>
                            ) : (
                                <button type="button" onClick={() => activity.key === 'compass' ? onStart() : onOpenTools?.(activity.anchor)} className="mt-3 inline-flex min-h-11 items-center self-start rounded-md text-left font-semibold text-indigo-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">{t(activity.action)}</button>
                            )}
                        </article>
                    ))}
                </div>
                <div className="text-center">
                    <button type="button" onClick={() => onOpenTools?.()} className="inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-indigo-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">{t('app.intro.entry.all')}</button>
                </div>
            </section>

            <div className="space-y-2 text-center text-sm">
                <p className="text-slate-600">{t('app.intro.entry.pace')}</p>
                <p className="text-slate-500">{t('app.intro.compact.limits')}</p>
            </div>

            <section aria-labelledby="intro-more-title" className="space-y-3">
                <h2 id="intro-more-title" className="font-display text-xl font-semibold text-slate-900">{t('app.intro.entry.more')}</h2>
                <div className="divide-y divide-slate-200 border-y border-slate-200">
                    {sections.map((section) => (
                        <details key={section.id} className="group" data-section={section.id}>
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md py-4 text-sm font-semibold text-slate-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 [&::-webkit-details-marker]:hidden">
                                {t(section.title)}
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

                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link href="/guide" className="inline-flex min-h-11 items-center text-sm font-medium text-indigo-700 underline underline-offset-2">{t('app.intro.entry.guide')}</Link>
                    <Link href="/guide/dati-riservatezza" className="inline-flex min-h-[44px] items-center text-sm font-medium text-indigo-700 underline underline-offset-2">{t('app.intro.compact.privacy.title')}</Link>
                </div>

            </section>

            <footer className="text-center text-sm text-slate-500">
                <p>{t('app.intro.compact.contact')}</p>
                <p className="mt-1">Daniele Dragoni <span aria-hidden="true">· </span><a href="mailto:daniele.dragoni@uniroma3.it" className="font-medium text-indigo-700 hover:underline">daniele.dragoni@uniroma3.it</a></p>
            </footer>
        </div>
    );
}
