'use client';

import { PersonalAIConnections } from '@/components/profile/PersonalAIConnections';
import { EntryLink, EntrySection } from '@/components/ui/EntryList';
import { useI18n } from '@/lib/i18n-context';
import { DidacticDesignSection } from './DidacticDesignSection';
import { MyClassesSection } from './MyClassesSection';
import { PracticeGymSection } from './PracticeGymSection';
import { TryToolsSection } from './TryToolsSection';
import { TeacherResourcesSection } from './TeacherResourcesSection';
import { teacherAreaName, teacherAreaDescription, teacherAreaText } from '@/lib/i18n-teacher-area';
import { teacherAreaGroups, teacherAreaImages, type TeacherAreaSlug } from '@/lib/teacher-area';

// Panoramica illustrata dell'Area docenti: stessa grammatica di PersonalAreaHome
// (gruppi per scopo, immagine + nome + descrizione, due colonne su desktop).
function TeacherAreaEntry({ slug }: { slug: TeacherAreaSlug }) {
    const { lang } = useI18n();
    return <EntryLink idPrefix="teacher" id={slug} href={`/docente/${slug}`} image={teacherAreaImages[slug]}
        name={teacherAreaName(lang, slug)} description={teacherAreaDescription(lang, slug)} />;
}

export function TeacherAreaHome({ teacher, institutes }: { teacher: boolean; institutes: boolean }) {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof teacherAreaText>[1]) => teacherAreaText(lang, key);

    const classroomGroup = teacherAreaGroups.find(g => g.id === 'classroom');
    const researchGroup = teacherAreaGroups.find(g => g.id === 'research');

    const renderGroup = (group: typeof teacherAreaGroups[number]) => {
        const slugs = group.slugs.filter(slug => slug === 'classi' ? false : slug === 'istituti' ? institutes : teacher || slug !== 'orientamento');
        if (slugs.length === 0) return null;
        return (
            <EntrySection key={group.id} id={`teacher-group-${group.id}`} title={l(group.id)}>
                {slugs.map(slug => <TeacherAreaEntry key={slug} slug={slug} />)}
            </EntrySection>
        );
    };

    return (
        <div className="space-y-8" data-teacher-area-home>
            {/* 1. Didattica e Classi */}
            <DidacticDesignSection />
            <MyClassesSection />
            {classroomGroup && renderGroup(classroomGroup)}

            {/* 2. Palestra di simulazione e prova */}
            <PracticeGymSection />
            <TryToolsSection />

            {/* 3. Profilo e Risorse */}
            <EntrySection id="teacher-profile-notebook-heading" title={l('teacherProfileHeading')} subtitle={l('teacherProfileSubtitle')} testId="teacher-profile-notebook-section">
                <TeacherAreaEntry slug="taccuino" />
            </EntrySection>

            <TeacherResourcesSection />
            {researchGroup && renderGroup(researchGroup)}

            <PersonalAIConnections area="docente" />
        </div>
    );
}
