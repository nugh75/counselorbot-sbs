'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import { Pencil, Trash2, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';
import type { Lang } from '@/lib/i18n';
import { parsePronunciations, pronunciationSnapshot, savePronunciations, subscribePronunciations, type PronunciationSettings } from '@/lib/voice-pronunciation';

export function PronunciationEditor({ language, onChange, onPreview }: { language: Lang; onChange: () => void; onPreview: (text: string, literal?: boolean) => void }) {
    const { t } = useI18n();
    const snapshot = useSyncExternalStore(subscribePronunciations, () => pronunciationSnapshot(language), () => '');
    const settings = parsePronunciations(snapshot, language);
    const [term, setTerm] = useState('');
    const [spoken, setSpoken] = useState('');
    const [preview, setPreview] = useState('');
    const [editing, setEditing] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const termInput = useRef<HTMLInputElement>(null);
    const update = (next: PronunciationSettings) => { onChange(); savePronunciations(language, next); };
    const inputClass = 'mt-1 min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-2 text-base font-normal';
    return <details className="rounded-md border border-slate-200 bg-white">
        <summary className="min-h-[44px] cursor-pointer px-3 py-3 text-sm font-semibold">{t('voice.pronunciation')} ({settings.rules.length})</summary>
        <div className="max-h-[40dvh] space-y-3 overflow-y-auto border-t border-slate-200 p-3">
            <p className="text-xs text-slate-600">{t('voice.pronunciationHelp')}</p>
            <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={settings.enabled} onChange={event => update({ ...settings, enabled: event.target.checked })} />{t('voice.pronunciationEnabled')}</label>
            <form className="space-y-2" onSubmit={event => {
                event.preventDefault();
                const cleanTerm = term.trim(), cleanSpoken = spoken.trim();
                if (!cleanTerm || !cleanSpoken) return;
                const rules = settings.rules.filter(rule => rule.term !== (editing ?? cleanTerm) && rule.term !== cleanTerm);
                if (rules.length >= 200) return;
                update({ ...settings, rules: [...rules, { term: cleanTerm, spoken: cleanSpoken }] });
                setTerm(''); setSpoken(''); setEditing(null);
            }}>
                <label className="block text-sm font-semibold">{t('voice.term')}<input ref={termInput} value={term} maxLength={100} required onChange={event => setTerm(event.target.value)} className={inputClass} /></label>
                <label className="block text-sm font-semibold">{t('voice.spoken')}<input value={spoken} maxLength={200} required onChange={event => setSpoken(event.target.value)} className={inputClass} /></label>
                <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={!term.trim() || !spoken.trim() || (!editing && settings.rules.length >= 200)}>{t('voice.saveRule')}</Button>
                    <Button type="button" variant="secondary" disabled={!spoken.trim()} onClick={() => onPreview(spoken.trim(), true)}><Volume2 className="h-4 w-4" />{t('voice.tryRule')}</Button>
                </div>
            </form>
            <label className="block text-sm font-semibold">{t('voice.searchRules')}<input type="search" value={search} onChange={event => setSearch(event.target.value)} className={inputClass} /></label>
            <div className="divide-y divide-slate-200">
                {settings.rules.filter(rule => `${rule.term} ${rule.spoken}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())).map(rule => <div key={rule.term} className="flex items-center gap-1 py-1">
                    <div className="min-w-0 flex-1 break-words text-sm"><span className="font-semibold">{rule.term}</span><span className="mx-1" aria-hidden="true">→</span>{rule.spoken}</div>
                    <Button type="button" variant="ghost" className="min-h-[44px] min-w-[44px] px-2" aria-label={t('voice.editRule', { term: rule.term })} onClick={() => { setTerm(rule.term); setSpoken(rule.spoken); setEditing(rule.term); termInput.current?.focus(); }}><Pencil className="h-4 w-4" /></Button>
                    <Button type="button" variant="ghost" className="min-h-[44px] min-w-[44px] px-2" aria-label={t('voice.deleteRule', { term: rule.term })} onClick={() => update({ ...settings, rules: settings.rules.filter(r => r.term !== rule.term) })}><Trash2 className="h-4 w-4" /></Button>
                </div>)}
            </div>
            <label className="block text-sm font-semibold">{t('voice.previewText')}<textarea value={preview} maxLength={2000} onChange={event => setPreview(event.target.value)} className={`${inputClass} min-h-20 py-2`} /></label>
            <Button type="button" variant="secondary" disabled={!preview.trim()} onClick={() => onPreview(preview)}>{t('voice.previewPronunciation')}</Button>
        </div>
    </details>;
}
