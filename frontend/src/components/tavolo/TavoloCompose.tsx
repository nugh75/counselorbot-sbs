'use client';

// La terna che fa nascere uno schema: il genere, la casella, gli esempi.
//
// Il genere non e' un prompt precompilato: restringe il vocabolario sul server,
// prima che il modello parli. Qui serve a due cose, dire in che lingua si
// pensa lo schema e offrire i due prompt d'esempio di quel genere.

import { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import {
    PRESET_IDS,
    fetchPresets,
    type TavoloPreset,
    type TavoloPresetId,
} from '@/lib/tavolo';
import { tavoloLabel } from '@/lib/i18n-tavolo';

const GENRE_LABEL: Record<TavoloPresetId, Parameters<typeof tavoloLabel>[0]> = {
    workflow: 'genreWorkflow',
    causal: 'genreCausal',
    concept: 'genreConcept',
    argument: 'genreArgument',
    algorithm: 'genreAlgorithm',
};

interface Props {
    busy: boolean;
    onCompose: (preset: TavoloPresetId | null, prompt: string) => void | Promise<void>;
    onOpenExample?: (preset: TavoloPresetId) => void | Promise<void>;
}

export function TavoloCompose({ busy, onCompose, onOpenExample }: Props) {
    const { lang } = useI18n();
    const label = (key: Parameters<typeof tavoloLabel>[0]) => tavoloLabel(key, lang);
    const [presets, setPresets] = useState<TavoloPreset[]>([]);
    const [genre, setGenre] = useState<TavoloPresetId | null>(null);
    const [prompt, setPrompt] = useState('');

    useEffect(() => {
        let alive = true;
        // I generi non bloccano la casella: se la chiamata non arriva, si
        // scrive lo stesso e il modello scegli il genere da se'.
        fetchPresets(lang).then((next) => { if (alive) setPresets(next); }).catch(() => undefined);
        return () => { alive = false; };
    }, [lang]);

    const chosen = presets.find((preset) => preset.id === genre);

    return (
        <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <h2 className="text-sm font-medium text-slate-800">{label('compose')}</h2>
            <p className="text-xs text-slate-500">{label('composeHint')}</p>

            <div role="group" aria-label={label('genre')} className="flex flex-wrap gap-1">
                {([null, ...PRESET_IDS] as (TavoloPresetId | null)[]).map((id) => (
                    <button key={id ?? 'auto'} type="button" onClick={() => setGenre(id)}
                        aria-pressed={genre === id}
                        className={`min-h-11 rounded-lg border px-3 text-sm ${genre === id
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                        {id ? label(GENRE_LABEL[id]) : label('genreAuto')}
                    </button>
                ))}
            </div>

            <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value.slice(0, 1200))}
                placeholder={label('composePlaceholder')}
                rows={3}
                aria-label={label('compose')}
                className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-800"
            />

            {chosen && chosen.prompts.length > 0 && (
                <div className="space-y-1">
                    <p className="text-xs font-medium text-slate-500">{label('examples')}</p>
                    {chosen.prompts.map((example) => (
                        <button key={example} type="button" onClick={() => setPrompt(example)}
                            className="block w-full rounded-lg border border-slate-200 px-2 py-2 text-left text-xs text-slate-600 hover:bg-slate-50">
                            {example}
                        </button>
                    ))}
                </div>
            )}

            <div className="flex gap-2">
                <button type="button" disabled={busy || !prompt.trim()}
                    onClick={() => void onCompose(genre, prompt)}
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                    {label('composeGo')}
                </button>
                {chosen?.has_example && onOpenExample && (
                    <button type="button" disabled={busy} onClick={() => void onOpenExample(chosen.id)}
                        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 px-3 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                        {label('openExample')}
                    </button>
                )}
            </div>
        </section>
    );
}
