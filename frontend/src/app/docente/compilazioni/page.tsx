'use client';

import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { ClassCompilationsSection } from '@/components/teacher/ClassCompilationsSection';

export default function TeacherCompilationsPage() {
    return <TeacherAreaPage slug="compilazioni">{() => <ClassCompilationsSection showHeading={false} />}</TeacherAreaPage>;
}
