'use client';

import { useState } from 'react';
import { classSettingsText } from '@/lib/i18n-class-settings';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { TeacherForbidden, TeacherLoading } from './TeacherAccess';
import { ClassMeetingsManager } from './ClassMeetingsManager';
import { useTeacherResource } from './useTeacherResource';
import { parseClassGroups } from './class-group-types';

// Meetings straight from the teacher area: pick a class or group, then plan,
// move and cancel its meetings and slots. `?class=<id>` preselects one; adding
// a meeting to a path stays in the class path editor.
export function TeacherMeetingsPage() {
    const { lang } = useI18n();
    const groups = useTeacherResource('/api/admin/groups', parseClassGroups);
    const [chosen, setChosen] = useState(() =>
        typeof window !== 'undefined' ? Number(new URLSearchParams(window.location.search).get('class')) || null : null);
    if (groups.forbidden) return <TeacherForbidden />;
    if (groups.loading) return <TeacherLoading />;
    if (groups.failed || !groups.data) return <Callout variant="danger">
        <p>{classSettingsText(lang, 'loadError')}</p>
        <Button variant="secondary" onClick={() => void groups.reload()}>{classSettingsText(lang, 'reload')}</Button>
    </Callout>;
    const active = groups.data.filter(row => row.is_active);
    if (active.length === 0) return <Callout>{teacherAreaText(lang, 'meetingsNoClasses')}</Callout>;
    const group = active.find(row => row.id === chosen) ?? active[0];
    return <div className="space-y-5">
        <label className="block max-w-md text-sm font-medium text-slate-700">{teacherAreaText(lang, 'meetingsChooseClass')}
            <select className="mt-1 w-full min-w-0 rounded-md border border-slate-300 bg-white p-2 text-sm" value={group.id}
                onChange={event => setChosen(Number(event.target.value))}>
                {active.map(row => <option key={row.id} value={row.id}>{row.institution_name ? `${row.name} · ${row.institution_name}` : row.name}</option>)}
            </select>
        </label>
        <Card><ClassMeetingsManager key={group.id} lang={lang} groupId={group.id} /></Card>
    </div>;
}
