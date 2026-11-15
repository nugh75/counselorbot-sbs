'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { useUserAccess } from '@/lib/use-user-access';
import { isToolAllowed } from '@/lib/user-access';
import { EntryLink, EntrySection } from '@/components/ui/EntryList';
import { FeedbackEntry } from './FeedbackEntry';

const activities = [
    { key: 'compass', image: 'compass', title: 'app.intro.action.compass.label', anchor: null },
    { key: 'profiles', image: 'profiles', title: 'base.category.assessment', anchor: 'tools-assessment' },
    { key: 'paths', image: 'paths', title: 'app.intro.compact.paths.title', anchor: 'tools-guided' },
    { key: 'workspace', image: 'tools', title: 'app.intro.compact.workspace.title', anchor: null },
] as const;
const sections = [
    { id: 'questionnaires', title: 'app.intro.compact.questionnaires', paragraphs: ['questionnaires.p1', 'questionnaires.p2', 'questionnaires.p3'] },
    { id: 'personal', title: 'app.intro.entry.personalDetails', paragraphs: ['personal.p1', 'personal.p2', 'personal.p3'] },
    { id: 'resources', title: 'app.intro.compact.resources.title', paragraphs: ['resources.p1', 'resources.p2', 'resources.p3'] },
] as const;

export function IntroScreen({ onStart }: { onStart: () => void }) {
    const { t } = useI18n();
    const { access, loading } = useUserAccess();

    return (
        <div className="mx-auto max-w-4xl space-y-8 py-4" data-testid="intro-screen">
            <header className="mx-auto max-w-2xl text-center">
                <h1 className="font-display text-3xl font-semibold leading-tight text-ink sm:text-4xl">{t('app.intro.entry.headline')}</h1>
                <p className="mt-4 text-sm text-ink-muted">{t('app.intro.compact.about')}</p>
            </header>

            <div className="space-y-4">
                {/* Flat entries like the area homes (#962): no boxed cards. */}
                <EntrySection id="intro-start-title" title={t('app.intro.entry.choose')} testId="intro-activities">
                    {activities.filter(activity => activity.key !== 'compass' || (!loading && isToolAllowed(access, 'bussola'))).map((activity) => (
                        <EntryLink
                            key={activity.key}
                            idPrefix="intro"
                            id={activity.key}
                            href={activity.anchor ? `/profilo#${activity.anchor}` : '/profilo'}
                            onOpen={activity.key === 'compass' ? onStart : undefined}
                            illustration={<Image src={`/images/intro/${activity.image}.png`} alt="" width={72} height={72} sizes="(min-width: 768px) 72px, 64px" className="h-16 w-16 shrink-0 object-contain md:h-18 md:w-18" />}
                            name={t(activity.title)}
                            description={t(`app.intro.entry.${activity.key}.body`)}
                        />
                    ))}
                </EntrySection>
                <div className="text-center">
                    <Link href="/profilo" className="inline-flex min-h-control items-center rounded-control text-sm font-semibold text-link underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">{t('app.intro.entry.all')}</Link>
                </div>
                <FeedbackEntry />
            </div>

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
                                            {after !== undefined && <><a href="https://www.competenzestrategiche.it/" target="_blank" rel="noopener noreferrer" className="text-link underline underline-offset-2">competenzestrategiche.it</a>{after}</>}
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
                <p className="mt-1">Daniele Dragoni <span aria-hidden="true">· </span><a href="mailto:daniele.dragoni@uniroma3.it" className="text-link hover:underline">daniele.dragoni@uniroma3.it</a></p>
            </footer>
        </div>
    );
}
