import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Wrapper card condiviso sopra l'utility glass-panel (bg + bordo + rounded-xl
// gia' inclusi). Padding di default p-6; override via className.
interface CardProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
    className?: string;
    as?: 'div' | 'section' | 'article';
}

export function Card({ children, className, as: Tag = 'div', ...props }: CardProps) {
    return <Tag className={cn('glass-panel p-6', className)} {...props}>{children}</Tag>;
}

