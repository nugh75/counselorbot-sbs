'use client';

import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { TeacherNotebook } from '@/components/teacher/TeacherNotebook';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText } from '@/lib/i18n-teacher-area';

export default function TeacherNotebookPage() {
    const { lang } = useI18n();
    return (
        <TeacherAreaPage slug="taccuino" wide={false}>
            {() => <div className="space-y-4">
                <p className="text-sm text-slate-600">{teacherAreaText(lang, 'notebookNote')}</p>
                <TeacherNotebook showHeading={false} />
            </div>}
        </TeacherAreaPage>
    );
}
