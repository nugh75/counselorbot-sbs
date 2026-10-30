'use client';

import { useState } from 'react';
import { Eye, X } from 'lucide-react';
import { getViewAsAccount, clearViewAs, type ViewAsAccount } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';

const ROLE_KEY: Record<ViewAsAccount['role'], string> = {
    studente: 'role.student',
    ricercatore: 'role.researcher',
    docente: 'role.teacher',
};

// Barra globale: visibile quando un admin sta usando un profilo di prova.
// Sempre raggiungibile per uscire dall'anteprima da qualsiasi pagina.
export function RolePreviewBanner() {
    const { t } = useI18n();
    const [account] = useState<ViewAsAccount | null>(() => getViewAsAccount());

    if (!account) return null;

    const exit = () => {
        clearViewAs();
        window.location.reload();
    };

    const roleLabel = t(ROLE_KEY[account.role]);

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-4 border-t border-warning-line bg-warning-soft px-4 py-2 text-sm font-semibold text-warning-ink shadow-pop">
            <Eye className="h-4 w-4 shrink-0" />
            <span>{t('rolePreview.banner', { name: account.name, role: roleLabel })}</span>
            <button
                type="button"
                onClick={exit}
                className="inline-flex min-h-control items-center gap-1 rounded-control border border-warning-line bg-surface px-4 text-xs font-semibold text-warning-ink hover:bg-surface-sunken"
            >
                <X className="h-4 w-4" />
                {t('rolePreview.exit')}
            </button>
        </div>
    );
}
