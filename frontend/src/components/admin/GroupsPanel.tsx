'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ChevronRight, Link2, Plus, Share2, Trash2, UserMinus, UserPlus, Users } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { learningText } from '@/lib/i18n-assignment-work';
import { apiFetch } from '@/lib/auth';
import { fetchInstitutions, type Institution } from '@/lib/referrals-api';
import { PlanStudentsPanel } from './PlanStudentsPanel';
import { GroupAssignments } from '../teacher/GroupAssignments';
import { useTeacherResource } from '../teacher/useTeacherResource';
import { TeacherForbidden } from '../teacher/TeacherAccess';
import { classGroupTexts as TEXTS } from '../teacher/class-group-texts';
import { parseClassGroups, type StudentGroup } from '../teacher/class-group-types';
import { ClassGroupEditor, ClassGroupEditorStatus } from '../teacher/ClassGroupEditor';
import { useClassGroupEditors } from '../teacher/useClassGroupEditors';
import { classLayoutText } from '@/lib/i18n-class-layout';
import { Button } from '@/components/ui/Button';
import { teacherLoadingText } from '@/lib/i18n-teacher-loading';
import { classSettingsText } from '@/lib/i18n-class-settings';


export function GroupsPanel() {
    const { lang, t } = useI18n();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const { data: groups, loading, failed, forbidden, reload: load } = useTeacherResource('/api/admin/groups', parseClassGroups);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [newSchool, setNewSchool] = useState('');
    const [newLevel, setNewLevel] = useState('');
    const [newInstitutionId, setNewInstitutionId] = useState('');
    const [institutions, setInstitutions] = useState<Institution[]>([]);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [openStudentsId, setOpenStudentsId] = useState<number | null>(null);
    const [origin, setOrigin] = useState('');
    const [botUsername, setBotUsername] = useState('');
    const [shares, setShares] = useState<Record<number, { id: number; shared_with_username: string }[]>>({});
    const [allUsers, setAllUsers] = useState<{ username: string; display_name: string; in_plans: boolean; in_groups: boolean; in_notes: boolean; in_research_contacts: boolean; research_contact_id: number | null }[]>([]);
    const [selectedShares, setSelectedShares] = useState<Record<number, Set<string>>>({});
    const [shareOpen, setShareOpen] = useState<number | null>(null);
    const editors = useClassGroupEditors(groups, load);
    const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
    const operationBusy = busy || editors.busy;

    useEffect(() => { setOrigin(window.location.origin); }, []);
    useEffect(() => {
        fetchInstitutions().then(setInstitutions).catch(() => setInstitutions([]));
    }, []);
    useEffect(() => {
        apiFetch('/api/telegram/bot-info')
            .then((res) => (res.ok ? res.json() : null))
            .then((info: { enabled: boolean; bot_username: string } | null) => {
                if (info?.enabled && info.bot_username) setBotUsername(info.bot_username);
            })
            .catch(() => { /* bot spento: nessun link Telegram */ });
    }, []);

    const loadShares = useCallback(async (groupId: number) => {
        const res = await apiFetch(`/api/admin/groups/${groupId}/shares`);
        if (res.ok) {
            const data: { id: number; shared_with_username: string }[] = await res.json();
            setShares((prev) => ({ ...prev, [groupId]: data }));
        }
    }, []);

    const loadUsers = useCallback(async () => {
        const res = await apiFetch('/api/admin/users-summary');
        if (res.ok) {
            const data: { users: { username: string; display_name: string; in_plans: boolean; in_groups: boolean; in_notes: boolean; in_research_contacts: boolean; research_contact_id: number | null }[] } = await res.json();
            setAllUsers(data.users);
        }
    }, []);

    const addShares = async (groupId: number) => {
        const selected = selectedShares[groupId];
        if (!selected || selected.size === 0) return;
        setBusy(true);
        setMessage('');
        try {
            let failed = false;
            for (const username of selected) {
                const res = await apiFetch(`/api/admin/groups/${groupId}/shares`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ shared_with_username: username }),
                });
                // 409 = gia' condivisa: non e' un errore da mostrare
                if (!res.ok && res.status !== 409) failed = true;
            }
            if (failed) setMessage(texts.shareError);
            setSelectedShares((prev) => ({ ...prev, [groupId]: new Set() }));
            await loadShares(groupId);
        } catch {
            setMessage(texts.shareError);
        } finally {
            setBusy(false);
        }
    };

    const removeShare = async (groupId: number, shareId: number) => {
        setBusy(true);
        try {
            await apiFetch(`/api/admin/groups/${groupId}/shares/${shareId}`, { method: 'DELETE' });
            await loadShares(groupId);
        } finally {
            setBusy(false);
        }
    };

    const toggleSelected = (groupId: number, username: string) => {
        setSelectedShares((prev) => {
            const current = prev[groupId] || new Set();
            const next = new Set(current);
            if (next.has(username)) {
                next.delete(username);
            } else {
                next.add(username);
            }
            return { ...prev, [groupId]: next };
        });
    };

    const toggleShare = (groupId: number) => {
        if (shareOpen === groupId) {
            setShareOpen(null);
        } else {
            setShareOpen(groupId);
            if (!shares[groupId]) loadShares(groupId);
            if (allUsers.length === 0) loadUsers();
            setSelectedShares((prev) => ({ ...prev, [groupId]: new Set() }));
        }
    };

    const copy = async (key: string, text: string) => {
        if (!navigator.clipboard) return;
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 1500);
    };

    const create = async () => {
        if (!groups || operationBusy || loading || !newName.trim()) return;
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
                    institution_id: newInstitutionId ? Number(newInstitutionId) : null,
                }),
            });
            if (!res.ok) throw new Error('create failed');
            setNewName('');
            setNewSchool('');
            setNewLevel('');
            setNewInstitutionId('');
            setCreating(false);
            load();
        } catch {
            setMessage(texts.error);
        } finally {
            setBusy(false);
        }
    };

    const toggleActive = async (group: StudentGroup) => {
        setBusy(true);
        try {
            const res = await apiFetch(`/api/admin/groups/${group.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !group.is_active }),
            });
            if (res.ok) load();
        } finally {
            setBusy(false);
        }
    };

    const remove = async (group: StudentGroup) => {
        setBusy(true);
        setMessage('');
        try {
            const res = await apiFetch(`/api/admin/groups/${group.id}`, { method: 'DELETE' });
            if (!res.ok) {
                const payload = await res.json().catch(() => null) as { detail?: string } | null;
                setMessage(payload?.detail || texts.error);
                return;
            }
            load();
        } finally {
            setBusy(false);
        }
    };

    const webLink = (group: StudentGroup) => `${origin}/gruppo?g=${group.code}`;
    const telegramLink = (group: StudentGroup) => `https://t.me/${botUsername}?start=g_${group.code}`;

    if (forbidden || editors.forbidden) return <TeacherForbidden />;

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
                    className="inline-flex min-h-11 items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    <Plus className="h-4 w-4" /> {texts.newGroup}
                </button>
            </div>

            {creating && (
                <div className="grid min-w-0 gap-3 rounded-md border border-slate-200 bg-white p-3 sm:grid-cols-2">
                    <label className="min-w-0 text-xs font-semibold text-slate-600">{classLayoutText(lang, 'name')}
                        <input
                            value={newName}
                            onChange={(event) => setNewName(event.target.value)}
                            placeholder={texts.namePlaceholder}
                            className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="min-w-0 text-xs font-semibold text-slate-600">{texts.school}
                        <input
                            value={newSchool}
                            onChange={(event) => setNewSchool(event.target.value)}
                            placeholder={texts.schoolPlaceholder}
                            className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                    </label>
                    <label className="min-w-0 text-xs font-semibold text-slate-600">{texts.levelLabel}
                        <select
                            value={newLevel}
                            onChange={(event) => setNewLevel(event.target.value)}
                            title={texts.levelHint}
                            aria-label={texts.levelLabel}
                            className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
                        >
                            <option value="">{texts.levelNone}</option>
                            <option value="secondaria">{texts.levelSecondaria}</option>
                            <option value="universita">{texts.levelUniversita}</option>
                            <option value="adulti">{texts.levelAdulti}</option>
                        </select>
                    </label>
                    <label className="min-w-0 text-xs font-semibold text-slate-600">{texts.institutionLabel}
                        <select
                            value={newInstitutionId}
                            onChange={(event) => setNewInstitutionId(event.target.value)}
                            title={texts.institutionHint}
                            aria-label={texts.institutionLabel}
                            className="mt-1 min-h-11 w-full min-w-0 rounded-md border border-slate-300 px-3 py-2 text-sm"
                        >
                            <option value="">{texts.institutionNone}</option>
                            {institutions.map((institution) => (
                                <option key={institution.id} value={String(institution.id)}>{institution.name}</option>
                            ))}
                        </select>
                    </label>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                        <button
                            type="button"
                            disabled={operationBusy || loading || !groups || !newName.trim()}
                            onClick={() => void create()}
                            className="min-h-11 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {texts.create}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setCreating(false); setNewName(''); setNewSchool(''); }}
                            className="min-h-11 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            {texts.cancel}
                        </button>
                    </div>
                </div>
            )}

            {message && <p className="text-sm text-red-600">{message}</p>}
            {loading && <p role="status" className="text-sm text-slate-500">{t('common.loading')}</p>}
            {failed && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-600">
                <p>{teacherLoadingText(lang, 'classes')}</p>
                <button type="button" disabled={loading} onClick={() => void load()}
                    className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{t('setup.retry')}</button>
            </div>}
            {!loading && !failed && groups?.length === 0 && <p className="text-sm text-slate-500">{texts.empty}</p>}

            <div className="space-y-3">
                {(groups || []).map((group) => (
                    <section key={group.id} className={`min-w-0 rounded-md border border-slate-200 bg-white p-4 ${group.is_active ? '' : 'opacity-60'}`}>
                        <div className="min-w-0">
                            <h3 className="font-bold text-slate-800">
                                <button id={`class-toggle-${group.id}`} type="button" aria-expanded={!collapsed[group.id]} aria-controls={`class-body-${group.id}`}
                                    aria-label={group.name}
                                    title={classLayoutText(lang, collapsed[group.id] ? 'expand' : 'collapse')}
                                    onClick={event => {
                                        if (!collapsed[group.id] && document.getElementById(`class-body-${group.id}`)?.contains(document.activeElement)) event.currentTarget.focus();
                                        setCollapsed(previous => ({ ...previous, [group.id]: !previous[group.id] }));
                                    }}
                                    className="flex min-h-11 w-full min-w-0 items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2">
                                    {collapsed[group.id] ? <ChevronRight className="h-5 w-5 shrink-0" aria-hidden /> : <ChevronDown className="h-5 w-5 shrink-0" aria-hidden />}
                                    <span className="min-w-0 break-words">{group.name}</span>
                                </button>
                            </h3>
                            <Link href={`/docente/classi/${group.id}`} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-indigo-700">{classSettingsText(lang, 'open')}</Link>
                            <p className="break-words text-xs text-slate-500">
                                {!group.is_active && <span>{texts.inactive}{' - '}</span>}
                                {group.members_count} {texts.members}{' - '}{group.owner_username}
                                {group.school ? ` - ${texts.school}: ${group.school}` : ''}
                            </p>
                            <ClassGroupEditorStatus groupId={group.id} editors={editors} disabled={operationBusy}
                                onRetrySuccess={() => requestAnimationFrame(() => document.getElementById(collapsed[group.id] ? `class-toggle-${group.id}` : `group-save-${group.id}`)?.focus())} />
                        </div>
                        <div id={`class-body-${group.id}`} hidden={!!collapsed[group.id]} className="mt-3 min-w-0">
                            <ClassGroupEditor group={group} institutions={institutions} editors={editors} disabled={operationBusy} showStatus={false} />
                            <div className="mt-4 border-t border-slate-200 pt-3">
                                <p className="break-words text-xs text-slate-500">{texts.code}: <span className="font-mono font-semibold text-slate-600">{group.code}</span></p>
                                {origin && (
                                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                                        <input readOnly value={webLink(group)} className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700" />
                                        <button
                                            type="button"
                                            onClick={() => void copy(`web-${group.id}`, webLink(group))}
                                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                        >
                                            {copiedKey === `web-${group.id}` ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                                            {texts.webLink}
                                        </button>
                                    </div>
                                )}

                                {botUsername && (
                                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                                        <input readOnly value={telegramLink(group)} className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700" />
                                        <button
                                            type="button"
                                            onClick={() => void copy(`tg-${group.id}`, telegramLink(group))}
                                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                                        >
                                            {copiedKey === `tg-${group.id}` ? <Check className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
                                            {texts.telegramLink}
                                        </button>
                                    </div>
                                )}
                                <p className="mt-2 text-xs text-slate-500">{learningText(lang, 'groupVisibility')}</p>

                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => toggleShare(group.id)}
                                        className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                                    >
                                        <Share2 className="h-3.5 w-3.5" />
                                        {texts.shareTitle}
                                        {shares[group.id]?.length ? ` (${shares[group.id].length})` : ''}
                                    </button>
                                </div>

                                {shareOpen === group.id && (
                                    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                                        <p className="mb-2 text-xs font-semibold text-slate-500">{texts.shareSelectUsers}</p>
                                        <div className="max-h-40 space-y-1 overflow-y-auto">
                                            {allUsers
                                                .filter((u) => u.in_research_contacts || u.in_plans || u.in_groups || u.in_notes)
                                                .filter((u) => u.username !== group.owner_username)
                                                .map((user) => {
                                                    const alreadyShared = shares[group.id]?.some((s) => s.shared_with_username === user.username);
                                                    const selected = selectedShares[group.id]?.has(user.username) ?? false;
                                                    return (
                                                        <label key={user.username} className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-white">
                                                            <input
                                                                type="checkbox"
                                                                checked={selected}
                                                                disabled={operationBusy || !!alreadyShared}
                                                                onChange={() => toggleSelected(group.id, user.username)}
                                                                className="accent-indigo-600"
                                                            />
                                                            <span className="flex-1 text-slate-700">
                                                                {user.display_name}
                                                                <span className="ml-1 text-2xs text-slate-500">{user.username}</span>
                                                            </span>
                                                            {alreadyShared && (
                                                                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-2xs font-medium text-slate-500">
                                                                    {texts.shareAlreadyShared}
                                                                </span>
                                                            )}
                                                        </label>
                                                    );
                                                })}
                                            {allUsers.filter((u) => u.in_research_contacts || u.in_plans || u.in_groups || u.in_notes).length === 0 && (
                                                <p className="text-xs text-slate-500">{texts.shareNoUsers}</p>
                                            )}
                                        </div>
                                        <div className="mt-3 flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                disabled={operationBusy || !selectedShares[group.id]?.size}
                                                onClick={() => void addShares(group.id)}
                                                className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                                            >
                                                <UserPlus className="h-3.5 w-3.5" />
                                                {texts.shareBtn}
                                            </button>
                                        </div>
                                        {shares[group.id]?.length > 0 && (
                                            <div className="mt-3">
                                                <p className="mb-1 text-xs font-semibold text-slate-500">{texts.sharedWith}</p>
                                                <div className="space-y-1">
                                                    {shares[group.id]?.map((share) => (
                                                        <div key={share.id} className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 text-xs">
                                                            <span className="text-slate-700">
                                                                {allUsers.find((u) => u.username === share.shared_with_username)?.display_name || share.shared_with_username}
                                                                <span className="ml-1 text-2xs text-slate-500">{share.shared_with_username}</span>
                                                            </span>
                                                            <button
                                                                type="button"
                                                                disabled={operationBusy}
                                                                onClick={() => void removeShare(group.id, share.id)}
                                                                className="inline-flex items-center gap-1 text-red-500 hover:text-red-700"
                                                            >
                                                                <UserMinus className="h-3.5 w-3.5" />
                                                                {texts.removeShare}
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {(!shares[group.id] || shares[group.id].length === 0) && (
                                            <p className="mt-2 text-xs text-slate-500">{texts.noShares}</p>
                                        )}
                                    </div>
                                )}

                                <Button type="button" variant="secondary" className="mt-3"
                                    onClick={() => setOpenStudentsId(openStudentsId === group.id ? null : group.id)}>
                                    <Users className="h-4 w-4" aria-hidden /> {texts.students}
                                </Button>

                                {openStudentsId === group.id && (
                                    <PlanStudentsPanel base={`/api/admin/groups/${group.id}`} withNotes />
                                )}

                                <GroupAssignments groupName={group.name} />
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Button type="button" variant="secondary" disabled={operationBusy} onClick={() => void toggleActive(group)}>
                                        {group.is_active ? texts.deactivate : texts.activate}
                                    </Button>
                                    <Button type="button" variant="danger" disabled={operationBusy} onClick={() => void remove(group)}>
                                        <Trash2 className="h-4 w-4" aria-hidden /> {texts.deleteGroup}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}
