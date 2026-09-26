'use client';

import { TeacherForbidden, TeacherLoading } from '@/components/teacher/TeacherAccess';
import { TeacherAreaHeader } from '@/components/teacher/TeacherAreaHeader';
import { useTeacherAccessState } from '@/components/teacher/useTeacherAccessState';

// Guscio comune delle sottopagine /docente/<slug>: controllo di identità,
// intestazione locale illustrata (come nelle aree personali) e contenuto.
// `teacher` è vero solo per i docenti effettivi; orientamento e piani lo usano.
export function TeacherAreaPage({ slug, children, wide = true }: {
    slug: Parameters<typeof TeacherAreaHeader>[0]['slug'];
    children: (teacher: boolean) => React.ReactNode;
    wide?: boolean;
}) {
    const { state, teacher } = useTeacherAccessState();
    if (state === 'loading') return <TeacherLoading />;
    if (state === 'forbidden') return <TeacherForbidden />;
    return (
        <div className="min-h-screen bg-slate-50">
            <section className={`${wide ? 'page-wide' : 'page-narrow'} space-y-8 px-4 py-8`}>
                <TeacherAreaHeader slug={slug} />
                {children(teacher)}
            </section>
        </div>
    );
}
