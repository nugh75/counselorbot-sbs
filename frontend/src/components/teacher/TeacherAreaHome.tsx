'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Target } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaName, teacherAreaDescription, teacherAreaText } from '@/lib/i18n-teacher-area';
import { teacherAreaGroups, teacherAreaImages, type TeacherAreaSlug } from '@/lib/teacher-area';

// Panoramica illustrata dell'Area docenti: stessa grammatica di PersonalAreaHome
// (gruppi per scopo, immagine + nome + descrizione, due colonne su desktop).
const control = 'group flex min-h-24 items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-slate-50 sm:gap-4';

function TeacherAreaEntry({ slug }: { slug: TeacherAreaSlug }) {
    const { lang } = useI18n();
    return (
        <Link href={`/docente/${slug}`} aria-labelledby={`teacher-link-${slug}`} aria-describedby={`teacher-description-${slug}`} className={control}>
            <Image src={teacherAreaImages[slug]} alt="" width={72} height={72} sizes="(min-width: 768px) 72px, 64px" className="h-16 w-16 shrink-0 rounded-md object-contain md:h-18 md:w-18" />
            <span className="min-w-0 flex-1">
                <span id={`teacher-link-${slug}`} className="block font-bold text-slate-900 group-hover:text-indigo-700">{teacherAreaName(lang, slug)}</span>
                <span id={`teacher-description-${slug}`} className="mt-1 block text-sm leading-relaxed text-slate-600">{teacherAreaDescription(lang, slug)}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
        </Link>
    );
}

export function TeacherAreaHome({ teacher, notebookSlot }: { teacher: boolean; notebookSlot?: React.ReactNode }) {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof teacherAreaText>[1]) => teacherAreaText(lang, key);
    return (
        <div className="space-y-6" data-teacher-area-home>
            <section aria-labelledby="teacher-goal-path">
                <h2 id="teacher-goal-path" className="border-b border-slate-200 pb-2 text-lg font-bold text-slate-800">{l('goalPathTitle')}</h2>
                <Link href="/?start=OBIETTIVO_DOCENZA" className="mt-2 flex items-start gap-3 rounded-lg border border-indigo-200 bg-white p-4 transition-colors hover:bg-indigo-50">
                    <Target className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
                    <span>
                        <span className="block font-semibold text-slate-800">{l('goalPathTitle')}</span>
                        <span className="block text-sm text-slate-600">{l('goalPathDescription')}</span>
                    </span>
                </Link>
            </section>
            {teacherAreaGroups.map(group => ({ ...group, slugs: group.slugs.filter(slug => teacher || slug !== 'orientamento') })).map(group => (
                <section key={group.id} aria-labelledby={`teacher-group-${group.id}`}>
                    <h2 id={`teacher-group-${group.id}`} className="border-b border-slate-200 pb-2 text-lg font-bold text-slate-800">{l(group.id)}</h2>
                    <nav aria-labelledby={`teacher-group-${group.id}`} className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
                        {group.slugs.map(slug => <TeacherAreaEntry key={slug} slug={slug} />)}
                    </nav>
                </section>
            ))}
            {notebookSlot && (
                <section aria-labelledby="teacher-notebook-group">
                    <h2 id="teacher-notebook-group" className="border-b border-slate-200 pb-2 text-lg font-bold text-slate-800">{l('notebook')}</h2>
                    <p className="mt-1 max-w-2xl text-sm text-slate-600">{l('notebookNote')}</p>
                    <div className="mt-2">{notebookSlot}</div>
                </section>
            )}
        </div>
    );
}
