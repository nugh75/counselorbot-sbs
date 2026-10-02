'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { classPickerText } from '@/lib/i18n-class-picker';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { teacherLoadingText } from '@/lib/i18n-teacher-loading';
import type { Institution } from '@/lib/referrals-api';
import { Button } from '@/components/ui/Button';
import { useTeacherResource } from './useTeacherResource';
import { parseClassGroups } from './class-group-types';
import { classGroupTexts } from './class-group-texts';
import { useClassGroupEditors } from './useClassGroupEditors';
import { ClassGroupEditor } from './ClassGroupEditor';

function parseInstitutions(payload: unknown): Institution[] {
    if (!Array.isArray(payload)) throw new Error('invalid institutions');
    return payload as Institution[];
}

function focusSnapshot() {
    const active = document.activeElement;
    const text = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement ? active : null;
    const start = text?.selectionStart; const end = text?.selectionEnd; const direction = text?.selectionDirection;
    return () => {
        if (!(active instanceof HTMLElement) || !active.isConnected) return;
        active.focus({ preventScroll: true });
        if (text && start != null && end != null) text.setSelectionRange(start, end, direction ?? undefined);
    };
}

function trapTab(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), textarea:not(:disabled), input:not(:disabled), [tabindex="0"]'))
        .filter(control => control.getClientRects().length > 0);
    const first = controls[0]; const last = controls.at(-1);
    if (first && last && (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
    }
}

