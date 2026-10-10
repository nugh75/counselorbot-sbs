'use client';

import { useState } from 'react';
import { parseClassSettings } from '@/lib/class-settings';
import { classSettingsText } from '@/lib/i18n-class-settings';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { TeacherForbidden, TeacherLoading } from './TeacherAccess';
import { ClassPathsTab } from './ClassPathsTab';
import { PathTemplatesPanel } from './PathTemplatesPanel';
import { useTeacherResource } from './useTeacherResource';
import { parseClassGroups } from './class-group-types';

// Class paths straight from the teacher area: pick a class, then the same
// editor as the class page's Paths tab. `?class=<id>` preselects one.
// Templates sit above: applying one creates drafts in the chosen classes or groups.
export function TeacherClassPathsPage() {
    const { lang } = useI18n();
    const groups = useTeacherResource('/api/admin/groups', parseClassGroups);
    // Applying a template adds drafts: remount the class editor so it lists them.
    const [applied, setApplied] = useState(0);
    const [chosen, setChosen] = useState(() =>
        typeof window !== 'undefined' ? Number(new URLSearchParams(window.location.search).get('class')) || null : null);
    if (groups.forbidden) return <TeacherForbidden />;
    if (groups.loading) return <TeacherLoading />;
    if (groups.failed || !groups.data) return <Callout variant="danger">
        <p>{classSettingsText(lang, 'loadError')}</p>
        <Button variant="secondary" onClick={() => void groups.reload()}>{classSettingsText(lang, 'reload')}</Button>
    </Callout>;
    const active = groups.data.filter(row => row.is_active);
    if (active.length === 0) return <Callout>{teacherAreaText(lang, 'pathsNoClasses')}</Callout>;
    const group = active.find(row => row.id === chosen) ?? active[0];
    return <div className="space-y-5">
        <PathTemplatesPanel groups={active} onApplied={groupId => { setChosen(groupId); setApplied(count => count + 1); }} />
        <label className="block max-w-md text-sm font-medium text-slate-700">{teacherAreaText(lang, 'pathsChooseClass')}
            <select className="mt-1 w-full min-w-0 rounded-md border border-slate-300 bg-white p-2 text-sm" value={group.id}
                onChange={event => setChosen(Number(event.target.value))}>
                {active.map(row => <option key={row.id} value={row.id}>{row.institution_name ? `${row.name} · ${row.institution_name}` : row.name}</option>)}
            </select>
        </label>
        <ClassPaths key={`${group.id}-${applied}`} groupId={group.id} institutionId={group.institution_id ?? null} />
    </div>;
}

function ClassPaths({ groupId, institutionId }: { groupId: number; institutionId: number | null }) {
    const { lang } = useI18n();
    const settings = useTeacherResource(`/api/teacher/groups/${groupId}/settings`, parseClassSettings);
    if (settings.forbidden) return <TeacherForbidden />;
    if (settings.loading) return <TeacherLoading />;
    if (settings.failed || !settings.data || settings.data.group_id !== groupId) return <Callout variant="danger">
        <p>{classSettingsText(lang, 'loadError')}</p>
        <Button variant="secondary" onClick={() => void settings.reload()}>{classSettingsText(lang, 'reload')}</Button>
    </Callout>;
    return <ClassPathsTab groupId={groupId} classSettings={settings.data} institutionId={institutionId} />;
}
