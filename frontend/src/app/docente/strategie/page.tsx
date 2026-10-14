'use client';

import { Suspense } from 'react';
import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { TeacherResourcesHub } from '@/components/teacher/TeacherResourcesHub';

export default function TeacherStrategiesPage() {
    return (
        <TeacherAreaPage slug="strategie">
            {() => (
                <Suspense fallback={null}>
                    <TeacherResourcesHub defaultTab="strategie" />
                </Suspense>
            )}
        </TeacherAreaPage>
    );
}
