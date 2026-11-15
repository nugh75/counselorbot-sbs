'use client';

import { useSyncExternalStore } from 'react';
import { useI18n } from '@/lib/i18n-context';

const key = 'cb_audio_auto_send';
const event = 'counselorbot-audio-preference';
let sessionValue = false;
function read() {
    try { return localStorage.getItem(key) === 'true'; } catch { return sessionValue; }
}
function subscribe(notify: () => void) {
    window.addEventListener('storage', notify);
    window.addEventListener(event, notify);
    return () => { window.removeEventListener('storage', notify); window.removeEventListener(event, notify); };
}
export function useAudioAutoSend() {
    return useSyncExternalStore(subscribe, read, () => false);
}

export function AudioSendOption({ compact = false }: { compact?: boolean }) {
    const { t } = useI18n();
    const enabled = useAudioAutoSend();
    return <label className="flex min-h-control cursor-pointer items-start gap-2 rounded-control px-2 py-2 text-sm text-ink-body hover:bg-surface-sunken">
        <input type="checkbox" checked={enabled} className="mt-1 shrink-0 accent-brand" onChange={eventObject => {
            sessionValue = eventObject.target.checked;
            try { localStorage.setItem(key, String(sessionValue)); } catch { /* Retain this visit's choice. */ }
            window.dispatchEvent(new Event(event));
        }} />
        <span>{t(compact ? 'audio.autoSendShort' : 'audio.autoSend')}{!compact && <span className="mt-1 block text-xs text-ink-muted">{t('audio.autoSendHelp')}</span>}</span>
    </label>;
}
