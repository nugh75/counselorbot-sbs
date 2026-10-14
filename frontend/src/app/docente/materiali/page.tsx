'use client';

import { Suspense } from 'react';
import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { TeacherResourcesHub } from '@/components/teacher/TeacherResourcesHub';

export default function TeacherReadingsPage() {
    return (
        <TeacherAreaPage slug="materiali">
            {() => (
                <Suspense fallback={null}>
                    <TeacherResourcesHub defaultTab="materiali" />
                </Suspense>
            )}
        </TeacherAreaPage>
    );
}
