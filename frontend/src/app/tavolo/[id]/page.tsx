'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { TavoloWorkspace } from '@/components/tavolo/TavoloWorkspace';

export default function TavoloPage() {
    const { id } = useParams<{ id: string }>();
    const search = useSearchParams();
    return <TavoloWorkspace key={id} id={id} initialCounselorId={Number(search.get('counselor')) || undefined} />;
}
