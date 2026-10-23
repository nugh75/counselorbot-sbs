import type { Metadata } from 'next';
import { ClassCouncilView } from '@/components/council/ClassCouncilView';

// Student data behind a password: keep the page out of search engines.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ClassCouncilPage({ params }: { params: Promise<{ token: string }> }) {
    const { token } = await params;
    return <ClassCouncilView token={token} />;
}
