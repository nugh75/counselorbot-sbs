'use client';

import { useState } from 'react';
import { Lightbulb, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { noticingText, type NoticingTextKey } from '@/lib/i18n-noticing';
import { NOTICING_KINDS } from '@/lib/teacher-noticing';
import { barPercent, classNoticingQuery, parseClassNoticing, pendingCompilations, type ClassCompilation, type ClassNoticing, type ClassTheme } from '@/lib/class-noticing';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { StudentResultItem } from './StudentResultItem';
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

function ThemeCard({ theme, total, base, compilations }: { theme: ClassTheme; total: number; base: string; compilations: Map<number, ClassCompilation> }) {
    const { lang } = useI18n();
    const l = (key: NoticingTextKey) => noticingText(lang, key);
    const [open, setOpen] = useState<number | null>(null);
    return <li className="space-y-4 rounded-lg border border-line bg-surface p-4">
        <p className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${KIND_BADGE[theme.kind]}`}>{l(theme.kind)}</span>
            <span className="font-semibold text-ink">{theme.title}</span>
        </p>
        <Bar label={l('students')} count={theme.student_count} total={total} color={KIND_BAR[theme.kind]} />
        {theme.suggestion && <p className="flex gap-2 text-sm text-ink-body"><Lightbulb className="mt-1 h-4 w-4 shrink-0 text-warning" aria-hidden />{theme.suggestion}</p>}
        <details className="text-sm">
            <summary className="min-h-[44px] cursor-pointer py-2 font-semibold text-link">{l('showStudents')} ({theme.students.length})</summary>
            <ul className="space-y-4">{theme.students.map((student, index) => {
                const compilation = compilations.get(student.result_id);
                return <li key={index} className="space-y-1 border-t border-line pt-2">
                    <p className="font-semibold text-ink">{student.username} <span className="font-normal text-ink-muted">· {student.questionnaire_type}</span></p>
                    <p className="text-ink-body">{student.text}</p>
                    <blockquote className="border-l-4 border-line-strong pl-4 italic text-ink-body">«{student.quote}»</blockquote>
                    {compilation && <>
                        <Button type="button" variant="ghost" className="min-h-[44px] px-2" aria-expanded={open === index} onClick={() => setOpen(open === index ? null : index)}>{l('openCompilation')}</Button>
                        {open === index && <StudentResultItem base={base} username={compilation.username} result={compilation} />}
                    </>}
                </li>;
            })}</ul>
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
    const data = result?.url === url ? result.data : resource.data;

    const analyse = async () => {
        if (!data) return;
        setFailed(false);
        const pending = pendingCompilations(data);
        try {
            for (const [index, row] of pending.entries()) {
                setProgress({ done: index, total: pending.length });
                await apiFetch(`${base}/students/${encodeURIComponent(row.username)}/results/${row.id}/noticing?lang=${lang}`, { method: 'POST' });
            }
            setProgress({ done: pending.length, total: pending.length });
            const response = await apiFetch(url, { method: 'POST' });
            if (!response.ok) throw new Error('class noticing failed');
            const next = parseClassNoticing(await response.json());
            setResult({ url, data: next });
            if (next.status === 'unavailable') setFailed(true);
        } catch {
            setFailed(true);
        } finally {
            setProgress(null);
        }
    };

    const compilations = new Map((data?.compilations ?? []).map(row => [row.id, row]));
    const pending = data ? pendingCompilations(data).length : 0;
    const total = data?.charts.students_with_chat ?? 0;
    const showResults = data && (data.status === 'ready' || data.status === 'stale');

    return <div className="space-y-6">
        <Card className="space-y-4">
            <div className="space-y-2">
                <h2 className="text-lg font-semibold text-ink">{l('classTitle')}</h2>
                <p className="text-sm text-ink-muted">{l('classIntro')}</p>
                <p className="text-xs text-ink-muted">{l('aiNote')}</p>
            </div>
            <div className="flex flex-wrap items-end gap-4">
                <label className="space-y-1 text-sm font-semibold text-ink-body">
                    <span className="block">{l('instrument')}</span>
                    <select value={instrument} onChange={event => setInstrument(event.target.value)} className="min-h-[44px] rounded-control border border-line-strong bg-surface px-4 text-sm">
                        <option value="">{l('allInstruments')}</option>
                        {(data?.instruments ?? []).map(code => <option key={code} value={code}>{code}</option>)}
                    </select>
                </label>
                <label className="space-y-1 text-sm font-semibold text-ink-body">
                    <span className="block">{l('period')}</span>
                    <select value={days} onChange={event => setDays(Number(event.target.value))} className="min-h-[44px] rounded-control border border-line-strong bg-surface px-4 text-sm">
                        {PERIODS.map(value => <option key={value} value={value}>{value ? l('lastDays', { n: value }) : l('allTime')}</option>)}
                    </select>
                </label>
                {data && data.compilations.length > 0 && <Button type="button" onClick={() => void analyse()} disabled={!!progress} aria-busy={!!progress}>
                    <Sparkles className="h-4 w-4" aria-hidden />{l(data.status === 'ready' || data.status === 'stale' ? 'reanalyse' : 'analyse')}
                </Button>}
            </div>
            {resource.loading && !data && <p role="status">{t('common.loading')}</p>}
            {resource.failed && !data && <Callout variant="danger"><p>{l('loadError')}</p><Button variant="secondary" onClick={() => void resource.reload()}>{t('setup.retry')}</Button></Callout>}
            {progress && <p role="status" className="text-sm text-link">{progress.done < progress.total ? l('progress', progress) : l('grouping')}</p>}
            {failed && <p role="alert" className="text-sm text-danger">{l('unavailable')}</p>}
            {data && <>
                <p className="text-sm text-ink-muted">{l('coverage', { chat: data.charts.students_with_chat, students: data.charts.students, pending })}</p>
                {data.status === 'empty' && <p>{l('classEmpty')}</p>}
                {data.status === 'missing' && <p>{l('classMissing')}</p>}
                {data.status === 'stale' && <p role="status" className="text-warning-ink">{l('classStale')}</p>}
                {data.generated_at && <p className="text-xs text-ink-muted">{l('generatedAt')} <time dateTime={data.generated_at}>{new Date(data.generated_at).toLocaleString(lang)}</time></p>}
            </>}
        </Card>
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
                    : <ul className="space-y-4">{data.themes.map((theme, index) => <ThemeCard key={index} theme={theme} total={total} base={base} compilations={compilations} />)}</ul>}
            </section>
        </>}
    </div>;
}
