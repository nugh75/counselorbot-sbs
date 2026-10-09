'use client';

import { useId, useState } from 'react';
import { Layers } from 'lucide-react';
import { classViewOptions, currentClassView, parseClassView, saveClassView } from '@/lib/class-view';
import { classViewText } from '@/lib/i18n-class-view';
import { useI18n } from '@/lib/i18n-context';
import { useUserAccess } from '@/lib/use-user-access';
import { cn } from '@/lib/utils';

// Student view switcher (#146): full view or a class view, stored server side.
// Renders nothing for students with no class and for staff.
export function ClassViewSwitcher({ labelled = false, className }: { labelled?: boolean; className?: string }) {
    const { lang } = useI18n();
    const { access } = useUserAccess();
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
        <div className={cn(labelled ? 'flex flex-col gap-1' : 'flex min-w-0 items-center', className)}>
            <label
                htmlFor={id}
                className={labelled ? 'text-2xs font-semibold uppercase tracking-wide text-slate-500' : 'sr-only'}
            >
                {label}
            </label>
            <div className="relative flex min-w-0 items-center">
                <Layers className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                <select
                    id={id}
                    value={currentClassView(access)}
                    disabled={saving}
                    title={`${label}: ${hint}`}
                    aria-describedby={`${id}-hint`}
                    aria-invalid={failed || undefined}
                    onChange={(event) => onChange(event.target.value)}
                    className={cn(
                        'min-h-[44px] w-full min-w-0 truncate rounded-full border border-slate-200 bg-slate-50 py-1 pl-8 pr-7 text-sm font-medium text-slate-700 hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 lg:min-h-0 lg:max-w-48 xl:max-w-56',
                        failed && 'border-red-400 dark:border-red-500',
                    )}
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {optionLabel(option.kind, option.name)}
                        </option>
                    ))}
                </select>
            </div>
            <span id={`${id}-hint`} className={labelled ? 'text-xs text-slate-500' : 'sr-only'}>{hint}</span>
            <span role="status" className={failed ? 'text-xs text-red-600 dark:text-red-400' : 'sr-only'}>
                {failed ? classViewText(lang, 'error') : ''}
            </span>
        </div>
    );
}
