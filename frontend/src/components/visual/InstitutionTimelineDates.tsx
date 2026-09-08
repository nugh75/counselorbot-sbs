'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { visualLabel } from '@/lib/i18n-visual-tools';
import type { OrientationDirectory } from '@/lib/referrals-api';
import type { VisualWorkspace } from '@/lib/visual-tools';
import { Button } from '@/components/ui/Button';

export function InstitutionTimelineDates({ locale, work, edit }: { locale: string; work: VisualWorkspace; edit: (work: VisualWorkspace) => void }) {
    const l = (key: string) => visualLabel(locale, key);
    const [data, setData] = useState<OrientationDirectory | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        void apiFetch(`/api/orientation-directory?lang=${locale}`, { signal: controller.signal }).then(async response => {
            if (!response.ok) throw new Error();
            const result = await response.json();
            if (!controller.signal.aborted) { setData(result); setFailed(false); }
        }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
        return () => controller.abort();
    }, [locale, attempt]);
    const timeline = work.timeline ?? { title: '', events: [] };
    return <details className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
        <summary className="min-h-11 cursor-pointer font-medium">{l('institutionDates')}{data?.institution ? ` · ${data.institution.name}` : ''}</summary>
        {failed ? <p role="alert">{l('loadError')} <Button type="button" variant="secondary" onClick={() => setAttempt(n => n + 1)}>{l('retry')}</Button></p> : !data ? <p role="status">{l('loading')}</p> : <div className="space-y-3">
            {!data.institution && <a href="/profilo/taccuino" className="block text-indigo-700 underline">{l('chooseInstitution')}</a>}
            {!data.events.length && <p>{l('noInstitutionDates')}</p>}
            {data.events.map(event => <article key={event.id} className="space-y-2 rounded-lg bg-white p-3">
                <h3 className="font-medium">{event.title}</h3>
                <p>{new Date(event.starts_at).toLocaleString(locale)}{event.location ? ` · ${event.location}` : ''}</p>
                {event.registration_deadline && <p>{l('registrationDeadline')}: {new Date(event.registration_deadline).toLocaleString(locale)}</p>}
                {event.page_url && <a href={event.page_url} target="_blank" rel="noopener noreferrer" className="block text-indigo-700 underline">{l('institutionDetails')}</a>}
                {(['start', ...(event.registration_deadline ? ['deadline'] : [])] as ('start' | 'deadline')[]).map(kind => <Button key={kind} type="button" variant="secondary" disabled={timeline.events.some(e => e.institution_event === event.id && (e.institution_date || 'start') === kind)} onClick={() => {
                    const period = kind === 'start' ? event.starts_at : event.registration_deadline;
                    edit({ ...work, timeline: { title: timeline.title || l('timeline'), events: [...timeline.events, {
                        id: crypto.randomUUID(), institution_event: event.id, institution_date: kind, institution_available: true,
                        title: event.title, period, tense: new Date(period) < new Date() ? 'past' : 'future', symbol: 'milestone',
                        reflection: '', source: '', action_ids: [], portfolio: [], personal_links: ['orientation'],
                    }] } });
                }}>{l(kind === 'start' ? 'addInstitutionDate' : 'addDeadline')}</Button>)}
            </article>)}
        </div>}
    </details>;
}
