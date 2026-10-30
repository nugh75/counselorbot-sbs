import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Bottone con token di variante/taglia: un'unica sorgente per colori e padding,
// al posto delle classi inline ripetute. Adozione incrementale, per aree.
//
// `accent` è l'ocra dell'identità — inizio, ripresa, movimento — a -600, che è
// la tinta che passa la soglia AA con il testo bianco; -500 restava a 3.58:1.
// Le taglie md e lg partono da 44px reali (`min-h-control`, in px): la vecchia taglia 11
// con la radice a 15px faceva 41px. Sono i comandi principali, presi col dito.
// Colori dai token semantici di globals.css; danger e success restano pieni
// rosso/smeraldo perche' i loro token di stato schiariscono nel tema scuro.
type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
    primary: 'bg-brand text-ink-on-brand hover:bg-brand-hover disabled:bg-line-strong',
    accent: 'bg-move text-ink-on-brand hover:bg-move-hover disabled:bg-line-strong',
    secondary: 'border border-line bg-surface text-ink-body hover:bg-surface-sunken',
    ghost: 'text-ink-muted hover:bg-surface-sunken hover:text-link',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-line-strong',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-line-strong',
};

const SIZES: Record<Size, string> = {
    sm: 'min-h-8 px-4 py-1 text-xs gap-1',
    md: 'min-h-control px-4 py-2 text-sm gap-2',
    lg: 'min-h-control px-6 py-2 text-sm gap-2',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
    children: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', className, children, ...rest }: ButtonProps) {
    return (
        <button
            className={cn(
                'inline-flex items-center justify-center rounded-control font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                VARIANTS[variant],
                SIZES[size],
                className,
            )}
            {...rest}
        >
            {children}
        </button>
    );
}
