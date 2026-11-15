'use client';

import { useSyncExternalStore } from 'react';
import { LANGUAGES, type Lang } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';
import { Select } from '@/components/ui/Field';

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

export function AudioLanguageOption({ compact = false }: { compact?: boolean }) {
    const { t } = useI18n();
    const selected = useAudioLanguage();
    return <label className={`${compact ? 'flex items-center gap-2' : 'block'} rounded-control px-2 py-2 text-sm text-ink-body`}>
        <span className={`${compact ? 'min-w-0 flex-1' : 'font-semibold text-ink-body'}`}>{t(compact ? 'audio.languageShort' : 'audio.language')}</span>
        <Select value={selected} aria-label={t('audio.language')} className={compact ? 'w-auto max-w-36' : 'mt-1'}
            onChange={eventObject => {
                sessionValue = eventObject.target.value as SpeechLanguage;
                try { localStorage.setItem(key, sessionValue); } catch { /* Retain this visit's choice. */ }
                window.dispatchEvent(new Event(event));
            }}>
            <option value="auto">{t('audio.languageAuto')}</option>
            {LANGUAGES.map(language => <option key={language.code} value={language.code}>{language.label}</option>)}
        </Select>
        {!compact && <span className="mt-1 block text-xs text-ink-muted">{t('audio.languageHelp')}</span>}
    </label>;
}
