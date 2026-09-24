'use client';

import { PersonalAreaHeader } from '@/components/profile/PersonalAreaHeader';
import { GoalsPanel } from '@/components/goals/GoalsPanel';

export default function GoalsPage() {
    return (
        <main className="page-wide space-y-5 px-4 py-8">
            <PersonalAreaHeader slug="obiettivi" />
            <GoalsPanel />
        </main>
    );
}
