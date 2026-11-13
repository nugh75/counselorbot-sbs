'use client';

import { EntryLink, EntrySection } from '@/components/ui/EntryList';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText, teacherAreaName, teacherAreaDescription } from '@/lib/i18n-teacher-area';
import { teacherAreaImages, type TeacherAreaSlug } from '@/lib/teacher-area';

const slugs: TeacherAreaSlug[] = ['catalogo-obiettivi', 'risorse', 'strategie', 'materiali'];

export function TeacherResourcesSection() {
    const { lang } = useI18n();
    return (
        <EntrySection id="teacher-resources-heading" title={teacherAreaText(lang, 'resources')} subtitle={teacherAreaText(lang, 'resourcesSubtitle')} testId="teacher-resources-library-section">
            {slugs.map(slug => <EntryLink key={slug} idPrefix="teacher-resources" id={slug} href={`/docente/${slug}`} image={teacherAreaImages[slug]}
                name={teacherAreaName(lang, slug)} description={teacherAreaDescription(lang, slug)} />)}
        </EntrySection>
    );
}
