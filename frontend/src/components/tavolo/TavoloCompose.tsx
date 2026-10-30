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
    aiAvailable?: boolean;
    onCompose: (preset: TavoloPresetId | null, prompt: string) => void | Promise<void>;
    onOpenExample?: (preset: TavoloPresetId, exampleId: string) => void | Promise<void>;
}

export function TavoloCompose({ busy, aiAvailable = true, onCompose, onOpenExample }: Props) {
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
        <section className="space-y-2 rounded-lg border border-line bg-surface p-4">
            <h2 className="text-sm text-ink">{label('compose')}</h2>
            <p className="text-xs text-ink-muted">{label('composeHint')}</p>

            <div role="group" aria-label={label('genre')} className="flex flex-wrap gap-1">
                {([null, ...PRESET_IDS] as (TavoloPresetId | null)[]).map((id) => (
                    <button key={id ?? 'auto'} type="button" onClick={() => setGenre(id)}
                        aria-pressed={genre === id}
                        className={`min-h-control rounded-lg border px-4 text-sm ${genre === id
                            ? 'border-brand bg-brand-soft text-link'
                            : 'border-line text-ink-body hover:bg-surface-sunken'}`}>
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
                className="w-full rounded-lg border border-line px-2 py-2 text-sm text-ink"
            />

            {chosen && chosen.prompts.length > 0 && (
                <div className="space-y-1">
                    <p className="text-xs text-ink-muted">{label('examples')}</p>
                    {chosen.prompts.map((example) => (
                        <button key={example} type="button" onClick={() => setPrompt(example)}
                            className="block min-h-control w-full rounded-lg border border-line px-2 py-2 text-left text-xs text-ink-muted hover:bg-surface-sunken">
                            {example}
                        </button>
                    ))}
                </div>
            )}

            <div className="flex gap-2">
                <button type="button" disabled={busy || !aiAvailable || !prompt.trim()}
                    onClick={() => void onCompose(genre, prompt)}
                    className="inline-flex min-h-control flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm text-ink-on-brand hover:bg-brand-hover disabled:opacity-40">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                    {label('composeGo')}
                </button>
            </div>

            {chosen && onOpenExample && chosen.examples.length > 0 && (
                // Gli esempi gia' fatti sono piu' di uno per genere: un elenco
                // di titoli, non un bottone, perche' la scelta e' fra tavoli e
                // non fra aprire e non aprire.
                <div className="space-y-1">
                    <p className="text-xs text-ink-muted">{label('readyTables')}</p>
                    {chosen.examples.map((example) => (
                        <button key={example.id} type="button" disabled={busy}
                            onClick={() => void onOpenExample(chosen.id, example.id)}
                            className="block min-h-control w-full rounded-lg border border-line px-2 py-2 text-left text-xs text-ink-body hover:bg-surface-sunken disabled:opacity-40">
                            {example.title}
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}
