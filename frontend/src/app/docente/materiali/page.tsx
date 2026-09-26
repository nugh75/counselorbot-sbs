'use client';

import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { CertifiedReadingsPanel } from '@/components/admin/CertifiedReadingsPanel';

export default function TeacherReadingsPage() {
    return <TeacherAreaPage slug="materiali">{() => <CertifiedReadingsPanel />}</TeacherAreaPage>;
}
