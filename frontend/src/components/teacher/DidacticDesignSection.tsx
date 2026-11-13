'use client';

import { EntryLink, EntrySection } from '@/components/ui/EntryList';
import ToolIllustration from '@/components/ui/ToolIllustration';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText } from '@/lib/i18n-teacher-area';

// Un'unica voce: lo strumento OBIETTIVO_DOCENZA (catalogo e piani operativi stanno nei gruppi Risorse e Classe).
export function DidacticDesignSection() {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof teacherAreaText>[1]) => teacherAreaText(lang, key);

    return (
        <EntrySection id="teacher-didactic-design-heading" title={l('didacticDesign')} testId="teacher-didactic-design-section">
            <EntryLink idPrefix="teacher-didactic" id="OBIETTIVO_DOCENZA" href="/?start=OBIETTIVO_DOCENZA"
                illustration={<ToolIllustration id="OBIETTIVO_DOCENZA" className="h-16 w-16 shrink-0 object-contain md:h-18 md:w-18" />}
                name={l('didacticDesignPrimaryTitle')} description={l('didacticDesignPrimaryDescription')} />
        </EntrySection>
    );
}
