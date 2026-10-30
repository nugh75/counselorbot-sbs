'use client';

// Taccuini studente di prova: il docente crea studenti immaginari, li modifica,
// li archivia o li elimina. Si scelgono poi dalle Opzioni della chat guidata o
// della Bussola («Prova»). Salvataggio esplicito, nessun autosalvataggio.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { listFrozenSessions, type FrozenSessionSummary } from '@/lib/frozen-session';
import { useI18n } from '@/lib/i18n-context';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { learningText } from '@/lib/i18n-assignment-work';
import { practiceNotebookText } from '@/lib/i18n-practice-notebooks';
import {
    PRACTICE_FIELD_MAX_CHARS,
    PRACTICE_NOTEBOOK_FIELDS,
    PRACTICE_TITLE_MAX_CHARS,
    type PracticeNotebook,
    type PracticeNotebookData,
} from '@/lib/practice-notebooks';
import { practiceNotebookApi } from '@/lib/practice-notebooks-api';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { PracticeChats } from './PracticeChats';
import { PracticeRepertoire } from './PracticeRepertoire';

type Draft = { id: number | 'new'; title: string; values: PracticeNotebookData; groupIds: number[] };
// Classi gestite dal docente (stesso elenco della chat docenza).
type ClassGroup = { id: number; name: string; school?: string | null; context_visible_to_students?: boolean; is_active?: boolean };

const primary = 'min-h-control rounded-control bg-brand px-4 text-sm font-semibold text-ink-on-brand hover:bg-brand-hover disabled:opacity-50';
const secondary = 'min-h-control rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink-body hover:bg-surface-sunken disabled:opacity-50';

