import type { ReactNode } from 'react';
import { AlertTriangle, Info, CheckCircle2, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Box informativo condiviso: una sola definizione per variante (colori, bordo,
// icona) al posto dei callout amber/sky/indigo/red ridefiniti inline ovunque.
type Variant = 'info' | 'warning' | 'success' | 'danger';

const STYLES: Record<Variant, { box: string; icon: string; defaultIcon: LucideIcon }> = {
    info: { box: 'border border-sky-200 bg-sky-50 text-sky-950', icon: 'text-sky-600', defaultIcon: Info },
    warning: { box: 'border-2 border-amber-300 bg-amber-50 text-amber-950', icon: 'text-amber-700', defaultIcon: AlertTriangle },
    success: { box: 'border border-emerald-200 bg-emerald-50 text-emerald-950', icon: 'text-emerald-600', defaultIcon: CheckCircle2 },
    danger: { box: 'border border-red-200 bg-red-50 text-red-800', icon: 'text-red-600', defaultIcon: XCircle },
};

interface CalloutProps {
    variant?: Variant;
    title?: ReactNode;
    children?: ReactNode;
    icon?: LucideIcon | null;
    className?: string;
}

export function Callout({ variant = 'info', title, children, icon, className }: CalloutProps) {
    const s = STYLES[variant];
    const Icon = icon === null ? null : (icon ?? s.defaultIcon);
    return (
        <div className={cn('rounded-xl p-5 flex gap-3', s.box, className)}>
            {Icon && <Icon className={cn('w-6 h-6 shrink-0', s.icon)} />}
            <div className="min-w-0 space-y-1 text-sm leading-relaxed">
                {title && <p className="font-semibold">{title}</p>}
                {children && <div>{children}</div>}
            </div>
        </div>
    );
}
