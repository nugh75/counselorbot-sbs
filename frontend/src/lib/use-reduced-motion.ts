'use client';

import { useSyncExternalStore } from 'react';

// Chi ha chiesto meno movimento, e da dove. Come `useDarkMode`, la richiesta
// dell'app vive in un attributo sull'<html> e la si osserva li': il CSS la
// legge dallo stesso posto, e non c'e' uno stato da tenere allineato.
const ATTRIBUTE = 'data-motion';
const SYSTEM_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeToAttribute(callback: () => void) {
    const observer = new MutationObserver(callback);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [ATTRIBUTE] });
    return () => observer.disconnect();
}

export function useReducedMotion() {
    return useSyncExternalStore(
        subscribeToAttribute,
        () => document.documentElement.getAttribute(ATTRIBUTE) === 'reduced',
        () => false,
    );
}

function subscribeToSystem(callback: () => void) {
    if (typeof window.matchMedia !== 'function') return () => {};
    const query = window.matchMedia(SYSTEM_QUERY);
    query.addEventListener('change', callback);
    return () => query.removeEventListener('change', callback);
}

/**
 * Vero quando e' il sistema operativo a chiedere meno movimento.
 *
 * L'interruttore dell'app puo' solo aggiungere una richiesta, mai togliere
 * quella del sistema: dove il sistema ha gia' deciso, il comando sparisce
 * invece di mostrare una scelta che non ha effetto.
 */
export function useSystemReducedMotion() {
    return useSyncExternalStore(
        subscribeToSystem,
        () => typeof window.matchMedia === 'function' && window.matchMedia(SYSTEM_QUERY).matches,
        () => false,
    );
}