export function PracticeNotebooks() {
    const { lang, t } = useI18n();
    const l = (key: Parameters<typeof practiceNotebookText>[1]) => practiceNotebookText(lang, key);
    const [notebooks, setNotebooks] = useState<PracticeNotebook[] | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
    const [error, setError] = useState('');
    useDraftGuard(dirty || busy, learningText(lang, 'leaveDraft'), { blocked: busy, preserveFocus: true });

    const load = useCallback(async () => {
        setLoadFailed(false);
        try {
            setNotebooks(await practiceNotebookApi.list(true));
        } catch {
            setLoadFailed(true);
        }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const [groups, setGroups] = useState<ClassGroup[] | null>(null);
    const [groupsFailed, setGroupsFailed] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        apiFetch('/api/admin/groups', { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error('groups');
                const rows: unknown = await response.json();
                setGroups(Array.isArray(rows) ? (rows as ClassGroup[]).filter((group) => group.is_active !== false) : []);
            })
            .catch(() => { if (!controller.signal.aborted) setGroupsFailed(true); });
        return () => controller.abort();
    }, []);
    // Chat guidate di prova ancora aperte (autosalvate): il docente le ritrova
    // sotto lo studente simulato e le riapre come dall'header.
    const [chats, setChats] = useState<FrozenSessionSummary[] | null>(null);
    const [chatsFailed, setChatsFailed] = useState(false);
    useEffect(() => {
        listFrozenSessions()
            .then((rows) => setChats(rows.filter((row) => row.practice_notebook_id != null)))
            .catch(() => setChatsFailed(true));
    }, []);

    const groupName = (group: ClassGroup) => group.school ? `${group.name} — ${group.school}` : group.name;

    const run = async (action: () => Promise<unknown>) => {
        if (busy) return false;
        setBusy(true);
        setError('');
        try {
            await action();
            await load();
            return true;
        } catch {
            setError(l('error'));
            return false;
        } finally {
            setBusy(false);
        }
    };

    const openDraft = (next: Draft) => {
        if (dirty && !window.confirm(learningText(lang, 'leaveDraft'))) return;
        setDraft(next);
        setDirty(false);
        setError('');
    };
    const closeDraft = () => {
        if (busy || (dirty && !window.confirm(learningText(lang, 'leaveDraft')))) return;
        setDraft(null);
        setDirty(false);
    };
    const edit = (patch: Partial<Draft>) => {
        setDraft((current) => current && { ...current, ...patch });
        setDirty(true);
    };

    const save = async () => {
        if (!draft || !draft.title.trim()) return;
        // Senza elenco classi (errore di caricamento) le associazioni salvate restano.
        const groupIds = groups === null ? undefined : draft.groupIds;
        const ok = await run(() => draft.id === 'new'
            ? practiceNotebookApi.create(draft.title, draft.values, groupIds ?? [])
            : practiceNotebookApi.update(draft.id, { title: draft.title, values: draft.values, groupIds }));
        if (ok) { setDraft(null); setDirty(false); }
    };

    const active = (notebooks ?? []).filter((notebook) => !notebook.archived_at);
    const archived = (notebooks ?? []).filter((notebook) => notebook.archived_at);

    const editor = (current: Draft) => (
        <form data-practice-notebook-editor className="space-y-4 rounded-lg border border-brand-line bg-surface p-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <div>
                <label htmlFor="practice-notebook-title" className="block text-xs font-semibold text-ink-muted">{l('name')}</label>
                <input id="practice-notebook-title" required value={current.title} maxLength={PRACTICE_TITLE_MAX_CHARS} aria-describedby="practice-notebook-title-hint"
                    onChange={(event) => edit({ title: event.target.value })}
                    className="mt-1 w-full rounded-control border border-line-strong px-4 py-2 text-sm" />
                <p id="practice-notebook-title-hint" className="mt-1 text-xs text-ink-muted">{l('nameHint')}</p>
            </div>
            <div className="grid gap-4">
                {PRACTICE_NOTEBOOK_FIELDS.map((field) => (
                    <div key={field.key}>
                        <label htmlFor={`practice-notebook-${field.key}`} className="block text-xs font-semibold text-ink-muted">{t(field.labelKey)}</label>
                        <textarea id={`practice-notebook-${field.key}`} rows={'multiline' in field ? 3 : 1} maxLength={PRACTICE_FIELD_MAX_CHARS}
                            value={current.values[field.key] ?? ''}
                            onChange={(event) => edit({ values: { ...current.values, [field.key]: event.target.value } })}
                            className="mt-1 w-full rounded-control border border-line-strong px-4 py-2 text-sm" />
                    </div>
                ))}
            </div>
            <fieldset className="min-w-0 space-y-2">
                <legend className="text-xs font-semibold text-ink-muted">{l('classes')}</legend>
                <p className="text-xs text-ink-muted">{l('classesHint')}</p>
                {groupsFailed && <p role="alert" className="text-xs text-danger">{l('classesError')}</p>}
                {groups !== null && !groups.length && <p className="text-xs text-ink-muted">{l('noClasses')}</p>}
                {groups?.map((group) => (
                    <label key={group.id} className="flex min-h-control items-start gap-2 text-sm text-ink-body">
                        <input type="checkbox" className="mt-1" checked={current.groupIds.includes(group.id)}
                            onChange={(event) => edit({ groupIds: event.target.checked
                                ? [...current.groupIds, group.id]
                                : current.groupIds.filter((id) => id !== group.id) })} />
                        <span>
                            {groupName(group)}
                            {!group.context_visible_to_students && <span className="block text-xs text-warning">{l('notShared')}</span>}
                        </span>
                    </label>
                ))}
                <Link href="/docente/classi" className="inline-flex min-h-control items-center text-xs font-semibold text-link underline underline-offset-2">{l('manageClasses')}</Link>
            </fieldset>
            <div className="flex flex-wrap items-center gap-4">
                <button type="submit" disabled={busy || !current.title.trim()} className={primary}>{l('save')}</button>
                <button type="button" disabled={busy} onClick={closeDraft} className={secondary}>{l('cancel')}</button>
            </div>
        </form>
    );

    const classSummary = (notebook: PracticeNotebook) => {
        const linked = (groups ?? []).filter((group) => notebook.group_ids.includes(group.id));
        if (!linked.length) return null;
        return (
            <div className="text-sm">
                <p className="font-semibold text-ink-muted">{l('classes')}</p>
                <ul className="text-ink-body">
                    {linked.map((group) => <li key={group.id}>
                        {groupName(group)}
                        {!group.context_visible_to_students && <span className="block text-xs text-warning">{l('notShared')}</span>}
                    </li>)}
                </ul>
            </div>
        );
    };

    const summary = (notebook: PracticeNotebook) => {
        const filled = PRACTICE_NOTEBOOK_FIELDS.filter((field) => (notebook.data[field.key] ?? '').trim());
        if (!filled.length) return <p className="text-sm text-ink-muted">{l('noFields')}</p>;
        return (
            <dl className="grid gap-2 text-sm">
                {filled.map((field) => <div key={field.key}>
                    <dt className="font-semibold text-ink-muted">{t(field.labelKey)}</dt>
                    <dd className="whitespace-pre-line text-ink-body">{notebook.data[field.key]}</dd>
                </div>)}
            </dl>
        );
    };

    return (
        <div data-practice-notebooks className="space-y-4">
            <p className="max-w-3xl text-sm text-ink-muted">{l('note')}</p>
            {draft?.id === 'new' ? editor(draft) : (
                <button type="button" disabled={busy || notebooks === null} onClick={() => openDraft({ id: 'new', title: '', values: {}, groupIds: [] })}
                    className={`${primary} inline-flex items-center gap-2`}>
                    <Plus className="h-4 w-4" aria-hidden="true" />{l('create')}
                </button>
            )}
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            {notebooks === null && !loadFailed && <p role="status" className="text-sm text-ink-muted">{t('common.loading')}</p>}
            {loadFailed && <div role="alert" className="flex flex-wrap items-center gap-4 text-sm text-danger">
                <p>{l('loadError')}</p>
                <button type="button" onClick={() => void load()} className={secondary}>{l('retry')}</button>
            </div>}
            {notebooks !== null && !active.length && draft?.id !== 'new' && <p className="text-sm text-ink-muted">{l('empty')}</p>}
            <ul className="space-y-4">
                {active.map((notebook) => (
                    <li key={notebook.id} data-practice-notebook={notebook.id}>
                        {draft?.id === notebook.id ? editor(draft) : (
                            <article className="space-y-4 rounded-lg border border-line bg-surface p-4">
                                <h2 className="text-base font-semibold text-ink">{notebook.title}</h2>
                                {summary(notebook)}
                                {classSummary(notebook)}
                                <PracticeChats notebookId={notebook.id} openChats={chats?.filter((chat) => chat.practice_notebook_id === notebook.id) ?? null} openChatsFailed={chatsFailed} />
                                <PracticeRepertoire notebookId={notebook.id} />
                                <div className="flex flex-wrap gap-2">
                                    <button type="button" disabled={busy} className={secondary}
                                        onClick={() => openDraft({ id: notebook.id, title: notebook.title, values: { ...notebook.data }, groupIds: [...notebook.group_ids] })}>{l('edit')}</button>
                                    <button type="button" disabled={busy} className={secondary}
                                        onClick={() => void run(() => practiceNotebookApi.update(notebook.id, { archived: true }))}>{l('archive')}</button>
                                </div>
                            </article>
                        )}
                    </li>
                ))}
            </ul>
            {archived.length > 0 && (
                <details className="rounded-lg border border-line bg-surface p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-ink-body">{l('archived')} ({archived.length})</summary>
                    <ul className="mt-4 space-y-2">
                        {archived.map((notebook) => (
                            <li key={notebook.id} data-practice-notebook-archived={notebook.id} className="flex flex-wrap items-center gap-2">
                                <span className="min-w-0 flex-1 text-sm text-ink-body">{notebook.title}</span>
                                <button type="button" disabled={busy} className={secondary}
                                    onClick={() => void run(() => practiceNotebookApi.update(notebook.id, { archived: false }))}>{l('restore')}</button>
                                {confirmRemove === notebook.id
                                    ? <ConfirmInline question={l('confirmRemove')} busy={busy}
                                        onConfirm={() => { setConfirmRemove(null); void run(() => practiceNotebookApi.remove(notebook.id)); }}
                                        onCancel={() => setConfirmRemove(null)} />
                                    : <button type="button" disabled={busy} className={secondary}
                                        onClick={() => setConfirmRemove(notebook.id)}>{l('remove')}</button>}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    );
}
