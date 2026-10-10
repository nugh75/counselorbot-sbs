'use client';

import Image from 'next/image';
import { PersonalAIConnections } from '@/components/profile/PersonalAIConnections';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaName, teacherAreaDescription, teacherAreaText } from '@/lib/i18n-teacher-area';
import { teacherAreaGroups, teacherAreaImages, type TeacherAreaSlug } from '@/lib/teacher-area';

// Panoramica illustrata dell'Area docenti: stessa grammatica di PersonalAreaHome
// (gruppi per scopo, immagine + nome + descrizione, due colonne su desktop).
const control = 'group flex min-h-24 items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-slate-50 sm:gap-4';

function TeacherAreaLink({ id, href, image, name, description }: { id: string; href: string; image: string; name: string; description: string }) {
    return (
        <Link href={href} aria-labelledby={`teacher-link-${id}`} aria-describedby={`teacher-description-${id}`} className={control}>
            <Image src={image} alt="" width={72} height={72} sizes="(min-width: 768px) 72px, 64px" className="h-16 w-16 shrink-0 rounded-md object-contain md:h-18 md:w-18" />
            <span className="min-w-0 flex-1">
                <span id={`teacher-link-${id}`} className="block font-bold text-slate-900 group-hover:text-indigo-700">{name}</span>
                <span id={`teacher-description-${id}`} className="mt-1 block text-sm leading-relaxed text-slate-600">{description}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
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
    return (
        <div className="space-y-6" data-teacher-area-home>
            {/* The two notebooks side by side, before the groups. */}
            <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
                <TeacherAreaEntry slug="taccuino" />
                <TeacherAreaEntry slug="taccuini-prova" />
            </div>
            {teacherAreaGroups.map(group => ({ ...group, slugs: group.slugs.filter(slug => slug === 'istituti' ? institutes : teacher || slug !== 'orientamento') })).map(group => (
                <section key={group.id} aria-labelledby={`teacher-group-${group.id}`}>
                    <h2 id={`teacher-group-${group.id}`} className="border-b border-slate-200 pb-2 text-lg font-bold text-slate-800">{l(group.id)}</h2>
                    <nav aria-labelledby={`teacher-group-${group.id}`} className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
                        {/* The guided chat for a class objective opens the catalogs, before the goal catalog. */}
                        {group.id === 'catalogs' && <TeacherAreaLink id="goal-path" href="/?start=OBIETTIVO_DOCENZA"
                            image="/images/platform/obiettivi-classe.png" name={l('goalPathTitle')} description={l('goalPathDescription')} />}
                        {group.slugs.map(slug => <TeacherAreaEntry key={slug} slug={slug} />)}
                    </nav>
                </section>
            ))}
            <PersonalAIConnections area="docente" />
        </div>
    );
}
