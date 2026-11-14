'use client';

// Taccuini studente di prova: il docente crea studenti immaginari, li modifica,
// li archivia o li elimina. Si scelgono poi dalle Opzioni della chat guidata o
// della Bussola («Prova»). Le spunte dei profili esistenti si salvano subito.
// Senza `notebookId` è l'elenco (voci piatte); con `notebookId` è la pagina
// dello studente di prova, a sezioni con linea e senza riquadri (#892).

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { EntryLink, EntrySection } from '@/components/ui/EntryList';
import ToolIllustration from '@/components/ui/ToolIllustration';
import { resolveActiveStudentTools } from '@/lib/tool-catalog';
import { useInstrumentCatalog } from '@/lib/use-instrument-catalog';
import { listFrozenSessions, type FrozenSessionSummary } from '@/lib/frozen-session';
import { useI18n } from '@/lib/i18n-context';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { learningText } from '@/lib/i18n-assignment-work';
import { practiceNotebookText } from '@/lib/i18n-practice-notebooks';
import {
    PRACTICE_FIELD_MAX_CHARS,
    PRACTICE_NOTEBOOK_FIELDS,
    PRACTICE_TITLE_MAX_CHARS,
    practiceNotebookAnchor,
    practiceNotebookHref,
    practiceNotebookIdFromHash,
    practiceToolEntry,
    type PracticeNotebook,
    type PracticeNotebookData,
    type PracticeResult,
} from '@/lib/practice-notebooks';
import { practiceNotebookApi } from '@/lib/practice-notebooks-api';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { PracticeChats } from './PracticeChats';
import { PracticeNotebookSummary } from './PracticeNotebookSummary';
import { PracticeRepertoire } from './PracticeRepertoire';
import { parseClassGroups } from './class-group-types';
import { useTeacherResource } from './useTeacherResource';

type Draft = { id: number | 'new'; title: string; values: PracticeNotebookData; groupIds: number[] };

const primary = 'min-h-control rounded-control bg-brand px-4 text-sm font-semibold text-ink-on-brand hover:bg-brand-hover disabled:opacity-50';
const secondary = 'min-h-control rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink-body hover:bg-surface-sunken disabled:opacity-50';
const linkAction = 'inline-flex min-h-control items-center text-sm font-semibold text-link underline underline-offset-2 disabled:opacity-50';
const sectionTitle = 'border-b border-line pb-2 text-lg font-semibold text-ink';

// Avatar dello studente di prova: il celeste di ruolo resta solo qui e sul badge.
function PracticeAvatar() {
    return (
        <svg viewBox="0 0 96 96" aria-hidden="true" focusable="false" className="h-16 w-16 shrink-0 md:h-18 md:w-18">
            <circle cx="48" cy="48" r="40" fill="var(--role-test-soft)" stroke="var(--role-test-line)" strokeWidth="2" />
            <circle cx="48" cy="40" r="13" fill="var(--i-paper)" stroke="var(--i-out)" strokeWidth="2.5" />
            <path d="M24 74c4-13 14-19 24-19s20 6 24 19" fill="var(--i-teal)" stroke="var(--i-out)" strokeWidth="2.5" />
        </svg>
    );
}

// Riga breve sotto il nome: i primi campi compilati del taccuino.
function practiceDescription(data: PracticeNotebookData): string {
    return PRACTICE_NOTEBOOK_FIELDS.map(({ key }) => (data[key] ?? '').trim()).filter(Boolean).slice(0, 3).join(', ');
}

function PracticeStartSection({ notebook, results }: { notebook: PracticeNotebook; results: PracticeResult[] | null }) {
    const { lang, tf } = useI18n();
    const l = (key: Parameters<typeof practiceNotebookText>[1]) => practiceNotebookText(lang, key);
    const { rows: catalog } = useInstrumentCatalog();
    const tools = useMemo(() => resolveActiveStudentTools(catalog, lang), [catalog, lang]);
    return (
        <EntrySection id="practice-start-heading" title={l('startTitle')} subtitle={l('startHint')} testId="practice-start-section">
            {tools.map((tool) => {
                const entry = practiceToolEntry(notebook.id, tool, results ?? []);
                if (!entry || (results === null && entry.kind !== 'unscored')) return null;
                const description = entry.kind === 'unscored' ? l('toolUnscored')
                    : entry.kind === 'profile' ? l('toolProfile')
                    : entry.kind === 'choose' ? l('toolChoose').replace('{n}', String(entry.count))
                    : l('toolNew');
                return (
                    <EntryLink key={tool.id} idPrefix="practice-start" id={tool.id} href={entry.href}
                        illustration={<ToolIllustration id={tool.id} className="h-16 w-16 shrink-0 object-contain md:h-18 md:w-18" />}
                        name={tf(`q.${tool.id}.name`, tool.name)} description={description} />
                );
            })}
        </EntrySection>
    );
}

