'use client';

import { useParams } from 'next/navigation';
import { ClassSettingsPage } from '@/components/teacher/ClassSettingsPage';

export default function TeacherClassPage() {
    const { id } = useParams<{ id: string }>();
    return <ClassSettingsPage groupId={Number(id)} />;
}
