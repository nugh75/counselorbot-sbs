'use client';

import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { AdministrationPlansPanel } from '@/components/admin/AdministrationPlansPanel';

export default function TeacherAdministrationPlansPage() {
    return <TeacherAreaPage slug="somministrazioni">{() => <AdministrationPlansPanel />}</TeacherAreaPage>;
}
