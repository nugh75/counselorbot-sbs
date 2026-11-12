import type { ReactNode } from 'react';
import { FlaskConical, GraduationCap, UserRound, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// Badge di ruolo: la tinta (token --role-* di globals.css, con i valori scuri)
// non e' mai l'unico canale, c'e' sempre icona + testo. Il testo e' `text-ink`
// sulla tinta; per il testo secondario su una card di ruolo usare
// `text-role-<ruolo>-muted`, o su un contenitore
// `[--ink-muted:var(--role-<ruolo>-muted)]` cosi' il `text-ink-muted` dei figli
// si scurisce da solo; non il `text-ink-muted` di default.
export type Role = 'teacher' | 'student' | 'test';

const STYLES: Record<Role, { box: string; icon: LucideIcon }> = {
    teacher: { box: 'border-role-teacher-line bg-role-teacher-soft', icon: GraduationCap },
    student: { box: 'border-role-student-line bg-role-student-soft', icon: UserRound },
    test: { box: 'border-role-test-line bg-role-test-soft', icon: FlaskConical },
};

interface RoleBadgeProps {
    role: Role;
    children: ReactNode;
    className?: string;
}

export function RoleBadge({ role, children, className }: RoleBadgeProps) {
    const { box, icon: Icon } = STYLES[role];
    return (
        <span data-role-badge={role} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold text-ink', box, className)}>
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {children}
        </span>
    );
}
