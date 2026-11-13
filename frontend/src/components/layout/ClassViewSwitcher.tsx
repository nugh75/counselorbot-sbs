'use client';

import { useId, useState } from 'react';
import { Layers } from 'lucide-react';
import { classViewOptions, currentClassView, parseClassView, saveClassView } from '@/lib/class-view';
import { classViewText } from '@/lib/i18n-class-view';
import { useI18n } from '@/lib/i18n-context';
import type { UserAccess } from '@/lib/user-access';
import { cn } from '@/lib/utils';

// Class dropdown at the top of /profilo (#146, #851): no class, all classes or
// one class, stored server side. Renders nothing for accounts without a class.
export function ClassViewSwitcher({ access, className }: { access: UserAccess | null; className?: string }) {
    const { lang } = useI18n();
    const [saving, setSaving] = useState(false);
    const [failed, setFailed] = useState(false);
    const id = useId();
    const options = classViewOptions(access);
    if (options.length === 0) return null;

    const label = classViewText(lang, 'label');
    const hint = classViewText(lang, 'hint');
    const optionLabel = (kind: string, name?: string) =>
        kind === 'class' ? classViewText(lang, 'class', name) : classViewText(lang, kind === 'all' ? 'all' : 'classes');

    const onChange = async (value: string) => {
        setSaving(true);
        setFailed(false);
        try {
            await saveClassView(parseClassView(value));
        } catch {
            setFailed(true);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={cn('flex flex-col gap-1', className)}>
            <label htmlFor={id} className="text-sm font-semibold text-ink">
                {label}
            </label>
            <div className="relative flex min-w-0 items-center">
                <Layers className="pointer-events-none absolute left-2 h-4 w-4 text-ink-muted" aria-hidden="true" />
                <select
                    id={id}
                    value={currentClassView(access)}
                    disabled={saving}
                    title={`${label}: ${hint}`}
                    aria-describedby={`${id}-hint`}
                    aria-invalid={failed || undefined}
                    onChange={(event) => onChange(event.target.value)}
                    className={cn(
                        'min-h-control w-full min-w-0 truncate rounded-full border border-line bg-surface-sunken py-1 pl-8 pr-8 text-sm text-ink-body hover:border-line-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60 sm:max-w-sm',
                        failed && 'border-danger',
                    )}
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {optionLabel(option.kind, option.name)}
                        </option>
                    ))}
                </select>
            </div>
            <span id={`${id}-hint`} className="text-xs text-ink-muted">{hint}</span>
            <span role="status" className={failed ? 'text-xs text-danger' : 'sr-only'}>
                {failed ? classViewText(lang, 'error') : ''}
            </span>
        </div>
    );
}
