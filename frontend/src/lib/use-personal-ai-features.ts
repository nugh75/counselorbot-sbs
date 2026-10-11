'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getViewAsAccount } from './auth';
import { chatgptRequest, type ChatGPTStatus } from './chatgpt';

export function usePersonalAIFeatures() {
    const [features, setFeatures] = useState({ personalAPI: false, chatgpt: false });
    useEffect(() => {
        const controller = new AbortController();
        if (getViewAsAccount()) return;
        let generation = 0;
        const load = async () => {
            const current = ++generation;
            const [api, chatgpt] = await Promise.allSettled([
                apiFetch('/api/user/api-settings', { signal: controller.signal, cache: 'no-store' }).then(async response => response.ok ? response.json() : { available: false }),
                chatgptRequest<ChatGPTStatus>('', 'GET', undefined, controller.signal),
            ]);
            if (controller.signal.aborted || current !== generation) return;
            setFeatures({ personalAPI: api.status === 'fulfilled' && api.value.available === true, chatgpt: chatgpt.status === 'fulfilled' && chatgpt.value.enabled === true });
        };
        void load();
        window.addEventListener('focus', load);
        window.addEventListener('chatgpt-connection-changed', load);
        return () => { controller.abort(); window.removeEventListener('focus', load); window.removeEventListener('chatgpt-connection-changed', load); };
    }, []);
    return features;
}
