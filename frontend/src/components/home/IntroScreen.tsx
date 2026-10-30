'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { useUserAccess } from '@/lib/use-user-access';
import { isToolAllowed } from '@/lib/user-access';
import { FeedbackEntry } from './FeedbackEntry';

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
    const { access, loading } = useUserAccess();

    return (
        <div className="mx-auto max-w-4xl space-y-8 py-4" data-testid="intro-screen">
            <header className="mx-auto max-w-2xl text-center">
                <h1 className="font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl">{t('app.intro.entry.headline')}</h1>
                <p className="mt-4 text-sm text-ink-muted">{t('app.intro.compact.about')}</p>
            </header>

            <section aria-labelledby="intro-start-title" className="space-y-4">
                <h2 id="intro-start-title" className="font-display text-xl font-semibold text-ink">{t('app.intro.entry.choose')}</h2>
                <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
                    {activities.filter(activity => activity.key !== 'compass' || (!loading && isToolAllowed(access, 'bussola'))).map((activity) => (
                        <article key={activity.key} className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-6">
                            <div className="flex items-center gap-4 sm:flex-col sm:items-start sm:gap-4">
                                <Image
                                    src={`/images/intro/${activity.image}.png`}
                                    alt=""
                                    width={96}
                                    height={96}
                                    sizes="(min-width: 640px) 96px, 64px"
                                    className="h-16 w-16 shrink-0 object-contain sm:h-24 sm:w-24"
                                />
                                <h3 className="font-display min-w-0 break-words text-lg font-semibold text-ink">{t(activity.title)}</h3>
                            </div>
                            <p className="mt-4 grow text-sm leading-relaxed text-ink-muted">{t(`app.intro.entry.${activity.key}.body`)}</p>
                            {activity.key === 'workspace' ? (
                                <Link href="/profilo" className="mt-4 inline-flex min-h-control items-center self-start rounded-control font-semibold text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">{t(activity.action)}</Link>
                            ) : (
                                <button type="button" onClick={() => activity.key === 'compass' ? onStart() : onOpenTools?.(activity.anchor)} className="mt-4 inline-flex min-h-control items-center self-start rounded-control text-left font-semibold text-link hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">{t(activity.action)}</button>
                            )}
                        </article>
                    ))}
                </div>
                <div className="text-center">
                    <button type="button" onClick={() => onOpenTools?.()} className="inline-flex min-h-control items-center rounded-control text-sm font-semibold text-link underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">{t('app.intro.entry.all')}</button>
                </div>
                <FeedbackEntry />
            </section>

            <div className="space-y-2 text-center text-sm">
                <p className="text-ink-muted">{t('app.intro.entry.pace')}</p>
                <p className="text-ink-muted">{t('app.intro.compact.limits')}</p>
            </div>

            <section aria-labelledby="intro-more-title" className="space-y-4">
                <h2 id="intro-more-title" className="font-display text-xl font-semibold text-ink">{t('app.intro.entry.more')}</h2>
                <div className="divide-y divide-line border-y border-line">
                    {sections.map((section) => (
                        <details key={section.id} className="group" data-section={section.id}>
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-control py-4 text-sm font-semibold text-ink-body focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
                                {t(section.title)}
                                <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 group-open:rotate-180" />
                            </summary>
                            <div className="max-w-3xl space-y-4 pb-6 text-sm leading-relaxed text-ink-muted">
                                {section.paragraphs.map((key) => {
                                    const [before, after] = t(`app.intro.compact.${key}`).split('competenzestrategiche.it');
                                    return (
                                        <p key={key}>
                                            {before}
                                            {after !== undefined && <><a href="https://www.competenzestrategiche.it/" target="_blank" rel="noopener noreferrer" className=" text-link underline underline-offset-2">competenzestrategiche.it</a>{after}</>}
                                        </p>
                                    );
                                })}
                            </div>
                        </details>
                    ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4">
                    <Link href="/guide" className="inline-flex min-h-control items-center text-sm text-link underline underline-offset-2">{t('app.intro.entry.guide')}</Link>
                    <Link href="/guide/dati-riservatezza" className="inline-flex min-h-control items-center text-sm text-link underline underline-offset-2">{t('app.intro.compact.privacy.title')}</Link>
                </div>

            </section>

            <footer className="text-center text-sm text-ink-muted">
                <p>{t('app.intro.compact.contact')}</p>
                <p className="mt-1">Daniele Dragoni <span aria-hidden="true">· </span><a href="mailto:daniele.dragoni@uniroma3.it" className=" text-link hover:underline">daniele.dragoni@uniroma3.it</a></p>
            </footer>
        </div>
    );
}
