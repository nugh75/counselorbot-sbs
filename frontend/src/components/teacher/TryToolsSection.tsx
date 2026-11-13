'use client';

import { useMemo } from 'react';
import { EntryLink, EntrySection } from '@/components/ui/EntryList';
import ToolIllustration from '@/components/ui/ToolIllustration';
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
        <EntrySection id="teacher-try-tools-heading" title={l('tryToolsTitle')} subtitle={l('tryToolsDescription')} testId="teacher-try-tools-section">
            {tools.map(q => (
                <EntryLink key={q.id} idPrefix="teacher-try" id={q.id} href={`/?start=${encodeURIComponent(q.id)}`}
                    illustration={<ToolIllustration id={q.id} className="h-16 w-16 shrink-0 object-contain md:h-18 md:w-18" />}
                    name={tf(`q.${q.id}.name`, q.name)} description={tf(`q.${q.id}.description`, q.description)} />
            ))}
        </EntrySection>
    );
}
