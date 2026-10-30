import type { ReactNode } from 'react';
import { AlertTriangle, Info, CheckCircle2, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Box informativo condiviso: una sola definizione per variante (colori, bordo,
// icona) al posto dei callout amber/sky/indigo/red ridefiniti inline ovunque.
type Variant = 'info' | 'warning' | 'success' | 'danger';

const STYLES: Record<Variant, { box: string; icon: string; defaultIcon: LucideIcon }> = {
    // Info uses the brand's pale petrol, not a cold sky blue. Colours come from
    // the status tokens in globals.css, which carry their own dark values.
    info: { box: 'border-info-line bg-info-soft text-info-ink', icon: 'text-info', defaultIcon: Info },
    warning: { box: 'border-warning-line bg-warning-soft text-warning-ink', icon: 'text-warning', defaultIcon: AlertTriangle },
    success: { box: 'border-success-line bg-success-soft text-success-ink', icon: 'text-success', defaultIcon: CheckCircle2 },
    danger: { box: 'border-danger-line bg-danger-soft text-danger-ink', icon: 'text-danger', defaultIcon: XCircle },
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
    // Un callout d'errore che compare dopo un'azione va annunciato: senza ruolo
    // resta muto per chi usa uno screen reader. Le altre varianti restano
    // contenuto normale, per non interrompere la lettura.
    return (
        <div role={variant === 'danger' ? 'alert' : undefined} className={cn('flex gap-2 rounded-card border p-4', s.box, className)}>
            {Icon && <Icon className={cn('w-6 h-6 shrink-0', s.icon)} />}
            <div className="min-w-0 space-y-2 text-sm leading-relaxed">
                {title && <p className="font-semibold">{title}</p>}
                {children && <div>{children}</div>}
            </div>
        </div>
    );
}
