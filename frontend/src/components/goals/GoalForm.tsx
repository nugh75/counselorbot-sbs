'use client';
import { useI18n } from '@/lib/i18n-context';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import type { GoalFields, GoalGroup } from '@/lib/goals';
import { Field, input } from './GoalUI';

type FormProps = { form: GoalFields; setForm: (form: GoalFields) => void; groups: GoalGroup[] };
export function GoalForm({ form, setForm, groups }: FormProps) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    return <div className="space-y-4">
        <Field label={l('title')}><input className={input} required maxLength={160} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
        {(['motivation', 'criteria', 'reflection'] as const).map(key => <Field key={key} label={l(key)}><textarea className={input} rows={3} maxLength={key === 'criteria' ? 1500 : key === 'reflection' ? 3000 : 2000} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></Field>)}
        <div className="grid gap-4 sm:grid-cols-3">
            <Field label={l('reviewDate')}><input className={input} type="date" value={form.review_date || ''} onChange={e => setForm({ ...form, review_date: e.target.value || null })} /></Field>
            <Field label={l('priority')}><select className={input} value={form.priority} onChange={e => setForm({ ...form, priority: Number(e.target.value) })}>{(['high', 'normal', 'low'] as const).map((key, i) => <option key={key} value={i + 1}>{l(key)}</option>)}</select></Field>
            <Field label={l('status')}><select className={input} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{(['active', 'paused', 'completed', 'archived'] as const).map(key => <option key={key} value={key}>{l(key)}</option>)}</select></Field>
        </div>
        <Field label={l('share')}><select className={input} value={form.shared_group_id || ''} onChange={e => setForm({ ...form, shared_group_id: Number(e.target.value) || null })}>
            <option value="">{l('private')}</option>{form.shared_group_id && !groups.some(g => g.id === form.shared_group_id) && <option value={form.shared_group_id}>{l('unavailable')}</option>}{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select></Field><p className="text-sm text-slate-600">{l('shareHelp')}</p>
    </div>;
}
