'use client';
import { PersonalAPISettings } from '@/components/profile/PersonalAPISettings';
import { TeacherForbidden, TeacherLoading } from '@/components/teacher/TeacherAccess';
import { useTeacherAccessState } from '@/components/teacher/useTeacherAccessState';
export default function TeacherAPIPage() {
    const { state } = useTeacherAccessState();
    if (state === 'loading') return <TeacherLoading />;
    if (state === 'forbidden') return <TeacherForbidden />;
    return <PersonalAPISettings area="docente" />;
}
