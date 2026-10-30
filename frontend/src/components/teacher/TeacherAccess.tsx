'use client';

import { ShieldAlert } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { Skeleton } from '@/components/ui/Skeleton';

// Esito "pagina riservata" per le rotte docenti: identico a prima, un solo
// pattern per l'Area docenti e le sue sottopagine.
export function TeacherForbidden() {
    const router = useRouter();
    const { lang } = useI18n();
    const l = (key: Parameters<typeof teacherAreaText>[1]) => teacherAreaText(lang, key);
    return (
        <div className="flex min-h-[60vh] items-center justify-center p-4">
            <div className="w-full max-w-md space-y-4 rounded-lg border border-line bg-surface p-8 text-center shadow-card">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-danger-soft">
                    <ShieldAlert className="h-6 w-6 text-danger" />
                </div>
                <p className="text-sm text-ink-muted">{l('forbidden')}</p>
                <button
                    onClick={() => router.push('/')}
                    className="min-h-control w-full rounded-control bg-brand py-2 font-semibold text-ink-on-brand transition-colors hover:bg-brand-hover"
                >
                    {l('back')}
                </button>
            </div>
        </div>
    );
}

export function TeacherLoading() {
    return <div className="page-wide space-y-6 px-4 py-8">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
    </div>;
}
