'use client';

import { ChatGPTSettingsPage } from '@/components/profile/ChatGPTSettingsPage';
import { TeacherForbidden, TeacherLoading } from '@/components/teacher/TeacherAccess';
import { useTeacherAccessState } from '@/components/teacher/useTeacherAccessState';

export default function TeacherChatGPTPage() {
    const { state } = useTeacherAccessState();
    if (state === 'loading') return <TeacherLoading />;
    if (state === 'forbidden') return <TeacherForbidden />;
    return <ChatGPTSettingsPage area="docente" />;
}
