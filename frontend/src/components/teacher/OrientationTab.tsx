'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { orientationRecText, type OrientationRecTextKey } from '@/lib/i18n-orientation-rec';
import { useDraftGuard } from '@/lib/use-draft-guard';
import {
    parseDraft, parseRecommendationDoc, parseRecommendationList,
    type RecommendationDoc, type RecommendationSummary,
} from '@/lib/orientation-recommendation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { TeacherLoading } from './TeacherAccess';
import { useTeacherResource } from './useTeacherResource';

const STATUS_CHIP = {
    draft: 'bg-warning-soft text-warning-ink',
    final: 'bg-success-soft text-success-ink',
} as const;

function date(lang: string, value: string | null) {
    return value ? new Date(value).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

export function OrientationTab({ groupId }: { groupId: number }) {
    const { lang } = useI18n();
    const l = (key: OrientationRecTextKey) => orientationRecText(lang, key);
    const students = useTeacherResource(
        `/api/teacher/groups/${groupId}/orientation-recommendations`, parseRecommendationList);

    const [query, setQuery] = useState('');
    const [username, setUsername] = useState<string | null>(null);
    const [doc, setDoc] = useState<RecommendationDoc | null>(null);
    const [content, setContent] = useState('');
    const [draftUsed, setDraftUsed] = useState(false);
    const [status, setStatus] = useState<RecommendationDoc['status']>(null);
    const [revision, setRevision] = useState(0);
    const [docLoading, setDocLoading] = useState(false);
    const [docFailed, setDocFailed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [confirmFinalize, setConfirmFinalize] = useState(false);
    const [draftBusy, setDraftBusy] = useState(false);
    const [draft, setDraft] = useState('');
    const [notice, setNotice] = useState<'' | 'saved' | 'saveError' | 'conflict' | 'detailLoadError' | 'generateError' | 'downloadError'>('');
    const pending = useRef<AbortController | null>(null);
    const dirty = !!doc && (content !== doc.content || status !== doc.status || draftUsed !== doc.ai_draft_used || !!draft);
    useDraftGuard(dirty || busy || draftBusy, l('discardChanges'), { blocked: busy || draftBusy });

    useEffect(() => () => pending.current?.abort(), []);
    useEffect(() => {
        if (!dirty && !busy && !draftBusy) return;
        const guardTab = (event: MouseEvent) => {
            const tab = event.target instanceof Element ? event.target.closest('[id^="class-tab-"][aria-selected="false"]') : null;
            if (tab && (busy || draftBusy || !window.confirm(orientationRecText(lang, 'discardChanges')))) {
                event.preventDefault(); event.stopPropagation();
            }
        };
        const guardTabKeys = (event: KeyboardEvent) => {
            if (!(event.target instanceof Element) || !event.target.closest('#class-tab-orientation')
                || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            if (busy || draftBusy || !window.confirm(orientationRecText(lang, 'discardChanges'))) {
                event.preventDefault(); event.stopPropagation();
            }
        };
        document.addEventListener('click', guardTab, true);
        document.addEventListener('keydown', guardTabKeys, true);
        return () => { document.removeEventListener('click', guardTab, true); document.removeEventListener('keydown', guardTabKeys, true); };
    }, [dirty, busy, draftBusy, lang]);

    const openStudent = async (student: RecommendationSummary) => {
        if (busy || draftBusy) return;
        if (dirty && !window.confirm(l('discardChanges'))) return;
        pending.current?.abort();
        const controller = new AbortController();
        pending.current = controller;
        setUsername(student.username);
        setDoc(null); setContent(''); setDraft(''); setDraftUsed(false);
        setStatus(student.status); setRevision(student.revision);
        setNotice(''); setDocFailed(false); setDocLoading(true);
        try {
            const res = await apiFetch(`/api/teacher/groups/${groupId}/orientation-recommendations/${encodeURIComponent(student.username)}`, { signal: controller.signal });
            if (!res.ok) { if (!controller.signal.aborted) setDocFailed(true); return; }
            const loaded = parseRecommendationDoc(await res.json());
            if (controller.signal.aborted) return;
            setDoc(loaded); setContent(loaded.content); setStatus(loaded.status);
            setRevision(loaded.revision); setDraftUsed(loaded.ai_draft_used);
        } catch {
            if (!controller.signal.aborted) setDocFailed(true);
        } finally {
            if (!controller.signal.aborted) setDocLoading(false);
        }
    };

    const save = async (nextStatus: RecommendationDoc['status'] | null) => {
        if (!username || busy || draftBusy || !doc?.is_member) return;
        setBusy(true); setNotice('');
        try {
            const res = await apiFetch(`/api/teacher/groups/${groupId}/orientation-recommendations/${encodeURIComponent(username)}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, revision, status: nextStatus ?? undefined, ai_draft_used: draftUsed ? true : undefined }),
            });
            if (res.status === 409) { setNotice('conflict'); return; }
            if (!res.ok) { setNotice('saveError'); return; }
            const saved = parseRecommendationDoc(await res.json());
            setDoc(saved); setContent(saved.content); setStatus(saved.status);
            setRevision(saved.revision); setDraftUsed(saved.ai_draft_used);
            setNotice('saved');
            void students.reload();
        } catch {
            setNotice('saveError');
        } finally {
            setBusy(false);
        }
    };

    const generate = async () => {
        if (!username || draftBusy || busy || !doc?.is_member) return;
        if ((content || '').trim() && !window.confirm(l('generateConfirm'))) return;
        setDraftBusy(true); setNotice(''); setDraft('');
        try {
            const res = await apiFetch(`/api/teacher/groups/${groupId}/orientation-recommendations/${encodeURIComponent(username)}/ai-draft`, { method: 'POST' });
            if (res.status === 502) { setNotice('generateError'); return; }
            if (!res.ok) { setNotice('generateError'); return; }
            setDraft(parseDraft(await res.json()));
        } catch {
            setNotice('generateError');
        } finally {
            setDraftBusy(false);
        }
    };

    const download = async () => {
        if (!username) return;
        setNotice('');
        try {
            const res = await apiFetch(`/api/teacher/groups/${groupId}/orientation-recommendations/${encodeURIComponent(username)}/pdf`);
            if (!res.ok || !res.headers.get('content-type')?.includes('application/pdf')) { setNotice('downloadError'); return; }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const who = doc?.display_name || username;
            link.download = `consiglio-orientativo_${who.replace(/[^\w.-]+/g, '_') || 'studente'}.pdf`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch {
            setNotice('downloadError');
        }
    };

    const list = (students.data || []).filter(row => {
        const needle = query.trim().toLowerCase();
        return !needle || row.display_name.toLowerCase().includes(needle)
            || row.username.toLowerCase().includes(needle);
    });
    const chip = (value: RecommendationSummary['status']) => value
        ? <span className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_CHIP[value]}`}>{l(value === 'final' ? 'statusFinal' : 'statusDraft')}</span>
        : <span className="rounded-full bg-surface-raised px-2 py-1 text-xs font-semibold text-ink-muted">{l('noDocument')}</span>;

    return <div className="space-y-6">
        <Card className="space-y-2">
            <h2 className="text-lg font-semibold text-ink">{l('title')}</h2>
            <p className="text-sm text-ink-muted">{l('intro')}</p>
            <p className="text-sm text-ink-muted">{l('privacy')}</p>
        </Card>
        {students.loading && <TeacherLoading />}
        {students.failed && <Callout variant="danger"><p>{l('loadError')}</p>
            <Button variant="secondary" onClick={() => void students.reload()}>{l('reload')}</Button></Callout>}
        {students.forbidden && <Callout variant="danger"><p>{l('loadError')}</p></Callout>}
        {students.data && <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
            <Card className="h-max space-y-4">
                <input value={query} onChange={event => setQuery(event.target.value)}
                    placeholder={l('search')} aria-label={l('search')}
                    className="min-h-[44px] w-full rounded-control border border-line-strong bg-surface px-4 text-sm" />
                {students.data.length === 0 && <p className="text-sm text-ink-muted">{l('noStudents')}</p>}
                {list.length === 0 && students.data.length > 0 && <p className="text-sm text-ink-muted">{l('search')}</p>}
                {list.length > 0 && <ul className="divide-y divide-line">
                    {list.map(row => <li key={row.username}>
                        <button type="button" disabled={busy || draftBusy} onClick={() => void openStudent(row)}
                            aria-pressed={username === row.username}
                            className={`min-h-[44px] w-full space-y-1 rounded-control px-2 py-2 text-left text-sm ${username === row.username ? 'bg-brand-soft' : 'hover:bg-surface-sunken'}`}>
                            <span className="block font-semibold text-ink">{row.display_name}</span>
                            <span className="flex flex-wrap items-center gap-2">
                                {chip(row.status)}
                                {row.ai_draft_used && <span className="rounded-full bg-brand-soft px-2 py-1 text-xs font-semibold text-link">{l('aiDrag')}</span>}
                            </span>
                        </button>
                    </li>)}
                </ul>}
            </Card>
            <Card className="space-y-4">
                {!username && <p className="text-sm text-ink-muted">{l('selectHint')}</p>}
                {username && docLoading && <TeacherLoading />}
                {username && docFailed && <Callout variant="danger"><p>{l('detailLoadError')}</p>
                    <Button variant="secondary" onClick={() => {
                        const chosen = students.data?.find(row => row.username === username);
                        if (chosen) void openStudent(chosen);
                    }}>{l('reload')}</Button></Callout>}
                {username && !docLoading && !docFailed && <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="space-y-1">
                            <p className="text-sm">
                                <span className="font-semibold text-ink-muted">{l('classLabel')}:</span>
                                <span className="text-ink"> {doc?.group_name || ''}</span>
                                <span className="font-semibold text-ink-muted"> · {l('studentLabel')}:</span>
                                <span className="text-ink"> {doc?.display_name || ''}</span>
                            </p>
                            {doc?.updated_at && <p className="text-xs text-ink-muted">
                                {l('lastChange')}: {date(lang, doc.updated_at)}{doc.updated_by ? ` · ${doc.updated_by}` : ''}
                            </p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {chip(status)}
                            {draftUsed && <span className="rounded-full bg-brand-soft px-2 py-1 text-xs font-semibold text-link">{l('aiDrag')}</span>}
                        </div>
                    </div>
                    {!doc?.is_member && <p className="text-sm text-ink-muted">{l('historical')}</p>}
                    <Button variant="secondary" disabled={draftBusy || busy || !doc?.is_member} onClick={() => void generate()}>
                        {l(draftBusy ? 'generating' : 'generate')}
                    </Button>
                    {draft && <div role="status" className="space-y-2 rounded-lg border border-brand-line bg-brand-soft p-4">
                        <p className="text-sm font-semibold text-link">{l('draftTitle')}</p>
                        <p className="whitespace-pre-wrap rounded-control bg-surface p-4 text-sm text-ink-body">{draft}</p>
                        <p className="text-xs text-link">{l('draftReady')}</p>
                        <div className="flex flex-wrap gap-2">
                            <Button disabled={busy} onClick={() => { setContent(draft); setDraftUsed(true); setDraft(''); }}>{l('useIt')}</Button>
                            <Button variant="secondary" disabled={busy} onClick={() => setDraft('')}>{l('discard')}</Button>
                        </div>
                    </div>}
                    <label className="block space-y-1">
                        <span className="text-xs font-semibold text-ink-muted">{l('content')}</span>
                        <textarea value={content} disabled={busy || !doc?.is_member} onChange={event => setContent(event.target.value)}
                            rows={14} placeholder={l('contentPlaceholder')}
                            className="w-full rounded-control border border-line-strong bg-surface p-4 text-sm leading-6" />
                    </label>
                    {notice && <p role="alert" className={`text-sm ${(notice === 'saved') ? 'text-success' : 'text-danger'}`}>
                        {notice === 'saved' && l('saved')}
                        {notice === 'saveError' && l('saveError')}
                        {notice === 'conflict' && l('conflictReload')}
                        {notice === 'detailLoadError' && l('detailLoadError')}
                        {notice === 'generateError' && l('generateError')}
                        {notice === 'downloadError' && l('downloadError')}
                    </p>}
                    <div className="flex flex-wrap items-center gap-2">
                        <Button disabled={busy || draftBusy || !doc?.is_member || !content.trim() || (doc !== null && content === doc.content && status === doc.status && draftUsed === doc.ai_draft_used)}
                            onClick={() => void save(status ?? 'draft')}>
                            {l(busy ? 'saving' : 'save')}
                        </Button>
                        {status === 'final'
                            ? <Button variant="secondary" disabled={busy || draftBusy || !doc?.is_member || !content.trim()} onClick={() => void save('draft')}>{l('backToDraft')}</Button>
                            : confirmFinalize
                                ? <ConfirmInline question={l('finalizeConfirm')} busy={busy}
                                    onConfirm={() => { setConfirmFinalize(false); void save('final'); }}
                                    onCancel={() => setConfirmFinalize(false)} />
                                : <Button variant="secondary" disabled={busy || draftBusy || !doc?.is_member || !content.trim()}
                                    onClick={() => setConfirmFinalize(true)}>
                                    {l('finalize')}</Button>}
                        <Button variant="secondary" disabled={!doc?.content.trim()} onClick={() => void download()}>{l('download')}</Button>
                        <span className="rounded-full bg-surface-raised px-2 py-1 text-xs text-ink-muted">{l('internalBadge')}</span>
                    </div>
                </div>}
            </Card>
        </div>}
    </div>;
}
