'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// Affordance "indietro" unica per tutta l'app. Due varianti dichiarate, non tre
// scritte a mano: `icon` è il cerchio del percorso guidato, dove il FlowStepper
// dice già dove sei; `labelled` è la pillola con testo delle pagine autonome
// (area personale, cambiamenti, admin), che senza etichetta non direbbero verso
// dove si torna. Misura 44px in entrambe, come ForwardButton.
interface BackButtonProps {
    href?: string;
    onClick?: () => void;
    label: string;
    className?: string;
    variant?: 'icon' | 'labelled';
}

const ICON =
    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-indigo-700';

const LABELLED =
    'inline-flex h-11 shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-indigo-700';

export function BackButton({ href, onClick, label, className, variant = 'icon' }: BackButtonProps) {
    const cls = cn(variant === 'labelled' ? LABELLED : ICON, className);
    const inner = (
        <>
            <ArrowLeft className="h-4 w-4 shrink-0" />
            {variant === 'labelled' && <span className="truncate">{label}</span>}
        </>
    );
    // Con l'etichetta visibile l'aria-label è ridondante: la lascia solo la variante icona.
    const a11y = variant === 'labelled' ? { title: label } : { 'aria-label': label, title: label };

    if (href) {
        return (
            <Link href={href} className={cls} {...a11y}>
                {inner}
            </Link>
        );
    }

    return (
        <button type="button" onClick={onClick} className={cls} {...a11y}>
            {inner}
        </button>
    );
}
