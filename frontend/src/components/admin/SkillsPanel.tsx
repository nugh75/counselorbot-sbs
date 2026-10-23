'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { SkillWizard, type AdminSkill, type SkillCatalog } from '@/components/admin/SkillWizard';

// Scheda Admin → Skill: elenco, accensione e la procedura guidata per creare o
// modificare una skill. `?skill=<id>` (link dalla mappa dei prompt) apre subito
// la skill indicata.

const SKILL_PARAM = 'skill';

export function SkillsPanel() {
    const { t } = useI18n();
    const [skills, setSkills] = useState<AdminSkill[]>([]);
    const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
    const [editing, setEditing] = useState<AdminSkill | 'new' | null>(null);
    const [error, setError] = useState('');
    const [status, setStatus] = useState('');

    const load = useCallback(async () => {
        const res = await fetch('/api/admin/skills');
        if (res.ok) setSkills(await res.json());
    }, []);

    useEffect(() => {
        let cancelled = false;
        void Promise.all([fetch('/api/admin/skills'), fetch('/api/admin/skills/catalog')]).then(async ([skillsRes, catalogRes]) => {
            if (cancelled) return;
            const list: AdminSkill[] = skillsRes.ok ? await skillsRes.json() : [];
            setSkills(list);
            if (catalogRes.ok) setCatalog(await catalogRes.json());
            const wanted = Number(new URLSearchParams(window.location.search).get(SKILL_PARAM));
            const skill = list.find(item => item.id === wanted);
            if (skill) setEditing(skill);
        });
        return () => { cancelled = true; };
    }, []);

    const closeWizard = (saved: boolean) => {
        setEditing(null);
        const url = new URL(window.location.href);
        if (url.searchParams.has(SKILL_PARAM)) {
            url.searchParams.delete(SKILL_PARAM);
            window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
        }
        if (saved) {
            setStatus(t('admin.skills.saved'));
            void load();
        }
    };

    const toggleActive = async (skill: AdminSkill) => {
        setError('');
        const res = await fetch(`/api/admin/skills/${skill.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !skill.is_active }),
        });
        if (!res.ok) setError(t('admin.skills.error.save'));
        void load();
    };

    const remove = async (skill: AdminSkill) => {
        if (!window.confirm(t('admin.skills.confirmDelete', { name: skill.name }))) return;
        setError('');
        const res = await fetch(`/api/admin/skills/${skill.id}`, { method: 'DELETE' });
        if (!res.ok) {
            const body = await res.json().catch(() => null);
            setError(typeof body?.detail === 'string' ? body.detail : t('admin.skills.error.delete'));
            return;
        }
        setStatus(t('admin.skills.deleted'));
        void load();
    };

    return <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-2xl">
                <h2 className="text-xl font-semibold">{t('admin.skills.title')}</h2>
                <p className="mt-1 text-sm text-slate-600">{t('admin.skills.intro')}</p>
            </div>
            <button type="button" onClick={() => setEditing('new')} disabled={!catalog}
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">
                <Plus className="h-4 w-4" />{t('admin.skills.new')}
            </button>
        </div>

        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {status && <p role="status" className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</p>}

        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b text-left text-xs uppercase text-slate-500">
                        <th className="py-2">{t('admin.skills.field.name')}</th>
                        <th>{t('admin.skills.summary.when')}</th>
                        <th>{t('admin.skills.position.routing')}</th>
                        <th>{t('admin.skills.publish.status')}</th>
                        <th>{t('admin.skills.field.active')}</th>
                        <th />
                    </tr>
                </thead>
                <tbody>
                    {skills.map(skill => {
                        const intents = Array.isArray(skill.conditions?.intents) ? (skill.conditions?.intents as string[]) : [];
                        return <tr key={skill.id} className="border-b align-top">
                            <td className="py-2 pr-3">
                                <span className="font-medium">{skill.name}</span>
                                {skill.builtin && <span className="ml-2 inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600"
                                    title={t('admin.skills.builtinHint')}>
                                    <Lock aria-hidden className="h-3 w-3" />{t('admin.skills.builtin')}
                                </span>}
                                <code className="block text-xs text-slate-400">{skill.slug}</code>
                            </td>
                            <td className="pr-3 text-xs">
                                {intents.length ? intents.map(intent => t(`admin.skills.intent.${intent}`)).join(' · ') : t('admin.skills.summary.anyIntent')}
                            </td>
                            <td className="pr-3 text-xs">{t(`admin.skills.routing.${skill.routing}`)}</td>
                            <td className="pr-3 text-xs">{t(`admin.skills.status.${skill.status}`)}</td>
                            <td className="pr-3">
                                <input type="checkbox" checked={skill.is_active} onChange={() => toggleActive(skill)}
                                    aria-label={t('admin.skills.field.active')} />
                            </td>
                            <td className="whitespace-nowrap text-right">
                                <button type="button" onClick={() => setEditing(skill)} disabled={!catalog} className="p-1" aria-label={t('admin.skills.edit')}>
                                    <Pencil className="h-4 w-4" />
                                </button>
                                {!skill.builtin && <button type="button" onClick={() => remove(skill)} className="p-1" aria-label={t('admin.skills.delete')}>
                                    <Trash2 className="h-4 w-4" />
                                </button>}
                            </td>
                        </tr>;
                    })}
                </tbody>
            </table>
        </div>

        {editing && catalog && <SkillWizard skill={editing === 'new' ? null : editing} catalog={catalog} onClose={closeWizard} />}
    </div>;
}
