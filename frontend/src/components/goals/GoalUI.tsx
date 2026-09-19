'use client';
import { cloneElement, useId, type ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { GoalError } from '@/lib/goals';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import { visualLabel } from '@/lib/i18n-visual-tools';
export const input = 'mt-1 block min-h-11 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-900';
export function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
    const id = useId();
    return <div className="min-w-0 text-sm font-medium text-slate-700"><label htmlFor={id}>{label}</label>{cloneElement(children, { id })}</div>;
}
export function GoalIssue({ error, lang, retry }: { error: unknown; lang: string; retry?: () => void }) {
    if (!error) return null;
    const key: GoalTextKey = error instanceof GoalError && error.status === 409 ? 'conflict' : error instanceof GoalError && error.status === 401 ? 'login' : 'error';
    return <div role="alert" className="space-y-2 rounded-md border border-red-200 bg-red-50 p-3 text-red-800"><p>{goalText(lang, key)}</p>{retry && <Button type="button" variant="secondary" onClick={retry}>{goalText(lang, key === 'conflict' ? 'reload' : 'retry')}</Button>}</div>;
}
export function resourceLabel(lang: string, kind: string) {
    const keys: Record<string, string> = { action: 'activity', event: 'timeline', card: 'cards', comparison: 'comparison', portfolio: 'portfolio', notebook: 'notebook', booklet: 'booklet' };
    return kind === 'portfolio' ? 'Portfolio' : kind === 'tavolo' ? 'Tavolo' : visualLabel(lang, keys[kind] || kind);
}
