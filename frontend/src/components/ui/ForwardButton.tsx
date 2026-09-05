'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// Affordance "avanti" del percorso guidato. Era un cerchio da 36px, grigio e
// senza testo, accanto a un "indietro" da 48px: l'azione principale di ogni
// schermata risultava più piccola e più quieta di quella che torna indietro, e
// su touch il `title` non compare, quindi restava una freccia senza parole.
// Ora è il primario: petrol pieno, etichetta visibile, 44px come BackButton.
// Ogni call-site passava già un `label` sensato, quindi il testo non è nuovo.
interface ForwardButtonProps {
    href?: string;
    onClick?: () => void;
    label: string;
    className?: string;
    disabled?: boolean;
    type?: 'button' | 'submit';
    form?: string;
}

const BASE =
    'inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-md bg-indigo-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:hover:bg-slate-300';

export function ForwardButton({ href, onClick, label, className, disabled, type = 'button', form }: ForwardButtonProps) {
    const cls = cn(BASE, className);
    const inner = (
        <>
            <span className="truncate">{label}</span>
            <ArrowRight className="h-4 w-4 shrink-0" />
        </>
    );

    if (href && !disabled) {
        return (
            <Link href={href} className={cls} title={label}>
                {inner}
            </Link>
        );
    }

    return (
        <button type={type} form={form} onClick={onClick} disabled={disabled} className={cls} title={label}>
            {inner}
        </button>
    );
}
