import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Wrapper card condiviso sui token semantici (superficie, bordo, raggio e ombra
// card): cambiano col tema senza remap. Padding di default p-6; override via className.
// variant="flat": nessun box, ombra o sfondo; solo un filetto in alto e spazio verticale
// (sottopagine delle aree, dove le card non si annidano).
interface CardProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
    className?: string;
    as?: 'div' | 'section' | 'article';
    variant?: 'boxed' | 'flat';
}

export function Card({ children, className, as: Tag = 'div', variant = 'boxed', ...props }: CardProps) {
    return <Tag className={cn(variant === 'flat' ? 'border-t border-line py-6' : 'rounded-card border border-line bg-surface p-6 shadow-card transition-colors duration-150', className)} {...props}>{children}</Tag>;
}

