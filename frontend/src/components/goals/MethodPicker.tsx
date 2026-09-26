'use client';
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import { goalApi, type MethodItem, type MethodRef, type PersonalStrategy } from '@/lib/goals';
import { pickerOptions, sameRef } from '@/lib/goal-method';
import { Field, input } from './GoalUI';

type Certified = { slug: string; name: string };

/** Metodo dell'obiettivo: strategie certificate (✦) e dello studente (✎). Le proprie restano riusabili. */
export function MethodPicker({ value, items, onChange, onPractice, disabled }: { value: MethodRef[]; items: MethodItem[]; onChange: (next: MethodRef[]) => void; onPractice?: (title: string) => void; disabled?: boolean }) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const [own, setOwn] = useState<PersonalStrategy[]>([]); const [certified, setCertified] = useState<Certified[]>([]);
    const [choice, setChoice] = useState(''); const [draft, setDraft] = useState('');
    useEffect(() => {
        void goalApi<PersonalStrategy[]>('/user/strategies').then(setOwn).catch(() => setOwn([]));
        void goalApi<Certified[]>(`/user/certified-strategies?lang=${lang}`).then(setCertified).catch(() => setCertified([]));
    }, [lang]);
    const titleOf = (ref: MethodRef) => items.find(item => sameRef(item, ref))?.title
        ?? (ref.kind === 'own' ? own.find(s => s.id === ref.id)?.text : certified.find(s => s.slug === ref.slug)?.name) ?? '';
    const options = pickerOptions(own, certified, value);
    const add = (ref: MethodRef) => { onChange([...value, ref]); setChoice(''); };
    const write = async () => {
        const created = await goalApi<PersonalStrategy>('/user/strategies', 'POST', { text: draft.trim() });
        setOwn([...own, created]); setDraft(''); add({ kind: 'own', id: created.id });
    };
    return <section className="space-y-2" aria-label={l('method')}>
        <h4 className="font-semibold">{l('method')}</h4>
        <ul className="space-y-1">{value.map(ref => <li key={ref.kind === 'own' ? `o${ref.id}` : `c${ref.slug}`} className="flex items-center gap-2 rounded-md bg-slate-50 px-2">
            <span aria-hidden>{ref.kind === 'own' ? '✎' : '✦'}</span>
            <span className="min-w-0 flex-1 break-words py-2">{titleOf(ref)} <span className="text-xs text-slate-500">({l(ref.kind === 'own' ? 'ownMark' : 'certifiedMark')})</span></span>
            {onPractice && <Button type="button" variant="secondary" disabled={disabled} onClick={() => onPractice(titleOf(ref))}>{l('putInPractice')}</Button>}
            <Button type="button" variant="ghost" disabled={disabled} aria-label={`✕ ${titleOf(ref)}`} onClick={() => onChange(value.filter(v => !sameRef(v, ref)))}><X className="h-4 w-4" aria-hidden /></Button>
        </li>)}</ul>
        <div className="flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1"><Field label={l('pickStrategy')}>
            <select className={input} disabled={disabled} value={choice} onChange={e => { const [k, v] = e.target.value.split(':'); if (k === 'o') add({ kind: 'own', id: Number(v) }); else if (k === 'c') add({ kind: 'certified', slug: v }); }}>
                <option value="">—</option>
                {options.own.length > 0 && <optgroup label={l('myStrategies')}>{options.own.map(s => <option key={s.id} value={`o:${s.id}`}>✎ {s.text}</option>)}</optgroup>}
                <optgroup label={l('certifiedStrategies')}>{options.certified.map(s => <option key={s.slug} value={`c:${s.slug}`}>✦ {s.name}</option>)}</optgroup>
            </select></Field></div></div>
        <div className="flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1"><Field label={l('writeStrategy')}>
            <input className={input} maxLength={300} disabled={disabled} value={draft} onChange={e => setDraft(e.target.value)} /></Field></div>
            <Button type="button" variant="secondary" disabled={disabled || !draft.trim()} onClick={() => void write()}>+</Button></div>
    </section>;
}
