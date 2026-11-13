'use client';

import { useParams } from 'next/navigation';
import { ForumView } from '@/components/forum/ForumView';
import { PersonalAreaHeader } from '@/components/profile/PersonalAreaHeader';
import { ClassContentGate } from '@/components/profile/ClassContentGate';

export default function StudentClassForumPage() {
    const { id } = useParams<{ id: string }>();
    return <div className="min-h-screen bg-surface-sunken"><section className="page-narrow space-y-8 px-4 py-8"><ClassContentGate><PersonalAreaHeader slug="classi" /><ForumView key={id} groupId={Number(id)} student /></ClassContentGate></section></div>;
}
