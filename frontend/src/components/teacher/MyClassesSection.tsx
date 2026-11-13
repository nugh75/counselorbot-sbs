'use client';

import { EntryLink, EntrySection } from '@/components/ui/EntryList';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaDescription, teacherAreaText } from '@/lib/i18n-teacher-area';
import { teacherAreaImages } from '@/lib/teacher-area';

// «Le mie classi» è una sola voce verso /docente/classi: l'elenco delle classi vive lì.
export function MyClassesSection() {
    const { lang } = useI18n();
    return (
        <EntrySection id="teacher-my-classes-heading" title={teacherAreaText(lang, 'myClassesTitle')} testId="teacher-my-classes-section">
            <EntryLink idPrefix="teacher-classes" id="classi" href="/docente/classi" image={teacherAreaImages.classi}
                name={teacherAreaText(lang, 'myClassesTitle')} description={teacherAreaDescription(lang, 'classi')} />
        </EntrySection>
    );
}
