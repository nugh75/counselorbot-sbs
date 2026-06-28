'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// Affordance "indietro" unica per tutta l'app: cerchio + freccia, icona-only
// (l'etichetta resta per screen reader e tooltip). Supporta sia link (href) sia
// handler (onClick). Sostituisce i vari stili di back sparsi nelle pagine.
interface BackButtonProps {
    href?: string;
    onClick?: () => void;
    label?: string;
    className?: string;
}

const BASE =
    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-indigo-700';

export function BackButton({ href, onClick, label = 'Indietro', className }: BackButtonProps) {
    const cls = cn(BASE, className);
    const icon = <ArrowLeft className="h-4 w-4" />;

    if (href) {
        return (
            <Link href={href} className={cls} aria-label={label} title={label}>
                {icon}
            </Link>
        );
    }

    return (
        <button type="button" onClick={onClick} className={cls} aria-label={label} title={label}>
            {icon}
        </button>
    );
}
