'use client';

import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { CertifiedStrategiesPanel } from '@/components/admin/CertifiedStrategiesPanel';

export default function TeacherStrategiesPage() {
    return <TeacherAreaPage slug="strategie">{() => <CertifiedStrategiesPanel />}</TeacherAreaPage>;
}
