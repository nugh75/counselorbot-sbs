'use client';

import { TeacherForbidden, TeacherLoading } from '@/components/teacher/TeacherAccess';
import { TeacherAreaHome } from '@/components/teacher/TeacherAreaHome';
import { TeacherNotebook } from '@/components/teacher/TeacherNotebook';
import { useTeacherAccessState } from '@/components/teacher/useTeacherAccessState';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText } from '@/lib/i18n-teacher-area';

// Area docenti: panoramica illustrata; le tabelle pesanti vivono nelle
// sottopagine /docente/<slug> (Orientamento solo per i docenti, come prima).
// Solo il taccuino resta qui, come riferimento continuo del ruolo.
export default function TeacherPage() {
    const { lang } = useI18n();
    const { state, teacher } = useTeacherAccessState();

    if (state === 'loading') return <TeacherLoading />;
    if (state === 'forbidden') return <TeacherForbidden />;

    return (
        <div className="min-h-screen bg-slate-50">
            <section className="page-wide px-4 py-8">
                <h1 className="text-2xl font-bold text-slate-800">{teacherAreaText(lang, 'title')}</h1>
                <p className="mt-1 text-sm text-slate-500">{teacherAreaText(lang, 'subtitle')}</p>
                <div className="mt-6">
                    <TeacherAreaHome teacher={teacher} notebookSlot={<TeacherNotebook />} />
                </div>
            </section>
        </div>
    );
}
