'use client';

import { PersonalAreaHeader } from '@/components/profile/PersonalAreaHeader';
import { StudentClassPathsPage } from '@/components/profile/StudentClassPathsPage';

export default function ClassPathsPage() {
    return (
        <main className="page-wide space-y-5 px-4 py-8">
            <PersonalAreaHeader slug="percorsi" />
            <StudentClassPathsPage />
        </main>
    );
}
