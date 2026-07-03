'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { getIdentity, type Identity } from '@/lib/auth';
import { canUseTeacherAssistant } from '@/lib/roles';
import { useI18n } from '@/lib/i18n-context';
import { AdministrationPlansPanel } from '@/components/admin/AdministrationPlansPanel';

// ponytail: testi inline it/en come il resto della UI docente/Telegram.
const TEXTS = {
    it: {
        title: 'I miei gruppi',
        subtitle: 'Piani di somministrazione dei tuoi gruppi: link di invito (web e Telegram), studenti, profili, note e messaggi.',
        forbidden: 'Pagina riservata a docenti, ricercatori e amministratori.',
        back: 'Torna a CounselorBot',
        loading: 'Verifica in corso...',
    },
    en: {
        title: 'My groups',
        subtitle: 'Administration plans for your groups: invitation links (web and Telegram), students, profiles, notes and messages.',
        forbidden: 'This page is reserved for teachers, researchers and administrators.',
        back: 'Back to CounselorBot',
        loading: 'Checking access...',
    },
};

export default function TeacherPage() {
    const router = useRouter();
    const { lang } = useI18n();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const [authState, setAuthState] = useState<'loading' | 'ok' | 'forbidden'>('loading');

    useEffect(() => {
        getIdentity().then((identity: Identity | null) => {
            setAuthState(canUseTeacherAssistant(identity) ? 'ok' : 'forbidden');
        });
    }, []);

    if (authState === 'loading') {
        return <div className="flex min-h-[60vh] items-center justify-center text-slate-500">{texts.loading}</div>;
    }

    if (authState === 'forbidden') {
        return (
            <div className="flex min-h-[60vh] items-center justify-center p-4">
                <div className="w-full max-w-md space-y-4 rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-red-50">
                        <ShieldAlert className="h-6 w-6 text-red-600" />
                    </div>
                    <p className="text-sm text-slate-500">{texts.forbidden}</p>
                    <button
                        onClick={() => router.push('/')}
                        className="w-full rounded-md bg-indigo-600 py-2.5 font-medium text-white transition-colors hover:bg-indigo-700"
                    >
                        {texts.back}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <section className="page-wide px-4 py-8">
                <h1 className="text-2xl font-bold text-slate-800">{texts.title}</h1>
                <p className="mt-1 text-sm text-slate-500">{texts.subtitle}</p>
                <div className="mt-6">
                    <AdministrationPlansPanel />
                </div>
            </section>
        </div>
    );
}
