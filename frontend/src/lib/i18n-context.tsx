'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Lang, DEFAULT_LANG, getStoredLang, setStoredLang, translate, translateFallback } from './i18n';

interface I18nContextValue {
    lang: Lang;
    setLang: (lang: Lang) => void;
    t: (key: string, vars?: Record<string, string | number>) => string;
    tf: (key: string, fallback: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
    const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

    // Allinea alla lingua salvata dopo il mount (evita mismatch SSR/CSR)
    useEffect(() => {
        setLangState(getStoredLang());
    }, []);

    const setLang = useCallback((next: Lang) => {
        setLangState(next);
        setStoredLang(next);
        // Aggiorna l'attributo lang del documento per accessibilità
        if (typeof document !== 'undefined') document.documentElement.lang = next;
    }, []);

    const t = useCallback(
        (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
        [lang],
    );

    const tf = useCallback(
        (key: string, fallback: string) => translateFallback(lang, key, fallback),
        [lang],
    );

    return <I18nContext.Provider value={{ lang, setLang, t, tf }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
    const ctx = useContext(I18nContext);
    if (!ctx) throw new Error('useI18n must be used within I18nProvider');
    return ctx;
}
