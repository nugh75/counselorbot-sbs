'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// Affordance "indietro" unica per tutta l'app. Due varianti dichiarate, non tre
// scritte a mano: `icon` è la sola freccia del percorso guidato, dove il
// FlowStepper dice già dove sei; `labelled` aggiunge il testo delle pagine
// autonome (area personale, cambiamenti, admin), che senza etichetta non
// direbbero verso dove si torna. Entrambe sono un link di testo, senza bordo,
// sfondo né pillola/cerchio: stessa lettura della prima voce del breadcrumb
// dell'Area docenti. Misura 44px in entrambe, come ForwardButton.
interface BackButtonProps {
    href?: string;
    onClick?: () => void;
    label: string;
    className?: string;
    variant?: 'icon' | 'labelled';
    disabled?: boolean;
}

const ICON =
    'inline-flex h-control w-control shrink-0 items-center justify-center text-ink-muted transition-colors hover:text-link disabled:cursor-not-allowed disabled:text-ink-muted disabled:opacity-50 disabled:hover:text-ink-muted';

const LABELLED =
    'inline-flex min-h-control shrink-0 items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-link disabled:cursor-not-allowed disabled:text-ink-muted disabled:opacity-50 disabled:hover:text-ink-muted';

export function BackButton({ href, onClick, label, className, variant = 'icon', disabled }: BackButtonProps) {
    const cls = cn(variant === 'labelled' ? LABELLED : ICON, className);
    const inner = (
        <>
            <ArrowLeft className="h-4 w-4 shrink-0" />
            {variant === 'labelled' && <span className="truncate">{label}</span>}
        </>
    );
    // Con l'etichetta visibile l'aria-label è ridondante: la lascia solo la variante icona.
    const a11y = variant === 'labelled' ? { title: label } : { 'aria-label': label, title: label };

    if (href && !disabled) {
        return (
            <Link href={href} className={cls} {...a11y}>
                {inner}
            </Link>
        );
    }

    return (
        <button type="button" onClick={onClick} disabled={disabled} className={cls} {...a11y}>
            {inner}
        </button>
    );
}
