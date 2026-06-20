'use client';

import { Moon, Sun } from 'lucide-react';
import { useDarkMode } from '@/lib/use-dark-mode';

// Interruttore tema chiaro/scuro. Aggiunge/toglie `.dark` sull'<html> e persiste
// la scelta in localStorage ('cb_theme'). Lo stato lo legge da useDarkMode
// (osserva la classe) → niente setState in effect.
const STORAGE_KEY = 'cb_theme';

export function ThemeToggle() {
    const dark = useDarkMode();

    const toggle = () => {
        const next = !dark;
        document.documentElement.classList.toggle('dark', next);
        try {
            localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
        } catch {
            /* storage non disponibile: la scelta vale solo per la sessione */
        }
    };

    return (
        <button
            type="button"
            onClick={toggle}
            className="console-topbar-icon"
            title={dark ? 'Tema chiaro' : 'Tema scuro'}
            aria-label={dark ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
        >
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
    );
}
