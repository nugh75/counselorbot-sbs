'use client';

import { Smartphone } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { TeacherDevicesPanel } from '@/components/teacher/TeacherDevicesPanel';
import { useI18n } from '@/lib/i18n-context';
import { localPairingText } from '@/lib/i18n-local-pairing';

export default function TeacherDevicesPage() {
    const { lang } = useI18n();
    return (
        <main id="contenuto" className="page-wide space-y-6 py-8">
            <PageHeader
                title={localPairingText(lang, 'devicesTitle')}
                subtitle={localPairingText(lang, 'devicesSubtitle')}
                backHref="/docente"
                backLabel={localPairingText(lang, 'backToTeacher')}
                icon={<Smartphone className="h-7 w-7 text-indigo-600" aria-hidden />}
            />
            <TeacherDevicesPanel />
        </main>
    );
}
