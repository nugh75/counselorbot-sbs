'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';

type Level = { label: string; meta: boolean; short_prompt: boolean } & Record<string, string | boolean | number | null>;
type Profile = { level?: string; context_tokens?: number; input_tokens?: number; compact?: boolean };
type Assignment = { target: string; profile: Profile };
const LIMITS = ['directives_tokens', 'persona_tokens', 'profile_tokens', 'knowledge_tokens', 'knowledge_top_n', 'history_turns'] as const;

export function ModelContextSettings() {
    const { t } = useI18n();
    const [levels, setLevels] = useState<Record<string, Level>>({});
    const [savedLevels, setSavedLevels] = useState<Record<string, Level>>({});
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
    const [saving, setSaving] = useState('');
    const [status, setStatus] = useState('');
    const [error, setError] = useState('');
    const load = async () => {
        setState('loading');
        try {
            const response = await apiFetch('/api/admin/model-context-levels');
            if (!response.ok) throw new Error('load');
            const data = await response.json();
            setLevels(data.levels); setSavedLevels(data.levels);
            setAssignments(Object.entries(data.profiles as Record<string, Profile>).map(([target, profile]) => ({ target, profile })));
            setState('ready');
        } catch { setState('error'); }
    };
    useEffect(() => { void load(); }, []);
    const updateLevel = (id: string, key: string, value: string | boolean | number | null) => {
        setLevels(previous => ({ ...previous, [id]: { ...previous[id], [key]: value } })); setStatus('');
    };
    const updateAssignment = (index: number, change: Partial<Assignment>) => {
        setAssignments(previous => previous.map((row, i) => i === index ? { ...row, ...change } : row)); setStatus('');
    };
    const save = async (key: string) => {
        setError(''); setStatus('');
        const names = assignments.map(row => row.target.trim());
        if (key === 'model_context_profiles' && (new Set(names).size !== names.length || names.some(name => !/^\S+\/\S+$/.test(name)))) {
            setError(t('admin.context.invalidTarget')); return;
        }
        setSaving(key);
        try {
            const value = key === 'model_context_levels' ? levels : Object.fromEntries(assignments.map((row, index) => [names[index], row.profile]));
            const response = await apiFetch('/api/admin/config', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value: JSON.stringify(value), description: t('admin.context.title') }),
            });
            if (!response.ok) throw new Error('save');
            if (key === 'model_context_levels') setSavedLevels(structuredClone(levels));
            setStatus(t('admin.promptMap.saved'));
        } catch { setError(t('admin.context.saveError')); }
        finally { setSaving(''); }
    };
    if (state === 'loading') return <p role="status">{t('admin.promptMap.loading')}</p>;
    if (state === 'error') return <div role="alert">{t('admin.promptMap.loadError')} <Button onClick={() => void load()}>{t('admin.promptMap.reload')}</Button></div>;
    return <section className="space-y-4" aria-label={t('admin.context.title')}>
        <h3 className="text-sm font-semibold text-slate-700">{t('admin.context.title')}</h3>
        <p className="text-sm text-slate-600">{t('admin.context.help')}</p>
        <fieldset disabled={!!saving} className="space-y-3">
            <legend className="text-sm font-medium">{t('admin.context.levels')}</legend>
            {Object.entries(levels).map(([id, level]) => <details key={id} className="rounded border border-slate-200 p-3">
                <summary className="cursor-pointer text-sm">{level.label} · {id}</summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs">{t('admin.context.name')}<input aria-label={`${t('admin.context.name')} ${id}`} value={level.label} onChange={event => updateLevel(id, 'label', event.target.value)} className="mt-1 w-full rounded border p-2" /></label>
                    {LIMITS.map(key => <label key={key} className="text-xs">{t(`admin.context.${key}`)}<input type="number" min="0" aria-label={`${t(`admin.context.${key}`)} ${id}`} value={level[key] as number ?? ''} onChange={event => updateLevel(id, key, event.target.value === '' ? null : Number(event.target.value))} className="mt-1 w-full rounded border p-2" /></label>)}
                    {(['meta', 'short_prompt'] as const).map(key => <label key={key} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={level[key]} onChange={event => updateLevel(id, key, event.target.checked)} />{t(`admin.context.${key}`)}</label>)}
                </div>
            </details>)}
            <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => {
                    let n = 1; while (levels[`custom-${n}`]) n++;
                    const template = Object.values(levels)[0];
                    setLevels({ ...levels, [`custom-${n}`]: { ...template, label: `${t('admin.context.newLevel')} ${n}` } }); setStatus('');
                }}>{t('admin.context.addLevel')}</Button>
                <Button onClick={() => void save('model_context_levels')}>{t('admin.context.saveLevels')}</Button>
            </div>
        </fieldset>
        <fieldset disabled={!!saving} className="space-y-3">
            <legend className="text-sm font-medium">{t('admin.context.assignments')}</legend>
            {assignments.map((row, index) => <div key={index} className="grid gap-2 rounded border border-slate-200 p-3 sm:grid-cols-2">
                <label className="text-xs">{t('admin.context.target')}<input value={row.target} aria-label={`${t('admin.context.target')} ${index + 1}`} onChange={event => updateAssignment(index, { target: event.target.value })} className="mt-1 w-full rounded border p-2" /></label>
                <label className="text-xs">{t('admin.context.level')}<select value={row.profile.level || ''} aria-label={`${t('admin.context.level')} ${index + 1}`} onChange={event => {
                    const profile = { ...row.profile }; if (event.target.value) profile.level = event.target.value; else delete profile.level;
                    updateAssignment(index, { profile });
                }} className="mt-1 w-full rounded border p-2"><option value="">{t('admin.context.unassigned')}</option>{Object.entries(savedLevels).map(([id, level]) => <option key={id} value={id}>{level.label}</option>)}</select></label>
                {(['context_tokens', 'input_tokens'] as const).map(key => <label key={key} className="text-xs">{t(`admin.context.${key}`)}<input type="number" min="1024" value={row.profile[key] ?? ''} aria-label={`${t(`admin.context.${key}`)} ${index + 1}`} onChange={event => {
                    const profile = { ...row.profile }; if (event.target.value === '') delete profile[key]; else profile[key] = Number(event.target.value);
                    updateAssignment(index, { profile });
                }} className="mt-1 w-full rounded border p-2" /></label>)}
                <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={row.profile.compact || false} onChange={event => updateAssignment(index, { profile: { ...row.profile, compact: event.target.checked } })} />{t('admin.context.compact')}</label>
                <Button variant="secondary" onClick={() => { setAssignments(assignments.filter((_, i) => i !== index)); setStatus(''); }}>{t('admin.context.removeAssignment')}</Button>
            </div>)}
            <div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => { setAssignments([...assignments, { target: '', profile: {} }]); setStatus(''); }}>{t('admin.context.addAssignment')}</Button><Button onClick={() => void save('model_context_profiles')}>{t('admin.context.saveAssignments')}</Button></div>
        </fieldset>
        <p role="status" className="text-xs text-slate-600">{saving ? t('admin.promptMap.saving') : status}</p>
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </section>;
}
