'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { classCompilationsText } from '@/lib/i18n-class-compilations';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { parseClassGroups } from './class-group-types';
import { useTeacherResource } from './useTeacherResource';
import { StudentResultItem, type StudentResult } from './StudentResultItem';

interface ClassStudents {
    group_id: number;
    students: Array<{ username: string; results: StudentResult[] }>;
}
function parseClassStudents(payload: unknown): ClassStudents {
    const value = payload as ClassStudents;
    if (!value || !Array.isArray(value.students) || !value.students.every(student => typeof student.username === 'string' && Array.isArray(student.results))) throw new Error('invalid students');
    return value;
}

function ClassCompilations({ groupId }: { groupId: number }) {
    const { lang, t } = useI18n();
    const base = `/api/admin/groups/${groupId}`;
    const resource = useTeacherResource(`${base}/students`, parseClassStudents);
    const l = (key: Parameters<typeof classCompilationsText>[1]) => classCompilationsText(lang, key);
    if (resource.forbidden) return <Callout variant="danger">{teacherAreaText(lang, 'forbidden')}</Callout>;
    if (resource.loading) return <p role="status">{t('common.loading')}</p>;
    if (resource.failed || resource.data?.group_id !== groupId) return <Callout variant="danger"><p>{l('resultsError')}</p><Button variant="secondary" onClick={() => void resource.reload()}>{t('setup.retry')}</Button></Callout>;
    const results = resource.data.students.flatMap(student => student.results.map(result => ({ username: student.username, result })))
        .sort((a, b) => (b.result.submitted_at ?? '').localeCompare(a.result.submitted_at ?? '') || b.result.id - a.result.id);
    if (results.length === 0) return <p role="status" className="text-sm text-slate-600">{l('empty')}</p>;
    return <ul className="divide-y divide-slate-200" aria-label={l('title')}>
        {results.map(({ username, result }) => <li key={result.id} className="min-w-0 py-3">
            <p className="mb-2 break-words font-semibold text-slate-900"><span className="sr-only">{l('student')}: </span>{username}</p>
            <StudentResultItem base={base} username={username} result={result} />
        </li>)}
    </ul>;
}

export function ClassCompilationsSection({ showHeading = true }: { showHeading?: boolean } = {}) {
    const { lang, t } = useI18n();
    const id = useId();
    const [selected, setSelected] = useState('');
    const groups = useTeacherResource('/api/admin/groups', parseClassGroups);
    const l = (key: Parameters<typeof classCompilationsText>[1]) => classCompilationsText(lang, key);
    const ready = !groups.loading && !groups.failed && !groups.forbidden;
    const group = ready ? groups.data?.find(row => String(row.id) === selected) : undefined;
    return <Card as="section" className="min-w-0 p-4 sm:p-6" aria-labelledby={showHeading ? `${id}-title` : undefined} data-class-compilations>
        {showHeading && <>
            <h2 id={`${id}-title`} className="text-lg font-bold text-slate-800">{l('title')}</h2>
            <p className="mt-1 text-sm text-slate-600">{l('description')}</p>
        </>}
        <div className={showHeading ? 'mt-4 space-y-3' : 'space-y-3'}>
            {groups.forbidden ? <Callout variant="danger">{teacherAreaText(lang, 'forbidden')}</Callout>
                : groups.loading ? <p role="status">{t('common.loading')}</p>
                    : groups.failed ? <Callout variant="danger"><p>{l('classesError')}</p><Button variant="secondary" onClick={() => void groups.reload()}>{t('setup.retry')}</Button></Callout>
                        : groups.data?.length === 0 ? <p role="status" className="text-sm text-slate-600">{l('noClasses')}</p>
                            : <>
                                <label htmlFor={`${id}-class`} className="block text-sm font-semibold text-slate-700">{l('classLabel')}</label>
                                <select id={`${id}-class`} value={group ? selected : ''} onChange={event => setSelected(event.target.value)}
                                    className="min-h-[44px] w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm sm:max-w-md">
                                    <option value="">{l('choose')}</option>
                                    {groups.data?.map(row => <option key={row.id} value={row.id}>{row.name}{row.school ? ` · ${row.school}` : ''}</option>)}
                                </select>
                                {/* A new class mounts fresh state and aborts all old list/transcript reads. */}
                                {group && <div className="space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                                        <span className="text-xs font-semibold text-slate-700">{group.name}{group.school ? ` · ${group.school}` : ''}</span>
                                        <Link href={`/docente/classi/${group.id}?tab=students`} className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-indigo-700 underline-offset-4 hover:underline">
                                            {l('viewAllInClass')} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                                        </Link>
                                    </div>
                                    <ClassCompilations key={group.id} groupId={group.id} />
                                </div>}
                            </>}
        </div>
    </Card>;
}
