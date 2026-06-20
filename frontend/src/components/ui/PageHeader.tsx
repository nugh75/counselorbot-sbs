'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

// Intestazione di pagina unica: titolo (scala fissa text-3xl), sottotitolo
// opzionale e un solo pattern di back-nav (Link via backHref oppure handler via
// onBack). Sostituisce i 4 pattern divergenti sparsi nelle pagine.
interface PageHeaderProps {
    title: string;
    subtitle?: ReactNode;
    backHref?: string;
    onBack?: () => void;
    backLabel?: string;
    actions?: ReactNode;
}

export function PageHeader({ title, subtitle, backHref, onBack, backLabel = 'Indietro', actions }: PageHeaderProps) {
    const backClasses =
        'p-2 border border-transparent hover:border-slate-200 hover:bg-white rounded-md transition-colors shrink-0';
    return (
        <div className="flex flex-wrap items-center gap-4">
            {backHref && (
                <Link href={backHref} className={backClasses} aria-label={backLabel}>
                    <ArrowLeft className="w-5 h-5 text-slate-600" />
                </Link>
            )}
            {!backHref && onBack && (
                <button onClick={onBack} className={backClasses} aria-label={backLabel}>
                    <ArrowLeft className="w-5 h-5 text-slate-600" />
                </button>
            )}
            <div className="min-w-0">
                <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
                {subtitle && <p className="text-slate-500 mt-1">{subtitle}</p>}
            </div>
            {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </div>
    );
}
