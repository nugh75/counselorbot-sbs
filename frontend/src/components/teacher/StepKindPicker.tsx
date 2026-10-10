'use client';

import { useId } from 'react';
import { stepKindText } from '@/lib/i18n-step-kinds';
import { AVAILABLE_STEP_KINDS, STEP_KINDS, type StepKind } from '@/lib/path-step-kinds';

/** First choice of «+ Aggiungi passo»: what the student does; the form for that type follows. */
export function StepKindPicker({ lang, value, onChange }: { lang: string; value: StepKind | null; onChange: (kind: StepKind) => void }) {
    // Class and template editors can be open together: each picker has its own radio group.
    const name = useId();
    return <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-slate-800">{stepKindText(lang, 'question')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
            {STEP_KINDS.map(kind => {
                const available = AVAILABLE_STEP_KINDS.includes(kind);
                return <label key={kind} className={`flex min-h-[44px] items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                    value === kind ? 'border-indigo-600 bg-indigo-50 font-semibold text-slate-900' : 'border-slate-200 text-slate-700'
                } ${available ? 'cursor-pointer' : 'opacity-60'}`}>
                    <input type="radio" name={name} value={kind} checked={value === kind} disabled={!available}
                        onChange={() => onChange(kind)} className="h-4 w-4 accent-indigo-600" />
                    <span>{stepKindText(lang, kind)}{available ? '' : ` · ${stepKindText(lang, 'soon')}`}</span>
                </label>;
            })}
        </div>
        {!AVAILABLE_STEP_KINDS.includes('meeting') && <p className="text-xs text-slate-600">{stepKindText(lang, 'meetingSoon')}</p>}
    </fieldset>;
}
