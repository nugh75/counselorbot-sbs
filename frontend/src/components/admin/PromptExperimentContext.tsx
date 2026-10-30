import type { Lang } from '@/lib/i18n';
import { promptLabContextCopy } from './prompt-lab-context-copy';
import { cn } from '@/lib/utils';

export interface PromptTarget {
    id: string;
    label: string;
    sort_order?: number;
    prompt?: string;
    system_prompt_mode?: string;
    questionnaire_type?: string;
    label_i18n?: Record<string, string> | null;
}

export function targetLabel(target: PromptTarget, lang: Lang): string {
    return target.label_i18n?.[lang] || target.label;
}

export function PromptExperimentContext({ targetKey, steps, baseline, frozen, lang }: {
    targetKey: string; steps: PromptTarget[]; baseline?: string; frozen: boolean; lang: Lang;
}) {
    const C = promptLabContextCopy[lang];
    const ordered = [...steps].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const target = ordered.find((s) => s.id === targetKey);
    return <section aria-label={C.location} className="space-y-4 rounded-lg border border-line bg-surface p-4 text-sm text-ink-body">
        <h4 className="font-semibold text-ink">{C.location}</h4>
        <p className="font-semibold text-link">{C.path} → {target ? targetLabel(target, lang) : targetKey}</p>
        <p>{C.scope}</p>
        {frozen && <p className="text-xs text-ink-muted">{C.frozen}</p>}
        {target ? <ol className="flex flex-wrap gap-2" aria-label={C.path}>
            {ordered.map((step) => <li key={step.id} aria-current={step.id === targetKey ? 'step' : undefined}
                className={cn('rounded-control border px-2 py-1 text-xs', step.id === targetKey ? 'border-brand-line bg-brand-soft font-semibold text-link' : 'border-line text-ink-muted')}>
                {targetLabel(step, lang)}
            </li>)}
        </ol> : <p>{C.unavailable}</p>}
        <p>{C.composition}</p>
        <div>
            <h5 className="mb-1 font-semibold">{frozen ? C.baseline : C.preview}</h5>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-control border border-line bg-surface-sunken p-4 font-sans text-sm">{baseline ?? target?.prompt ?? C.unavailable}</pre>
        </div>
        <details className="text-xs text-ink-muted">
            <summary className="cursor-pointer">{C.technical}</summary>
            <p className="mt-2 break-all font-mono">{`guided_steps.prompt · id=${targetKey} · system_prompt_mode=${target?.system_prompt_mode ?? '—'}`}</p>
        </details>
    </section>;
}
