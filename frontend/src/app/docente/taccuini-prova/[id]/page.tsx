'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { PracticeNotebooks } from '@/components/teacher/PracticeNotebooks';
import { useI18n } from '@/lib/i18n-context';
import { getTeacherBreadcrumbsForSlug } from '@/lib/teacher-breadcrumbs';

// Pagina di uno studente di prova (#892): ?profilo=<tipo> apre il modulo di un nuovo profilo.
function PracticeNotebookPage() {
    const { lang } = useI18n();
    const { id } = useParams<{ id: string }>();
    const profile = useSearchParams().get('profilo');
    const breadcrumbs = getTeacherBreadcrumbsForSlug('taccuini-prova', lang)
        .map((item) => item.current ? { label: item.label, href: '/docente/taccuini-prova' } : item);
    return (
        <TeacherAreaPage slug="taccuini-prova" wide={false} customBreadcrumbs={breadcrumbs}>
            {() => <PracticeNotebooks notebookId={Number(id)} newProfileType={profile} />}
        </TeacherAreaPage>
    );
}

export default function TeacherPracticeNotebookPage() {
    return <Suspense><PracticeNotebookPage /></Suspense>;
}
