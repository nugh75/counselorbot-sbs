'use client';

import { useParams } from 'next/navigation';
import { ClassSettingsPage } from '@/components/teacher/ClassSettingsPage';

export default function AdminClassPage() {
    const { id } = useParams<{ id: string }>();
    return <ClassSettingsPage groupId={Number(id)} adminOnly />;
}
