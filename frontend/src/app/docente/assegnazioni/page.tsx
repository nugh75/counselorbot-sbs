'use client';

import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { AssignmentsPanel } from '@/components/teacher/AssignmentsPanel';

export default function TeacherAssignmentsPage() {
    return <TeacherAreaPage slug="assegnazioni">{() => <AssignmentsPanel teacher showHeading={false} />}</TeacherAreaPage>;
}
