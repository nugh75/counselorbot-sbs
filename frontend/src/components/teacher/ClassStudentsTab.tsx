'use client';

import { PlanStudentsPanel } from '@/components/admin/PlanStudentsPanel';
import { isLocalAuth } from '@/lib/auth';
import { Card } from '@/components/ui/Card';
import { useI18n } from '@/lib/i18n-context';
import { classSettingsText } from '@/lib/i18n-class-settings';
import { publicOrigin } from '@/lib/runtime-config';
import { ClassAddStudent, ClassPendingInvitations, useClassInvitations } from './ClassEmailInvitations';
import { ClassPracticeStudents } from './ClassPracticeStudents';

// #838: three blocks in this order, each tinted by its role (cards only):
// real students (brand), pending invitations (teacher cream), test students
// (celestino). Test students are the teacher's practice notebooks, never members.
export function ClassStudentsTab({ groupId, groupName, groupCode }: { groupId: number; groupName: string; groupCode: string }) {
    const { lang } = useI18n();
    const origin = publicOrigin();
    const email = !isLocalAuth(); // no invitations with the local provider (#836)
    const webLink = origin ? `${origin}/gruppo?g=${groupCode}` : '';
    const invitations = useClassInvitations(groupId, groupName, webLink);
    return <>
        <Card as="section" aria-labelledby="class-real-students-heading" className="space-y-4 border-brand-line bg-brand-soft/40">
            <h2 id="class-real-students-heading" className="text-lg font-semibold text-ink">{classSettingsText(lang, 'students')}</h2>
            {email && <ClassAddStudent groupId={groupId} state={invitations} />}
            <PlanStudentsPanel base={`/api/admin/groups/${groupId}`} withNotes />
        </Card>
        {email && <ClassPendingInvitations webLink={webLink} state={invitations} />}
        <ClassPracticeStudents groupId={groupId} />
    </>;
}
