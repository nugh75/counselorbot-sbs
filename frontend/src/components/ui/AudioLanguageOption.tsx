'use client';

import { useSyncExternalStore } from 'react';
import { LANGUAGES, type Lang } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';

export type SpeechLanguage = 'auto' | Lang;

const key = 'cb_audio_language';
const event = 'counselorbot-audio-preference';
const allowed = new Set<string>(['auto', ...LANGUAGES.map(language => language.code)]);
let sessionValue: SpeechLanguage = 'auto';
function read(): SpeechLanguage {
    try {
        const stored = localStorage.getItem(key) || '';
        return allowed.has(stored) ? stored as SpeechLanguage : sessionValue;
    } catch { return sessionValue; }
}
function subscribe(notify: () => void) {
    window.addEventListener('storage', notify);
    window.addEventListener(event, notify);
    return () => { window.removeEventListener('storage', notify); window.removeEventListener(event, notify); };
}
export function useAudioLanguage(): SpeechLanguage {
    return useSyncExternalStore(subscribe, read, () => 'auto' as SpeechLanguage);
}

export function AudioLanguageOption() {
    const { t } = useI18n();
    const selected = useAudioLanguage();
    return <label className="block rounded-md px-2 py-2 text-sm text-slate-600">
        <span className="font-medium text-slate-700">{t('audio.language')}</span>
        <select value={selected} aria-label={t('audio.language')} className="mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm"
            onChange={eventObject => {
                sessionValue = eventObject.target.value as SpeechLanguage;
                try { localStorage.setItem(key, sessionValue); } catch { /* Retain this visit's choice. */ }
                window.dispatchEvent(new Event(event));
            }}>
            <option value="auto">{t('audio.languageAuto')}</option>
            {LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.label}</option>)}
        </select>
        <span className="mt-1 block text-xs text-slate-500">{t('audio.languageHelp')}</span>
    </label>;
}
