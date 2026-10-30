'use client';

import { TeacherForbidden, TeacherLoading } from '@/components/teacher/TeacherAccess';
import { TeacherAreaHome } from '@/components/teacher/TeacherAreaHome';
import { useTeacherAccessState } from '@/components/teacher/useTeacherAccessState';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText } from '@/lib/i18n-teacher-area';

// Area docenti: panoramica illustrata; le tabelle pesanti vivono nelle
// sottopagine /docente/<slug> (Orientamento solo per i docenti, come prima).
export default function TeacherPage() {
    const { lang } = useI18n();
    const { state, teacher, institutes } = useTeacherAccessState();

    if (state === 'loading') return <TeacherLoading />;
    if (state === 'forbidden') return <TeacherForbidden />;

    return (
        <div className="min-h-screen bg-surface-sunken">
            <section className="page-wide px-4 py-8">
                <h1 className="text-2xl font-semibold text-ink">{teacherAreaText(lang, 'title')}</h1>
                <p className="mt-1 text-sm text-ink-muted">{teacherAreaText(lang, 'subtitle')}</p>
                <div className="mt-6">
                    <TeacherAreaHome teacher={teacher} institutes={institutes} />
                </div>
            </section>
        </div>
    );
}
