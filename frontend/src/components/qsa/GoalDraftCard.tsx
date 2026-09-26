'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { toast } from '@/components/ui/Toast';
import { GoalCatalogEditor } from '@/components/goals/GoalCatalogEditor';
import { Field, input } from '@/components/goals/GoalUI';
import type { CatalogData } from '@/lib/goals';
import { formFromDraft, goalDataFromForm, goalRequestId, type GoalDraft, type GoalForm } from '@/lib/goal-draft';

// The reviewed draft stays in the parent's frozen session; publication never
// follows personal saving automatically. The existing catalog editor retains
// its group, review and explicit-assignment permissions.
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
    const [catalogDraft, setCatalogDraft] = useState<CatalogData | null>(null);
    const set = (key: keyof GoalForm, value: string) => onChange({ ...form, [key]: value });

    const save = async () => {
        if (!form.title.trim()) { toast.error(t('goalDraft.titleRequired')); return; }
        setSaving(true);
        try {
            const data = goalDataFromForm(form);
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

    return <section aria-labelledby="goal-draft-title" className="max-h-[60vh] space-y-3 overflow-y-auto border-t border-slate-200 bg-white p-4">
        <h2 id="goal-draft-title" className="text-sm font-bold text-slate-800">{t('goalDraft.title')}</h2>
        <p className="text-sm text-slate-600">{t(draft ? 'goalDraft.intro' : 'goalDraft.introEmpty')}</p>
        <form onSubmit={e => { e.preventDefault(); void save(); }}>
            <fieldset disabled={saving || saved} className="space-y-3">
                <Field label={t('goalDraft.field.title')}><input className={input} required maxLength={160} value={form.title} onChange={e => set('title', e.target.value)} /></Field>
                {(['motivation', 'criteria', 'reflection'] as const).map(key => <Field key={key} label={t(`goalDraft.field.${key}`)}>
                    <textarea className={input} rows={2} maxLength={key === 'motivation' ? 2000 : key === 'criteria' ? 1500 : 3000} value={form[key]} onChange={e => set(key, e.target.value)} />
                </Field>)}
                <Field label={t('goalDraft.field.reviewDate')}><input type="date" className={input} value={form.review_date} onChange={e => set('review_date', e.target.value)} /></Field>
                {!saved && <Button type="submit"><Save className="h-4 w-4" aria-hidden="true" />{t(saving ? 'goalDraft.saving' : 'goalDraft.save')}</Button>}
            </fieldset>
        </form>
        {saved && <p role="status" className="text-sm text-emerald-700">{t('goalDraft.saved')} <a className="underline" href="/profilo/obiettivi">{t('goalDraft.open')}</a></p>}
        {questionnaireType === 'OBIETTIVO_DOCENZA' && <>
            {!catalogDraft && <Button type="button" variant="secondary" disabled={saving || !form.title.trim()} onClick={() => {
                setCatalogDraft({ title: form.title, description: form.motivation, criteria: form.criteria,
                    suggestions: form.reflection, area: '', audience: '', language: lang });
            }}>{t('goalDraft.publish')}</Button>}
            {catalogDraft && <GoalCatalogEditor initialData={catalogDraft} />}
        </>}
    </section>;
}
