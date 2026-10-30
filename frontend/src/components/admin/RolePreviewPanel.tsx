'use client';

import { useState } from 'react';
import { Check, Eye, Minus, UserCog } from 'lucide-react';
import {
    getViewAsAccount, clearViewAs, VIEW_AS_ACCOUNTS,
    type ViewAsRole, type ViewAsAccount, type Identity,
} from '@/lib/auth';
import {
    canUseAssistant, canUsePersonalPage, canUseResearchConsole, canUseTeacherAssistant,
} from '@/lib/roles';
import { toast } from '@/components/ui/Toast';
import { useI18n } from '@/lib/i18n-context';

type RoleKey = ViewAsRole | 'admin';

const ROLE_KEY: Record<RoleKey, string> = {
    studente: 'role.student',
    ricercatore: 'role.researcher',
    docente: 'role.teacher',
    admin: 'role.admin',
};

const ROLE_DESC_KEY: Record<ViewAsRole, string> = {
    studente: 'admin.rolePreview.desc.student',
    ricercatore: 'admin.rolePreview.desc.researcher',
    docente: 'admin.rolePreview.desc.teacher',
};

// Identita' sintetiche per costruire la matrice delle capacita' per ruolo.
function syntheticIdentity(role: RoleKey): Identity {
    const base: Identity = {
        email: '', username: 'preview', name: 'preview',
        groups: [], is_admin: false, is_researcher: false, authenticated: true,
    };
    if (role === 'admin') return { ...base, is_admin: true, groups: ['admins'] };
    if (role === 'ricercatore') return { ...base, is_researcher: true, groups: ['researchers'] };
    if (role === 'docente') return { ...base, groups: ['docenti'] };
    return { ...base, groups: ['studenti'] };
}

const CAPABILITIES: { labelKey: string; fn: (id: Identity) => boolean }[] = [
    { labelKey: 'admin.rolePreview.cap.assistant', fn: canUseAssistant },
    { labelKey: 'admin.rolePreview.cap.personal', fn: canUsePersonalPage },
    { labelKey: 'admin.rolePreview.cap.teacherAssistant', fn: canUseTeacherAssistant },
    { labelKey: 'admin.rolePreview.cap.researchConsole', fn: canUseResearchConsole },
];

const ROLES: RoleKey[] = ['studente', 'ricercatore', 'docente', 'admin'];

export function RolePreviewPanel() {
    const { t } = useI18n();
    const [active] = useState<ViewAsAccount | null>(() => getViewAsAccount());

    const startPreview = (account: ViewAsAccount) => {
        window.open(`/?view_as=${account.username}`, '_blank');
        toast.success(t('admin.rolePreview.started', { name: account.name }));
    };

    const stopPreview = () => {
        clearViewAs();
        window.location.reload();
    };

    return (
        <div className="space-y-6">
            <div className="rounded-card border border-line bg-surface shadow-card p-4 space-y-2">
                <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
                    <Eye className="h-5 w-5 text-brand" />
                    {t('admin.rolePreview.title')}
                </h2>
                <p className="text-sm text-ink-muted">
                    {t('admin.rolePreview.description')}
                </p>
            </div>

            {active && (
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-warning-line bg-warning-soft p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-warning-ink">
                        <UserCog className="h-5 w-5" />
                        {t('admin.rolePreview.active', { name: active.name, role: t(ROLE_KEY[active.role]), username: active.username })}
                    </div>
                    <button
                        type="button"
                        onClick={stopPreview}
                        className="min-h-control inline-flex items-center gap-2 rounded-control bg-warning px-4 py-2 text-sm font-semibold text-ink-on-brand hover:bg-warning"
                    >
                        {t('admin.rolePreview.back')}
                    </button>
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {VIEW_AS_ACCOUNTS.map((account) => {
                    const isActive = active?.username === account.username;
                    return (
                        <div key={account.username} className="rounded-card border border-line bg-surface shadow-card flex flex-col gap-2 p-4">
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-ink">{account.name}</h3>
                                <span className="rounded-full bg-surface-raised px-2 py-1 text-2xs font-semibold text-ink-muted">
                                    {t(ROLE_KEY[account.role])}
                                </span>
                            </div>
                            <p className="text-2xs font-semibold text-ink-muted">{account.username}</p>
                            <p className="grow text-xs text-ink-muted">{t(ROLE_DESC_KEY[account.role])}</p>
                            <button
                                type="button"
                                onClick={() => startPreview(account)}
                                className={`min-h-control inline-flex items-center justify-center gap-2 rounded-control px-4 py-2 text-sm font-semibold ${
                                    isActive
                                        ? 'border border-brand-line bg-brand-soft text-link'
                                        : 'bg-brand text-ink-on-brand hover:bg-brand-hover'
                                }`}
                            >
                                <Eye className="h-4 w-4" />
                                {isActive ? t('admin.rolePreview.inUse') : t('admin.rolePreview.use')}
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Matrice delle capacita' per ruolo: cosa vede/puo' fare ciascun ruolo. */}
            <div className="rounded-card border border-line bg-surface shadow-card overflow-x-auto p-4">
                <h3 className="mb-4 text-sm font-semibold text-ink">{t('admin.rolePreview.matrixTitle')}</h3>
                <table className="w-full min-w-[34rem] text-sm">
                    <thead>
                        <tr className="border-b border-line text-left text-ink-muted">
                            <th className="py-2 pr-4 font-semibold">{t('admin.rolePreview.function')}</th>
                            {ROLES.map((role) => (
                                <th key={role} className="px-4 py-2 text-center font-semibold">{t(ROLE_KEY[role])}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {CAPABILITIES.map((cap) => (
                            <tr key={cap.labelKey} className="border-b border-line">
                                <td className="py-2 pr-4 font-semibold text-ink-body">{t(cap.labelKey)}</td>
                                {ROLES.map((role) => {
                                    const ok = cap.fn(syntheticIdentity(role));
                                    return (
                                        <td key={role} className="px-4 py-2 text-center">
                                            {ok ? (
                                                <Check className="mx-auto h-4 w-4 text-success" />
                                            ) : (
                                                <Minus className="mx-auto h-4 w-4 text-ink-muted" />
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
