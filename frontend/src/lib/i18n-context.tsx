'use client';

import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from 'react';
import { Lang, DEFAULT_LANG, getStoredLang, setStoredLang, translate, translateFallback } from './i18n';

interface I18nContextValue {
    lang: Lang;
    setLang: (lang: Lang) => void;
    t: (key: string, vars?: Record<string, string | number>) => string;
    tf: (key: string, fallback: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const LANGUAGE_EVENT = 'counselorbot-language-change';

function subscribeToLanguage(onStoreChange: () => void): () => void {
    window.addEventListener('storage', onStoreChange);
    window.addEventListener(LANGUAGE_EVENT, onStoreChange);
    return () => {
        window.removeEventListener('storage', onStoreChange);
        window.removeEventListener(LANGUAGE_EVENT, onStoreChange);
    };
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
    const lang = useSyncExternalStore(subscribeToLanguage, getStoredLang, () => DEFAULT_LANG);

    useEffect(() => {
        document.documentElement.lang = lang;
    }, [lang]);

    const setLang = useCallback((next: Lang) => {
        setStoredLang(next);
        window.dispatchEvent(new Event(LANGUAGE_EVENT));
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
