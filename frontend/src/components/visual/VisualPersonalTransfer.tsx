'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { visualLabel } from '@/lib/i18n-visual-tools';
import { annotationEntries, bookletFields, importAnnotation, notebookFields, visualEntries, type ImportTarget, type PersonalContext } from '@/lib/visual-personal';
import type { SavedWorkspace, VisualWorkspace } from '@/lib/visual-tools';

const inputClass = 'mt-1 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-800';

export function VisualPersonalTransfer({ sessionId, locale, work, saveWorkspace, onClose }: {
    sessionId: string;
    locale: string;
    work: VisualWorkspace;
    saveWorkspace: (next?: VisualWorkspace) => Promise<SavedWorkspace | null>;
    onClose: () => void;
}) {
    const { t } = useI18n();
    const l = (key: string) => visualLabel(locale, key);
    const endpoint = `/api/session/${encodeURIComponent(sessionId)}/visual-tools/personal`;
    const [data, setData] = useState<PersonalContext | null>(null);
    const [direction, setDirection] = useState<'out' | 'in'>('out');
    const [selection, setSelection] = useState('');
    const [destination, setDestination] = useState<'notebook' | 'booklet'>('notebook');
    const [bookletId, setBookletId] = useState('');
    const [field, setField] = useState('notes');
    const [target, setTarget] = useState<ImportTarget>('cards');
    const [draft, setDraft] = useState('');
    const [title, setTitle] = useState('');
    const [busy, setBusy] = useState(false);
    const [issue, setIssue] = useState('');
    const [status, setStatus] = useState('');
    const heading = useRef<HTMLHeadingElement>(null);
    const generation = useRef(0);
    const load = useCallback(async () => {
        const current = ++generation.current;
        setBusy(true); setIssue('');
        try {
            const response = await apiFetch(`${endpoint}?lang=${locale}`, { signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error();
            const result = await response.json();
            if (current === generation.current) setData(result);
        } catch { if (current === generation.current) setIssue('personalLoadError'); }
        finally { if (current === generation.current) setBusy(false); }
    }, [endpoint, locale]);
    const invalidateLoad = useCallback(() => { generation.current++; }, []);
    useEffect(() => { heading.current?.focus(); void load(); return invalidateLoad; }, [load, invalidateLoad]);

    const entries = direction === 'out' ? visualEntries(work, l) : data ? annotationEntries(data, t, l) : [];
    const selected = entries.find(entry => entry.id === selection);
    const booklet = data?.booklets.find(item => String(item.id) === bookletId);
    const previous = (destination === 'notebook' ? data?.notebook[field] : booklet?.data[field]) || '';
    const block = direction === 'out' && selected && data ? `${draft.trim()}\n(${data.sources[selected.source]})` : '';
    const preview = previous.includes(block) && block ? previous : [previous, block].filter(Boolean).join('\n\n');
    const maxLength = direction === 'out' ? data?.limits[destination] || 0 : target === 'actions' ? 1000 : target === 'cards' ? 600 : 160;
    const tooLong = (direction === 'out' ? preview.length : draft.length) > maxLength;
    const choose = (id: string) => {
        const entry = entries.find(item => item.id === id);
        setSelection(id); setDraft(entry?.text || ''); setTitle((entry?.text || '').split('\n')[0].slice(0, 160));
        setIssue(''); setStatus('');
    };
    const transfer = async () => {
        if (!selected || !data || !draft.trim() || tooLong) return;
        setBusy(true); setIssue(''); setStatus('');
        try {
            if (direction === 'in') {
                const next = importAnnotation(work, selected, target, draft, title);
                if (!(await saveWorkspace(next))) throw new Error('personalSaveError');
                setStatus('personalImported');
            } else {
                const saved = await saveWorkspace();
                if (!saved) throw new Error('personalSaveError');
                const response = await apiFetch(endpoint, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
                    body: JSON.stringify({ revision: saved.revision, entry: selected.id, destination, booklet_id: bookletId ? Number(bookletId) : null,
                        field, expected_text: previous, text: draft.trim(), language: locale }),
                });
                if (!response.ok) {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(response.status === 409 ? 'personalConflict' : error.detail === 'personal_limit' ? 'personalLength' : 'personalSaveError');
                }
                const result = await response.json();
                setData(result.context);
                if (result.booklet_id) setBookletId(String(result.booklet_id));
                setStatus(result.status === 'duplicate' ? 'personalDuplicate' : 'personalSaved');
            }
        } catch (error) {
            const key = error instanceof Error ? error.message : '';
            setIssue(['personalSaveError', 'personalConflict', 'personalLength', 'personalDuplicate', 'limit'].includes(key) ? key : 'personalSaveError');
        } finally { setBusy(false); }
    };

    return <section className="mx-auto w-full max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 ref={heading} tabIndex={-1} className="text-lg font-semibold text-slate-900">{l('personalLinks')}</h3>
            <Button type="button" variant="ghost" className="min-h-[44px]" onClick={onClose} disabled={busy}><ArrowLeft className="h-4 w-4" />{l('backTools')}</Button>
        </div>
        <details className="text-sm text-slate-600"><summary className="min-h-[44px] cursor-pointer py-3 font-medium text-indigo-700">{l('howTo')}</summary><p>{l('personalHelp')}</p></details>
        {issue && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {l(issue)}{['personalLoadError', 'personalConflict'].includes(issue) && <Button type="button" variant="secondary" className="ml-2 min-h-[44px]" onClick={() => void load()} disabled={busy}>{l('reloadPersonal')}</Button>}
        </div>}
        {status && <p role="status" className="text-sm text-indigo-700">{l(status)}</p>}
        {!data ? <p role="status">{l(busy ? 'loading' : 'personalLoadError')}</p> : <fieldset disabled={busy} className="space-y-4">
            <label className="block text-sm font-medium">{l('transferDirection')}<select aria-label={l('transferDirection')} className={inputClass} value={direction} onChange={event => { setDirection(event.target.value as 'in' | 'out'); setSelection(''); setDraft(''); setIssue(''); setStatus(''); }}>
                <option value="out">{l('toPersonal')}</option><option value="in">{l('fromPersonal')}</option>
            </select></label>
            <label className="block text-sm font-medium">{l('chooseContent')}<select aria-label={l('chooseContent')} className={inputClass} value={selection} onChange={event => choose(event.target.value)}>
                <option value="">{l('chooseContent')}</option>{entries.map(entry => <option key={entry.id} value={entry.id}>{entry.label.slice(0, 180)}</option>)}
            </select></label>
            {!entries.length && <p className="text-sm text-slate-600">{l(direction === 'in' ? 'personalEmpty' : 'visualEmpty')}</p>}
            {direction === 'out' ? <>
                <label className="block text-sm font-medium">{l('destination')}<select aria-label={l('destination')} className={inputClass} value={destination} onChange={event => { const next = event.target.value as 'notebook' | 'booklet'; setDestination(next); setField(next === 'notebook' ? 'notes' : 'student_notes'); setStatus(''); }}>
                    <option value="notebook">{l('notebook')}</option><option value="booklet" disabled={!data.questionnaire_type}>{l('booklet')}{data.questionnaire_type ? ` · ${data.questionnaire_type}` : ''}</option>
                </select></label>
                {destination === 'booklet' && <label className="block text-sm font-medium">{l('bookletSheet')}<select aria-label={l('bookletSheet')} className={inputClass} value={bookletId} onChange={event => { setBookletId(event.target.value); setStatus(''); }}>
                    <option value="">{l('newSheet')}</option>{data.booklets.map(item => <option key={item.id} value={item.id}>{item.title || `${l('booklet')} ${item.id}`}</option>)}
                </select></label>}
                <label className="block text-sm font-medium">{l('destinationField')}<select aria-label={l('destinationField')} className={inputClass} value={field} onChange={event => { setField(event.target.value); setStatus(''); }}>
                    {Object.entries(destination === 'notebook' ? notebookFields : bookletFields).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
                </select></label>
            </> : <label className="block text-sm font-medium">{l('destination')}<select aria-label={l('destination')} className={inputClass} value={target} onChange={event => { setTarget(event.target.value as ImportTarget); setStatus(''); }}>
                <option value="cards">{l('cards')}</option><option value="actions">{l('board')}</option><option value="comparison">{l('option')}</option>
            </select></label>}
            {selected && <>
                {direction === 'in' && target === 'actions' && <label className="block text-sm font-medium">{l('titleField')}<input aria-label={l('titleField')} className={inputClass} maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></label>}
                <label className="block text-sm font-medium">{l('reviewTransfer')}<textarea aria-label={l('reviewTransfer')} rows={5} className={inputClass} value={draft} onChange={event => { setDraft(event.target.value); setStatus(''); }} /></label>
                {direction === 'out' && <details open className="rounded-lg border border-slate-200 p-3">
                    <summary className="min-h-[44px] cursor-pointer py-2 text-sm font-semibold">{l('resultPreview')}</summary>
                    <p className="whitespace-pre-wrap break-words text-sm text-slate-700">{preview}</p>
                </details>}
                <p className={`text-sm ${tooLong ? 'text-red-700' : 'text-slate-600'}`}>{direction === 'out' ? preview.length : draft.length} / {maxLength}{tooLong ? ` · ${l('personalLength')}` : ''}</p>
                <Button type="button" className="min-h-[44px]" disabled={!draft.trim() || tooLong || (direction === 'in' && target === 'actions' && !title.trim())} onClick={() => void transfer()}>
                    {l(direction === 'out' ? 'savePersonal' : 'saveVisual')}
                </Button>
            </>}
        </fieldset>}
    </section>;
}
