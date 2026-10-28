'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { orientationRecText, type OrientationRecTextKey } from '@/lib/i18n-orientation-rec';
import {
    parseDraft, parseRecommendationDoc, parseRecommendationList,
    type RecommendationDoc, type RecommendationSummary,
} from '@/lib/orientation-recommendation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { TeacherLoading } from './TeacherAccess';
import { useTeacherResource } from './useTeacherResource';

const STATUS_CHIP = {
    draft: 'bg-amber-100 text-amber-800',
    final: 'bg-emerald-100 text-emerald-800',
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
    const [draftBusy, setDraftBusy] = useState(false);
    const [draft, setDraft] = useState('');
    const [notice, setNotice] = useState<'' | 'saved' | 'saveError' | 'conflict' | 'detailLoadError' | 'generateError' | 'downloadError'>('');
    const pending = useRef<AbortController | null>(null);

    useEffect(() => () => pending.current?.abort(), []);

    const openStudent = async (student: RecommendationSummary) => {
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
        if (!username || busy) return;
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
        if (!username || draftBusy) return;
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
        ? <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CHIP[value]}`}>{l(value === 'final' ? 'statusFinal' : 'statusDraft')}</span>
        : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{l('noDocument')}</span>;

    return <div className="space-y-5">
        <Card className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-800">{l('title')}</h2>
            <p className="text-sm text-slate-600">{l('intro')}</p>
            <p className="text-sm text-slate-600">{l('privacy')}</p>
        </Card>
        {students.loading && <TeacherLoading />}
        {students.failed && <Callout variant="danger"><p>{l('loadError')}</p>
            <Button variant="secondary" onClick={() => void students.reload()}>{l('reload')}</Button></Callout>}
        {students.forbidden && <Callout variant="danger"><p>{l('loadError')}</p></Callout>}
        {students.data && <div className="grid gap-5 lg:grid-cols-[320px,1fr]">
            <Card className="h-max space-y-3">
                <input value={query} onChange={event => setQuery(event.target.value)}
                    placeholder={l('search')} aria-label={l('search')}
                    className="min-h-[44px] w-full rounded-md border border-slate-300 bg-white px-3 text-sm" />
                {students.data.length === 0 && <p className="text-sm text-slate-500">{l('noStudents')}</p>}
                {list.length === 0 && students.data.length > 0 && <p className="text-sm text-slate-500">{l('search')}</p>}
                {list.length > 0 && <ul className="divide-y divide-slate-100">
                    {list.map(row => <li key={row.username}>
                        <button type="button" onClick={() => void openStudent(row)}
                            aria-pressed={username === row.username}
                            className={`min-h-[44px] w-full space-y-1 rounded-md px-2 py-2 text-left text-sm ${username === row.username ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}>
                            <span className="block font-medium text-slate-800">{row.display_name}</span>
                            <span className="flex flex-wrap items-center gap-2">
                                {chip(row.status)}
                                {row.ai_draft_used && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">{l('aiDrag')}</span>}
                            </span>
                        </button>
                    </li>)}
                </ul>}
            </Card>
            <Card className="space-y-4">
                {!username && <p className="text-sm text-slate-500">{l('selectHint')}</p>}
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
                                <span className="font-medium text-slate-500">{l('classLabel')}:</span>
                                <span className="text-slate-800"> {doc?.group_name || ''}</span>
                                <span className="font-medium text-slate-500"> · {l('studentLabel')}:</span>
                                <span className="text-slate-800"> {doc?.display_name || ''}</span>
                            </p>
                            {doc?.updated_at && <p className="text-xs text-slate-500">
                                {l('lastChange')}: {date(lang, doc.updated_at)}{doc.updated_by ? ` · ${doc.updated_by}` : ''}
                            </p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {chip(status)}
                            {draftUsed && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">{l('aiDrag')}</span>}
                        </div>
                    </div>
                    <Button variant="secondary" disabled={draftBusy} onClick={() => void generate()}>
                        {l(draftBusy ? 'generating' : 'generate')}
                    </Button>
                    {draft && <div role="status" className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                        <p className="text-sm font-semibold text-indigo-800">{l('draftTitle')}</p>
                        <p className="whitespace-pre-wrap rounded-md bg-white p-3 text-sm text-slate-700">{draft}</p>
                        <p className="text-xs text-indigo-700">{l('draftReady')}</p>
                        <div className="flex flex-wrap gap-2">
                            <Button onClick={() => { setContent(draft); setDraftUsed(true); setDraft(''); }}>{l('useIt')}</Button>
                            <Button variant="secondary" onClick={() => setDraft('')}>{l('discard')}</Button>
                        </div>
                    </div>}
                    <label className="block space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{l('content')}</span>
                        <textarea value={content} onChange={event => setContent(event.target.value)}
                            rows={14} placeholder={l('contentPlaceholder')}
                            className="w-full rounded-md border border-slate-300 bg-white p-3 text-sm leading-6" />
                    </label>
                    {notice && <p role="alert" className={`text-sm ${(notice === 'saved') ? 'text-emerald-700' : 'text-red-600'}`}>
                        {notice === 'saved' && l('saved')}
                        {notice === 'saveError' && l('saveError')}
                        {notice === 'conflict' && l('conflictReload')}
                        {notice === 'detailLoadError' && l('detailLoadError')}
                        {notice === 'generateError' && l('generateError')}
                        {notice === 'downloadError' && l('downloadError')}
                    </p>}
                    <div className="flex flex-wrap items-center gap-2">
                        <Button disabled={busy || (doc !== null && content === doc.content && status === doc.status && draftUsed === doc.ai_draft_used)}
                            onClick={() => void save(status ?? 'draft')}>
                            {l(busy ? 'saving' : 'save')}
                        </Button>
                        {status === 'final'
                            ? <Button variant="secondary" disabled={busy || !content.trim()} onClick={() => void save('draft')}>{l('backToDraft')}</Button>
                            : <Button variant="secondary" disabled={busy || !content.trim()}
                                onClick={() => { if (window.confirm(l('finalizeConfirm'))) void save('final'); }}>
                                {l('finalize')}</Button>}
                        <Button variant="secondary" disabled={!content.trim()} onClick={() => void download()}>{l('download')}</Button>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{l('internalBadge')}</span>
                    </div>
                </div>}
            </Card>
        </div>}
    </div>;
}
