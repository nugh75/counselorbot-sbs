'use client';

import { PersonalAreaHeader } from '@/components/profile/PersonalAreaHeader';
import { StudentClassPathsPage } from '@/components/profile/StudentClassPathsPage';
import { ClassContentGate } from '@/components/profile/ClassContentGate';

export default function ClassPathsPage() {
    return (
        <main className="page-wide space-y-5 px-4 py-8">
            <PersonalAreaHeader slug="piani-operativi" />
            <ClassContentGate><StudentClassPathsPage /></ClassContentGate>
        </main>
    );
}
