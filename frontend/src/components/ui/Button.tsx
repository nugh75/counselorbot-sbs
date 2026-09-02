import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Bottone con token di variante/taglia: un'unica sorgente per colori e padding,
// al posto delle classi inline ripetute. Adozione incrementale, per aree.
//
// `accent` è l'ocra dell'identità — inizio, ripresa, movimento — a -600, che è
// la tinta che passa la soglia AA con il testo bianco; -500 restava a 3.58:1.
// Le taglie md e lg partono da 44px di altezza: sono quelle dei comandi
// principali, che su touch vanno presi con il dito.
type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-300',
    accent: 'bg-ochre-600 text-white hover:bg-ochre-700 disabled:bg-slate-300',
    secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-50 hover:text-indigo-700',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-slate-300',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-300',
};

const SIZES: Record<Size, string> = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'min-h-11 px-4 py-2.5 text-sm gap-2',
    lg: 'min-h-11 px-6 py-3 text-sm gap-2',
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
                'inline-flex items-center justify-center rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
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
