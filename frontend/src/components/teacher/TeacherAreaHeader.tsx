'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaName, teacherAreaDescription } from '@/lib/i18n-teacher-area';
import { teacherAreaImages, type TeacherAreaSlug } from '@/lib/teacher-area';
import { PageHeader } from '@/components/ui/PageHeader';
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
        <header data-teacher-area-header className="space-y-6">
            <TeacherBreadcrumbs items={breadcrumbItems} extra={extra} />
            <PageHeader
                headingRef={heading}
                title={teacherAreaName(lang, slug)}
                subtitle={teacherAreaDescription(lang, slug)}
                icon={<Image src={teacherAreaImages[slug]} alt="" width={72} height={72} className="h-16 w-16 shrink-0 object-contain sm:h-18 sm:w-18" />}
            />
        </header>
    );
}
