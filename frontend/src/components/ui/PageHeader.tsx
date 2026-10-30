'use client';

import type { ReactNode, Ref } from 'react';
import { BackButton } from './BackButton';
import { PreviousPageButton } from './PreviousPageButton';

// Intestazione di pagina unica: titolo (scala fissa text-2xl semibold), sottotitolo
// opzionale e un solo pattern di back-nav (PreviousPageButton via backHref oppure handler via
// onBack). Sostituisce i 4 pattern divergenti sparsi nelle pagine.
interface PageHeaderProps {
    title: string;
    subtitle?: ReactNode;
    backHref?: string;
    onBack?: () => void;
    backLabel?: string;
    icon?: ReactNode;
    actions?: ReactNode;
    forward?: ReactNode;
    // Titolo che riceve il focus al cambio di pagina (area personale).
    headingRef?: Ref<HTMLHeadingElement>;
}

export function PageHeader({ title, subtitle, backHref, onBack, backLabel, icon, actions, forward, headingRef }: PageHeaderProps) {
    return (
        <div className="flex flex-wrap items-center gap-4">
            {(backHref || onBack) && (
                <div className="flex items-center gap-2">
                    {onBack ? (
                        <BackButton variant="labelled" onClick={onBack} label={backLabel ?? 'Indietro'} />
                    ) : backHref ? (
                        <PreviousPageButton variant="labelled" fallbackHref={backHref} label={backLabel} />
                    ) : null}
                    {forward}
                </div>
            )}
            <div className="flex min-w-0 items-center gap-2">
                {icon}
                <div className="min-w-0">
                    <h1 ref={headingRef} tabIndex={headingRef ? -1 : undefined} className="text-2xl font-semibold text-ink focus:outline-none">{title}</h1>
                    {subtitle && <p className="mt-2 text-ink-muted">{subtitle}</p>}
                </div>
            </div>
            {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </div>
    );
}
