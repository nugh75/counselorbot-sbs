import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Wrapper card condiviso sui token semantici (superficie, bordo, raggio e ombra
// card): cambiano col tema senza remap. Padding di default p-6; override via className.
interface CardProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
    className?: string;
    as?: 'div' | 'section' | 'article';
}

export function Card({ children, className, as: Tag = 'div', ...props }: CardProps) {
    return <Tag className={cn('rounded-card border border-line bg-surface p-6 shadow-card transition-colors duration-150', className)} {...props}>{children}</Tag>;
}

