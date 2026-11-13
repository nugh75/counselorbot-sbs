'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Plus, Share2, Users } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch, getIdentity, type Identity } from '@/lib/auth';
import { fetchTeacherInstitutions, type Institution } from '@/lib/referrals-api';
import { useTeacherResource } from '../teacher/useTeacherResource';
import { TeacherForbidden } from '../teacher/TeacherAccess';
import { classGroupTexts as TEXTS } from '../teacher/class-group-texts';
import { parseClassGroups, type StudentGroup } from '../teacher/class-group-types';
import { classLayoutText } from '@/lib/i18n-class-layout';
import { teacherLoadingText } from '@/lib/i18n-teacher-loading';
import { classSettingsText } from '@/lib/i18n-class-settings';
import { Button } from '@/components/ui/Button';
import { EntryLink, EntrySection } from '@/components/ui/EntryList';

export interface GroupsPanelProps {
    institutionId?: number;
    basePath?: string;
}

export function GroupsPanel({ institutionId, basePath: explicitBasePath }: GroupsPanelProps = {}) {
    const pathname = usePathname();
    const router = useRouter();
    const basePath = explicitBasePath ?? (pathname?.startsWith('/admin') ? '/admin/classi' : '/docente/classi');

    const { lang, t } = useI18n();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const { data: groups, loading, failed, forbidden, reload: load } = useTeacherResource('/api/admin/groups', parseClassGroups);

    const [currentUser, setCurrentUser] = useState<Identity | null>(null);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newSchool, setNewSchool] = useState('');
    const [newLevel, setNewLevel] = useState('');
    const [newInstitutionId, setNewInstitutionId] = useState(institutionId ? String(institutionId) : '');
    const [institutions, setInstitutions] = useState<Institution[]>([]);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [sharesCount, setSharesCount] = useState<Record<number, number>>({});

    useEffect(() => {
        getIdentity().then(setCurrentUser).catch(() => setCurrentUser(null));
    }, []);

    useEffect(() => {
        fetchTeacherInstitutions().then(setInstitutions).catch(() => setInstitutions([]));
    }, []);

    // Fallback: se shares_count non è ancora nel payload API, interroga l'endpoint shares
    useEffect(() => {
        if (!groups) return;
        const missing = groups.filter((g) => g.shares_count === undefined && sharesCount[g.id] === undefined);
        if (missing.length === 0) return;
        for (const g of missing) {
            apiFetch(`/api/admin/groups/${g.id}/shares`)
                .then((res) => (res.ok ? res.json() : []))
                .then((data: unknown[]) => {
                    setSharesCount((prev) => ({ ...prev, [g.id]: Array.isArray(data) ? data.length : 0 }));
                })
                .catch(() => {});
        }
    }, [groups, sharesCount]);

    const create = async () => {
        if (!groups || busy || loading || !newName.trim()) return;
        setBusy(true);
        setMessage('');
        try {
            const res = await apiFetch('/api/admin/groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newName.trim(),
                    school: newSchool.trim() || null,
                    school_level: newLevel || null,
                    institution_id: institutionId ?? (newInstitutionId ? Number(newInstitutionId) : null),
                }),
            });
            if (!res.ok) throw new Error('create failed');
            const created = (await res.json()) as StudentGroup;
            setNewName('');
            setNewSchool('');
            setNewLevel('');
            setNewInstitutionId(institutionId ? String(institutionId) : '');
            setCreating(false);
            if (created && created.id) {
                router.push(`${basePath}/${created.id}`);
            } else {
                load();
            }
        } catch {
            setMessage(texts.error);
        } finally {
            setBusy(false);
        }
    };

    const visibleGroups = groups?.filter((group) => institutionId === undefined || group.institution_id === institutionId);

    if (forbidden) return <TeacherForbidden />;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <p className="max-w-2xl text-sm text-ink-muted">{texts.subtitle}</p>
                </div>
                <Button
                    type="button"
                    disabled={!groups || loading}
                    onClick={() => setCreating(true)}
                >
                    <Plus className="h-4 w-4" /> {texts.newGroup}
                </Button>
            </div>

            {creating && (
                <div className="grid min-w-0 gap-4 rounded-control border border-line bg-surface p-4 shadow-card sm:grid-cols-2">
                    <label className="min-w-0 text-xs font-semibold text-ink-muted">
                        {classLayoutText(lang, 'name')}
                        <input
                            value={newName}
                            onChange={(event) => setNewName(event.target.value)}
                            placeholder={texts.namePlaceholder}
                            className="mt-1 h-control w-full min-w-0 rounded-control border border-line-strong px-4 py-2 text-sm focus:border-brand focus:outline-none"
                        />
                    </label>
                    <label className="min-w-0 text-xs font-semibold text-ink-muted">
                        {texts.school}
                        <input
                            value={newSchool}
                            onChange={(event) => setNewSchool(event.target.value)}
                            placeholder={texts.schoolPlaceholder}
                            className="mt-1 h-control w-full min-w-0 rounded-control border border-line-strong px-4 py-2 text-sm focus:border-brand focus:outline-none"
                        />
                    </label>
                    <label className="min-w-0 text-xs font-semibold text-ink-muted">
                        {texts.levelLabel}
                        <select
                            value={newLevel}
                            onChange={(event) => setNewLevel(event.target.value)}
                            title={texts.levelHint}
                            aria-label={texts.levelLabel}
                            className="mt-1 h-control w-full min-w-0 rounded-control border border-line-strong px-4 py-2 text-sm focus:border-brand focus:outline-none"
                        >
                            <option value="">{texts.levelNone}</option>
                            <option value="secondaria">{texts.levelSecondaria}</option>
                            <option value="universita">{texts.levelUniversita}</option>
                            <option value="adulti">{texts.levelAdulti}</option>
                        </select>
                    </label>
                    <label className="min-w-0 text-xs font-semibold text-ink-muted">
                        {texts.institutionLabel}
                        <select
                            value={newInstitutionId}
                            disabled={institutionId !== undefined}
                            onChange={(event) => setNewInstitutionId(event.target.value)}
                            title={texts.institutionHint}
                            aria-label={texts.institutionLabel}
                            className="mt-1 h-control w-full min-w-0 rounded-control border border-line-strong px-4 py-2 text-sm focus:border-brand focus:outline-none"
                        >
                            <option value="">{texts.institutionNone}</option>
                            {institutions.map((institution) => (
                                <option key={institution.id} value={String(institution.id)}>
                                    {institution.name}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                        <Button
                            type="button"
                            disabled={busy || loading || !groups || !newName.trim()}
                            onClick={() => void create()}
                        >
                            {texts.create}
                        </Button>
                        <button
                            type="button"
                            onClick={() => {
                                setCreating(false);
                                setNewName('');
                                setNewSchool('');
                                setNewLevel('');
                                setNewInstitutionId(institutionId ? String(institutionId) : '');
                            }}
                            className="min-h-control rounded-control border border-line-strong px-4 py-2 text-sm font-semibold text-ink-body hover:bg-surface-sunken"
                        >
                            {texts.cancel}
                        </button>
                    </div>
                </div>
            )}

            {message && <p className="text-sm text-danger">{message}</p>}
            {loading && <p role="status" className="text-sm text-ink-muted">{t('common.loading')}</p>}
            {failed && (
                <div role="alert" className="flex flex-wrap items-center gap-4 text-sm text-danger">
                    <p>{teacherLoadingText(lang, 'classes')}</p>
                    <Button variant="secondary"
                        type="button"
                        disabled={loading}
                        onClick={() => void load()}
                    >
                        {t('setup.retry')}
                    </Button>
                </div>
            )}
            {!loading && !failed && visibleGroups?.length === 0 && <p className="text-sm text-ink-muted">{texts.empty}</p>}

            {visibleGroups && visibleGroups.length > 0 && (
                <EntrySection id="class-entries" title={texts.title}>
                    {visibleGroups.map((group) => {
                        const isShared =
                            (group.shares_count !== undefined ? group.shares_count > 0 : (sharesCount[group.id] ?? 0) > 0) ||
                            Boolean(
                                currentUser?.username &&
                                    group.owner_username &&
                                    group.owner_username.toLowerCase() !== currentUser.username.toLowerCase(),
                            );
                        const place = group.school || group.institution_name;
                        const description = [
                            `${texts.code}: ${group.code}`,
                            `${group.members_count} ${texts.members}`,
                            place,
                            `${classSettingsText(lang, 'owner')}: ${group.owner_username}`,
                        ].filter(Boolean).join(' · ');
                        return (
                            <EntryLink
                                key={group.id}
                                idPrefix="class"
                                id={String(group.id)}
                                href={`${basePath}/${group.id}`}
                                illustration={<Users className="h-6 w-6 shrink-0 text-ink-muted" aria-hidden="true" />}
                                name={group.name}
                                description={description}
                                badge={
                                    <>
                                        {!group.is_active && (
                                            <span className="rounded-full border border-line bg-surface-raised px-2 py-1 text-xs font-semibold text-ink-muted">
                                                {classSettingsText(lang, 'statusInactive')}
                                            </span>
                                        )}
                                        {isShared && (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-brand-line bg-brand-soft px-2 py-1 text-xs font-semibold text-link">
                                                <Share2 className="h-3 w-3" aria-hidden="true" />
                                                {classSettingsText(lang, 'shared')}
                                            </span>
                                        )}
                                    </>
                                }
                            />
                        );
                    })}
                </EntrySection>
            )}
        </div>
    );
}
