'use client';

import { useSyncExternalStore } from 'react';

// Espone lo stato dark/light osservando la classe `.dark` sull'<html>.
// Serve ai componenti che non possono usare CSS (es. recharts, che colora via
// prop/hex inline): si ridisegnano quando l'utente cambia tema.
function subscribe(callback: () => void) {
    const observer = new MutationObserver(callback);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
}

function getSnapshot() {
    return document.documentElement.classList.contains('dark');
}

export function useDarkMode() {
    return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
