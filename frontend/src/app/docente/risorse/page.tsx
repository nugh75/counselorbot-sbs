'use client';

import { Suspense } from 'react';
import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { TeacherResourcesHub } from '@/components/teacher/TeacherResourcesHub';

export default function TeacherResourcesPage() {
    return (
        <TeacherAreaPage slug="risorse">
            {() => (
                <Suspense fallback={null}>
                    <TeacherResourcesHub />
                </Suspense>
            )}
        </TeacherAreaPage>
    );
}
