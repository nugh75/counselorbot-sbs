'use client';

import { useState } from 'react';
import { Lightbulb, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { noticingText, type NoticingTextKey } from '@/lib/i18n-noticing';
import { journeyText } from '@/lib/i18n-journey-noticing';
import { NOTICING_KINDS } from '@/lib/teacher-noticing';
import { barPercent, classNoticingQuery, parseClassNoticing, type ClassNoticing, type ClassTheme } from '@/lib/class-noticing';
import { parseStudentNoticing, SOURCE_KINDS, type SourceKind } from '@/lib/student-noticing';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { SourceQuote, StudentJourneyNoticing } from './StudentJourneyNoticing';
import { useTeacherResource } from './useTeacherResource';

const PERIODS = [0, 30, 90];
const KIND_BAR = { revisit: 'bg-info', resource: 'bg-success', difficulty: 'bg-warning', attention: 'bg-danger' } as const;
const KIND_BADGE = { revisit: 'bg-info-soft text-info-ink', resource: 'bg-success-soft text-success-ink', difficulty: 'bg-warning-soft text-warning-ink', attention: 'bg-danger-soft text-danger-ink' } as const;

function Bar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
    return <div className="space-y-1">
        <div className="flex justify-between gap-2 text-sm"><span className="text-ink-body">{label}</span><span className="font-semibold text-ink">{count}/{total}</span></div>
        <div className="h-2.5 rounded-full bg-surface-raised" aria-hidden><div className={`h-2.5 rounded-full ${color}`} style={{ width: `${barPercent(count, total)}%` }} /></div>
    </div>;
}

