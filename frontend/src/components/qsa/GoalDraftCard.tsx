'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { Field, input } from '@/components/goals/GoalUI';
import type { CatalogEntry } from '@/lib/goals';
import { formFromDraft, goalDataFromForm, goalRequestId, type GoalDraft, type GoalForm } from '@/lib/goal-draft';

// The reviewed draft stays in the parent's frozen session. A student goal goes
// to the personal goals; a docenza goal goes straight into the teacher's goal
// catalog as a draft, with the session targets as a teacher-only note (#904).
// Publishing and assignments stay in the catalog page.
export function GoalDraftCard({ questionnaireType, sessionId, draft, onChange }: {
    questionnaireType: string;
    sessionId: string;
    draft: GoalDraft | null;
    onChange: (draft: GoalDraft) => void;
}) {
    const { t, lang } = useI18n();
    const form = formFromDraft(draft);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [targetNote, setTargetNote] = useState('');
    const docenza = questionnaireType === 'OBIETTIVO_DOCENZA';
    const set = (key: keyof GoalForm, value: string) => onChange({ ...form, [key]: value });

    const save = async () => {
        if (!form.title.trim()) { toast.error(t('goalDraft.titleRequired')); return; }
        setSaving(true);
        try {
            const data = goalDataFromForm(form);
            if (docenza) {
                const res = await apiFetch('/api/teacher/goal-catalog', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'draft', group_id: null, session_id: sessionId,
                        data: { title: data.title, description: data.motivation, criteria: data.criteria,
                            suggestions: data.reflection, area: '', audience: '', language: lang } }),
                });
                if (!res.ok) throw new Error(`catalog save failed (${res.status})`);
                setTargetNote(((await res.json()) as CatalogEntry).target_note ?? '');
                setSaved(true);
                toast.success(t('goalDraft.savedCatalog'));
                return;
            }
            const res = await apiFetch('/api/user/goals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, review_date: data.review_date || null,
                    status: 'active', request_id: await goalRequestId(sessionId),
                    origin: { kind: 'session', target_id: sessionId } }),
            });
            if (!res.ok) throw new Error(`goal save failed (${res.status})`);
            setSaved(true);
            toast.success(t('goalDraft.saved'));
        } catch { toast.error(t('goalDraft.error')); }
        finally { setSaving(false); }
    };

    return <section aria-labelledby="goal-draft-title" className="max-h-[60vh] space-y-4 overflow-y-auto border-t border-line bg-surface p-4">
        <h2 id="goal-draft-title" className="text-sm font-semibold text-ink">{t('goalDraft.title')}</h2>
        <p className="text-sm text-ink-muted">{t(draft ? 'goalDraft.intro' : 'goalDraft.introEmpty')}</p>
        <form onSubmit={e => { e.preventDefault(); void save(); }}>
            <fieldset disabled={saving || saved} className="space-y-4">
                <Field label={t('goalDraft.field.title')}><input className={input} required maxLength={160} value={form.title} onChange={e => set('title', e.target.value)} /></Field>
                {(['motivation', 'criteria', 'reflection'] as const).map(key => <Field key={key} label={t(`goalDraft.field.${key}`)}>
                    <textarea className={input} rows={2} maxLength={key === 'motivation' ? 2000 : key === 'criteria' ? 1500 : 3000} value={form[key]} onChange={e => set(key, e.target.value)} />
                </Field>)}
                {!docenza && <Field label={t('goalDraft.field.reviewDate')}><input type="date" className={input} value={form.review_date} onChange={e => set('review_date', e.target.value)} /></Field>}
                {!saved && <Button type="submit"><Save className="h-4 w-4" aria-hidden="true" />{t(saving ? 'goalDraft.saving' : 'goalDraft.save')}</Button>}
            </fieldset>
        </form>
        {saved && !docenza && <p role="status" className="text-sm text-success">{t('goalDraft.saved')} <a className="underline" href="/profilo/obiettivi">{t('goalDraft.open')}</a></p>}
        {saved && docenza && <div role="status" className="space-y-1 text-sm">
            <p className="text-success">{t('goalDraft.savedCatalog')} <a className="underline" href="/docente/catalogo-obiettivi">{t('goalDraft.openCatalog')}</a></p>
            {targetNote && <p className="text-ink-muted">{t('goalDraft.writtenFor')}: {targetNote}</p>}
        </div>}
    </section>;
}
