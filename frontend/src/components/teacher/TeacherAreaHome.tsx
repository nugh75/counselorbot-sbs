'use client';

import Image from 'next/image';
import { PersonalAIConnections } from '@/components/profile/PersonalAIConnections';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { DidacticDesignSection } from './DidacticDesignSection';
import { MyClassesSection } from './MyClassesSection';
import { PracticeGymSection } from './PracticeGymSection';
import { TeacherResourcesSection } from './TeacherResourcesSection';
import { teacherAreaName, teacherAreaDescription, teacherAreaText } from '@/lib/i18n-teacher-area';
import { teacherAreaGroups, teacherAreaImages, type TeacherAreaSlug } from '@/lib/teacher-area';

// Panoramica illustrata dell'Area docenti: stessa grammatica di PersonalAreaHome
// (gruppi per scopo, immagine + nome + descrizione, due colonne su desktop).
const control = 'group flex min-h-24 items-center gap-4 rounded-card px-2 py-4 transition-colors hover:bg-surface-sunken sm:gap-4';

function TeacherAreaLink({ id, href, image, name, description }: { id: string; href: string; image: string; name: string; description: string }) {
    return (
        <Link href={href} aria-labelledby={`teacher-link-${id}`} aria-describedby={`teacher-description-${id}`} className={control}>
            <Image src={image} alt="" width={72} height={72} sizes="(min-width: 768px) 72px, 64px" className="h-16 w-16 shrink-0 rounded-control object-contain md:h-18 md:w-18" />
            <span className="min-w-0 flex-1 break-words">
                <span id={`teacher-link-${id}`} className="block font-semibold text-ink group-hover:text-link">{name}</span>
                <span id={`teacher-description-${id}`} className="mt-1 block text-sm leading-relaxed text-ink-muted">{description}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
        </Link>
    );
}

function TeacherAreaEntry({ slug }: { slug: TeacherAreaSlug }) {
    const { lang } = useI18n();
    return <TeacherAreaLink id={slug} href={`/docente/${slug}`} image={teacherAreaImages[slug]}
        name={teacherAreaName(lang, slug)} description={teacherAreaDescription(lang, slug)} />;
}

export function TeacherAreaHome({ teacher, institutes }: { teacher: boolean; institutes: boolean }) {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof teacherAreaText>[1]) => teacherAreaText(lang, key);

    const classroomGroup = teacherAreaGroups.find(g => g.id === 'classroom');
    const researchGroup = teacherAreaGroups.find(g => g.id === 'research');

    const renderGroup = (group: typeof teacherAreaGroups[number]) => {
        const slugs = group.slugs.filter(slug => slug === 'istituti' ? institutes : teacher || slug !== 'orientamento');
        if (slugs.length === 0) return null;
        return (
            <section key={group.id} aria-labelledby={`teacher-group-${group.id}`}>
                <h2 id={`teacher-group-${group.id}`} className="border-b border-line pb-2 text-lg font-semibold text-ink">
                    {l(group.id)}
                </h2>
                <nav aria-labelledby={`teacher-group-${group.id}`} className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
                    {slugs.map(slug => <TeacherAreaEntry key={slug} slug={slug} />)}
                </nav>
            </section>
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

            {/* 3. Profilo e Risorse */}
            <section aria-labelledby="teacher-profile-notebook-heading" data-testid="teacher-profile-notebook-section">
                <div className="border-b border-line pb-2">
                    <h2 id="teacher-profile-notebook-heading" className="text-lg font-semibold text-ink">
                        {l('teacherProfileHeading')}
                    </h2>
                    <p className="mt-1 text-xs text-ink-muted">
                        {l('teacherProfileSubtitle')}
                    </p>
                </div>
                <nav aria-labelledby="teacher-profile-notebook-heading" className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
                    <TeacherAreaEntry slug="taccuino" />
                </nav>
            </section>

            <TeacherResourcesSection />
            {researchGroup && renderGroup(researchGroup)}

            <PersonalAIConnections area="docente" />
        </div>
    );
}
