'use client';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { noticingText } from '@/lib/i18n-noticing';
import { journeyText } from '@/lib/i18n-journey-noticing';
import { parseAdvice, parseStudentNoticing, SOURCE_KINDS, type Advice, type SourceEvidence, type StudentNoticing } from '@/lib/student-noticing';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { useTeacherResource } from './useTeacherResource';

export function SourceQuote({ source, base }: { source: SourceEvidence; base: string }) {
    const { lang } = useI18n();
    const [text, setText] = useState<string | null>(null);
    const [context, setContext] = useState('');
    const [error, setIssue] = useState(false);
    const [busy, setBusy] = useState(false);
    const abort = useRef<AbortController | null>(null);
    useEffect(() => () => abort.current?.abort(), []);
    const open = async () => {
        setIssue(false); setBusy(true);
        const controller = new AbortController(); abort.current = controller;
        try {
            const response = await apiFetch(`${base}/noticing-source?${new URLSearchParams({ source: source.id })}`, { signal: controller.signal });
            if (!response.ok) throw new Error('source unavailable');
            const body = await response.json();
            if (!controller.signal.aborted) { setText(body.text); setContext(body.context || ''); }
        } catch { if (!controller.signal.aborted) setIssue(true); }
        finally { if (!controller.signal.aborted) setBusy(false); }
    };
    return <div className="space-y-2 border-l-4 border-slate-300 pl-3 text-sm">
        <p className="text-xs text-slate-500">{journeyText(lang, source.kind)} · {journeyText(lang, source.author)}{source.date && ` · ${new Date(source.date).toLocaleDateString(lang)}`}</p>
        <blockquote className="break-words italic text-slate-700">«{source.quote}»</blockquote>
        <Button type="button" variant="ghost" onClick={() => void open()} disabled={busy}>{journeyText(lang, 'sourceOpen')}</Button>
        {context && <details><summary className="min-h-11 cursor-pointer py-2 text-slate-500">{journeyText(lang, 'sourceContext')}</summary><p className="whitespace-pre-wrap break-words text-slate-600">{context}</p></details>}
        {text !== null && <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-3 font-sans text-slate-700">{text}</pre>}
        {error && <p role="alert">{noticingText(lang, 'loadError')}</p>}
    </div>;
}

function OrientationAdvice({ base, ready, fingerprint }: { base: string; ready: boolean; fingerprint: string }) {
    const { lang, t } = useI18n();
    const l = (key: Parameters<typeof journeyText>[1], values?: Record<string, string | number>) => journeyText(lang, key, values);
    const url = `${base}/orientation-advice?lang=${lang}`;
    const resource = useTeacherResource(url, parseAdvice);
    const [saved, setSaved] = useState<Advice | null>(null);
    const [edited, setEdited] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setIssue] = useState<'conflict' | 'unavailable' | null>(null);
    const [copied, setCopied] = useState(false);
    const [basis, setBasis] = useState(fingerprint);
    const controller = useRef<AbortController | null>(null);
    useEffect(() => () => controller.current?.abort(), []);
    const data = saved ?? resource.data;
    const text = edited ?? data?.text ?? '';
    const dirty = edited !== null && edited !== data?.text;
    const stale = data?.stale || basis !== fingerprint;
    useDraftGuard(dirty || busy, l('leave'), { blocked: busy, preserveFocus: true });
    const update = async (operation: 'generate' | 'save' | 'validate') => {
        if (!data || busy) return;
        if (operation === 'generate' && data.revision > 0 && !window.confirm(l('leave'))) return;
        setBusy(true); setIssue(null);
        const abort = new AbortController(); controller.current = abort;
        try {
            const response = await apiFetch(url, { method: 'POST', signal: abort.signal, headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ revision: data.revision, operation, text }) });
            if (!response.ok) { setIssue(response.status === 409 ? 'conflict' : 'unavailable'); return; }
            const next = parseAdvice(await response.json());
            if (!abort.signal.aborted) { setSaved(next); setEdited(null); if (operation === 'generate') setBasis(fingerprint); }
        } catch { if (!abort.signal.aborted) setIssue('unavailable'); }
        finally { if (!abort.signal.aborted) setBusy(false); }
    };
    return <section className="space-y-3 border-t border-slate-200 pt-5" aria-label={l('advice')}>
        <h4 className="font-semibold text-slate-800">{l('advice')}</h4>
        <p className="text-sm text-slate-600">{l('adviceIntro')}</p>
        {!ready && <p className="text-sm text-slate-600">{l('prerequisite')}</p>}
        {resource.loading && !data && <p role="status">{t('common.loading')}</p>}
        {resource.failed && !data && <Button onClick={() => void resource.reload()}>{t('setup.retry')}</Button>}
        {data && <>
            {stale && <p role="status" className="text-amber-900">{l('stale')}</p>}
            {data.revision > 0 && <>
                <p className="break-words text-sm font-medium text-slate-700">{data.state === 'validated' && !dirty && !stale ? l('validated', { name: data.validated_by ?? '', date: data.validated_at ? new Date(data.validated_at).toLocaleString(lang) : '' }) : l('draft')}</p>
                <label className="block space-y-2 text-sm text-slate-700"><span>{l('advice')}</span>
                    <textarea value={text} disabled={busy} onChange={event => { setEdited(event.target.value); setCopied(false); }} maxLength={20000} rows={12}
                        className="w-full rounded-md border border-slate-300 bg-white p-3 text-slate-800" />
                </label>
            </>}
            <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void update('generate')} disabled={busy || !ready}>{l(data.revision ? 'regenerate' : 'generate')}</Button>
                {data.revision > 0 && <>
                    <Button type="button" variant="secondary" disabled={busy || !text.trim() || !dirty} onClick={() => void update('save')}>{l('save')}</Button>
                    <Button type="button" disabled={busy || !text.trim() || stale || !ready || (data.state === 'validated' && !dirty)} onClick={() => void update('validate')}>{l('validate')}</Button>
                    <Button type="button" variant="secondary" onClick={() => { void navigator.clipboard.writeText(text).then(() => setCopied(true)).catch(() => setIssue('unavailable')); }}>{l(copied ? 'copied' : 'copy')}</Button>
                </>}
            </div>
            {busy && <p role="status">{t('common.loading')}</p>}
            {error && <Callout variant="danger"><p role="alert">{error === 'conflict' ? l('conflict') : noticingText(lang, 'unavailable')}</p>
                {error === 'conflict' && <Button variant="secondary" onClick={() => { if (!dirty || window.confirm(l('leave'))) { setSaved(null); setEdited(null); setIssue(null); void resource.reload(); } }}>{l('reload')}</Button>}
            </Callout>}
        </>}
    </section>;
}

