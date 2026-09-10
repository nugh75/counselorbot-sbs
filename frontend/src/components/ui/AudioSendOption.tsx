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

export function AudioSendOption() {
    const { t } = useI18n();
    const enabled = useAudioAutoSend();
    return <label className="flex min-h-[44px] cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-sm text-slate-600 hover:bg-slate-50">
        <input type="checkbox" checked={enabled} className="mt-1 shrink-0 accent-indigo-600" onChange={eventObject => {
            sessionValue = eventObject.target.checked;
            try { localStorage.setItem(key, String(sessionValue)); } catch { /* Retain this visit's choice. */ }
            window.dispatchEvent(new Event(event));
        }} />
        <span>{t('audio.autoSend')}<span className="mt-1 block text-xs text-slate-500">{t('audio.autoSendHelp')}</span></span>
    </label>;
}
