import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Barra azione ancorata al fondo del viewport: la CTA principale resta sempre
// visibile mentre il contenuto lungo scorre sopra. Niente piu' scroll fino in
// fondo per raggiungere il bottone. Sfondo sfumato = il contenuto svanisce
// dietro invece di tagliarsi netto.
interface StickyActionsProps {
    children: ReactNode;
    className?: string;
}

export function StickyActions({ children, className }: StickyActionsProps) {
    return (
        <div
            className={cn(
                'sticky bottom-0 z-20 -mx-4 px-4 pt-4 pb-3',
                'bg-gradient-to-t from-[var(--console-bg)] via-[var(--console-bg)] to-transparent',
                className,
            )}
        >
            {children}
        </div>
    );
}
