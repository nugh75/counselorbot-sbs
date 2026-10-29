'use client';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { guideTaskHref, type GuideAudience } from '@/lib/guide-tasks';
import type { GuideTaskId } from '@/lib/i18n-guide-tasks';
import { guideUIText } from '@/lib/i18n-guide-ui';

export function GuideHelpLink({task, audience = 'student'}: {task: GuideTaskId; audience?: GuideAudience}) {
    const {lang} = useI18n();
    return <Link href={guideTaskHref(task, audience)} target="_blank" rel="noopener noreferrer"
        className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-indigo-700 underline underline-offset-2">
        <BookOpen className="h-4 w-4" aria-hidden="true" />{guideUIText(lang, 'help')}
    </Link>;
}
