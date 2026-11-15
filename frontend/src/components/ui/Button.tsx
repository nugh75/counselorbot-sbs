import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
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
    ghost: 'text-ink-muted hover:bg-surface-raised hover:text-link',
    danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-line-strong',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-line-strong',
};

const SIZES: Record<Size, string> = {
    sm: 'min-h-8 px-4 py-1 text-xs gap-1',
    md: 'min-h-control px-4 py-2 text-sm gap-2',
    lg: 'min-h-control px-6 py-2 text-sm gap-2',
};

const BASE = 'inline-flex items-center justify-center rounded-control font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60';

/** The button look as a class string, for links and other elements that must look like a Button. */
export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', className?: string) {
    return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

/** The only spinning mark in the app: a small spinner inside a busy button. */
export const SPIN = 'animate-spin motion-reduce:animate-none';

export function Spinner({ className }: { className?: string }) {
    return <Loader2 aria-hidden="true" className={cn('h-4 w-4 shrink-0', SPIN, className)} />;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
    /** Shows the small spinner before the label and disables the button. */
    busy?: boolean;
    children: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', className, busy, disabled, children, ...rest }: ButtonProps) {
    return (
        <button
            className={buttonClasses(variant, size, className)}
            disabled={disabled || busy}
            aria-busy={busy || undefined}
            {...rest}
        >
            {busy && <Spinner />}
            {children}
        </button>
    );
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

/** A Next `Link` with the Button look: navigation, not an action. */
export function ButtonLink({ variant = 'secondary', size = 'md', className, ...rest }: ButtonLinkProps) {
    return <Link className={buttonClasses(variant, size, className)} {...rest} />;
}
