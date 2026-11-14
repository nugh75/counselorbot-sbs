'use client';

import Image from 'next/image';
import { EntryLink } from '@/components/ui/EntryList';
import { useI18n } from '@/lib/i18n-context';
import { useUserAccess } from '@/lib/use-user-access';
import { isToolAllowed } from '@/lib/user-access';

export function CompassEntry({ onOpen }: { onOpen?: () => void }) {
    const { t } = useI18n();
    const { access, loading } = useUserAccess();
    if (loading || !isToolAllowed(access, 'bussola')) return null;
    return <EntryLink idPrefix="tool" id="bussola" href="/bussola" onOpen={onOpen} testId="compass-entry"
        illustration={<Image src="/images/intro/compass.png" alt="" width={144} height={144} sizes="96px" className="h-16 w-16 shrink-0 object-contain md:h-18 md:w-18" />}
        name={t('app.intro.action.compass.label')} description={t('app.intro.action.compass.desc')} />;
}
