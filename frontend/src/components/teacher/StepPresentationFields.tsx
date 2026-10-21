'use client';

import { useId, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { classPathText, type PathTextKey } from '@/lib/i18n-class-paths';
import { Button } from '@/components/ui/Button';
import type { StepPresentation } from '@/lib/class-path-presentation';

const link = 'text-xs font-semibold text-indigo-700 hover:underline';
const field = 'mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none';

function formatDate(lang: string, iso: string) {
    // Noon avoids the previous day in negative timezones: the value is a calendar day.
    return new Date(`${iso}T12:00:00`).toLocaleDateString(lang);
}

/**
 * A step already names its object. The title and the date are overrides, shown
 * only when the teacher asks for one; the note stays empty unless it adds
 * something the object's own page does not already say.
 */
export function StepPresentationFields({ presentation, step, update, showDate = true }: {
    showDate?: boolean;
    presentation: StepPresentation;
    step: {step_type?: string | null; title?: string | null; instructions?: string | null; due_date?: string | null};
    update: (patch: {title?: string | null; instructions?: string | null; due_date?: string | null}) => void;
}) {
    const { lang } = useI18n();
    const l = (key: PathTextKey) => classPathText(lang, key);
    const titleId = useId();
    const noteId = useId();
    const dateId = useId();
    const [editingTitle, setEditingTitle] = useState(presentation.titleSource === 'override' || step.step_type === 'forum');
    const [noteOpen, setNoteOpen] = useState(presentation.note != null);
    const [dateOpen, setDateOpen] = useState(Boolean(step.due_date));
    const noteLength = step.instructions?.length ?? 0;
    const source = presentation.dueDateSource === 'meeting' ? l('dateFromMeeting')
        : presentation.dueDateSource === 'assignment' ? l('dateFromAssignment')
        : presentation.dueDateSource === 'administration' ? l('dateFromAdministration')
        : presentation.dueDateSource === 'override' ? l('dateOverrideLabel')
        : null;

    return <div className="space-y-2">
        {step.step_type === 'forum' || editingTitle || presentation.titleSource === 'override' ? <div>
            <label htmlFor={titleId} className="text-xs font-medium text-slate-700">{l('stepTitleLabel')}</label>
            <input id={titleId} type="text" value={step.title ?? ''} maxLength={200}
                placeholder={presentation.derivedTitle}
                onChange={event => update({title: event.target.value})}
                aria-describedby={`${titleId}-help`}
                className={field} />
            <div id={`${titleId}-help`} className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span>{l('studentSees')} <strong className="font-medium text-slate-700">{presentation.title}</strong></span>
                {step.step_type !== 'forum' && <Button type="button" variant="ghost" size="sm" className={link} onClick={() => { update({title: null}); setEditingTitle(false); }}>{l('useDefaultTitle')}</Button>}
            </div>
        </div> : <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span><span className="font-medium text-slate-700">{l('stepTitleLabel')}:</span> {presentation.derivedTitle}</span>
            <Button type="button" variant="ghost" size="sm" className={link} onClick={() => setEditingTitle(true)}>{l('personalizeTitle')}</Button>
        </div>}
        {step.step_type === 'forum' && <p className="text-xs text-slate-500">{l('forumTitleRequired')}</p>}

        {noteOpen || presentation.note != null ? <div>
            <label htmlFor={noteId} className="text-xs font-medium text-slate-700">{l('noteLabel')}</label>
            <textarea id={noteId} rows={2} maxLength={1000} value={step.instructions ?? ''}
                onChange={event => update({instructions: event.target.value})}
                aria-describedby={`${noteId}-help`}
                className={field} />
            <div id={`${noteId}-help`} className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span className="min-w-0 flex-1">{l('noteHelp')}</span>
                <span>{`${noteLength}/1000`}</span>
            </div>
            {step.instructions ? <Button type="button" variant="ghost" size="sm" className={link} onClick={() => { update({instructions: null}); setNoteOpen(false); }}>{l('removeNote')}</Button> : null}
        </div> : <div>
            <Button type="button" variant="ghost" size="sm" className={link} onClick={() => setNoteOpen(true)}>{l('addNote')}</Button>
        </div>}

        {showDate && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
            <span className="font-medium text-slate-700"><label htmlFor={dateId}>{l('dueDateLabel')}:</label></span>
            {(dateOpen && step.step_type !== 'meeting') || step.due_date ? <>
                <input id={dateId} type="date" value={step.due_date ?? ''}
                    onChange={event => update({due_date: event.target.value || null})}
                    aria-label={l('dueDateLabel')}
                    className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-800 focus:border-indigo-600 focus:outline-none" />
                <Button type="button" variant="ghost" size="sm" className={link} onClick={() => {
                    update({due_date: null});
                    setDateOpen(false);
                }}>{presentation.dueDateSource ? l('useObjectDate') : l('removeDate')}</Button>
                {presentation.dueDate && <span className="text-slate-500">{`${presentation.dueDate} · ${source}`}</span>}
            </> : <>
                <span>{presentation.dueDate ? `${formatDate(lang, presentation.dueDate)} · ${source}` : l('noDate')}</span>
                {step.step_type !== 'meeting' && <Button type="button" variant="ghost" size="sm" className={link} onClick={() => setDateOpen(true)}>
                    {presentation.dueDateSource ? l('differentDate') : l('addDate')}
                </Button>}
            </>}
        </div>}
    </div>;
}
