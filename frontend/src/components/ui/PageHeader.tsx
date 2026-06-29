'use client';

import type { ReactNode } from 'react';
import { BackButton } from './BackButton';

// Intestazione di pagina unica: titolo (scala fissa text-2xl), sottotitolo
// opzionale e un solo pattern di back-nav (Link via backHref oppure handler via
// onBack). Sostituisce i 4 pattern divergenti sparsi nelle pagine.
interface PageHeaderProps {
    title: string;
    subtitle?: ReactNode;
    backHref?: string;
    onBack?: () => void;
    backLabel?: string;
    actions?: ReactNode;
    forward?: ReactNode;
}

export function PageHeader({ title, subtitle, backHref, onBack, backLabel = 'Indietro', actions, forward }: PageHeaderProps) {
    return (
        <div className="flex flex-wrap items-center gap-4">
            {(backHref || onBack) && (
                <div className="flex items-center gap-3">
                    <BackButton href={backHref} onClick={onBack} label={backLabel} />
                    {forward}
                </div>
            )}
            <div className="min-w-0">
                <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
                {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
            </div>
            {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </div>
    );
}
