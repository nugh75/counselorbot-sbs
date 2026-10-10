'use client';

import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { TeacherClassPathsPage } from '@/components/teacher/TeacherClassPathsPage';

export default function TeacherPathsPage() {
    return <TeacherAreaPage slug="percorsi">{() => <TeacherClassPathsPage />}</TeacherAreaPage>;
}
