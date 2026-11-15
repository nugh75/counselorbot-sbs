import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Status label on the state tokens (-soft fill, -ink text): a small flat tag,
// not a pill, in sentence case. The text carries the meaning; the dot is a cue.
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<StatusTone, { box: string; dot: string }> = {
    neutral: { box: 'bg-surface-sunken text-ink-body', dot: 'bg-ink-muted' },
    info: { box: 'bg-info-soft text-info-ink', dot: 'bg-info' },
    success: { box: 'bg-success-soft text-success-ink', dot: 'bg-success' },
    warning: { box: 'bg-warning-soft text-warning-ink', dot: 'bg-warning' },
    danger: { box: 'bg-danger-soft text-danger-ink', dot: 'bg-danger' },
};

interface StatusBadgeProps {
    tone?: StatusTone;
    dot?: boolean;
    className?: string;
    children: ReactNode;
}

export function StatusBadge({ tone = 'neutral', dot = false, className, children }: StatusBadgeProps) {
    const { box, dot: dotClass } = TONES[tone];
    return (
        <span data-status-badge={tone} className={cn('inline-flex items-center gap-1.5 rounded-control px-2 py-0.5 text-xs font-semibold', box, className)}>
            {dot && <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass)} aria-hidden />}
            {children}
        </span>
    );
}
