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
        <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 shadow-lg">
            <Eye className="h-4 w-4 shrink-0" />
            <span>{t('rolePreview.banner', { name: account.name, role: roleLabel })}</span>
            <button
                type="button"
                onClick={exit}
                className="inline-flex items-center gap-1 rounded-md bg-amber-950/90 px-3 py-1 text-xs font-bold text-amber-50 hover:bg-amber-950"
            >
                <X className="h-3.5 w-3.5" />
                {t('rolePreview.exit')}
            </button>
        </div>
    );
}
