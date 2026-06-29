'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Affordance "avanti" simmetrica al BackButton: cerchio + freccia a destra,
// icona-only (l'etichetta resta per screen reader e tooltip). Supporta sia
// Link (href) sia handler (onClick) e uno stato disabled.
interface ForwardButtonProps {
    href?: string;
    onClick?: () => void;
    label?: string;
    className?: string;
    disabled?: boolean;
    type?: 'button' | 'submit';
    form?: string;
}

const BASE =
    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300 disabled:hover:bg-slate-50 disabled:hover:text-slate-300';

export function ForwardButton({ href, onClick, label = 'Continua', className, disabled, type = 'button', form }: ForwardButtonProps) {
    const cls = cn(BASE, className);
    const icon = <ArrowRight className="h-4 w-4" />;

    if (href && !disabled) {
        return (
            <Link href={href} className={cls} aria-label={label} title={label}>
                {icon}
            </Link>
        );
    }

    return (
        <button type={type} form={form} onClick={onClick} disabled={disabled} className={cls} aria-label={label} title={label}>
            {icon}
        </button>
    );
}