'use client';

import { Moon, Sun } from 'lucide-react';
import { useDarkMode } from '@/lib/use-dark-mode';
import { useI18n } from '@/lib/i18n-context';
import { Tooltip } from '@/components/ui/Tooltip';

// Interruttore tema chiaro/scuro. Aggiunge/toglie `.dark` sull'<html> e persiste
// la scelta in localStorage ('cb_theme'). Lo stato lo legge da useDarkMode
// (osserva la classe) → niente setState in effect.
const STORAGE_KEY = 'cb_theme';

export function ThemeToggle() {
    const { t } = useI18n();
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
        <Tooltip content={dark ? t('theme.toLight') : t('theme.toDark')}>
            <button
                type="button"
                onClick={toggle}
                className="console-topbar-icon"
                aria-label={dark ? t('theme.switchToLight') : t('theme.switchToDark')}
            >
                {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
        </Tooltip>
    );
}
