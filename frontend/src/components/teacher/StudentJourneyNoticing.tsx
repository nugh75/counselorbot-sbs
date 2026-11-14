'use client';
// Whole-journey noticing of one student (#890): batches analysed on request, every quote with its source.
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { noticingText } from '@/lib/i18n-noticing';
import { journeyText } from '@/lib/i18n-journey-noticing';
import { parseStudentNoticing, SOURCE_KINDS, type SourceEvidence, type StudentNoticing } from '@/lib/student-noticing';
import { Button } from '@/components/ui/Button';
import { useTeacherResource } from './useTeacherResource';

export function SourceQuote({ source, base }: { source: SourceEvidence; base: string }) {
    const { lang } = useI18n();
    const [text, setText] = useState<string | null>(null);
    const [context, setContext] = useState('');
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState(false);
    const abort = useRef<AbortController | null>(null);
    useEffect(() => () => abort.current?.abort(), []);
    const open = async () => {
        setFailed(false); setBusy(true);
        const controller = new AbortController(); abort.current = controller;
        try {
            const response = await apiFetch(`${base}/noticing-source?${new URLSearchParams({ source: source.id })}`, { signal: controller.signal });
            if (!response.ok) throw new Error('source unavailable');
            const body = await response.json();
            if (!controller.signal.aborted) { setText(body.text); setContext(body.context || ''); }
        } catch { if (!controller.signal.aborted) setFailed(true); }
        finally { if (!controller.signal.aborted) setBusy(false); }
    };
    return <div className="space-y-2 border-l-4 border-line-strong pl-4 text-sm">
        <p className="text-xs text-ink-muted">{journeyText(lang, source.kind)} · {journeyText(lang, source.author)}{source.date && ` · ${new Date(source.date).toLocaleDateString(lang)}`}</p>
        <blockquote className="break-words italic text-ink-body">«{source.quote}»</blockquote>
        <Button type="button" variant="ghost" className="min-h-[44px] px-2" onClick={() => void open()} disabled={busy}>{journeyText(lang, 'sourceOpen')}</Button>
        {context && <details><summary className="min-h-[44px] cursor-pointer py-2 text-ink-muted">{journeyText(lang, 'sourceContext')}</summary><p className="whitespace-pre-wrap break-words text-ink-muted">{context}</p></details>}
        {text !== null && <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-control bg-surface-raised p-4 font-sans text-ink-body">{text}</pre>}
        {failed && <p role="alert" className="text-danger">{noticingText(lang, 'loadError')}</p>}
    </div>;
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
    return <div className="space-y-4 rounded-lg border border-line bg-surface p-4">
        {resource.loading && !data && <p role="status">{t('common.loading')}</p>}
        {resource.failed && !data && <Button variant="secondary" onClick={() => void resource.reload()}>{t('setup.retry')}</Button>}
        {data && <>
            <p className="text-sm text-ink-muted">{journeyText(lang, 'sourceCount', { n: data.source_count, done: data.total_chunks - data.pending_chunks.length, total: data.total_chunks })}</p>
            <details><summary className="min-h-[44px] cursor-pointer py-2 font-semibold text-link">{journeyText(lang, 'sources')}</summary>
                <ul className="grid gap-1 text-sm text-ink-muted sm:grid-cols-2">{SOURCE_KINDS.filter(kind => data.source_counts[kind] > 0).map(kind => <li key={kind}>{journeyText(lang, kind)}: {data.source_counts[kind]}</li>)}</ul>
            </details>
            {data.pending_chunks.length > 0 && <Button type="button" disabled={busy} aria-busy={busy} onClick={() => void analyse()}>{journeyText(lang, 'analyse')}</Button>}
            {busy && <p role="status">{journeyText(lang, 'progress', { done, total: data.pending_chunks.length + done })}</p>}
            {failed && <p role="alert" className="text-danger">{noticingText(lang, 'unavailable')}</p>}
            {data.status === 'empty' && <p>{journeyText(lang, 'empty')}</p>}
            <ul className="space-y-4">{data.items.map(item => <li key={item.id} className="space-y-2 border-t border-line pt-4">
                <p className="text-xs font-semibold text-link">{noticingText(lang, item.kind)}</p><p className="text-ink">{item.text}</p>
                {item.evidence.map((source, index) => <SourceQuote key={`${source.id}:${index}`} source={source} base={base} />)}
            </li>)}</ul>
        </>}
    </div>;
}
