'use client';
import { useParams } from 'next/navigation';
import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { TeacherForbidden } from '@/components/teacher/TeacherAccess';
import { InstituteClasses } from '@/components/teacher/InstitutesPanel';

export default function InstituteClassesPage() {
    const { id } = useParams<{ id: string }>();
    return <TeacherAreaPage slug="istituti">{(_teacher, institutes) => institutes ? <InstituteClasses institutionId={Number(id)} /> : <TeacherForbidden />}</TeacherAreaPage>;
}
