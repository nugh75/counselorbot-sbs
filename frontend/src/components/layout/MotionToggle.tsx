'use client';

import { Zap, ZapOff } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { useReducedMotion, useSystemReducedMotion } from '@/lib/use-reduced-motion';
import { Tooltip } from '@/components/ui/Tooltip';

// Interruttore del movimento. Mette `data-motion="reduced"` sull'<html> e
// persiste la scelta in localStorage ('cb_motion'), come ThemeToggle fa con il
// tema. Il sistema operativo ha gia' la sua impostazione, ma quasi nessuno
// studente sa di averla e su un computer di scuola non puo' cambiarla: chi sta
// male -- disturbi vestibolari, emicrania -- deve poter fermare il movimento
// dove si trova, non nelle preferenze di un sistema che non controlla.
const STORAGE_KEY = 'cb_motion';

export function MotionToggle() {
    const { t } = useI18n();
    const reduced = useReducedMotion();
    const systemDecided = useSystemReducedMotion();

    // Dove il sistema ha gia' chiesto meno movimento non c'e' niente da
    // scegliere: un interruttore che non cambia nulla sarebbe una bugia.
    if (systemDecided) return null;

    const toggle = () => {
        const next = !reduced;
        document.documentElement.setAttribute('data-motion', next ? 'reduced' : 'full');
        try {
            localStorage.setItem(STORAGE_KEY, next ? 'reduced' : 'full');
        } catch {
            /* storage non disponibile: la scelta vale solo per la sessione */
        }
    };

    return (
        <Tooltip content={reduced ? t('motion.restoreHint') : t('motion.reduceHint')}>
            <button
                type="button"
                onClick={toggle}
                className="console-topbar-icon"
                aria-pressed={reduced}
                aria-label={reduced ? t('motion.restore') : t('motion.reduce')}
            >
                {reduced ? <ZapOff className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
            </button>
        </Tooltip>
    );
}
