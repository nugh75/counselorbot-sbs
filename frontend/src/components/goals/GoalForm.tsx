'use client';
import { useI18n } from '@/lib/i18n-context';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import type { GoalFields, GoalGroup } from '@/lib/goals';
import { Field, input } from './GoalUI';

type FormProps = { form: GoalFields; setForm: (form: GoalFields) => void; groups: GoalGroup[]; create?: boolean };
export function GoalForm({ form, setForm, groups, create = false }: FormProps) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    // F12 (audit Area personale, lotto 3A): alla creazione restano visibili solo
    // titolo, motivazione e data di revisione; i dettagli progrediscono su richiesta.
    const details = <>
        <Field label={l('criteria')}><textarea className={input} rows={3} maxLength={1500} value={form.criteria} onChange={e => setForm({ ...form, criteria: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
            <Field label={l('priority')}><select className={input} value={form.priority} onChange={e => setForm({ ...form, priority: Number(e.target.value) })}>{(['high', 'normal', 'low'] as const).map((key, i) => <option key={key} value={i + 1}>{l(key)}</option>)}</select></Field>
            <Field label={l('status')}><select className={input} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{(['active', 'paused', 'completed', 'archived'] as const).map(key => <option key={key} value={key}>{l(key)}</option>)}</select></Field>
        </div>
        <Field label={l('share')}><select className={input} value={form.shared_group_id || ''} onChange={e => setForm({ ...form, shared_group_id: Number(e.target.value) || null })}>
            <option value="">{l('private')}</option>{form.shared_group_id && !groups.some(g => g.id === form.shared_group_id) && <option value={form.shared_group_id}>{l('unavailable')}</option>}{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select></Field><p className="text-sm text-slate-600">{l('shareHelp')}</p>
    </>;
    return <div className="space-y-4">
        <Field label={l('title')}><input className={input} required maxLength={160} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label={l('motivation')}><textarea className={input} rows={3} maxLength={2000} value={form.motivation} onChange={e => setForm({ ...form, motivation: e.target.value })} /></Field>
        <Field label={l('reviewDate')}><input className={input} type="date" value={form.review_date || ''} onChange={e => setForm({ ...form, review_date: e.target.value || null })} /></Field>
        {create
            ? <details className="rounded-md border border-slate-200 p-3"><summary className="min-h-11 cursor-pointer py-2 font-semibold text-indigo-700">{l('moreDetails')}</summary><div className="mt-3 space-y-4">{details}</div></details>
            : details}
    </div>;
}
