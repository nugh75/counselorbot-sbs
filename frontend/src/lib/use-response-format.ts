'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { ResponseFormat } from './chat-preferences';

const EVENT = 'chat-format-change';
const fallback = new Map<string, ResponseFormat>();
function subscribe(onChange: () => void) {
    window.addEventListener(EVENT, onChange);
    window.addEventListener('storage', onChange);
    return () => {
        window.removeEventListener(EVENT, onChange);
        window.removeEventListener('storage', onChange);
    };
}

// Surfaces without frozen snapshots remember the preference in this browser session.
export function useResponseFormat(sessionKey: string, initial: ResponseFormat = 'standard') {
    const key = `chat-format:${sessionKey}`;
    const snapshot = useCallback((): ResponseFormat => {
        try {
            const saved = sessionStorage.getItem(key);
            if (saved === 'standard' || saved === 'bullets' || saved === 'table') return saved;
        } catch { /* storage can be disabled */ }
        return fallback.get(key) ?? initial;
    }, [key, initial]);
    const value = useSyncExternalStore(subscribe, snapshot, () => initial);
    const change = (next: ResponseFormat) => {
        fallback.set(key, next);
        try { sessionStorage.setItem(key, next); } catch { /* retain the in-memory choice */ }
        window.dispatchEvent(new Event(EVENT));
    };
    return [value, change] as const;
}
