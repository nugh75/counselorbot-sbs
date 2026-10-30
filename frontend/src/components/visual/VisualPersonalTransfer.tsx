'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { BackButton } from '@/components/ui/BackButton';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { visualLabel } from '@/lib/i18n-visual-tools';
import { annotationEntries, importAnnotation, notebookFields, readingLabel, visualEntries, type ImportTarget, type PersonalContext } from '@/lib/visual-personal';
import type { SavedWorkspace, VisualWorkspace } from '@/lib/visual-tools';

const inputClass = 'mt-1 w-full min-w-0 rounded-control border border-line-strong bg-surface px-4 py-2 text-base text-ink';

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
    const [destination, setDestination] = useState<'notebook' | 'reading'>('notebook');
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

    const entries = direction === 'out' ? visualEntries(work, l) : data ? annotationEntries(data, t, l, locale) : [];
    const selected = entries.find(entry => entry.id === selection);
    const previous = (destination === 'notebook' ? data?.notebook[field] : data?.reading?.note) || '';
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
                    body: JSON.stringify({ revision: saved.revision, entry: selected.id, destination,
                        field, expected_text: previous, text: draft.trim(), language: locale }),
                });
                if (!response.ok) {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(response.status === 409 ? 'personalConflict' : error.detail === 'personal_limit' ? 'personalLength' : 'personalSaveError');
                }
                const result = await response.json();
                setData(result.context);
                setStatus(result.status === 'duplicate' ? 'personalDuplicate' : 'personalSaved');
            }
        } catch (error) {
            const key = error instanceof Error ? error.message : '';
            setIssue(['personalSaveError', 'personalConflict', 'personalLength', 'personalDuplicate', 'limit'].includes(key) ? key : 'personalSaveError');
        } finally { setBusy(false); }
    };

    return <section className="mx-auto w-full max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 ref={heading} tabIndex={-1} className="text-lg font-semibold text-ink">{l('personalLinks')}</h3>
            <BackButton variant="labelled" onClick={onClose} label={l('backTools')} disabled={busy} />
        </div>
        <details className="text-sm text-ink-muted"><summary className="min-h-control cursor-pointer py-4 text-link">{l('howTo')}</summary><p>{l('personalHelp')}</p></details>
        {issue && <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft p-4 text-sm text-danger-ink">
            {l(issue)}{['personalLoadError', 'personalConflict'].includes(issue) && <Button type="button" variant="secondary" className="ml-2 min-h-control" onClick={() => void load()} disabled={busy}>{l('reloadPersonal')}</Button>}
        </div>}
        {status && <p role="status" className="text-sm text-link">{l(status)}</p>}
        {!data ? <p role="status">{l(busy ? 'loading' : 'personalLoadError')}</p> : <fieldset disabled={busy} className="space-y-4">
            <label className="block text-sm">{l('transferDirection')}<select aria-label={l('transferDirection')} className={inputClass} value={direction} onChange={event => { setDirection(event.target.value as 'in' | 'out'); setSelection(''); setDraft(''); setIssue(''); setStatus(''); }}>
                <option value="out">{l('toPersonal')}</option><option value="in">{l('fromPersonal')}</option>
            </select></label>
            <label className="block text-sm">{l('chooseContent')}<select aria-label={l('chooseContent')} className={inputClass} value={selection} onChange={event => choose(event.target.value)}>
                <option value="">{l('chooseContent')}</option>{entries.map(entry => <option key={entry.id} value={entry.id}>{entry.label.slice(0, 180)}</option>)}
            </select></label>
            {!entries.length && <p className="text-sm text-ink-muted">{l(direction === 'in' ? 'personalEmpty' : 'visualEmpty')}</p>}
            {direction === 'out' ? <>
                <label className="block text-sm">{l('destination')}<select aria-label={l('destination')} className={inputClass} value={destination} onChange={event => { const next = event.target.value as 'notebook' | 'reading'; setDestination(next); setField(next === 'notebook' ? 'notes' : 'note'); setStatus(''); }}>
                    <option value="notebook">{l('notebook')}</option><option value="reading" disabled={!data.reading}>{readingLabel(locale)}{data.questionnaire_type ? ` · ${data.questionnaire_type}` : ''}</option>
                </select></label>
                {destination === 'notebook' && <label className="block text-sm">{l('destinationField')}<select aria-label={l('destinationField')} className={inputClass} value={field} onChange={event => { setField(event.target.value); setStatus(''); }}>
                    {Object.entries(notebookFields).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
                </select></label>}
            </> : <label className="block text-sm">{l('destination')}<select aria-label={l('destination')} className={inputClass} value={target} onChange={event => { setTarget(event.target.value as ImportTarget); setStatus(''); }}>
                <option value="cards">{l('cards')}</option><option value="actions">{l('board')}</option><option value="comparison">{l('option')}</option>
            </select></label>}
            {selected && <>
                {direction === 'in' && target === 'actions' && <label className="block text-sm">{l('titleField')}<input aria-label={l('titleField')} className={inputClass} maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></label>}
                <label className="block text-sm">{l('reviewTransfer')}<textarea aria-label={l('reviewTransfer')} rows={5} className={inputClass} value={draft} onChange={event => { setDraft(event.target.value); setStatus(''); }} /></label>
                {direction === 'out' && <details open className="rounded-lg border border-line p-4">
                    <summary className="min-h-control cursor-pointer py-2 text-sm font-semibold">{l('resultPreview')}</summary>
                    <p className="whitespace-pre-wrap break-words text-sm text-ink-body">{preview}</p>
                </details>}
                <p className={`text-sm ${tooLong ? 'text-danger-ink' : 'text-ink-muted'}`}>{direction === 'out' ? preview.length : draft.length} / {maxLength}{tooLong ? ` · ${l('personalLength')}` : ''}</p>
                <Button type="button" className="min-h-control" disabled={!draft.trim() || tooLong || (direction === 'in' && target === 'actions' && !title.trim())} onClick={() => void transfer()}>
                    {l(direction === 'out' ? 'savePersonal' : 'saveVisual')}
                </Button>
            </>}
        </fieldset>}
    </section>;
}
