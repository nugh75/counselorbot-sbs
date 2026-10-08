'use client';

import { useParams } from 'next/navigation';
import { ForumView } from '@/components/forum/ForumView';

export default function StudentClassForumPage() {
    const { id } = useParams<{ id: string }>();
    return <div className="min-h-screen bg-slate-50"><section className="page-narrow px-4 py-8"><ForumView key={id} groupId={Number(id)} student /></section></div>;
}
