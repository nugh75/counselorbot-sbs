'use client';

import type { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { classViewText } from '@/lib/i18n-class-view';
import { isClassContentHidden } from '@/lib/user-access';
import { useUserAccess } from '@/lib/use-user-access';

export function ClassContentGate({ children }: { children: ReactNode }) {
    const { lang } = useI18n();
    const { access, loading } = useUserAccess();
    if (loading) return null;
    if (isClassContentHidden(access)) {
        return <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700" role="status">
            {classViewText(lang, 'classContentHidden')}
        </p>;
    }
    return children;
}
