'use client';

import { PlanStudentsPanel } from '@/components/admin/PlanStudentsPanel';
import { isLocalAuth } from '@/lib/auth';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { classCompilationsText } from '@/lib/i18n-class-compilations';
import { useI18n } from '@/lib/i18n-context';
import { classSettingsText } from '@/lib/i18n-class-settings';
import { publicOrigin } from '@/lib/runtime-config';
import { ClassAddStudent, ClassPendingInvitations, useClassInvitations } from './ClassEmailInvitations';
import { ClassPracticeStudents } from './ClassPracticeStudents';

// #838: three blocks in this order, each a flat section under a rule with its
// role badge (#957): real students, pending invitations (teacher), test students.
// Test students are the teacher's practice notebooks, never members.
export function ClassStudentsTab({ groupId, groupName, groupCode }: { groupId: number; groupName: string; groupCode: string }) {
    const { lang } = useI18n();
    const origin = publicOrigin();
    const email = !isLocalAuth(); // no invitations with the local provider (#836)
    const webLink = origin ? `${origin}/gruppo?g=${groupCode}` : '';
    const invitations = useClassInvitations(groupId, groupName, webLink);
    return <>
        <section aria-labelledby="class-real-students-heading" className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 border-b border-line-strong pb-2">
                <h2 id="class-real-students-heading" className="text-lg font-semibold text-ink">{classSettingsText(lang, 'students')}</h2>
                <RoleBadge role="student">{classCompilationsText(lang, 'student')}</RoleBadge>
            </div>
            {email && <ClassAddStudent groupId={groupId} state={invitations} />}
            <PlanStudentsPanel base={`/api/admin/groups/${groupId}`} withNotes goalGroupId={groupId} />
        </section>
        {email && <ClassPendingInvitations webLink={webLink} state={invitations} />}
        <ClassPracticeStudents groupId={groupId} />
    </>;
}
