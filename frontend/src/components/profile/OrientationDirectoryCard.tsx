'use client';

// Institution-defined filters are separate from the needs used in chat.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ExternalLink, MapPin, Users } from 'lucide-react';

import { categoryText } from '@/lib/i18n-institution-categories';
import { useI18n } from '@/lib/i18n-context';
import {
    fetchOrientationDirectory,
    type DirectoryEvent,
    type DirectoryReferral,
    type InstitutionDirectory,
    type OrientationDirectory,
} from '@/lib/referrals-api';

function formatDate(value: string, lang: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function OrientationDirectoryCard() {
    const { t, lang } = useI18n();
    const [data, setData] = useState<OrientationDirectory | null>(null);
    const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let alive = true;
        // Loading hides stale filters while language/context is reloaded.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState('loading');
        fetchOrientationDirectory(lang).then(result => {
            if (alive) { setData(result); setState('ready'); }
        }).catch(() => { if (alive) setState('error'); });
        return () => { alive = false; };
    }, [lang, attempt]);
    if (state === 'loading') return <p role="status" className="text-sm text-slate-500">{t('referrals.loading')}</p>;
    if (state === 'error' || !data) return <div role="alert"><p>{t('referrals.error')}</p><button type="button" className="min-h-[44px] underline" onClick={() => setAttempt(value => value + 1)}>{categoryText(lang, 'retry')}</button></div>;
    // Compatibility with an older backend during a staged frontend rollout.
    const groups = data.institution_groups ?? (data.institution ? [{ institution: data.institution, categories: [], referrals: data.referrals.filter(row => row.institution_id === data.institution!.id || row.institution_id === undefined), events: data.events.filter(row => row.institution_id === data.institution!.id || row.institution_id === undefined) }] : []);
    const nationalReferrals = data.referrals.filter(row => row.institution_id === null || (!data.institution && row.institution_id === undefined));
    const nationalEvents = data.events.filter(row => row.institution_id === null || (!data.institution && row.institution_id === undefined));
    return <div className="space-y-8" data-orientation-directory>
        {groups.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">{t('referrals.institution.missing')} <Link href="/profilo/taccuino" className="underline">{t('referrals.institution.change')}</Link></p>}
        {groups.map(group => <InstitutionContents key={group.institution.id} group={group} />)}
        {(nationalReferrals.length > 0 || nationalEvents.length > 0) && <section aria-label={categoryText(lang, 'national')} className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-700"><h2 className="text-lg font-semibold">{categoryText(lang, 'national')}</h2><DirectoryContents referrals={nationalReferrals} events={nationalEvents} /></section>}
    </div>;
}

function InstitutionContents({ group }: { group: InstitutionDirectory }) {
    const { t, lang } = useI18n();
    const [selected, setSelected] = useState('');
    const category = group.categories.some(item => item.id === selected) ? selected : '';
    const institution = group.institution;
    return <section aria-label={institution.name} className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-xs font-semibold text-slate-500">{t('referrals.institution.label')}</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-3"><h2 className="text-base font-semibold">{institution.name}</h2>
                {institution.orientation_page_url && <a href={institution.orientation_page_url} target="_blank" rel="noreferrer" className="text-sm text-indigo-600 underline dark:text-indigo-300">{t('referrals.institution.page')}</a>}
                <Link href="/profilo/taccuino" className="text-sm underline">{t('referrals.institution.change')}</Link>
            </div>
        </div>
        {group.categories.length > 0 && <div role="group" aria-label={categoryText(lang, 'categories')} className="flex flex-wrap gap-2">
            {[{ id: '', name: t('referrals.filter.all'), description: '' }, ...group.categories].map(item => <button key={item.id} type="button" aria-pressed={category === item.id} title={item.description || undefined} onClick={() => setSelected(item.id)} className={`min-h-[44px] max-w-full break-words rounded-full border px-3 py-2 text-sm ${category === item.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200'}`}>{item.name}</button>)}
        </div>}
        <DirectoryContents referrals={category ? group.referrals.filter(row => row.category_ids?.includes(category)) : group.referrals} events={category ? group.events.filter(row => row.category_ids?.includes(category)) : group.events} />
    </section>;
}

function DirectoryContents({ referrals, events }: { referrals: DirectoryReferral[]; events: DirectoryEvent[] }) {
    const { t, lang } = useI18n();
    return <div className="space-y-6">
            <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <CalendarDays className="h-4 w-4" /> {t('referrals.events.title')}
                </h3>
                {events.length === 0 ? (
                    <p className="text-sm text-slate-500">{t('referrals.events.empty')}</p>
                ) : events.map((event) => (
                    <article key={event.id} className="min-w-0 break-words rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{event.title}</p>
                        <p className="text-xs text-slate-500">{formatDate(event.starts_at, lang)}</p>
                        {event.summary && <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{event.summary}</p>}
                        {(event.is_online || event.location) && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                                <MapPin className="h-3 w-3" />
                                {event.is_online ? t('referrals.events.online') : event.location}
                            </p>
                        )}
                        {event.registration_deadline && (
                            <p className="mt-1 text-xs text-amber-700">
                                {t('referrals.events.deadline', { date: formatDate(event.registration_deadline, lang) })}
                            </p>
                        )}
                        {event.page_url && (
                            <a
                                href={event.page_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline dark:text-indigo-300"
                            >
                                {t('referrals.events.page')} <ExternalLink className="h-3 w-3" />
                            </a>
                        )}
                    </article>
                ))}
            </section>

            <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    <Users className="h-4 w-4" /> {t('referrals.people.title')}
                </h3>
                {referrals.length === 0 ? (
                    <p className="text-sm text-slate-500">{t('referrals.people.empty')}</p>
                ) : referrals.map((referral) => (
                    <article key={referral.id} className="min-w-0 break-words rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {referral.role}{referral.person ? ` — ${referral.person}` : ''}
                        </p>
                        {referral.what_for && (
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                <span className="text-slate-500">{t('referrals.people.whatFor')}: </span>
                                {referral.what_for}
                            </p>
                        )}
                        {referral.how_to_reach && (
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                <span className="text-slate-500">{t('referrals.people.howTo')}: </span>
                                {referral.how_to_reach}
                            </p>
                        )}
                        {(referral.hours || referral.location || referral.email) && (
                            <p className="mt-1 text-xs text-slate-500">
                                {[referral.hours, referral.location, referral.email].filter(Boolean).join(' · ')}
                            </p>
                        )}
                        {referral.page_url && (
                            <a
                                href={referral.page_url}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline dark:text-indigo-300"
                            >
                                {t('referrals.institution.page')} <ExternalLink className="h-3 w-3" />
                            </a>
                        )}
                    </article>
                ))}
            </section>
    </div>;
}
