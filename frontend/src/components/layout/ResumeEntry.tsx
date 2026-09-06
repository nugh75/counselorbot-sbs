'use client';

import { useState, type ReactNode } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useI18n } from '@/lib/i18n-context';
import { deleteFrozenSession } from '@/lib/frozen-session';
import { getResume, setResume } from '@/lib/resume';
import { clearPqblProgress } from '@/lib/pqbl-progress';

type Target = { kind: 'session'; sessionId: string } | { kind: 'pqbl' };

export function ResumeEntry({ target, label, children, menuItem = false }: {
    target: Target; label: string; children: ReactNode; menuItem?: boolean;
}) {
    const { t } = useI18n();
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const remove = async () => {
        if (busy || !window.confirm(`${t('frozen.deleteConfirm')}\n\n${label}`)) return;
        setBusy(true); setFailed(false);
        try {
            if (target.kind === 'pqbl') clearPqblProgress();
            else {
                if (!(await deleteFrozenSession(target.sessionId))) throw new Error('delete failed');
                if (getResume()?.sessionId === target.sessionId) setResume(null);
            }
        } catch { setFailed(true); }
        finally { setBusy(false); }
    };
    return <div className="flex min-w-0 flex-wrap items-center [&>a]:min-h-[44px] [&>a]:min-w-0 [&>a]:flex-1">
        {children}
        <Tooltip content={t('frozen.delete')}>
            <button type="button" role={menuItem ? 'menuitem' : undefined} aria-label={`${t('frozen.delete')}: ${label}`}
                disabled={busy} onClick={() => void remove()}
                className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
            </button>
        </Tooltip>
        {failed && <p role="alert" className="w-full px-3 py-2 text-sm text-red-700">{t('frozen.deleteError')}</p>}
    </div>;
}
