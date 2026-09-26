'use client';

import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { GoalCatalogEditor } from '@/components/goals/GoalCatalogEditor';

export default function TeacherGoalCatalogPage() {
    return <TeacherAreaPage slug="catalogo-obiettivi">{() => <GoalCatalogEditor />}</TeacherAreaPage>;
}