// Native modal dialogs provide keyboard trapping/inert background and focus return.
// No notebook/session values enter this component. S13 owns all drafts and PUTs.
export function ClassGroupPicker({ close, onNavigationState }: {
    close: () => void;
    onNavigationState: (state: { dirty: boolean; busy: boolean }) => void;
}) {
    const { lang, t } = useI18n();
    const texts = classGroupTexts[lang as keyof typeof classGroupTexts] ?? classGroupTexts.en;
    const l = (key: Parameters<typeof classPickerText>[1]) => classPickerText(lang, key);
    const groups = useTeacherResource('/api/admin/groups', parseClassGroups);
    const institutions = useTeacherResource('/api/institutions', parseInstitutions);
    const editors = useClassGroupEditors(groups.data, groups.reload);
    const [selected, setSelected] = useState('');
    const [transition, setTransition] = useState<{ run: () => void; restore: () => void } | null>(null);
    const dialog = useRef<HTMLDialogElement>(null);
    const confirmation = useRef<HTMLDialogElement>(null);
    const pointerFocus = useRef<ReturnType<typeof focusSnapshot> | null>(null);
    const heading = useId(); const confirmHeading = useId(); const hint = useId(); const picker = useId();
    const group = groups.data?.find(row => String(row.id) === selected);
    const forbidden = groups.forbidden || institutions.forbidden || editors.forbidden;
    const blocked = editors.busy;
    // The notebook owns ONE page-navigation guard. Multiple guards would stack
    // history markers on legacy browsers and mix the two independent drafts.
    useEffect(() => { onNavigationState({ dirty: !forbidden && editors.dirty, busy: blocked }); }, [onNavigationState, forbidden, editors.dirty, blocked]);
    useEffect(() => () => { onNavigationState({ dirty: false, busy: false }); }, [onNavigationState]);

    useEffect(() => {
        const modal = dialog.current;
        const restore = focusSnapshot();
        modal?.showModal();
        return () => { modal?.close(); restore(); };
    }, []);
    useEffect(() => {
        if (transition) confirmation.current?.showModal();
    }, [transition]);

    const request = (run: () => void) => {
        const restore = pointerFocus.current ?? focusSnapshot();
        pointerFocus.current = null;
        if (blocked) { restore(); return; }
        if (!forbidden && group && editors.states[group.id]?.dirty) setTransition({ run, restore });
        else run();
    };
    const keep = () => {
        confirmation.current?.close();
        transition?.restore();
        setTransition(null);
    };
    const ready = !forbidden && groups.data !== undefined;
    return <dialog ref={dialog} aria-labelledby={heading} aria-describedby={hint}
        onPointerDownCapture={() => { pointerFocus.current = focusSnapshot(); }}
        onKeyDownCapture={() => { pointerFocus.current = null; }}
        onKeyDown={event => { if (!transition) trapTab(event); }}
        onCancel={event => { event.preventDefault(); request(close); }}
        onClick={event => {
            if (event.target !== event.currentTarget) return;
            const rect = event.currentTarget.getBoundingClientRect();
            if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) request(close);
        }}
        className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl backdrop:bg-black/40">
        <div className="mb-3 flex items-start justify-between gap-2">
            <h2 id={heading} className="min-w-0 break-words text-lg font-bold">{l('title')}</h2>
            <Button type="button" variant="ghost" aria-label={t('common.close')} title={t('common.close')} disabled={blocked} onClick={() => request(close)} className="shrink-0 px-3"><X aria-hidden="true" className="h-5 w-5" /></Button>
        </div>
        <label className="block text-sm font-semibold text-slate-700" htmlFor={picker}>{l('label')}</label>
        <select id={picker} autoFocus value={ready ? selected : ''} disabled={!ready || blocked || groups.loading || groups.failed}
            onChange={event => { const value = event.target.value; request(() => setSelected(value)); }}
            className="mt-1 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
            <option value="">{l('choose')}</option>
            {ready && groups.data?.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
        {forbidden ? <p role="alert" className="mt-3 text-sm text-red-600">{teacherAreaText(lang, 'forbidden')}</p> : <>
            {(groups.loading || institutions.loading) && <p role="status" className="mt-3 text-sm text-slate-500">{t('common.loading')}</p>}
            {groups.failed && <div role="alert" className="mt-3 text-sm text-red-600">
                <p>{teacherLoadingText(lang, 'classes')}</p><Button type="button" variant="secondary" disabled={groups.loading || blocked} onClick={() => void groups.reload()}>{t('setup.retry')}</Button>
            </div>}
            {institutions.failed && <div role="alert" className="mt-3 text-sm text-red-600">
                <p>{l('institutionsError')}</p><Button type="button" variant="secondary" disabled={institutions.loading || blocked} onClick={() => void institutions.reload()}>{t('setup.retry')}</Button>
            </div>}
            {!groups.loading && !groups.failed && groups.data?.length === 0 && <p className="mt-3 text-sm text-slate-600">{texts.empty}</p>}
            {group && <div className="mt-4 min-w-0 space-y-3">
                <p className="break-words text-sm font-semibold text-slate-800">{group.name}</p>
                <p className="break-words text-xs text-slate-500">{group.school && `${group.school} · `}{group.owner_username} · {group.members_count} {texts.members}</p>
                <ClassGroupEditor group={group} institutions={institutions.data ?? []} editors={editors} idPrefix="class-picker"
                    disabled={groups.loading || groups.failed || institutions.loading || institutions.failed} />
            </div>}
        </>}
        <p id={hint} className="mt-3 text-xs text-slate-500">{l('cancelHint')}</p>
        <Button type="button" variant="secondary" disabled={blocked} onClick={() => request(close)} className="mt-3">{texts.cancel}</Button>
        {transition && <dialog ref={confirmation} aria-labelledby={confirmHeading} aria-describedby={`${hint}-confirm`}
            onKeyDown={trapTab}
            onCancel={event => { event.preventDefault(); event.stopPropagation(); keep(); }}
            className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-slate-900 shadow-xl backdrop:bg-black/40">
            <h3 id={confirmHeading} className="text-lg font-bold">{l('discardTitle')}</h3>
            <p id={`${hint}-confirm`} className="mt-2 text-sm text-slate-600">{l('cancelHint')}</p>
            <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" variant="secondary" autoFocus onClick={keep}>{l('keep')}</Button>
                <Button type="button" disabled={blocked} onClick={() => {
                    if (blocked) return;
                    if (group) editors.discard(group.id);
                    confirmation.current?.close();
                    transition.run();
                    setTransition(null);
                }}>{l('discard')}</Button>
            </div>
        </dialog>}
    </dialog>;
}
