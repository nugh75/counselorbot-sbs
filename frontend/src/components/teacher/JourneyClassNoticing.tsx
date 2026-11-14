'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { noticingText, type NoticingTextKey } from '@/lib/i18n-noticing';
import { journeyText } from '@/lib/i18n-journey-noticing';
import { NOTICING_KINDS } from '@/lib/teacher-noticing';
import { barPercent, classNoticingQuery, parseClassNoticing, type ClassNoticing } from '@/lib/class-noticing';
import { parseStudentNoticing, SOURCE_KINDS, type SourceKind } from '@/lib/student-noticing';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { useTeacherResource } from './useTeacherResource';
import { SourceQuote, StudentJourneyNoticing } from './StudentJourneyNoticing';

export function JourneyClassNoticing({ groupId }: { groupId: number }) {
    const { lang, t } = useI18n();
    const l = (key: NoticingTextKey) => noticingText(lang, key);
    const base = `/api/admin/groups/${groupId}`;
    const [instrument, setInstrument] = useState('');
    const [days, setDays] = useState(0);
    const query = classNoticingQuery(lang, instrument, days);
    const url = `${base}/noticing?${query}`;
    const parse = useCallback((payload: unknown) => ({ url, data: parseClassNoticing(payload) }), [url]);
    const resource = useTeacherResource(url, parse);
    const [result, setResult] = useState<{ url: string; data: ClassNoticing } | null>(null);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [failed, setFailed] = useState(false);
    const [opened, setOpened] = useState<Set<string>>(new Set());
    const [refreshVersion, setRefreshVersion] = useState(0);
    const controller = useRef<AbortController | null>(null);
    useEffect(() => () => controller.current?.abort(), []);
    const data = result?.url === url ? result.data : resource.data?.url === url ? resource.data.data : undefined;
    const studentBase = (username: string) => `${base}/students/${encodeURIComponent(username)}`;
    const changed = () => { setResult(null); void resource.reload(); };
    const analyse = async () => {
        if (!data) return;
        const abort = new AbortController(); controller.current = abort;
        const total = data.students.reduce((n, student) => n + student.pending_chunks.length, 0);
        let done = 0;
        setFailed(false); setProgress({ done, total });
        try {
            for (const student of data.students) {
                for (const chunk of student.pending_chunks) {
                    const response = await apiFetch(`${studentBase(student.username)}/noticing?${query}&chunk=${chunk}`, { method: 'POST', signal: abort.signal });
                    if (!response.ok) throw new Error('student noticing failed');
                    parseStudentNoticing(await response.json());
                    if (abort.signal.aborted) return;
                    setProgress({ done: ++done, total });
                }
            }
            const response = await apiFetch(url, { method: 'POST', signal: abort.signal });
            if (!response.ok) throw new Error('class noticing failed');
            const next = parseClassNoticing(await response.json());
            if (!abort.signal.aborted) { setResult({ url, data: next }); setFailed(next.status === 'unavailable'); setRefreshVersion(value => value + 1); }
        } catch { if (!abort.signal.aborted) { setFailed(true); changed(); } }
        finally { if (!abort.signal.aborted) setProgress(null); }
    };
    const pending = data?.students.reduce((n, student) => n + student.pending_chunks.length, 0) ?? 0;
    const roster = data?.students ?? result?.data.students ?? resource.data?.data.students ?? [];
    const total = data?.charts.students_with_sources ?? 0;
    return <div className="space-y-5">
        <Card className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">{l('classTitle')}</h2>
            <p className="text-sm text-slate-600">{journeyText(lang, 'intro')}</p>
            <p className="text-xs text-slate-500">{journeyText(lang, 'evidenceNote')}</p>
            <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1 text-sm font-medium text-slate-700"><span className="block">{l('instrument')}</span>
                    <select disabled={!!progress} value={instrument} onChange={event => setInstrument(event.target.value)} className="min-h-11 rounded border border-slate-300 bg-white px-3">
                        <option value="">{l('allInstruments')}</option>{data?.instruments.map(code => <option key={code} value={code}>{SOURCE_KINDS.includes(code as SourceKind) ? journeyText(lang, code as SourceKind) : code}</option>)}
                    </select>
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700"><span className="block">{l('period')}</span>
                    <select disabled={!!progress} value={days} onChange={event => setDays(Number(event.target.value))} className="min-h-11 rounded border border-slate-300 bg-white px-3">
                        {[0, 30, 90].map(value => <option key={value} value={value}>{value ? noticingText(lang, 'lastDays', { n: value }) : l('allTime')}</option>)}
                    </select>
                </label>
                {total > 0 && <Button disabled={!!progress} aria-busy={!!progress} onClick={() => void analyse()}>{l(data?.status === 'ready' || data?.status === 'stale' ? 'reanalyse' : 'analyse')}</Button>}
            </div>
            <p className="text-xs text-slate-500">{journeyText(lang, 'filterScope')}</p>
            {resource.loading && !data && <p role="status">{t('common.loading')}</p>}
            {resource.failed && !data && <Callout variant="danger"><p>{l('loadError')}</p><Button onClick={() => void resource.reload()}>{t('setup.retry')}</Button></Callout>}
            {failed && <p role="alert" className="text-red-700">{l('unavailable')}</p>}
            {progress && <p role="status">{progress.done < progress.total ? journeyText(lang, 'progress', progress) : l('grouping')}</p>}
            {data && <>
                <p className="text-sm text-slate-600">{journeyText(lang, 'coverage', { n: total, total: data.charts.students, pending })}</p>
                {data.status === 'empty' && <p>{journeyText(lang, 'empty')}</p>}
                {data.status === 'stale' && <p role="status" className="text-amber-900">{journeyText(lang, 'stale')}</p>}
            </>}
        </Card>
        <section className="space-y-3" aria-label={journeyText(lang, 'sources')}>
                {roster.map(student => <details key={student.username} className="rounded-lg border border-slate-200 bg-white p-3"
                    onToggle={event => { if (event.currentTarget.open) setOpened(previous => new Set(previous).add(student.username)); }}>
                    <summary className="min-h-11 cursor-pointer break-words py-2 font-semibold text-indigo-700">{student.username} · {journeyText(lang, 'sources')}: {student.source_count}</summary>
                    {opened.has(student.username) && <StudentJourneyNoticing key={`${student.username}:${lang}`} base={studentBase(student.username)} onChanged={changed} refreshVersion={refreshVersion} />}
                </details>)}
        </section>
        {data && <>
            {(data.status === 'ready' || data.status === 'stale') && <>
                {data.suggestions.length > 0 && <Card className="space-y-3"><h3 className="font-semibold text-slate-800">{l('suggestions')}</h3>
                    <ul className="list-inside list-disc space-y-2 text-sm text-slate-700">{data.suggestions.map((text, index) => <li key={index}>{text}</li>)}</ul>
                </Card>}
                <Card className="space-y-3"><h3 className="font-semibold text-slate-800">{l('kindsChart')}</h3>
                    {NOTICING_KINDS.map(kind => <div key={kind} className="space-y-1 text-sm text-slate-700"><p>{l(kind)} · {data.charts.kinds[kind]}/{total}</p>
                        <div className="h-2 rounded bg-slate-100" aria-hidden><div className="h-2 rounded bg-indigo-500" style={{ width: `${barPercent(data.charts.kinds[kind], total)}%` }} /></div>
                    </div>)}
                </Card>
                <section className="space-y-3"><h3 className="font-semibold text-slate-800">{l('themes')}</h3>
                    {data.themes.length === 0 && <p>{l('noThemes')}</p>}
                    {data.themes.map((theme, index) => <Card key={index} className="space-y-3">
                        <h4 className="font-semibold text-slate-800">{theme.title} · {theme.student_count} {l('students')}</h4><p className="text-sm text-slate-700">{theme.suggestion}</p>
                        <details><summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-indigo-700">{l('showStudents')}</summary>
                            <ul className="space-y-4">{theme.students.map((student, i) => <li key={i} className="space-y-2"><p className="font-semibold">{student.username}</p><p>{student.text}</p>
                                <SourceQuote source={student.source} base={studentBase(student.username)} />
                            </li>)}</ul>
                        </details>
                    </Card>)}
                </section>
            </>}
        </>}
    </div>;
}