export function StudentJourneyNoticing({ base, onChanged, refreshVersion }: { base: string; onChanged: () => void; refreshVersion: number }) {
    const { lang, t } = useI18n();
    const resource = useTeacherResource(`${base}/noticing?lang=${lang}`, parseStudentNoticing);
    const [generated, setGenerated] = useState<{ version: number; data: StudentNoticing } | null>(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const [done, setDone] = useState(0);
    const controller = useRef<AbortController | null>(null);
    useEffect(() => () => controller.current?.abort(), []);
    const reload = resource.reload;
    useEffect(() => { if (refreshVersion) void reload(); }, [refreshVersion, reload]);
    const data = generated?.version === refreshVersion ? generated.data : resource.data;
    const analyse = async () => {
        if (!data) return;
        const abort = new AbortController(); controller.current = abort;
        setBusy(true); setFailed(false); setDone(0);
        try {
            for (const [index, chunk] of data.pending_chunks.entries()) {
                const response = await apiFetch(`${base}/noticing?${new URLSearchParams({ lang, chunk })}`, { method: 'POST', signal: abort.signal });
                if (!response.ok) throw new Error('noticing failed');
                const next = parseStudentNoticing(await response.json());
                if (abort.signal.aborted) return;
                setGenerated({ version: refreshVersion, data: next }); setDone(index + 1);
            }
            onChanged();
        } catch { if (!abort.signal.aborted) setFailed(true); }
        finally { if (!abort.signal.aborted) setBusy(false); }
    };
    return <div className="space-y-4 rounded-lg border border-indigo-200 bg-white p-4">
        {resource.loading && !data && <p role="status">{t('common.loading')}</p>}
        {resource.failed && !data && <Button onClick={() => void resource.reload()}>{t('setup.retry')}</Button>}
        {data && <>
            <p className="text-sm text-slate-600">{journeyText(lang, 'sourceCount', { n: data.source_count, done: data.total_chunks - data.pending_chunks.length, total: data.total_chunks })}</p>
            <details><summary className="min-h-11 cursor-pointer py-2 font-medium text-indigo-700">{journeyText(lang, 'sources')}</summary>
                <ul className="grid gap-1 text-sm text-slate-600 sm:grid-cols-2">{SOURCE_KINDS.filter(kind => data.source_counts[kind] > 0).map(kind => <li key={kind}>{journeyText(lang, kind)}: {data.source_counts[kind]}</li>)}</ul>
            </details>
            {data.pending_chunks.length > 0 && <Button type="button" disabled={busy} onClick={() => void analyse()}>{journeyText(lang, 'analyse')}</Button>}
            {busy && <p role="status">{journeyText(lang, 'progress', { done, total: data.pending_chunks.length + done })}</p>}
            {failed && <p role="alert">{noticingText(lang, 'unavailable')}</p>}
            {data.status === 'empty' && <p>{journeyText(lang, 'empty')}</p>}
            <ul className="space-y-4">{data.items.map(item => <li key={item.id} className="space-y-2 border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-indigo-700">{noticingText(lang, item.kind)}</p><p className="text-slate-800">{item.text}</p>
                {item.evidence.map((source, index) => <SourceQuote key={`${source.id}:${index}`} source={source} base={base} />)}
            </li>)}</ul>
            <OrientationAdvice base={base} fingerprint={data.fingerprint} ready={data.status === 'ready' && data.items.length > 0} />
        </>}
    </div>;
}
