'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { QUESTIONNAIRE_LIST } from '@/lib/questionnaires';
import { resolveActiveStudentTools } from '@/lib/tool-catalog';
import { useInstrumentCatalog } from '@/lib/use-instrument-catalog';

// «Prova gli strumenti»: ogni voce apre /?start=<id>, dove la scelta del metodo
// (studente di prova / dati propri, #837) esiste già per i docenti.
export function TryToolsSection() {
    const { lang, tf } = useI18n();
    const l = (key: Parameters<typeof teacherAreaText>[1]) => teacherAreaText(lang, key);
    const { rows: catalog } = useInstrumentCatalog();

    const tools = useMemo(() => {
        const teacherTool = QUESTIONNAIRE_LIST.find(q => q.id === 'OBIETTIVO_DOCENZA');
        return [...resolveActiveStudentTools(catalog, lang), ...(teacherTool ? [teacherTool] : [])];
    }, [catalog, lang]);

    return (
        <section aria-labelledby="teacher-try-tools-heading" data-testid="teacher-try-tools-section">
            <div className="border-b border-line pb-2">
                <h2 id="teacher-try-tools-heading" className="text-lg font-semibold text-ink">{l('tryToolsTitle')}</h2>
            </div>
            <div className="mt-4 rounded-card border border-role-teacher-line bg-role-teacher-soft p-4 shadow-card [--ink-muted:var(--role-teacher-muted)] sm:p-6">
                <div className="flex flex-wrap items-center gap-2">
                    <RoleBadge role="teacher">{l('title')}</RoleBadge>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-ink-body">{l('tryToolsDescription')}</p>
                <ul className="mt-4 grid gap-2 md:grid-cols-2">
                    {tools.map(q => (
                        <li key={q.id}>
                            <Link
                                href={`/?start=${encodeURIComponent(q.id)}`}
                                data-testid={`try-tool-${q.id}`}
                                className="group flex min-h-[44px] items-center gap-3 rounded-control border border-role-teacher-line bg-surface/80 px-3 py-2 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                            >
                                <span className="min-w-0 flex-1 break-words">
                                    <span className="block font-semibold text-ink group-hover:text-link">{tf(`q.${q.id}.name`, q.name)}</span>
                                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">{tf(`q.${q.id}.description`, q.description)}</span>
                                </span>
                                <ArrowRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}
