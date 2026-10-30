'use client';
import { cloneElement, useId, type ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { GoalError } from '@/lib/goals';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import { visualLabel } from '@/lib/i18n-visual-tools';
export const input = 'mt-1 block min-h-control w-full min-w-0 rounded-control border border-line-strong bg-surface px-4 py-2 text-base text-ink';
export function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
    const id = useId();
    return <div className="min-w-0 text-sm font-semibold text-ink-body"><label htmlFor={id}>{label}</label>{cloneElement(children, { id })}</div>;
}
export function GoalIssue({ error, lang, retry }: { error: unknown; lang: string; retry?: () => void }) {
    if (!error) return null;
    const key: GoalTextKey = error instanceof GoalError && error.status === 409 ? 'conflict' : error instanceof GoalError && error.status === 401 ? 'login' : 'error';
    return <Callout variant="danger"><div className="space-y-2"><p>{goalText(lang, key)}</p>{retry && <Button type="button" variant="secondary" onClick={retry}>{goalText(lang, key === 'conflict' ? 'reload' : 'retry')}</Button>}</div></Callout>;
}
export function resourceLabel(lang: string, kind: string) {
    const keys: Record<string, string> = { action: 'activity', event: 'timeline', card: 'cards', comparison: 'comparison', portfolio: 'portfolio', notebook: 'notebook' };
    if (kind === 'reading' || kind === 'session') return goalText(lang, kind as GoalTextKey);
    return kind === 'portfolio' ? 'Portfolio' : kind === 'tavolo' ? 'Tavolo' : visualLabel(lang, keys[kind] || kind);
}
