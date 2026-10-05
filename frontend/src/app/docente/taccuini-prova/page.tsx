'use client';

import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { PracticeNotebooks } from '@/components/teacher/PracticeNotebooks';

export default function TeacherPracticeNotebooksPage() {
    return (
        <TeacherAreaPage slug="taccuini-prova" wide={false}>
            {() => <PracticeNotebooks />}
        </TeacherAreaPage>
    );
}
