'use client';

import { useState, type ReactNode } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { Tooltip } from '@/components/ui/Tooltip';
import { useI18n } from '@/lib/i18n-context';
import { deleteFrozenSession } from '@/lib/frozen-session';
import { getResume, setResume } from '@/lib/resume';
import { clearPqblProgress } from '@/lib/pqbl-progress';

type Target = { kind: 'session'; sessionId: string } | { kind: 'pqbl' };

export function ResumeEntry({ target, label, children, deletable = true }: {
    target: Target; label: string; children: ReactNode; deletable?: boolean;
}) {
    const { t } = useI18n();
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const remove = async () => {
        if (busy) return;
        setConfirming(false); setBusy(true); setFailed(false);
        try {
            if (target.kind === 'pqbl') clearPqblProgress();
            else {
                if (!(await deleteFrozenSession(target.sessionId))) throw new Error('delete failed');
                if (getResume()?.sessionId === target.sessionId) setResume(null);
            }
        } catch { setFailed(true); }
        finally { setBusy(false); }
    };
    return <div className="flex min-w-0 flex-wrap items-center [&>a]:min-h-control [&>a]:min-w-0 [&>a]:flex-1">
        {children}
        {deletable && !confirming && <Tooltip content={t('frozen.delete')}>
            <button type="button" aria-label={`${t('frozen.delete')}: ${label}`}
                disabled={busy} onClick={() => setConfirming(true)}
                className="inline-flex h-control w-control shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-danger-soft hover:text-danger disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
            </button>
        </Tooltip>}
        {deletable && confirming && <ConfirmInline question={t('frozen.deleteConfirm')} busy={busy}
            onConfirm={() => void remove()} onCancel={() => setConfirming(false)} className="w-full flex-wrap" />}
        {failed && <p role="alert" className="w-full px-4 py-2 text-sm text-danger">{t('frozen.deleteError')}</p>}
    </div>;
}
