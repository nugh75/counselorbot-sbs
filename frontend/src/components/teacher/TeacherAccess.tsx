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
            <div className="w-full max-w-md space-y-4 rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-red-50">
                    <ShieldAlert className="h-6 w-6 text-red-600" />
                </div>
                <p className="text-sm text-slate-500">{l('forbidden')}</p>
                <button
                    onClick={() => router.push('/')}
                    className="w-full rounded-md bg-indigo-600 py-2.5 font-medium text-white transition-colors hover:bg-indigo-700"
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
