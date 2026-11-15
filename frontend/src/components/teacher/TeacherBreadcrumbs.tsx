'use client';

import { AreaBreadcrumbs } from '@/components/ui/AreaBreadcrumbs';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import type { TeacherBreadcrumbItem } from '@/lib/teacher-breadcrumbs';

export interface TeacherBreadcrumbsProps {
    items: TeacherBreadcrumbItem[];
    extra?: React.ReactNode;
    className?: string;
}

/** Breadcrumb dell'Area Docente: wrapper di AreaBreadcrumbs. */
export function TeacherBreadcrumbs(props: TeacherBreadcrumbsProps) {
    const { lang } = useI18n();
    return <AreaBreadcrumbs {...props} ariaLabel={teacherAreaText(lang, 'breadcrumbsAriaLabel')} testId="teacher-breadcrumbs" />;
}
