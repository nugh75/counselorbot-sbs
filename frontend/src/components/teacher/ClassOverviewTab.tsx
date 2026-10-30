'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
    AlertTriangle,
    ArrowRight,
    Check,
    Copy,
    FileText,
    MessageSquare,
    Pencil,
    Power,
    Route,
    Share2,
    Trash2,
    UserMinus,
    UserPlus,
    Users,
    Wrench,
} from 'lucide-react';
import { apiFetch, isLocalAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { publicOrigin } from '@/lib/runtime-config';
import { classSettingsText, type classSettingsTexts } from '@/lib/i18n-class-settings';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { learningText } from '@/lib/i18n-assignment-work';
import { fetchTeacherInstitutions, type Institution } from '@/lib/referrals-api';
import { ADMIN_CLASSES_HREF } from '@/lib/admin-navigation';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { getClassCoverUrl } from '@/lib/class-cover-presets';
import { ClassImageModal } from './ClassImageModal';
import { ClassPairingSection } from './ClassPairingSection';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { StudentGroup } from './class-group-types';
import type { ClassSettings } from '@/lib/class-settings';

type TextKey = keyof typeof classSettingsTexts;

interface GroupShare {
    id: number;
    shared_with_username: string;
}

interface UserSummaryItem {
    username: string;
    display_name: string;
    in_plans?: boolean;
    in_groups?: boolean;
    in_notes?: boolean;
    in_research_contacts?: boolean;
    research_contact_id?: number | null;
}

export interface ClassOverviewTabProps {
    group: StudentGroup;
    settings: ClassSettings;
    onReload: () => void | Promise<void>;
    onSelectTab: (tab: 'students' | 'toolsTab' | 'paths' | 'forum') => void;
    admin: boolean;
    adminRoute: boolean;
}

export function ClassOverviewTab({
    group,
    settings,
    onReload,
    onSelectTab,
    adminRoute,
}: ClassOverviewTabProps) {
    const router = useRouter();
    const { lang, t } = useI18n();
    const l = (key: TextKey) => classSettingsText(lang, key);

    // Clipboard and platform info
    const [botUsername, setBotUsername] = useState('');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    // Colleagues sharing state
    const [shares, setShares] = useState<GroupShare[]>([]);
    const [allUsers, setAllUsers] = useState<UserSummaryItem[]>([]);
    const [sharesLoading, setSharesLoading] = useState(false);
    const [shareBusy, setShareBusy] = useState(false);
    const [selectedUserToAdd, setSelectedUserToAdd] = useState('');
    const [shareMessage, setShareMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

    // Class details (Anagrafica) state
    const [institutions, setInstitutions] = useState<Institution[]>([]);
    const [name, setName] = useState(group.name);
    const [school, setSchool] = useState(group.school ?? '');
    const [schoolLevel, setSchoolLevel] = useState(group.school_level ?? '');
    const [institutionId, setInstitutionId] = useState(group.institution_id ? String(group.institution_id) : '');
    const [description, setDescription] = useState(group.description ?? '');
    const [methodologies, setMethodologies] = useState(group.methodologies ?? '');
    const [visible, setVisible] = useState(group.context_visible_to_students);
    const [saveBusy, setSaveBusy] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'error' | null>(null);
    const [saveError, setSaveError] = useState('');
    const [showCoverModal, setShowCoverModal] = useState(false);

    // Status & Deletion state
    const [statusBusy, setStatusBusy] = useState(false);
    const [statusError, setStatusError] = useState('');
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const deleteDialogRef = useRef<HTMLDialogElement>(null);

    // Initial setup: bot info, institutions, shares, users
    useEffect(() => {
        let active = true;
        apiFetch('/api/telegram/bot-info')
            .then(res => (res.ok ? res.json() : null))
            .then((info: { enabled: boolean; bot_username: string } | null) => {
                if (active && info?.enabled && info.bot_username) {
                    setBotUsername(info.bot_username);
                }
            })
            .catch(() => {});
        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        let active = true;
        fetchTeacherInstitutions()
            .then(list => {
                if (active) setInstitutions(list);
            })
            .catch(() => {
                if (active) setInstitutions([]);
            });
        return () => {
            active = false;
        };
    }, []);

    const loadShares = useCallback(async () => {
        setSharesLoading(true);
        try {
            const res = await apiFetch(`/api/admin/groups/${group.id}/shares`);
            if (res.ok) {
                const data = await res.json();
                setShares(Array.isArray(data) ? data : []);
            }
        } catch {
            // non-fatal
        } finally {
            setSharesLoading(false);
        }
    }, [group.id]);

    const loadUsers = useCallback(async () => {
        try {
            const res = await apiFetch('/api/admin/users-summary');
            if (res.ok) {
                const data = await res.json();
                const list = data?.users || (Array.isArray(data) ? data : []);
                setAllUsers(list);
            }
        } catch {
            // non-fatal
        }
    }, []);

    useEffect(() => {
        void loadShares();
        void loadUsers();
    }, [loadShares, loadUsers]);

    // Track dirty state of class details
    const isDirty =
        name.trim() !== (group.name ?? '').trim() ||
        school.trim() !== (group.school ?? '').trim() ||
        (schoolLevel || null) !== (group.school_level || null) ||
        (institutionId ? Number(institutionId) : null) !== (group.institution_id || null) ||
        description.trim() !== (group.description ?? '').trim() ||
        methodologies.trim() !== (group.methodologies ?? '').trim() ||
        visible !== group.context_visible_to_students;

    useDraftGuard(isDirty, l('discard'), { blocked: saveBusy });

    // Sync form when group changes externally and user has not typed unsaved edits
    useEffect(() => {
        if (!isDirty) {
            setName(group.name);
            setSchool(group.school ?? '');
            setSchoolLevel(group.school_level ?? '');
            setInstitutionId(group.institution_id ? String(group.institution_id) : '');
            setDescription(group.description ?? '');
            setMethodologies(group.methodologies ?? '');
            setVisible(group.context_visible_to_students);
        }
    }, [group, isDirty]);

    // Copy to clipboard helper
    const copy = async (key: string, text: string) => {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            try {
                await navigator.clipboard.writeText(text);
                setCopiedKey(key);
                setTimeout(() => setCopiedKey(null), 1500);
            } catch {
                // Ignore clipboard failure
            }
        }
    };

    // Add colleague share
    const handleAddShare = async () => {
        if (!selectedUserToAdd || shareBusy) return;
        setShareBusy(true);
        setShareMessage(null);
        try {
            const res = await apiFetch(`/api/admin/groups/${group.id}/shares`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shared_with_username: selectedUserToAdd }),
            });
            if (!res.ok && res.status !== 409) {
                throw new Error('share failed');
            }
            setSelectedUserToAdd('');
            await loadShares();
        } catch {
            setShareMessage({ kind: 'error', text: l('shareError') });
        } finally {
            setShareBusy(false);
        }
    };

    // Remove colleague share
    const handleRemoveShare = async (shareId: number) => {
        setShareBusy(true);
        setShareMessage(null);
        try {
            const res = await apiFetch(`/api/admin/groups/${group.id}/shares/${shareId}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('delete share failed');
            await loadShares();
        } catch {
            setShareMessage({ kind: 'error', text: l('shareError') });
        } finally {
            setShareBusy(false);
        }
    };

    // Discard unsaved anagrafica changes
    const handleDiscard = () => {
        setName(group.name);
        setSchool(group.school ?? '');
        setSchoolLevel(group.school_level ?? '');
        setInstitutionId(group.institution_id ? String(group.institution_id) : '');
        setDescription(group.description ?? '');
        setMethodologies(group.methodologies ?? '');
        setVisible(group.context_visible_to_students);
        setSaveStatus(null);
        setSaveError('');
    };

    // Save anagrafica
    const handleSave = async () => {
        if (!name.trim()) {
            setSaveError(l('classNameRequired'));
            setSaveStatus('error');
            return;
        }
        setSaveBusy(true);
        setSaveStatus(null);
        setSaveError('');
        try {
            const res = await apiFetch(`/api/admin/groups/${group.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    school: school.trim() || null,
                    school_level: schoolLevel || null,
                    institution_id: institutionId ? Number(institutionId) : null,
                    description: description.trim() || null,
                    methodologies: methodologies.trim() || null,
                    context_visible_to_students: visible,
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null) as { detail?: string } | null;
                throw new Error(data?.detail || l('classSaveError'));
            }
            setSaveStatus('saved');
            await onReload();
        } catch (err: unknown) {
            setSaveStatus('error');
            setSaveError(err instanceof Error ? err.message : l('classSaveError'));
        } finally {
            setSaveBusy(false);
        }
    };

    // Toggle active status
    const handleToggleActive = async () => {
        setStatusBusy(true);
        setStatusError('');
        try {
            const res = await apiFetch(`/api/admin/groups/${group.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !group.is_active }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null) as { detail?: string } | null;
                throw new Error(data?.detail || l('error'));
            }
            await onReload();
        } catch (err: unknown) {
            setStatusError(err instanceof Error ? err.message : l('error'));
        } finally {
            setStatusBusy(false);
        }
    };

    // Delete class
    const handleDeleteClass = async () => {
        setStatusBusy(true);
        setDeleteError('');
        try {
            const res = await apiFetch(`/api/admin/groups/${group.id}`, {
                method: 'DELETE',
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null) as { detail?: string } | null;
                if (res.status === 409) {
                    setDeleteError(data?.detail || l('deleteClassHasPlansError'));
                } else {
                    setDeleteError(data?.detail || l('error'));
                }
                return;
            }
            deleteDialogRef.current?.close();
            setShowDeleteDialog(false);
            router.push(adminRoute ? ADMIN_CLASSES_HREF : '/docente/classi');
        } catch (err: unknown) {
            setDeleteError(err instanceof Error ? err.message : l('error'));
        } finally {
            setStatusBusy(false);
        }
    };

    // Manage delete dialog modal state
    useEffect(() => {
        if (showDeleteDialog && deleteDialogRef.current && !deleteDialogRef.current.open) {
            deleteDialogRef.current.showModal();
        }
    }, [showDeleteDialog]);

    // Available users to share with
    const availableUsers = allUsers
        .filter(u => u.username !== group.owner_username)
        .filter(u => !shares.some(s => s.shared_with_username === u.username))
        .sort((a, b) => (a.display_name || a.username).localeCompare(b.display_name || b.username));

    // Tools counts for quick links
    const nonAlwaysOnTools = settings.tools.filter(tool => !tool.always_on);
    const enabledToolsCount = nonAlwaysOnTools.filter(
        tool => tool.admin_enabled && !settings.disabled_tool_keys.includes(tool.key)
    ).length;

    const shareOrigin = publicOrigin();
    // Nascondi il link web se non c'e' un'origine pubblica (tunnel non attivo in desktop).
    // Telegram non dipende dal tunnel, quindi resta visibile se botUsername e' impostato.
    const webLink = shareOrigin ? `${shareOrigin}/gruppo?g=${group.code}` : '';
    const telegramLink = botUsername ? `https://t.me/${botUsername}?start=g_${group.code}` : '';
    const showWebLink = !!webLink;

    return (
        <div className="space-y-6">
            {/* 1. Quick Links verso le altre tab dell'Hub */}
            <section aria-labelledby="class-overview-quicklinks-heading">
                <h2 id="class-overview-quicklinks-heading" className="sr-only">
                    {l('quickLinksTitle')}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Studenti iscritti */}
                    <button
                        type="button"
                        onClick={() => onSelectTab('students')}
                        className="group flex flex-col justify-between rounded-card border border-line bg-surface p-4 text-left shadow-card transition hover:border-brand-line hover:shadow-card"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-ink-body">{l('enrolledStudents')}</span>
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-link group-hover:bg-brand-soft">
                                <Users className="h-4 w-4" aria-hidden />
                            </span>
                        </div>
                        <div className="mt-4 flex items-baseline gap-2">
                            <span className="text-2xl font-semibold text-ink">{group.members_count}</span>
                            <span className="text-xs text-ink-muted">{l('members')}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-link group-hover:underline">
                            {l('goToStudents')} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </div>
                    </button>

                    {/* Strumenti abilitati */}
                    <button
                        type="button"
                        onClick={() => onSelectTab('toolsTab')}
                        className="group flex flex-col justify-between rounded-card border border-line bg-surface p-4 text-left shadow-card transition hover:border-brand-line hover:shadow-card"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-ink-body">{l('enabledTools')}</span>
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-link group-hover:bg-brand-soft">
                                <Wrench className="h-4 w-4" aria-hidden />
                            </span>
                        </div>
                        <div className="mt-4 flex items-baseline gap-2">
                            <span className="text-2xl font-semibold text-ink">{enabledToolsCount}</span>
                            <span className="text-sm text-ink-muted">/ {nonAlwaysOnTools.length}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-link group-hover:underline">
                            {l('goToTools')} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </div>
                    </button>

                    {/* Percorsi didattici */}
                    <button
                        type="button"
                        onClick={() => onSelectTab('paths')}
                        className="group flex flex-col justify-between rounded-card border border-line bg-surface p-4 text-left shadow-card transition hover:border-brand-line hover:shadow-card"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-ink-body">{l('classPaths')}</span>
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-link group-hover:bg-brand-soft">
                                <Route className="h-4 w-4" aria-hidden />
                            </span>
                        </div>
                        <div className="mt-4">
                            <p className="line-clamp-2 text-xs text-ink-muted">{l('classPathsDesc')}</p>
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-link group-hover:underline">
                            {l('goToPaths')} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </div>
                    </button>

                    {/* Forum di classe */}
                    <button
                        type="button"
                        onClick={() => onSelectTab('forum')}
                        className="group flex flex-col justify-between rounded-card border border-line bg-surface p-4 text-left shadow-card transition hover:border-brand-line hover:shadow-card"
                    >
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-ink-body">{l('classForum')}</span>
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-link group-hover:bg-brand-soft">
                                <MessageSquare className="h-4 w-4" aria-hidden />
                            </span>
                        </div>
                        <div className="mt-4">
                            <p className="line-clamp-2 text-xs text-ink-muted">{l('classForumDesc')}</p>
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-link group-hover:underline">
                            {l('goToForum')} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </div>
                    </button>
                </div>
            </section>

            {/* 2. Invito Studenti */}
            {isLocalAuth() ? <ClassPairingSection groupId={group.id} /> : <Card>
                <section aria-labelledby="class-invitation-heading" className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
                        <div>
                            <h2 id="class-invitation-heading" className="flex items-center gap-2 text-lg font-semibold text-ink">
                                <UserPlus className="h-5 w-5 text-link" aria-hidden />
                                {l('inviteStudentsTitle')}
                            </h2>
                            <p className="mt-1 text-xs text-ink-muted">{l('inviteStudentsHint')}</p>
                        </div>
                    </div>

                    {/* Codice classe in evidenza */}
                    <div className="rounded-card border border-brand-line bg-brand-soft/50 p-4">
                        <span className="text-xs font-semibold text-ink">{l('classCode')}</span>
                        <div className="mt-1 flex flex-wrap items-center justify-between gap-4">
                            <span className="font-mono tracking-widest text-2xl font-semibold text-ink sm:text-3xl">
                                {group.code}
                            </span>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => void copy('code', group.code)}
                                className="inline-flex items-center gap-2"
                            >
                                {copiedKey === 'code' ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                                {copiedKey === 'code' ? l('copied') : l('copyCode')}
                            </Button>
                        </div>
                    </div>

                    {/* Link di iscrizione Web & Telegram */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {showWebLink ? (
                            <div className="space-y-2">
                                <label htmlFor="overview-weblink" className="text-xs font-semibold text-ink-body">
                                    {l('webLink')}
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        id="overview-weblink"
                                        readOnly
                                        value={webLink}
                                        className="min-h-[44px] flex-1 rounded-control border border-line-strong bg-surface-sunken px-4 font-mono text-xs text-ink-body focus:outline-hidden"
                                    />
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() => void copy('web', webLink)}
                                        aria-label={l('copyWebLink')}
                                        className="shrink-0"
                                    >
                                        {copiedKey === 'web' ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                                        <span className="hidden sm:inline">{copiedKey === 'web' ? l('copied') : l('copy')}</span>
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-ink-body">{l('webLink')}</label>
                                <p className="text-xs text-warning">{l('tunnelInactive')}</p>
                            </div>
                        )}

                        {botUsername && (
                            <div className="space-y-2">
                                <label htmlFor="overview-telegramlink" className="text-xs font-semibold text-ink-body">
                                    {l('telegramLink')}
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        id="overview-telegramlink"
                                        readOnly
                                        value={telegramLink}
                                        className="min-h-[44px] flex-1 rounded-control border border-line-strong bg-surface-sunken px-4 font-mono text-xs text-ink-body focus:outline-hidden"
                                    />
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        onClick={() => void copy('tg', telegramLink)}
                                        aria-label={l('copyTelegramLink')}
                                        className="shrink-0"
                                    >
                                        {copiedKey === 'tg' ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                                        <span className="hidden sm:inline">{copiedKey === 'tg' ? l('copied') : l('copy')}</span>
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>

                    <p className="text-xs text-ink-muted">
                        {learningText(lang, 'groupVisibility')}
                    </p>
                </section>
            </Card>}

            {/* 3. Condivisione con Colleghi */}
            <Card>
                <section aria-labelledby="class-sharing-heading" className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
                        <div>
                            <h2 id="class-sharing-heading" className="flex items-center gap-2 text-lg font-semibold text-ink">
                                <Share2 className="h-5 w-5 text-link" aria-hidden />
                                {l('shareWithColleagues')}
                            </h2>
                            <p className="mt-1 text-xs text-ink-muted">{l('shareHint')}</p>
                        </div>
                        <span className="rounded-full bg-surface-raised px-2 py-1 text-xs font-semibold text-ink-muted">
                            {l('owner')}: <span className="font-semibold text-ink">@{group.owner_username}</span>
                        </span>
                    </div>

                    {/* Form aggiunta collega */}
                    <div className="space-y-2 rounded-lg border border-line bg-surface-sunken/60 p-4">
                        <label htmlFor="overview-share-select" className="block text-xs font-semibold text-ink-body">
                            {l('addColleague')}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            <select
                                id="overview-share-select"
                                value={selectedUserToAdd}
                                onChange={e => setSelectedUserToAdd(e.target.value)}
                                disabled={shareBusy}
                                className="min-h-[44px] min-w-[200px] flex-1 rounded-control border border-line-strong bg-surface px-4 text-sm text-ink"
                            >
                                <option value="">{l('selectColleague')}</option>
                                {availableUsers.map(user => (
                                    <option key={user.username} value={user.username}>
                                        {user.display_name} (@{user.username})
                                    </option>
                                ))}
                            </select>
                            <Button
                                type="button"
                                disabled={shareBusy || !selectedUserToAdd}
                                onClick={() => void handleAddShare()}
                                className="inline-flex items-center gap-2"
                            >
                                <UserPlus className="h-4 w-4" />
                                {l('shareBtn')}
                            </Button>
                        </div>
                        {shareMessage && (
                            <p className={`text-xs ${shareMessage.kind === 'error' ? 'text-danger' : 'text-success'}`}>
                                {shareMessage.text}
                            </p>
                        )}
                    </div>

                    {/* Elenco condivisioni attive */}
                    <div className="space-y-2">
                        <h3 className="text-xs font-semibold text-ink-muted">{l('sharedWith')}</h3>
                        {sharesLoading ? (
                            <p className="text-xs text-ink-muted">{t('common.loading')}</p>
                        ) : shares.length === 0 ? (
                            <p className="rounded-control border border-dashed border-line p-4 text-center text-xs text-ink-muted">
                                {l('noShares')}
                            </p>
                        ) : (
                            <div className="divide-y divide-line rounded-lg border border-line bg-surface">
                                {shares.map(share => {
                                    const user = allUsers.find(u => u.username === share.shared_with_username);
                                    return (
                                        <div key={share.id} className="flex items-center justify-between p-4 text-sm">
                                            <div>
                                                <span className="font-semibold text-ink">
                                                    {user?.display_name || share.shared_with_username}
                                                </span>
                                                <span className="ml-2 font-mono text-xs text-ink-muted">
                                                    @{share.shared_with_username}
                                                </span>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                disabled={shareBusy}
                                                onClick={() => void handleRemoveShare(share.id)}
                                                className="inline-flex items-center gap-1 text-xs text-danger hover:text-danger"
                                            >
                                                <UserMinus className="h-3.5 w-3.5" />
                                                {l('removeShare')}
                                            </Button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </section>
            </Card>

            {/* 4. Anagrafica & Informazioni di Classe */}
            <Card>
                <section aria-labelledby="class-details-heading" className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
                        <div>
                            <h2 id="class-details-heading" className="flex items-center gap-2 text-lg font-semibold text-ink">
                                <FileText className="h-5 w-5 text-link" aria-hidden />
                                {l('classDetailsTitle')}
                            </h2>
                            <p className="mt-1 text-xs text-ink-muted">{l('classDetailsHint')}</p>
                        </div>
                        {isDirty && (
                            <span className="rounded-full bg-warning-soft px-2 py-1 text-xs font-semibold text-warning-ink">
                                {l('dirty')}
                            </span>
                        )}
                    </div>

                    {/* Copertina 16:9 della classe */}
                    <div className="flex flex-col gap-4 rounded-card border border-line/90 bg-surface-sunken/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                            <div className="relative aspect-[16/9] h-16 sm:h-20 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-raised shadow-card">
                                <Image
                                    src={getClassCoverUrl(group)}
                                    alt={group.name}
                                    fill
                                    unoptimized
                                    className="object-cover"
                                />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-ink">
                                    {teacherAreaText(lang, 'classCoverModalTitle')}
                                </h3>
                                <p className="mt-1 text-xs text-ink-muted">
                                    {teacherAreaText(lang, 'classCoverModalSubtitle')}
                                </p>
                            </div>
                        </div>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setShowCoverModal(true)}
                            className="inline-flex min-h-[44px] shrink-0 items-center gap-2 self-start sm:self-auto"
                        >
                            <Pencil className="h-4 w-4" aria-hidden />
                            <span>{teacherAreaText(lang, 'classCoverChange')}</span>
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {/* Nome classe */}
                        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-body">
                            {l('className')} *
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                disabled={saveBusy}
                                required
                                className="min-h-[44px] rounded-control border border-line-strong bg-surface px-4 py-2 text-sm text-ink"
                            />
                        </label>

                        {/* Scuola */}
                        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-body">
                            {l('school')}
                            <input
                                type="text"
                                value={school}
                                onChange={e => setSchool(e.target.value)}
                                disabled={saveBusy}
                                placeholder={l('schoolPlaceholder')}
                                className="min-h-[44px] rounded-control border border-line-strong bg-surface px-4 py-2 text-sm text-ink"
                            />
                        </label>

                        {/* Grado / Livello scolastico */}
                        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-body">
                            {l('schoolLevel')}
                            <select
                                value={schoolLevel}
                                onChange={e => setSchoolLevel(e.target.value)}
                                disabled={saveBusy}
                                className="min-h-[44px] rounded-control border border-line-strong bg-surface px-4 py-2 text-sm text-ink"
                            >
                                <option value="">{l('levelNone')}</option>
                                <option value="secondaria">{l('levelSecondaria')}</option>
                                <option value="universita">{l('levelUniversita')}</option>
                                <option value="adulti">{l('levelAdulti')}</option>
                            </select>
                        </label>

                        {/* Istituto */}
                        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-body">
                            {l('partnerInstitution')}
                            <select
                                value={institutionId}
                                onChange={e => setInstitutionId(e.target.value)}
                                disabled={saveBusy}
                                className="min-h-[44px] rounded-control border border-line-strong bg-surface px-4 py-2 text-sm text-ink"
                            >
                                <option value="">{l('institutionNone')}</option>
                                {group.institution_id && !institutions.some(row => row.id === group.institution_id) && (
                                    <option value={group.institution_id}>{group.institution_name ?? l('partnerInstitution')}</option>
                                )}
                                {institutions.map(inst => (
                                    <option key={inst.id} value={String(inst.id)}>
                                        {inst.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {/* Descrizione classe */}
                        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-body sm:col-span-2">
                            {l('description')}
                            <textarea
                                rows={3}
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                disabled={saveBusy}
                                placeholder={l('descriptionPlaceholder')}
                                className="rounded-control border border-line-strong bg-surface px-4 py-2 text-sm text-ink"
                            />
                        </label>

                        {/* Metodologie */}
                        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-body sm:col-span-2">
                            {l('methodologies')}
                            <textarea
                                rows={3}
                                value={methodologies}
                                onChange={e => setMethodologies(e.target.value)}
                                disabled={saveBusy}
                                placeholder={l('methodologiesPlaceholder')}
                                className="rounded-control border border-line-strong bg-surface px-4 py-2 text-sm text-ink"
                            />
                        </label>

                        {/* Visibilità contesto per studenti */}
                        <label className="flex min-h-[44px] items-center gap-4 text-xs text-ink-body sm:col-span-2">
                            <input
                                type="checkbox"
                                checked={visible}
                                onChange={e => setVisible(e.target.checked)}
                                disabled={saveBusy}
                                className="h-4 w-4 rounded-xs border-line-strong text-link focus:ring-focus"
                            />
                            <span>{l('shareContextToStudents')}</span>
                        </label>
                    </div>

                    {/* Barra azioni salvataggio */}
                    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-4">
                        <div className="min-w-0 flex-1 text-sm">
                            {saveStatus === 'saved' && (
                                <p role="status" className="font-semibold text-success">
                                    {l('classSaved')}
                                </p>
                            )}
                            {saveStatus === 'error' && (
                                <p role="alert" className="font-semibold text-danger">
                                    {saveError || l('classSaveError')}
                                </p>
                            )}
                            {isDirty && saveStatus === null && (
                                <p className="text-xs text-ink-muted">{l('dirty')}</p>
                            )}
                        </div>
                        <div className="flex gap-2">
                            {isDirty && (
                                <Button
                                    type="button"
                                    variant="secondary"
                                    disabled={saveBusy}
                                    onClick={handleDiscard}
                                >
                                    {l('cancel')}
                                </Button>
                            )}
                            <Button
                                type="button"
                                disabled={saveBusy || !isDirty || !name.trim()}
                                onClick={() => void handleSave()}
                            >
                                {saveBusy ? l('saving') : l('save')}
                            </Button>
                        </div>
                    </div>
                </section>
            </Card>

            {/* 5. Stato della Classe & Azioni */}
            <Card>
                <section aria-labelledby="class-status-heading" className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
                        <div>
                            <h2 id="class-status-heading" className="flex items-center gap-2 text-lg font-semibold text-ink">
                                <Power className="h-5 w-5 text-link" aria-hidden />
                                {l('classStatusTitle')}
                            </h2>
                            <p className="mt-1 text-xs text-ink-muted">
                                {group.is_active ? l('classStatusActiveHelp') : l('classStatusInactiveHelp')}
                            </p>
                        </div>
                        <span
                            className={`inline-flex items-center gap-2 rounded-full px-4 py-1 text-xs font-semibold ${
                                group.is_active
                                    ? 'border border-success-line bg-success-soft text-success'
                                    : 'border border-line bg-surface-raised text-ink-muted'
                            }`}
                        >
                            <span
                                className={`h-2 w-2 rounded-full ${
                                    group.is_active ? 'bg-success' : 'bg-line-strong'
                                }`}
                            />
                            {group.is_active ? l('classStatusActive') : l('classStatusInactive')}
                        </span>
                    </div>

                    {statusError && (
                        <p className="text-xs font-semibold text-danger">{statusError}</p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                        <div className="space-y-1">
                            <p className="text-sm font-semibold text-ink">
                                {group.is_active ? l('deactivateClass') : l('activateClass')}
                            </p>
                            <p className="max-w-xl text-xs text-ink-muted">
                                {group.is_active ? l('deactivateClassDesc') : l('activateClassDesc')}
                            </p>
                        </div>
                        <Button
                            type="button"
                            variant="secondary"
                            disabled={statusBusy}
                            onClick={() => void handleToggleActive()}
                        >
                            {group.is_active ? l('deactivate') : l('activate')}
                        </Button>
                    </div>

                    {/* Danger Zone: Cancellazione */}
                    <div className="mt-4 rounded-card border border-danger-line bg-danger-soft/50 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="space-y-1">
                                <h3 className="flex items-center gap-2 text-sm font-semibold text-danger-ink">
                                    <Trash2 className="h-4 w-4 text-danger" />
                                    {l('deleteClass')}
                                </h3>
                                <p className="max-w-xl text-xs text-danger">
                                    {l('deleteClassWarning')}
                                </p>
                                {deleteError && (
                                    <p className="mt-1 text-xs font-semibold text-danger">
                                        {deleteError}
                                    </p>
                                )}
                            </div>
                            <Button
                                type="button"
                                variant="danger"
                                disabled={statusBusy}
                                onClick={() => {
                                    setDeleteError('');
                                    setShowDeleteDialog(true);
                                }}
                            >
                                {l('deleteClass')}
                            </Button>
                        </div>
                    </div>

                    {/* Dialog modale di conferma cancellazione */}
                    {showDeleteDialog && (
                        <dialog
                            ref={deleteDialogRef}
                            className="fixed inset-0 z-50 m-auto max-w-md rounded-card border border-line bg-surface p-6 shadow-modal backdrop:bg-slate-900/40"
                            onCancel={() => setShowDeleteDialog(false)}
                        >
                            <div className="space-y-4">
                                <div className="flex items-start gap-4">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
                                        <AlertTriangle className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-ink">
                                            {l('deleteClassConfirmTitle')}
                                        </h3>
                                        <p className="mt-1 text-sm text-ink-muted">
                                            {l('deleteClassConfirmMessage')}
                                        </p>
                                    </div>
                                </div>

                                {deleteError && (
                                    <div className="rounded-lg bg-danger-soft p-4 text-xs font-semibold text-danger">
                                        {deleteError}
                                    </div>
                                )}

                                <div className="flex justify-end gap-2 pt-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        disabled={statusBusy}
                                        onClick={() => setShowDeleteDialog(false)}
                                    >
                                        {l('cancel')}
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="danger"
                                        disabled={statusBusy}
                                        onClick={() => void handleDeleteClass()}
                                    >
                                        {statusBusy ? l('saving') : l('deleteClassConfirmAction')}
                                    </Button>
                                </div>
                            </div>
                        </dialog>
                    )}
                </section>
            </Card>

            {showCoverModal && (
                <ClassImageModal
                    open={showCoverModal}
                    group={group}
                    onClose={() => setShowCoverModal(false)}
                    onUpdated={async (updatedGroup) => {
                        setShowCoverModal(false);
                        await onReload();
                    }}
                />
            )}
        </div>
    );
}
