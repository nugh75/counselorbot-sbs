'use client';

import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { focusLeaves } from '@/lib/disclosure';

// Pattern unico dei pannelli dell'header (menu, Riprendi, lingua): pulsante con
// aria-expanded/aria-controls, Escape chiude e riporta il focus al pulsante,
// click fuori o Tab oltre il pannello chiudono. Niente role=menu né focus trap:
// le voci si attraversano con Tab, nell'ordine del DOM.
export function useDisclosure(panelId: string) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false);
                triggerRef.current?.focus();
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return {
        open,
        containerRef,
        triggerRef,
        triggerProps: { 'aria-expanded': open, 'aria-controls': panelId, onClick: () => setOpen((v) => !v) },
        onBlur: (e: FocusEvent) => {
            if (focusLeaves(containerRef.current, e.relatedTarget)) setOpen(false);
        },
        // Navigazione: la pagina cambia, il focus non va riportato.
        close: () => setOpen(false),
        // Azione sul posto (lingua, tema): il pannello si smonta, il focus torna
        // al pulsante invece di finire sul body.
        closeToTrigger: () => {
            setOpen(false);
            triggerRef.current?.focus();
        },
    };
}
