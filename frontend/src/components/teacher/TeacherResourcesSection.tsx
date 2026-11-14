'use client';

import ToolIllustration from '@/components/ui/ToolIllustration';
import { EntryLink, EntrySection } from '@/components/ui/EntryList';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText, teacherAreaName, teacherAreaDescription } from '@/lib/i18n-teacher-area';
import { teacherAreaGroups, teacherAreaImages } from '@/lib/teacher-area';

const slugs = teacherAreaGroups.find(g => g.id === 'resources')?.slugs ?? [];

export function TeacherResourcesSection() {
    const { lang } = useI18n();
    return (
        <EntrySection id="teacher-resources-heading" title={teacherAreaText(lang, 'resources')} subtitle={teacherAreaText(lang, 'resourcesSubtitle')} testId="teacher-resources-library-section">
            <EntryLink idPrefix="teacher-didactic" id="OBIETTIVO_DOCENZA" href="/?start=OBIETTIVO_DOCENZA"
                illustration={<ToolIllustration id="OBIETTIVO_DOCENZA" className="h-16 w-16 shrink-0 object-contain md:h-18 md:w-18" />}
                name={teacherAreaText(lang, 'didacticDesignPrimaryTitle')} description={teacherAreaText(lang, 'didacticDesignPrimaryDescription')} />
            {slugs.map(slug => <EntryLink key={slug} idPrefix="teacher-resources" id={slug} href={`/docente/${slug}`} image={teacherAreaImages[slug]}
                name={teacherAreaName(lang, slug)} description={teacherAreaDescription(lang, slug)} />)}
        </EntrySection>
    );
}
