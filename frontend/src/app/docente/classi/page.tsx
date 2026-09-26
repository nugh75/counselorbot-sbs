'use client';

import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { GroupsPanel } from '@/components/admin/GroupsPanel';

export default function TeacherGroupsPage() {
    return <TeacherAreaPage slug="classi">{() => <GroupsPanel />}</TeacherAreaPage>;
}
