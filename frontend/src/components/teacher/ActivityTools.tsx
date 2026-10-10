'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { activityToolHref, type ActivityTool } from '@/lib/activity-tools';
import { activityToolText } from '@/lib/i18n-activity-tools';
import { classSettingsText, classSettingsTexts } from '@/lib/i18n-class-settings';
import { resolveClassPathToolName } from '@/lib/class-paths-tool-names';
import { Button } from '@/components/ui/Button';

export function activityToolName(key: string, lang: string): string {
    return key in classSettingsTexts ? classSettingsText(lang, key as keyof typeof classSettingsTexts) : resolveClassPathToolName(key, lang);
}

/** #174: the teacher picks the personal tools an activity asks the student to use. */
export function ActivityToolsPicker({ lang, options, value, onChange, note }: {
    lang: string; options: string[]; value: string[]; onChange: (keys: string[]) => void; note?: string | null;
}) {
    return <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{activityToolText(lang, 'tools')}</legend>
        <p className="text-xs text-slate-600">{activityToolText(lang, 'toolsHelp')}</p>
        {note ? <p className="text-sm text-slate-600">{note}</p> : <div className="grid gap-1 sm:grid-cols-2">
            {options.map(key => <label key={key} className="flex min-h-[44px] items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-indigo-600" checked={value.includes(key)}
                    onChange={event => onChange(event.target.checked ? [...value, key] : value.filter(item => item !== key))} />
                {activityToolName(key, lang)}
            </label>)}
        </div>}
    </fieldset>;
}

/** The activity's tools: each opens in a popup inside the activity, or at full page. */
export function ActivityToolsList({ lang, tools, interactive = true }: { lang: string; tools: ActivityTool[]; interactive?: boolean }) {
    const [open, setOpen] = useState<string | null>(null);
    if (!tools.length) return null;
    return <div className="space-y-2 text-sm">
        <p className="font-semibold">{activityToolText(lang, 'tools')}</p>
        <ul className="space-y-2">
            {tools.map(tool => <li key={tool.key} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white p-2">
                <span className="min-w-0 flex-1 font-medium text-slate-800">{activityToolName(tool.key, lang)}</span>
                {!tool.available ? <span className="text-xs text-slate-600">{activityToolText(lang, 'unavailable')}</span>
                    : interactive && <>
                        <Button variant="secondary" size="sm" type="button" onClick={() => setOpen(tool.key)}>{activityToolText(lang, 'openHere')}</Button>
                        <a href={activityToolHref(tool.key)} target="_blank" rel="noopener"
                            className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline">
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />{activityToolText(lang, 'openFullPage')}
                        </a>
                    </>}
            </li>)}
        </ul>
        {open && <ToolPopup lang={lang} toolKey={open} close={() => setOpen(null)} />}
    </div>;
}

function ToolPopup({ lang, toolKey, close }: { lang: string; toolKey: string; close: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const heading = useId();
    const name = activityToolName(toolKey, lang);
    useEffect(() => {
        // A modal dialog keeps focus inside and closes on Esc; focus returns to the opener.
        const opener = document.activeElement as HTMLElement | null;
        dialog.current?.showModal();
        return () => opener?.focus();
    }, []);
    return <dialog ref={dialog} aria-labelledby={heading} onClose={close} data-testid="activity-tool-popup"
        className="fixed inset-0 m-auto h-[90dvh] w-[calc(100%-1rem)] max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/40">
        <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
                <h2 id={heading} className="min-w-0 truncate font-semibold">{name}</h2>
                <div className="flex items-center gap-2">
                    <a href={activityToolHref(toolKey)} target="_blank" rel="noopener"
                        className="hidden min-h-[44px] items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline sm:inline-flex">
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />{activityToolText(lang, 'openFullPage')}
                    </a>
                    <Button variant="secondary" size="sm" type="button" autoFocus onClick={() => dialog.current?.close()}
                        aria-label={activityToolText(lang, 'close')} title={activityToolText(lang, 'close')}>
                        <X className="h-4 w-4" aria-hidden />
                    </Button>
                </div>
            </div>
            <iframe title={name} src={activityToolHref(toolKey, true)} className="min-h-0 w-full flex-1 border-0" />
        </div>
    </dialog>;
}
