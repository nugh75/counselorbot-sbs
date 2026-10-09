'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/auth';
import {
    filterProgressStudents,
    parseClassPathProgress,
    progressCellCode,
    type ClassPathProgressCell,
    type ClassPathProgressStep,
    type ClassPathProgressStudent,
    type ProgressFilter,
} from '@/lib/class-paths';
import { classPathText, type PathTextKey } from '@/lib/i18n-class-paths';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';
import { TeacherForbidden, TeacherLoading } from './TeacherAccess';
import { useTeacherResource } from './useTeacherResource';

const FILTERS: { value: ProgressFilter; key: PathTextKey }[] = [
    { value: 'all', key: 'filterAll' },
    { value: 'late', key: 'filterLate' },
    { value: 'not_started', key: 'filterNotStarted' },
];

function todayIso(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function cellClass(cell: ClassPathProgressCell, selected: boolean): string {
    const tone = cell.state === 'done'
        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
        : cell.state === 'locked' || cell.state === 'unavailable'
        ? 'bg-slate-50 text-slate-400 border-slate-200'
        : 'bg-white text-slate-600 border-slate-200';
    const ring = selected ? 'ring-2 ring-indigo-600' : '';
    return `flex h-10 min-w-[44px] items-center justify-center rounded border px-2 font-mono text-sm ${tone} ${ring} hover:border-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600`;
}

interface Props {
    pathId: number;
    toolName: (toolKey: string) => string;
}

export function ClassPathProgressPanel({ pathId, toolName }: Props) {
    const { lang } = useI18n();
    const l = (key: PathTextKey) => classPathText(lang, key);
    const resource = useTeacherResource(`/api/teacher/paths/${pathId}/progress`, parseClassPathProgress);

    const [filter, setFilter] = useState<ProgressFilter>('all');
    const [selected, setSelected] = useState<{ username: string; stepId: number } | null>(null);
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState<'saved' | 'error' | null>(null);

    if (resource.forbidden) return <TeacherForbidden />;
    const progress = resource.data;
    if (!progress) {
        if (resource.loading) return <TeacherLoading />;
        return (
            <Callout variant="danger">
                <p>{l('progressLoadError')}</p>
                <Button variant="secondary" onClick={() => void resource.reload()}>
                    {l('reload')}
                </Button>
            </Callout>
        );
    }

    const stateLabel = (cell: ClassPathProgressCell): string => {
        const state = cell.state === 'done' ? l('completed')
            : cell.state === 'locked' ? l('stateLocked')
            : cell.state === 'unavailable' ? l('notAvailable')
            : l('stateNotDone');
        const source = cell.source === 'teacher' ? l('sourceTeacher')
            : cell.source === 'student' ? l('sourceStudent')
            : cell.source === 'automatic' ? l('sourceAutomatic')
            : null;
        return source ? `${state} (${source})` : state;
    };
    const stepName = (step: ClassPathProgressStep, index: number) =>
        `${l('stepLabel').replace('{n}', String(index + 1))} · ${step.title || toolName(step.tool_key)}`;
    const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(lang) : '');

    const students = filterProgressStudents(progress, filter, todayIso());
    const selectedStudent = selected ? progress.students.find(s => s.username === selected.username) : undefined;
    const selectedIndex = selected ? progress.steps.findIndex(s => s.id === selected.stepId) : -1;
    const selectedStep = selectedIndex >= 0 ? progress.steps[selectedIndex] : undefined;
    const selectedCell = selectedStudent?.cells.find(c => c.step_id === selected?.stepId);

    const select = (student: ClassPathProgressStudent, stepId: number) => {
        setSelected({ username: student.username, stepId });
        setReason('');
        setNotice(null);
    };

    const saveOverride = async (state: 'done' | 'not_done' | 'clear') => {
        if (!selected || saving) return;
        setSaving(true);
        setNotice(null);
        try {
            const response = await apiFetch(
                `/api/teacher/paths/${pathId}/steps/${selected.stepId}/progress/${encodeURIComponent(selected.username)}`,
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(state === 'clear' ? { state } : { state, reason: reason.trim() || null }),
                },
            );
            if (!response.ok) throw new Error('override failed');
            setReason('');
            setNotice('saved');
            await resource.reload();
        } catch {
            setNotice('error');
        } finally {
            setSaving(false);
        }
    };

    const cellButton = (student: ClassPathProgressStudent, cell: ClassPathProgressCell, index: number) => {
        const step = progress.steps[index];
        const isSelected = selected?.username === student.username && selected.stepId === cell.step_id;
        return (
            <button
                type="button"
                aria-pressed={isSelected}
                aria-label={`${student.display_name} — ${step ? stepName(step, index) : ''}: ${stateLabel(cell)}`}
                title={stateLabel(cell)}
                onClick={() => select(student, cell.step_id)}
                className={cellClass(cell, isSelected)}
            >
                {progressCellCode(cell)}
            </button>
        );
    };

    return (
        <Card as="section" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <h3 className="text-base font-semibold text-slate-800">{l('progressTitle')}</h3>
                <div role="group" aria-label={l('filterLabel')} className="flex flex-wrap gap-1">
                    {FILTERS.map(option => (
                        <button
                            key={option.value}
                            type="button"
                            aria-pressed={filter === option.value}
                            onClick={() => setFilter(option.value)}
                            className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold ${
                                filter === option.value
                                    ? 'border-indigo-700 bg-indigo-700 text-white'
                                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                            }`}
                        >
                            {l(option.key)}
                        </button>
                    ))}
                </div>
            </div>

            {progress.students.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">{l('noStudents')}</p>
            ) : students.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-500">{l('noStudentsFilter')}</p>
            ) : (
                <>
                    <div className="hidden overflow-x-auto md:block">
                        <table className="w-full border-separate border-spacing-1 text-sm">
                            <thead>
                                <tr>
                                    <th scope="col" className="text-left font-semibold text-slate-700">{l('studentHeader')}</th>
                                    {progress.steps.map((step, index) => (
                                        <th key={step.id} scope="col" title={stepName(step, index)} className="font-mono font-semibold text-slate-600">
                                            {index + 1}
                                        </th>
                                    ))}
                                    <th scope="col" className="text-right font-semibold text-slate-700">{l('doneHeader')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {students.map(student => (
                                    <tr key={student.username}>
                                        <th scope="row" className="max-w-[12rem] truncate text-left font-medium text-slate-800">
                                            {student.display_name}
                                        </th>
                                        {student.cells.map((cell, index) => (
                                            <td key={cell.step_id} className="text-center">
                                                {cellButton(student, cell, index)}
                                            </td>
                                        ))}
                                        <td className="text-right font-mono text-slate-700">{`${student.done}/${student.total}`}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <th scope="row" className="text-left text-xs font-semibold text-slate-500">{l('doneByStep')}</th>
                                    {progress.steps.map(step => (
                                        <td key={step.id} className="text-center font-mono text-xs text-slate-500">
                                            {step.available ? `${step.done_count}/${progress.students.length}` : '—'}
                                        </td>
                                    ))}
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <ul className="space-y-2 md:hidden">
                        {students.map(student => (
                            <li key={student.username}>
                                <details className="rounded-lg border border-slate-200 bg-white">
                                    <summary className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 px-3 text-sm">
                                        <span className="font-medium text-slate-800">{student.display_name}</span>
                                        <span className="font-mono text-slate-700">{`${student.done}/${student.total}`}</span>
                                    </summary>
                                    <ul className="space-y-1 border-t border-slate-100 p-2">
                                        {student.cells.map((cell, index) => (
                                            <li key={cell.step_id} className="flex items-center justify-between gap-2 text-xs text-slate-700">
                                                <span className="min-w-0 flex-1 break-words">
                                                    {progress.steps[index] ? stepName(progress.steps[index], index) : ''}
                                                </span>
                                                {cellButton(student, cell, index)}
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            <p className="text-xs text-slate-500">{l('progressLegend')}</p>
            <p className="text-xs text-slate-500">{l('precedenceHint')}</p>

            {selectedStudent && selectedStep && selectedCell ? (
                <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3" aria-live="polite">
                    <div>
                        <p className="text-sm font-semibold text-slate-800">
                            {`${selectedStudent.display_name} · ${stepName(selectedStep, selectedIndex)}`}
                        </p>
                        <p className="text-sm text-slate-700">{stateLabel(selectedCell)}</p>
                        {selectedCell.teacher_state && (
                            <p className="text-xs text-slate-600">
                                {l('teacherMarkInfo')
                                    .replace('{state}', selectedCell.teacher_state === 'done' ? l('completed') : l('stateNotDone'))
                                    .replace('{actor}', selectedCell.actor || '')
                                    .replace('{date}', formatDate(selectedCell.at))}
                            </p>
                        )}
                        {selectedCell.teacher_state && selectedCell.reason && (
                            <p className="text-xs italic text-slate-600">{selectedCell.reason}</p>
                        )}
                        {selectedCell.state === 'locked' && (
                            <p className="text-xs text-slate-600">{l('lockedOverrideHint')}</p>
                        )}
                    </div>
                    {selectedCell.state !== 'unavailable' && (
                        <div>
                            <label htmlFor="progress-reason" className="block text-xs font-semibold text-slate-700">
                                {l('reasonLabel')}
                            </label>
                            <input
                                id="progress-reason"
                                type="text"
                                maxLength={500}
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                className="mt-1 block w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm text-slate-800 focus:border-indigo-600 focus:outline-none"
                            />
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <Button
                            variant="secondary"
                            disabled={saving || selectedCell.state === 'unavailable'}
                            onClick={() => void saveOverride('done')}
                        >
                            {l('teacherMarkDone')}
                        </Button>
                        <Button
                            variant="secondary"
                            disabled={saving || selectedCell.state === 'unavailable'}
                            onClick={() => void saveOverride('not_done')}
                        >
                            {l('teacherMarkNotDone')}
                        </Button>
                        <Button
                            variant="secondary"
                            disabled={saving || !selectedCell.teacher_state}
                            onClick={() => void saveOverride('clear')}
                        >
                            {l('clearOverride')}
                        </Button>
                    </div>
                    {notice === 'saved' && <p role="status" className="text-sm font-medium text-emerald-700">{l('overrideSaved')}</p>}
                    {notice === 'error' && <p role="alert" className="text-sm font-medium text-red-600">{l('overrideError')}</p>}
                </div>
            ) : (
                progress.students.length > 0 && <p className="text-xs text-slate-500">{l('selectCellHint')}</p>
            )}
        </Card>
    );
}
