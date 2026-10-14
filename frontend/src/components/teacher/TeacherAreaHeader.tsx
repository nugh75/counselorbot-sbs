'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaName, teacherAreaDescription } from '@/lib/i18n-teacher-area';
import { teacherAreaImages, type TeacherAreaSlug } from '@/lib/teacher-area';
import { TeacherBreadcrumbs } from './TeacherBreadcrumbs';
import { getTeacherBreadcrumbsForSlug, type TeacherBreadcrumbItem } from '@/lib/teacher-breadcrumbs';

export interface TeacherAreaHeaderProps {
    slug: TeacherAreaSlug;
    customBreadcrumbs?: TeacherBreadcrumbItem[];
    extra?: React.ReactNode;
}

// Intestazione delle sottopagine docenti con navigazione breadcrumbs accessibile.
export function TeacherAreaHeader({ slug, customBreadcrumbs, extra }: TeacherAreaHeaderProps) {
    const { lang } = useI18n();
    const heading = useRef<HTMLHeadingElement>(null);

    useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [slug]);

    const breadcrumbItems = customBreadcrumbs ?? getTeacherBreadcrumbsForSlug(slug, lang);

    return (
        <header data-teacher-area-header className="space-y-5">
            <TeacherBreadcrumbs items={breadcrumbItems} extra={extra} />
            <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 sm:grid-cols-[4.5rem_minmax(0,1fr)]">
                <Image src={teacherAreaImages[slug]} alt="" width={72} height={72} className="h-16 w-16 object-contain sm:row-span-2 sm:h-18 sm:w-18" />
                <h1 ref={heading} tabIndex={-1} className="min-w-0 break-words text-2xl font-bold tracking-tight focus:outline-none sm:self-end">{teacherAreaName(lang, slug)}</h1>
                <p className="col-span-2 text-sm text-slate-600 sm:col-span-1 sm:self-start dark:text-slate-400">{teacherAreaDescription(lang, slug)}</p>
            </div>
        </header>
    );
}
