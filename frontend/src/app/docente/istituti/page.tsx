'use client';
import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { TeacherForbidden } from '@/components/teacher/TeacherAccess';
import { InstitutesPanel } from '@/components/teacher/InstitutesPanel';

export default function InstitutesPage() {
    return <TeacherAreaPage slug="istituti">{teacher => teacher ? <InstitutesPanel /> : <TeacherForbidden />}</TeacherAreaPage>;
}
