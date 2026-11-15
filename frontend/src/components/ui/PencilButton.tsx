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
    label: string;
    className?: string;
    disabled?: boolean;
}

const BASE =
    'inline-flex h-control w-control shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-body transition-colors hover:bg-surface-sunken hover:text-link disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-sunken disabled:text-ink-muted disabled:hover:bg-surface-sunken disabled:hover:text-ink-muted';

export function PencilButton({ href, onClick, label, className, disabled }: PencilButtonProps) {
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