export function PracticeNotebooks({ notebookId, newProfileType }: { notebookId?: number; newProfileType?: string | null } = {}) {
    const { lang, t } = useI18n();
    const router = useRouter();
    const l = (key: Parameters<typeof practiceNotebookText>[1]) => practiceNotebookText(lang, key);
    const [notebooks, setNotebooks] = useState<PracticeNotebook[] | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [dirty, setDirty] = useState(false);
    const [busy, setBusy] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState<number | null>(null);
    const [error, setError] = useState('');
    const [classSaveError, setClassSaveError] = useState<number | null>(null);
    useDraftGuard(dirty || busy, learningText(lang, 'leaveDraft'), { blocked: busy, preserveFocus: true });

    const load = useCallback(async () => {
        try {
            setNotebooks(await practiceNotebookApi.list(true));
            setLoadFailed(false);
        } catch {
            setLoadFailed(true);
        }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const classGroups = useTeacherResource('/api/admin/groups?own=true', parseClassGroups);
    const groups = classGroups.data?.filter(group => group.is_active);
    // Chat guidate di prova ancora aperte (autosalvate): il docente le ritrova
    // sotto lo studente simulato e le riapre come dall'header.
    const [chats, setChats] = useState<FrozenSessionSummary[] | null>(null);
    const [chatsFailed, setChatsFailed] = useState(false);
    useEffect(() => {
        listFrozenSessions()
            .then((rows) => setChats(rows.filter((row) => row.practice_notebook_id != null)))
            .catch(() => setChatsFailed(true));
    }, []);
    // Profili dello studente aperto (dal repertorio) e conteggi per l'elenco.
    const [results, setResults] = useState<PracticeResult[] | null>(null);
    const [profileCounts, setProfileCounts] = useState<Record<number, number>>({});

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
        let incomplete = false;
        const ok = await run(async () => {
            if (draft.id === 'new') {
                const saved = await practiceNotebookApi.create(draft.title, draft.values, draft.groupIds);
                incomplete = draft.groupIds.some(id => !saved.group_ids.includes(id));
            } else {
                await practiceNotebookApi.update(draft.id, { title: draft.title, values: draft.values });
            }
        });
        if (ok) {
            setDraft(null);
            setDirty(false);
            if (incomplete) setError(l('classSaveError'));
        }
    };

    const saveClass = async (notebookId: number, groupId: number, linked: boolean) => {
        if (busy) return;
        setBusy(true);
        setClassSaveError(null);
        try {
            const saved = await practiceNotebookApi.setClass(notebookId, groupId, linked);
            setNotebooks(rows => rows?.map(row => row.id === notebookId ? saved : row) ?? null);
        } catch {
            setClassSaveError(notebookId);
        } finally {
            setBusy(false);
        }
    };

    const active = (notebooks ?? []).filter((notebook) => !notebook.archived_at);
    const archived = (notebooks ?? []).filter((notebook) => notebook.archived_at);
    // I vecchi link all'ancora dell'elenco aprono la pagina dello studente.
    useEffect(() => {
        if (notebookId !== undefined) return;
        const id = practiceNotebookIdFromHash(window.location.hash);
        if (id !== null) router.replace(practiceNotebookHref(id));
    }, [notebookId, router]);
    const activeIds = active.map((notebook) => notebook.id).join(',');
    useEffect(() => {
        if (notebookId !== undefined || !activeIds) return;
        let current = true;
        for (const id of activeIds.split(',').map(Number)) {
            practiceNotebookApi.results(id)
                .then((rows) => { if (current) setProfileCounts((counts) => ({ ...counts, [id]: rows.length })); })
                .catch(() => undefined);
        }
        return () => { current = false; };
    }, [notebookId, activeIds]);

    const classSelection = (groupIds: number[], onChange: (groupId: number, linked: boolean) => void, notebookId?: number) => (
        <fieldset className="min-w-0 space-y-2" disabled={busy}>
            <legend className={notebookId !== undefined ? `${sectionTitle} w-full` : 'text-xs font-semibold text-ink-muted'}>{l('classes')}</legend>
            <p className="text-xs text-ink-muted">{l('classesHint')}</p>
            {notebookId !== undefined && <p className="text-xs text-ink-muted">{l('classesAutosave')}</p>}
            {classGroups.loading && <p role="status" className="text-xs text-ink-muted">{t('common.loading')}</p>}
            {(classGroups.failed || classGroups.forbidden) && <div role="alert" className="text-xs text-danger">
                <p>{l('classesError')}</p>
                <button type="button" onClick={() => void classGroups.reload()} className={secondary}>{l('retry')}</button>
            </div>}
            {groups && !groups.length && <p className="text-xs text-ink-muted">{l('noClasses')}</p>}
            {groups?.map(group => (
                <label key={group.id} className="flex min-h-control items-start gap-2 text-sm text-ink-body">
                    <input type="checkbox" className="mt-1" checked={groupIds.includes(group.id)}
                        onChange={event => onChange(group.id, event.target.checked)} />
                    <span>
                        {group.school ? `${group.name} — ${group.school}` : group.name}
                        {!group.context_visible_to_students && <span className="block text-xs text-ink-muted">{l('notShared')}</span>}
                    </span>
                </label>
            ))}
            {notebookId !== undefined && classSaveError === notebookId && <p role="alert" className="text-xs text-danger">{l('classSaveError')}</p>}
            <Link href="/docente/classi" className="inline-flex min-h-control items-center text-xs font-semibold text-link underline underline-offset-2">{l('manageClasses')}</Link>
        </fieldset>
    );

    const editor = (current: Draft) => (
        <form data-practice-notebook-editor className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <div>
                <label htmlFor="practice-notebook-title" className="block text-xs font-semibold text-ink-muted">{l('name')}</label>
                <input id="practice-notebook-title" required value={current.title} maxLength={PRACTICE_TITLE_MAX_CHARS} aria-describedby="practice-notebook-title-hint"
                    onChange={(event) => edit({ title: event.target.value })}
                    className="mt-1 w-full rounded-control border border-line-strong px-4 py-2 text-sm" />
                <p id="practice-notebook-title-hint" className="mt-1 text-xs text-ink-muted">{l('nameHint')}</p>
            </div>
            {current.id === 'new' && classSelection(current.groupIds, (groupId, linked) => edit({
                groupIds: linked ? [...current.groupIds, groupId] : current.groupIds.filter(id => id !== groupId),
            }))}
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
            <div className="flex flex-wrap items-center gap-4">
                <button type="submit" disabled={busy || !current.title.trim()} className={primary}>{l('save')}</button>
                <button type="button" disabled={busy} onClick={closeDraft} className={secondary}>{l('cancel')}</button>
            </div>
        </form>
    );

    const openChatCount = (id: number) => chats?.filter((chat) => chat.practice_notebook_id === id).length ?? 0;
    const status = (id: number) => {
        const profiles = profileCounts[id];
        const open = openChatCount(id);
        return [
            profiles === undefined ? '' : profiles === 0 ? l('profileCountNone') : profiles === 1 ? l('profileCountOne') : l('profileCountMany').replace('{n}', String(profiles)),
            open === 0 ? '' : open === 1 ? l('openChatCountOne') : l('openChatCountMany').replace('{n}', String(open)),
        ].filter(Boolean).join(' · ');
    };
    const entry = (notebook: PracticeNotebook, archivedEntry = false) => (
        <EntryLink key={notebook.id} idPrefix={archivedEntry ? 'practice-archived' : 'practice-notebook'} id={String(notebook.id)}
            href={practiceNotebookHref(notebook.id)} illustration={<PracticeAvatar />} name={notebook.title}
            description={practiceDescription(notebook.data) || l('noFields')}
            badge={<RoleBadge role="test">{l('badge')}</RoleBadge>}
            status={archivedEntry ? undefined : status(notebook.id) || undefined} />
    );
    const loading = <>
        {notebooks === null && !loadFailed && <p role="status" className="text-sm text-ink-muted">{t('common.loading')}</p>}
        {loadFailed && <div role="alert" className="flex flex-wrap items-center gap-4 text-sm text-danger">
            <p>{l('loadError')}</p>
            <button type="button" onClick={() => void load()} className={secondary}>{l('retry')}</button>
        </div>}
    </>;

    if (notebookId !== undefined) {
        const notebook = notebooks?.find((row) => row.id === notebookId);
        if (!notebook) return (
            <div className="space-y-4">
                {loading}
                {notebooks !== null && <p className="text-sm text-ink-muted">{l('notFound')}</p>}
            </div>
        );
        const isArchived = Boolean(notebook.archived_at);
        const leave = async (action: () => Promise<unknown>) => {
            if (await run(action)) router.push('/docente/taccuini-prova');
        };
        return (
            <div data-practice-notebook={notebook.id} className="space-y-8">
                <div className="flex items-center gap-4">
                    <PracticeAvatar />
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 id={practiceNotebookAnchor(notebook.id)} tabIndex={-1} className="scroll-mt-24 break-words text-xl font-semibold text-ink">{notebook.title}</h2>
                            <RoleBadge role="test">{l('badge')}</RoleBadge>
                        </div>
                        {practiceDescription(notebook.data) && <p className="mt-1 text-sm text-ink-muted">{practiceDescription(notebook.data)}</p>}
                    </div>
                </div>
                {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                {isArchived && <p className="text-sm text-ink-muted">{l('archivedNote')}</p>}
                {!isArchived && <>
                    <PracticeStartSection notebook={notebook} results={results} />
                    <PracticeChats notebookId={notebook.id} openChats={chats?.filter((chat) => chat.practice_notebook_id === notebook.id) ?? null} openChatsFailed={chatsFailed} />
                    <PracticeRepertoire notebookId={notebook.id} onResults={setResults} newProfileType={newProfileType} />
                </>}
                <section aria-labelledby="practice-who-heading" className="space-y-4">
                    <h2 id="practice-who-heading" className={sectionTitle}>{l('whoIs')}</h2>
                    {draft?.id === notebook.id ? editor(draft) : <>
                        <PracticeNotebookSummary data={notebook.data} />
                        <button type="button" disabled={busy} className={linkAction}
                            onClick={() => openDraft({ id: notebook.id, title: notebook.title, values: { ...notebook.data }, groupIds: [] })}>{l('edit')}</button>
                    </>}
                </section>
                {!isArchived && <section>
                    {classSelection(notebook.group_ids, (groupId, linked) => void saveClass(notebook.id, groupId, linked), notebook.id)}
                </section>}
                <div className="flex flex-wrap items-center gap-4 border-t border-line pt-4">
                    {isArchived ? <>
                        <button type="button" disabled={busy} className={linkAction}
                            onClick={() => void run(() => practiceNotebookApi.update(notebook.id, { archived: false }))}>{l('restore')}</button>
                        {confirmRemove === notebook.id
                            ? <ConfirmInline question={l('confirmRemove')} busy={busy}
                                onConfirm={() => { setConfirmRemove(null); void leave(() => practiceNotebookApi.remove(notebook.id)); }}
                                onCancel={() => setConfirmRemove(null)} />
                            : <button type="button" disabled={busy} className={`${linkAction} text-danger`}
                                onClick={() => setConfirmRemove(notebook.id)}>{l('remove')}</button>}
                    </> : <button type="button" disabled={busy} className={`${linkAction} text-danger`}
                        onClick={() => void leave(() => practiceNotebookApi.update(notebook.id, { archived: true }))}>{l('archiveStudent')}</button>}
                </div>
            </div>
        );
    }

    return (
        <div data-practice-notebooks className="space-y-8">
            <div className="space-y-4">
                <p className="max-w-3xl text-sm text-ink-muted">{l('note')}</p>
                {draft?.id === 'new' ? editor(draft) : (
                    <button type="button" disabled={busy || notebooks === null} onClick={() => openDraft({ id: 'new', title: '', values: {}, groupIds: [] })}
                        className={`${primary} inline-flex items-center gap-2`}>
                        <Plus className="h-4 w-4" aria-hidden="true" />{l('create')}
                    </button>
                )}
                {error && <p role="alert" className="text-sm text-danger">{error}</p>}
                {loading}
                {notebooks !== null && !active.length && draft?.id !== 'new' && <p className="text-sm text-ink-muted">{l('empty')}</p>}
            </div>
            {active.length > 0 && (
                <EntrySection id="practice-active-heading" title={l('activeTitle')} testId="practice-notebooks-active">
                    {active.map((notebook) => entry(notebook))}
                </EntrySection>
            )}
            {archived.length > 0 && (
                <EntrySection id="practice-archived-heading" title={`${l('archived')} (${archived.length})`} testId="practice-notebooks-archived">
                    {archived.map((notebook) => entry(notebook, true))}
                </EntrySection>
            )}
        </div>
    );
}
