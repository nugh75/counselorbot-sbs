'use client';

import { useEffect, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { getViewAsRole, clearViewAsRole, type ViewAsRole } from '@/lib/auth';

const ROLE_LABEL: Record<ViewAsRole, string> = {
    studente: 'Studente',
    ricercatore: 'Ricercatore',
    docente: 'Docente',
};

// Barra globale: visibile quando un admin sta usando l'anteprima ruoli.
// Sempre raggiungibile per uscire dall'anteprima da qualsiasi pagina.
export function RolePreviewBanner() {
    const [role, setRole] = useState<ViewAsRole | null>(null);

    useEffect(() => { setRole(getViewAsRole()); }, []);

    if (!role) return null;

    const exit = () => {
        clearViewAsRole();
        window.location.reload();
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 shadow-lg">
            <Eye className="h-4 w-4 shrink-0" />
            <span>Anteprima ruolo: {ROLE_LABEL[role]} — stai vedendo l&apos;interfaccia di questo ruolo.</span>
            <button
                type="button"
                onClick={exit}
                className="inline-flex items-center gap-1 rounded-md bg-amber-950/90 px-3 py-1 text-xs font-bold text-amber-50 hover:bg-amber-950"
            >
                <X className="h-3.5 w-3.5" />
                Esci
            </button>
        </div>
    );
}