function ThemeCard({ theme, total, studentBase }: { theme: ClassTheme; total: number; studentBase: (username: string) => string }) {
    const { lang } = useI18n();
    const l = (key: NoticingTextKey) => noticingText(lang, key);
    return <li className="space-y-4 rounded-lg border border-line bg-surface p-4">
        <p className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${KIND_BADGE[theme.kind]}`}>{l(theme.kind)}</span>
            <span className="font-semibold text-ink">{theme.title}</span>
        </p>
        <Bar label={l('students')} count={theme.student_count} total={total} color={KIND_BAR[theme.kind]} />
        {theme.suggestion && <p className="flex gap-2 text-sm text-ink-body"><Lightbulb className="mt-1 h-4 w-4 shrink-0 text-warning" aria-hidden />{theme.suggestion}</p>}
        <details className="text-sm">
            <summary className="min-h-[44px] cursor-pointer py-2 font-semibold text-link">{l('showStudents')} ({theme.students.length})</summary>
            <ul className="space-y-4">{theme.students.map((student, index) => <li key={index} className="space-y-1 border-t border-line pt-2">
                <p className="font-semibold text-ink">{student.username}</p>
                <p className="text-ink-body">{student.text}</p>
                <SourceQuote source={student.source} base={studentBase(student.username)} />
            </li>)}</ul>
        </details>
    </li>;
}

export function ClassNoticingTab({ groupId }: { groupId: number }) {
    const { lang, t } = useI18n();
    const l = (key: NoticingTextKey, values?: Record<string, string | number>) => noticingText(lang, key, values);
    const base = `/api/admin/groups/${groupId}`;
    const [instrument, setInstrument] = useState('');
    const [days, setDays] = useState(0);
    const url = `${base}/noticing?${classNoticingQuery(lang, instrument, days)}`;
    const resource = useTeacherResource(url, parseClassNoticing);
    const [result, setResult] = useState<{ url: string; data: ClassNoticing } | null>(null);
    const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
    const [failed, setFailed] = useState(false);
    const [opened, setOpened] = useState<Set<string>>(new Set());
    const [refreshVersion, setRefreshVersion] = useState(0);
    const data = result?.url === url ? result.data : resource.data;
    const studentBase = (username: string) => `${base}/students/${encodeURIComponent(username)}`;
    const changed = () => { setResult(null); void resource.reload(); };

    // Analyse every pending batch of every student (with the same filters), then group the class.
    const analyse = async () => {
        if (!data) return;
        const total = data.students.reduce((n, student) => n + student.pending_chunks.length, 0);
        let done = 0;
        setFailed(false);
        setProgress({ done, total });
        try {
            for (const student of data.students) {
                for (const chunk of student.pending_chunks) {
                    const response = await apiFetch(`${studentBase(student.username)}/noticing?${classNoticingQuery(lang, instrument, days)}&chunk=${chunk}`, { method: 'POST' });
                    if (!response.ok) throw new Error('student noticing failed');
                    parseStudentNoticing(await response.json());
                    setProgress({ done: ++done, total });
                }
            }
            const response = await apiFetch(url, { method: 'POST' });
            if (!response.ok) throw new Error('class noticing failed');
            const next = parseClassNoticing(await response.json());
            setResult({ url, data: next });
            setRefreshVersion(value => value + 1);
            if (next.status === 'unavailable') setFailed(true);
        } catch {
            setFailed(true);
            changed();
        } finally {
            setProgress(null);
        }
    };

    const pending = data?.students.reduce((n, student) => n + student.pending_chunks.length, 0) ?? 0;
    const total = data?.charts.students_with_sources ?? 0;
    const showResults = data && (data.status === 'ready' || data.status === 'stale');

    return <div className="space-y-6">
        <Card className="space-y-4">
            <div className="space-y-2">
                <h2 className="text-lg font-semibold text-ink">{l('classTitle')}</h2>
                <p className="text-sm text-ink-muted">{journeyText(lang, 'intro')}</p>
                <p className="text-xs text-ink-muted">{journeyText(lang, 'evidenceNote')}</p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
                <label className="space-y-1 text-sm font-semibold text-ink-body">
                    <span className="block">{l('instrument')}</span>
                    <select disabled={!!progress} value={instrument} onChange={event => setInstrument(event.target.value)} className="min-h-[44px] rounded-control border border-line-strong bg-surface px-4 text-sm">
                        <option value="">{l('allInstruments')}</option>
                        {(data?.instruments ?? []).map(code => <option key={code} value={code}>{SOURCE_KINDS.includes(code as SourceKind) ? journeyText(lang, code as SourceKind) : code}</option>)}
                    </select>
                </label>
                <label className="space-y-1 text-sm font-semibold text-ink-body">
                    <span className="block">{l('period')}</span>
                    <select disabled={!!progress} value={days} onChange={event => setDays(Number(event.target.value))} className="min-h-[44px] rounded-control border border-line-strong bg-surface px-4 text-sm">
                        {PERIODS.map(value => <option key={value} value={value}>{value ? l('lastDays', { n: value }) : l('allTime')}</option>)}
                    </select>
                </label>
                {total > 0 && <Button type="button" onClick={() => void analyse()} disabled={!!progress} aria-busy={!!progress}>
                    <Sparkles className="h-4 w-4" aria-hidden />{l(data?.status === 'ready' || data?.status === 'stale' ? 'reanalyse' : 'analyse')}
                </Button>}
            </div>
            <p className="text-xs text-ink-muted">{journeyText(lang, 'filterScope')}</p>
            {resource.loading && !data && <p role="status">{t('common.loading')}</p>}
            {resource.failed && !data && <Callout variant="danger"><p>{l('loadError')}</p><Button variant="secondary" onClick={() => void resource.reload()}>{t('setup.retry')}</Button></Callout>}
            {progress && <p role="status" className="text-sm text-link">{progress.done < progress.total ? journeyText(lang, 'progress', progress) : l('grouping')}</p>}
            {failed && <p role="alert" className="text-sm text-danger">{l('unavailable')}</p>}
            {data && <>
                <p className="text-sm text-ink-muted">{journeyText(lang, 'coverage', { n: total, total: data.charts.students, pending })}</p>
                {data.status === 'empty' && <p>{journeyText(lang, 'empty')}</p>}
                {data.status === 'missing' && <p>{l('classMissing')}</p>}
                {data.status === 'stale' && <p role="status" className="text-warning-ink">{journeyText(lang, 'stale')}</p>}
                {data.generated_at && <p className="text-xs text-ink-muted">{l('generatedAt')} <time dateTime={data.generated_at}>{new Date(data.generated_at).toLocaleString(lang)}</time></p>}
            </>}
        </Card>
        <section className="space-y-2" aria-label={journeyText(lang, 'sources')}>
            {(data?.students ?? []).map(student => <details key={student.username} className="rounded-lg border border-line bg-surface p-4"
                onToggle={event => { if (event.currentTarget.open) setOpened(previous => new Set(previous).add(student.username)); }}>
                <summary className="min-h-[44px] cursor-pointer break-words py-2 font-semibold text-link">{student.username} · {journeyText(lang, 'sources')}: {student.source_count}</summary>
                {opened.has(student.username) && <StudentJourneyNoticing key={`${student.username}:${lang}`} base={studentBase(student.username)} onChanged={changed} refreshVersion={refreshVersion} />}
            </details>)}
        </section>
        {showResults && <>
            {data.suggestions.length > 0 && <Card className="space-y-4 border-warning-line bg-warning-soft">
                <h3 className="font-semibold text-ink">{l('suggestions')}</h3>
                <ol className="list-inside list-decimal space-y-1 text-sm text-ink">{data.suggestions.map((text, index) => <li key={index}>{text}</li>)}</ol>
            </Card>}
            <Card className="space-y-4">
                <h3 className="font-semibold text-ink">{l('kindsChart')}</h3>
                {NOTICING_KINDS.map(kind => <Bar key={kind} label={l(kind)} count={data.charts.kinds[kind] ?? 0} total={total} color={KIND_BAR[kind]} />)}
            </Card>
            <section className="space-y-4">
                <h3 className="font-semibold text-ink">{l('themes')}</h3>
                {data.themes.length === 0 ? <p className="text-sm text-ink-muted">{l('noThemes')}</p>
                    : <ul className="space-y-4">{data.themes.map((theme, index) => <ThemeCard key={index} theme={theme} total={total} studentBase={studentBase} />)}</ul>}
            </section>
        </>}
    </div>;
}
