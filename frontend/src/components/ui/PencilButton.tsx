'use client';

import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

// Affordance "modifica" unica, simmetrica al BackButton (freccia) e al
// ForwardButton (freccia a destra): cerchio + matita, icona-only
// (l'etichetta resta per screen reader e tooltip). Permette di mantenere la
// stessa "prima riga" di azioni in tutte le fasi di selezione/interazione.
interface PencilButtonProps {
    href?: string;
    onClick?: () => void;
    label?: string;
    className?: string;
    disabled?: boolean;
}

const BASE =
    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-slate-50 disabled:hover:text-slate-300';

export function PencilButton({ href, onClick, label = 'Modifica', className, disabled }: PencilButtonProps) {
    const cls = cn(BASE, className);
    const icon = <Pencil className="h-4 w-4" />;

    if (href && !disabled) {
        return (
            <Link href={href} className={cls} aria-label={label} title={label}>
                {icon}
            </Link>
        );
    }

    return (
        <button type="button" onClick={onClick} disabled={disabled} className={cls} aria-label={label} title={label}>
            {icon}
        </button>
    );
}