'use client';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import {
    EVENT_ROLES,
    formFromDraft,
    milestoneFromForm,
    type EventBookletDraft,
    type EventBookletForm,
} from '@/lib/event-booklet';

// A fine percorso la sintesi dell'Evento significativo diventa una tappa passata
// della linea del tempo: la bozza arriva gia' compilata, la persona la corregge e
// decide se salvarla. Lo stesso request_id rende innocuo un secondo invio.
export function EventMilestoneCard({ sessionId, draft }: { sessionId: string; draft: EventBookletDraft | null }) {
    const { t } = useI18n();
    const [form, setForm] = useState<EventBookletForm>(() => formFromDraft(draft));
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState<{ eventId: string; tryNext: string } | null>(null);
    const [requestId] = useState(() => crypto.randomUUID());

    // La bozza arriva con l'ultimo turno della sintesi: finche' la persona non
    // ha salvato, il modulo la segue.
    useEffect(() => {
        if (!saved) setForm(formFromDraft(draft));
    }, [draft, saved]);

    const set = (key: keyof EventBookletForm, value: string) => setForm((previous) => ({ ...previous, [key]: value }));

    const save = async () => {
        setSaving(true);
        try {
            const data = milestoneFromForm(form);
            const res = await apiFetch('/api/user/timeline/milestones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, request_id: requestId, period: '', session_id: sessionId || null }),
            });
            if (!res.ok) throw new Error(`milestone save failed (${res.status})`);
            const { event_id: eventId } = await res.json() as { event_id: string };
            setSaved({ eventId, tryNext: data.review.try_next });
            toast.success(t('eventMilestone.saved'));
        } catch {
            toast.error(t('eventBooklet.error'));
        } finally {
            setSaving(false);
        }
    };

    const inputClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';
    const label = 'text-xs font-semibold uppercase tracking-wide text-slate-500';
    const text = (key: keyof EventBookletForm, title: string, rows = 2, hint?: string) => (
        <label className="block">
            <span className={label}>{title}</span>
            {hint && <span className="ml-2 text-xs text-slate-400">{hint}</span>}
            <textarea value={form[key]} rows={rows} disabled={Boolean(saved)} onChange={(event) => set(key, event.target.value)} className={`${inputClass} resize-y`} />
        </label>
    );

    return (
        <section aria-labelledby="event-milestone-title" className="max-h-[60vh] space-y-3 overflow-y-auto border-t border-slate-200 bg-white p-4">
            <div>
                <h2 id="event-milestone-title" className="text-sm font-bold text-slate-800">{t('eventMilestone.title')}</h2>
                <p className="mt-1 text-sm text-slate-600">{t(draft ? 'eventBooklet.intro' : 'eventBooklet.introEmpty')}</p>
            </div>
            <label className="block">
                <span className={label}>{t('eventBooklet.field.title')}</span>
                <input value={form.title} disabled={Boolean(saved)} onChange={(event) => set('title', event.target.value)} className={inputClass} />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                    <span className={label}>{t('eventBooklet.field.date')}</span>
                    <input type="date" value={form.bio_date} disabled={Boolean(saved)} onChange={(event) => set('bio_date', event.target.value)} className={inputClass} />
                </label>
                <label className="block">
                    <span className={label}>{t('eventBooklet.field.role')}</span>
                    <select value={form.event_role} disabled={Boolean(saved)} onChange={(event) => set('event_role', event.target.value)} className={inputClass}>
                        <option value="">{t('booklet.select')}</option>
                        {EVENT_ROLES.map((role) => <option key={role} value={role}>{t(`eventBooklet.role.${role}`)}</option>)}
                    </select>
                </label>
            </div>
            {text('bio_context', t('eventBooklet.field.context'))}
            <div className="grid gap-3 md:grid-cols-2">
                {text('worked', t('eventBooklet.field.worked'), 3, t('eventBooklet.itemsHint'))}
                {text('didNotWork', t('eventBooklet.field.didNotWork'), 3, t('eventBooklet.itemsHint'))}
            </div>
            {text('discovery', t('eventBooklet.field.reading'), 3)}
            <div className="grid gap-3 md:grid-cols-2">
                {text('objective', t('eventBooklet.field.try'))}
                {text('strategy', t('eventBooklet.field.howWhen'))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
                {saved ? (
                    <>
                        <p role="status" className="text-sm font-semibold text-emerald-700">
                            {t('eventMilestone.saved')} <a className="underline" href="/profilo/timeline">{t('eventMilestone.open')}</a>
                        </p>
                        {saved.tryNext && (
                            <a className="text-sm font-semibold text-indigo-700 underline"
                                href={`/profilo/obiettivi?new=1&origin=${encodeURIComponent(`event:${saved.eventId}`)}&title=${encodeURIComponent(saved.tryNext.slice(0, 160))}`}>
                                {t('eventMilestone.toGoal')}
                            </a>
                        )}
                    </>
                ) : (
                    <Button type="button" onClick={() => void save()} disabled={saving || !form.title.trim()}>
                        <Save className="h-4 w-4" aria-hidden="true" />{saving ? t('eventBooklet.saving') : t('eventMilestone.save')}
                    </Button>
                )}
            </div>
        </section>
    );
}
