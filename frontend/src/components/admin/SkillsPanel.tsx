'use client';

import { useCallback, useEffect, useState } from 'react';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { SkillWizard, type AdminSkill, type SkillCatalog } from '@/components/admin/SkillWizard';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { Button } from '@/components/ui/Button';

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

    const [confirmDelete, setConfirmDelete] = useState<string | number | null>(null);
    const remove = async (skill: AdminSkill) => {
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
        <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
                <h2 className="text-xl font-semibold">{t('admin.skills.title')}</h2>
                <p className="mt-1 text-sm text-ink-muted">{t('admin.skills.intro')}</p>
            </div>
            <Button type="button" onClick={() => setEditing('new')} disabled={!catalog}>
                <Plus className="h-4 w-4" />{t('admin.skills.new')}
            </Button>
        </div>

        {error && <p role="alert" className="rounded-control bg-danger-soft px-4 py-2 text-sm text-danger-ink">{error}</p>}
        {status && <p role="status" className="rounded-control bg-success-soft px-4 py-2 text-sm text-success-ink">{status}</p>}

        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b text-left text-xs text-ink-muted">
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
                            <td className="py-2 pr-4">
                                <span className="font-semibold">{skill.name}</span>
                                {skill.builtin && <span className="ml-2 inline-flex items-center gap-1 rounded bg-surface-raised px-2 py-1 text-2xs text-ink-muted"
                                    title={t('admin.skills.builtinHint')}>
                                    <Lock aria-hidden className="h-3 w-3" />{t('admin.skills.builtin')}
                                </span>}
                                <code className="block text-xs text-ink-muted">{skill.slug}</code>
                            </td>
                            <td className="pr-4 text-xs">
                                {intents.length ? intents.map(intent => t(`admin.skills.intent.${intent}`)).join(' · ') : t('admin.skills.summary.anyIntent')}
                            </td>
                            <td className="pr-4 text-xs">{t(`admin.skills.routing.${skill.routing}`)}</td>
                            <td className="pr-4 text-xs">{t(`admin.skills.status.${skill.status}`)}</td>
                            <td className="pr-4">
                                <input type="checkbox" checked={skill.is_active} onChange={() => toggleActive(skill)}
                                    aria-label={t('admin.skills.field.active')} />
                            </td>
                            <td className="whitespace-nowrap text-right">
                                <button type="button" onClick={() => setEditing(skill)} disabled={!catalog} className="inline-flex min-h-control min-w-control items-center justify-center p-2" aria-label={t('admin.skills.edit')}>
                                    <Pencil className="h-4 w-4" />
                                </button>
                                {!skill.builtin && (confirmDelete === skill.id
                                    ? <ConfirmInline question={t('admin.skills.confirmDelete', { name: skill.name })} onConfirm={() => { setConfirmDelete(null); void remove(skill); }} onCancel={() => setConfirmDelete(null)} />
                                    : <button type="button" onClick={() => setConfirmDelete(skill.id)} className="inline-flex min-h-control min-w-control items-center justify-center p-2" aria-label={t('admin.skills.delete')}>
                                          <Trash2 className="h-4 w-4" />
                                      </button>)}
                            </td>
                        </tr>;
                    })}
                </tbody>
            </table>
        </div>

        {editing && catalog && <SkillWizard skill={editing === 'new' ? null : editing} catalog={catalog} onClose={closeWizard} />}
    </div>;
}
