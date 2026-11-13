'use client';

import { EntryLink, EntrySection } from '@/components/ui/EntryList';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { teacherAreaImages } from '@/lib/teacher-area';

export function PracticeGymSection() {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof teacherAreaText>[1]) => teacherAreaText(lang, key);

    return (
        <EntrySection id="teacher-practice-gym-heading" title={l('practiceGymTitle')} testId="teacher-practice-gym-section">
            <EntryLink idPrefix="teacher-gym" id="taccuini-prova" href="/docente/taccuini-prova" image={teacherAreaImages['taccuini-prova']}
                name={l('practiceGymPrimaryTitle')} description={l('practiceGymPrimaryDescription')}
                badge={<RoleBadge role="teacher">{l('practiceGymBadge')}</RoleBadge>} />
        </EntrySection>
    );
}
