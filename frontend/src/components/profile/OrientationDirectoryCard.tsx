'use client';

// Directory dell'orientamento: le figure a cui lo studente può rivolgersi e gli
// appuntamenti del suo istituto. A differenza della chat, qui non c'è filtro sui
// bisogni: è un elenco, e deve mostrare tutto ciò che riguarda il proprio istituto.

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, ExternalLink, MapPin, Users } from 'lucide-react';

import { useI18n } from '@/lib/i18n-context';
import {
    fetchOrientationDirectory,
    type DirectoryEvent,
    type DirectoryReferral,
    type Institution,
} from '@/lib/referrals-api';

function formatDate(value: string, lang: string): string {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function OrientationDirectoryCard() {
    const { t, lang } = useI18n();
    const [institution, setInstitution] = useState<Institution | null>(null);
    const [referrals, setReferrals] = useState<DirectoryReferral[]>([]);
    const [events, setEvents] = useState<DirectoryEvent[]>([]);
    const [need, setNeed] = useState<string>('');
    const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

    useEffect(() => {
        let alive = true;
        // Falso positivo della regola: al cambio di lingua la directory si
        // ricarica, e tornare a `loading` e' lo stato voluto, non una cascata.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState('loading');
        fetchOrientationDirectory(lang)
            .then((data) => {
                if (!alive) return;
                setInstitution(data.institution);
                setReferrals(data.referrals);
                setEvents(data.events);
                setState('ready');
            })
            .catch(() => { if (alive) setState('error'); });
        return () => { alive = false; };
    }, [lang]);

    // I filtri offerti sono solo i bisogni realmente presenti: una chip che non
    // filtra niente è una promessa vuota.
    const needs = useMemo(() => {
        const found = new Set<string>();
        [...referrals, ...events].forEach((row) => row.needs.forEach((n) => found.add(n)));
        return Array.from(found).sort();
    }, [referrals, events]);

    const shownReferrals = need ? referrals.filter((r) => r.needs.includes(need)) : referrals;
    const shownEvents = need ? events.filter((e) => e.needs.includes(need)) : events;

    if (state === 'loading') return <p className="text-sm text-slate-500">{t('referrals.loading')}</p>;
    if (state === 'error') return <p className="text-sm text-rose-600">{t('referrals.error')}</p>;

    return (
        <div className="space-y-6">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-slate-500">
                    {t('referrals.institution.label')}
                </p>
                {institution ? (
                    <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-base font-semibold text-slate-800">{institution.name}</span>
                        {institution.orientation_page_url && (
                            <a
                                href={institution.orientation_page_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
                            >
                                {t('referrals.institution.page')} <ExternalLink className="h-3 w-3" />
                            </a>
                        )}
                        <a href="/profilo/taccuino" className="text-sm text-slate-500 hover:underline">
                            {t('referrals.institution.change')}
                        </a>
                    </div>
                ) : (
                    // Vuoto parlante: senza istituto la pagina dice cosa fare,
                    // invece di restare muta.
                    <p className="mt-1 text-sm text-slate-600">
                        {t('referrals.institution.missing')}{' '}
                        <a href="/profilo/taccuino" className="text-indigo-600 hover:underline">
                            {t('referrals.institution.change')}
                        </a>
                    </p>
                )}
            </div>

            {needs.length > 1 && (
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => setNeed('')}
                        className={`rounded-full px-3 py-1 text-xs ${need === '' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                    >
                        {t('referrals.filter.all')}
                    </button>
                    {needs.map((code) => (
                        <button
                            key={code}
                            type="button"
                            onClick={() => setNeed(code)}
                            className={`rounded-full px-3 py-1 text-xs ${need === code ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                        >
                            {t(`referrals.need.${code}`)}
                        </button>
                    ))}
                </div>
            )}

            <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <CalendarDays className="h-4 w-4" /> {t('referrals.events.title')}
                </h3>
                {shownEvents.length === 0 ? (
                    <p className="text-sm text-slate-500">{t('referrals.events.empty')}</p>
                ) : shownEvents.map((event) => (
                    <article key={event.id} className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-sm font-semibold text-slate-800">{event.title}</p>
                        <p className="text-xs text-slate-500">{formatDate(event.starts_at, lang)}</p>
                        {event.summary && <p className="mt-1 text-sm text-slate-600">{event.summary}</p>}
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
                                className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
                            >
                                {t('referrals.events.page')} <ExternalLink className="h-3 w-3" />
                            </a>
                        )}
                    </article>
                ))}
            </section>

            <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Users className="h-4 w-4" /> {t('referrals.people.title')}
                </h3>
                {shownReferrals.length === 0 ? (
                    <p className="text-sm text-slate-500">{t('referrals.people.empty')}</p>
                ) : shownReferrals.map((referral) => (
                    <article key={referral.id} className="rounded-lg border border-slate-200 bg-white p-4">
                        <p className="text-sm font-semibold text-slate-800">
                            {referral.role}{referral.person ? ` — ${referral.person}` : ''}
                        </p>
                        {referral.what_for && (
                            <p className="mt-1 text-sm text-slate-600">
                                <span className="text-slate-500">{t('referrals.people.whatFor')}: </span>
                                {referral.what_for}
                            </p>
                        )}
                        {referral.how_to_reach && (
                            <p className="mt-1 text-sm text-slate-600">
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
                                className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
                            >
                                {t('referrals.institution.page')} <ExternalLink className="h-3 w-3" />
                            </a>
                        )}
                    </article>
                ))}
            </section>
        </div>
    );
}
