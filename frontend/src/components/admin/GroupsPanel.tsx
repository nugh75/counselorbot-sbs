'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, Check, Copy, Plus, Route, Share2, Users, Wrench } from 'lucide-react';
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
    const [copiedCodeId, setCopiedCodeId] = useState<number | null>(null);
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

    const copyCode = async (groupId: number, code: string) => {
        if (!navigator.clipboard) return;
        await navigator.clipboard.writeText(code);
        setCopiedCodeId(groupId);
        setTimeout(() => setCopiedCodeId(null), 1500);
    };

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
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                        <Users className="h-5 w-5 text-slate-500" /> {texts.title}
                    </h2>
                    <p className="mt-1 max-w-2xl text-sm text-slate-500">{texts.subtitle}</p>
                </div>
                <button
                    type="button"
                    disabled={!groups || loading}
                    onClick={() => setCreating(true)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                    <Plus className="h-4 w-4" /> {texts.newGroup}
                </button>
            </div>

            {creating && (
                <div className="grid min-w-0 gap-3 rounded-md border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2">
                    <label className="min-w-0 text-xs font-semibold text-slate-600">
                        {classLayoutText(lang, 'name')}
                        <input
                            value={newName}
                            onChange={(event) => setNewName(event.target.value)}
                            placeholder={texts.namePlaceholder}
                            className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                        />
                    </label>
                    <label className="min-w-0 text-xs font-semibold text-slate-600">
                        {texts.school}
                        <input
                            value={newSchool}
                            onChange={(event) => setNewSchool(event.target.value)}
                            placeholder={texts.schoolPlaceholder}
                            className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                        />
                    </label>
                    <label className="min-w-0 text-xs font-semibold text-slate-600">
                        {texts.levelLabel}
                        <select
                            value={newLevel}
                            onChange={(event) => setNewLevel(event.target.value)}
                            title={texts.levelHint}
                            aria-label={texts.levelLabel}
                            className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
                        >
                            <option value="">{texts.levelNone}</option>
                            <option value="secondaria">{texts.levelSecondaria}</option>
                            <option value="universita">{texts.levelUniversita}</option>
                            <option value="adulti">{texts.levelAdulti}</option>
                        </select>
                    </label>
                    <label className="min-w-0 text-xs font-semibold text-slate-600">
                        {texts.institutionLabel}
                        <select
                            value={newInstitutionId}
                            disabled={institutionId !== undefined}
                            onChange={(event) => setNewInstitutionId(event.target.value)}
                            title={texts.institutionHint}
                            aria-label={texts.institutionLabel}
                            className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
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
                        <button
                            type="button"
                            disabled={busy || loading || !groups || !newName.trim()}
                            onClick={() => void create()}
                            className="min-h-11 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {texts.create}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setCreating(false);
                                setNewName('');
                                setNewSchool('');
                                setNewLevel('');
                                setNewInstitutionId(institutionId ? String(institutionId) : '');
                            }}
                            className="min-h-11 rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            {texts.cancel}
                        </button>
                    </div>
                </div>
            )}

            {message && <p className="text-sm text-red-600">{message}</p>}
            {loading && <p role="status" className="text-sm text-slate-500">{t('common.loading')}</p>}
            {failed && (
                <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-600">
                    <p>{teacherLoadingText(lang, 'classes')}</p>
                    <button
                        type="button"
                        disabled={loading}
                        onClick={() => void load()}
                        className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                        {t('setup.retry')}
                    </button>
                </div>
            )}
            {!loading && !failed && visibleGroups?.length === 0 && <p className="text-sm text-slate-500">{texts.empty}</p>}

            <div className="space-y-3">
                {(visibleGroups || []).map((group) => {
                    const isShared =
                        (group.shares_count !== undefined ? group.shares_count > 0 : (sharesCount[group.id] ?? 0) > 0) ||
                        Boolean(
                            currentUser?.username &&
                                group.owner_username &&
                                group.owner_username.toLowerCase() !== currentUser.username.toLowerCase(),
                        );

                    return (
                        <section
                            key={group.id}
                            className={`min-w-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5 ${
                                group.is_active ? '' : 'bg-slate-50 opacity-75'
                            }`}
                        >
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-base font-bold text-slate-900 sm:text-lg">
                                            <Link
                                                href={`${basePath}/${group.id}`}
                                                className="hover:text-emerald-700 hover:underline focus-visible:outline-2"
                                            >
                                                {group.name}
                                            </Link>
                                        </h3>
                                        {/* Status badge: Attiva / Inattiva */}
                                        <span
                                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                                group.is_active
                                                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                                    : 'border border-slate-200 bg-slate-100 text-slate-600'
                                            }`}
                                        >
                                            <span
                                                className={`h-1.5 w-1.5 rounded-full ${
                                                    group.is_active ? 'bg-emerald-500' : 'bg-slate-400'
                                                }`}
                                                aria-hidden="true"
                                            />
                                            {group.is_active ? classSettingsText(lang, 'statusActive') : classSettingsText(lang, 'statusInactive')}
                                        </span>
                                        {/* Shared badge: Condivisa */}
                                        {isShared && (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
                                                <Share2 className="h-3 w-3" aria-hidden="true" />
                                                {classSettingsText(lang, 'shared')}
                                            </span>
                                        )}
                                    </div>

                                    {/* Code & Meta info */}
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-slate-500">{texts.code}:</span>
                                            <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono font-semibold text-slate-800">
                                                {group.code}
                                                <button
                                                    type="button"
                                                    onClick={() => void copyCode(group.id, group.code)}
                                                    title={
                                                        copiedCodeId === group.id
                                                            ? classSettingsText(lang, 'copied')
                                                            : classSettingsText(lang, 'copyCode')
                                                    }
                                                    aria-label={
                                                        copiedCodeId === group.id
                                                            ? classSettingsText(lang, 'copied')
                                                            : `${classSettingsText(lang, 'copyCode')} ${group.code}`
                                                    }
                                                    className="inline-flex min-h-6 min-w-6 items-center justify-center text-slate-500 hover:text-emerald-700 focus-visible:outline-2"
                                                >
                                                    {copiedCodeId === group.id ? (
                                                        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                                                    ) : (
                                                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                                    )}
                                                </button>
                                            </span>
                                        </div>

                                        <span className="inline-flex items-center gap-1">
                                            <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                                            <span>
                                                {group.members_count} {texts.members}
                                            </span>
                                        </span>

                                        {group.school && (
                                            <span className="truncate">
                                                <span className="text-slate-400">•</span> {texts.school}:{' '}
                                                <span className="font-medium text-slate-700">{group.school}</span>
                                            </span>
                                        )}

                                        {group.institution_name && !group.school && (
                                            <span className="truncate">
                                                <span className="text-slate-400">•</span>{' '}
                                                <span className="font-medium text-slate-700">{group.institution_name}</span>
                                            </span>
                                        )}

                                        <span className="truncate">
                                            <span className="text-slate-400">•</span> {classSettingsText(lang, 'owner')}:{' '}
                                            <span className="font-medium text-slate-700">{group.owner_username}</span>
                                        </span>
                                    </div>
                                </div>

                                {/* Primary CTA */}
                                <div className="shrink-0 sm:self-center">
                                    <Link
                                        href={`${basePath}/${group.id}`}
                                        aria-label={classSettingsText(lang, 'open')}
                                        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2"
                                    >
                                        <span>{classSettingsText(lang, 'open')}</span>
                                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                    </Link>
                                </div>
                            </div>

                            {/* Tab shortcuts */}
                            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                                <Link
                                    href={`${basePath}/${group.id}?tab=students`}
                                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-emerald-700 focus-visible:outline-2"
                                >
                                    <Users className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                                    <span>{classSettingsText(lang, 'students')}</span>
                                </Link>
                                <Link
                                    href={`${basePath}/${group.id}?tab=tools`}
                                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-emerald-700 focus-visible:outline-2"
                                >
                                    <Wrench className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                                    <span>{classSettingsText(lang, 'toolsTab')}</span>
                                </Link>
                                <Link
                                    href={`${basePath}/${group.id}?tab=paths`}
                                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-emerald-700 focus-visible:outline-2"
                                >
                                    <Route className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                                    <span>{classSettingsText(lang, 'paths')}</span>
                                </Link>
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
