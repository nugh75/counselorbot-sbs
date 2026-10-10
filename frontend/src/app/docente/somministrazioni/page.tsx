'use client';

import { TeacherAreaPage } from '@/components/teacher/TeacherAreaPage';
import { AdministrationPlansPanel } from '@/components/admin/AdministrationPlansPanel';
import { pathPublicationText } from '@/lib/i18n-path-publication';
import { useI18n } from '@/lib/i18n-context';

// The research view of the same administration rows the class path builder uses.
export default function TeacherAdministrationPlansPage() {
    const { lang } = useI18n();
    return <TeacherAreaPage slug="somministrazioni">{() => <AdministrationPlansPanel
        classHref={groupId => `/docente/classi/${groupId}?tab=paths`}
        classLinkLabel={pathPublicationText(lang, 'openClassPaths')} />}</TeacherAreaPage>;
}
