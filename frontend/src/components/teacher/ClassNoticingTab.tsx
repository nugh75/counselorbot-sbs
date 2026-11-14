'use client';
import { useI18n } from '@/lib/i18n-context';
import { JourneyClassNoticing } from './JourneyClassNoticing';

export function ClassNoticingTab({ groupId }: { groupId: number }) {
    const { lang } = useI18n();
    return <JourneyClassNoticing key={`${groupId}:${lang}`} groupId={groupId} />;
}
