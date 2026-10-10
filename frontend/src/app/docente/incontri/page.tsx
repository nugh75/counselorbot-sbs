'use client';

import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { TeacherMeetingsPage } from '@/components/teacher/TeacherMeetingsPage';

export default function TeacherMeetingsRoute() {
    return <TeacherAreaPage slug="incontri">{() => <TeacherMeetingsPage />}</TeacherAreaPage>;
}
