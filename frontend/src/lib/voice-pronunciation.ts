import type { Lang } from './i18n';
import importedDefaults from './voice-pronunciation-defaults.json';

export type PronunciationRule = { term: string; spoken: string };
export type PronunciationSettings = { enabled: boolean; rules: PronunciationRule[] };
// Complete dictionary from TD_daniele be44ce5, unchanged: 80 IT + 49 EN rules.
// Keep the imported file byte-for-byte; user corrections live separately.
const defaults: Partial<Record<Lang, Record<string, string>>> = {
    it: importedDefaults.italiano, en: importedDefaults.inglese,
};
export const pronunciationDefaults = (lang: Lang): PronunciationSettings => ({ enabled: true, rules: Object.entries(defaults[lang] ?? {}).map(([term, spoken]) => ({ term, spoken })) });
const key = (lang: Lang) => `cb_pronunciation_${lang}`;
const eventName = 'counselorbot-pronunciation-change';
const memory = new Map<Lang, string>();
export function pronunciationSnapshot(lang: Lang): string {
    try { return localStorage.getItem(key(lang)) || memory.get(lang) || ''; } catch { return memory.get(lang) || ''; }
}
export function parsePronunciations(snapshot: string, lang: Lang): PronunciationSettings {
    try {
        const data = JSON.parse(snapshot);
        if (typeof data.enabled !== 'boolean' || !Array.isArray(data.rules)) return pronunciationDefaults(lang);
        return { enabled: data.enabled, rules: data.rules.filter((r: PronunciationRule) => typeof r?.term === 'string' && typeof r?.spoken === 'string' && r.term.trim() && r.spoken.trim() && r.term.length <= 100 && r.spoken.length <= 200).slice(0, 200) };
    } catch { return pronunciationDefaults(lang); }
}
export function savePronunciations(lang: Lang, settings: PronunciationSettings) {
    const value = JSON.stringify(settings);
    memory.set(lang, value);
    try { localStorage.setItem(key(lang), value); } catch { /* Available for this visit. */ }
    window.dispatchEvent(new Event(eventName));
}
export function subscribePronunciations(notify: () => void) {
    window.addEventListener('storage', notify);
    window.addEventListener(eventName, notify);
    return () => { window.removeEventListener('storage', notify); window.removeEventListener(eventName, notify); };
}
export function pronunciationRules(lang: Lang) {
    const settings = parsePronunciations(pronunciationSnapshot(lang), lang);
    return settings.enabled ? settings.rules : [];
}
