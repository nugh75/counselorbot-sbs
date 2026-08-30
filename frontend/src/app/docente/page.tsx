'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { getIdentity, type Identity } from '@/lib/auth';
import { canUseTeacherAssistant } from '@/lib/roles';
import { useI18n } from '@/lib/i18n-context';
import { AdministrationPlansPanel } from '@/components/admin/AdministrationPlansPanel';
import { GroupsPanel } from '@/components/admin/GroupsPanel';

// Local copy is complete for every supported interface language.
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
    es: {
        title: 'Mis grupos',
        subtitle: 'Planes de administración de tus grupos: enlaces de invitación (web y Telegram), estudiantes, perfiles, notas y mensajes.',
        forbidden: 'Esta página está reservada a docentes, investigadores y administradores.',
        back: 'Volver a CounselorBot',
        loading: 'Comprobando el acceso...',
    },
    fr: {
        title: 'Mes groupes',
        subtitle: 'Plans de passation de vos groupes : liens d’invitation (web et Telegram), étudiants, profils, notes et messages.',
        forbidden: 'Cette page est réservée aux enseignants, chercheurs et administrateurs.',
        back: 'Retour à CounselorBot',
        loading: 'Vérification de l’accès...',
    },
    de: {
        title: 'Meine Gruppen',
        subtitle: 'Durchführungspläne für Ihre Gruppen: Einladungslinks (Web und Telegram), Lernende, Profile, Notizen und Nachrichten.',
        forbidden: 'Diese Seite ist Lehrkräften, Forschenden und Administratoren vorbehalten.',
        back: 'Zurück zu CounselorBot',
        loading: 'Zugriff wird geprüft...',
    },
    sv: {
        title: 'Mina grupper',
        subtitle: 'Genomförandeplaner för dina grupper: inbjudningslänkar (webb och Telegram), studenter, profiler, anteckningar och meddelanden.',
        forbidden: 'Den här sidan är endast för lärare, forskare och administratörer.',
        back: 'Tillbaka till CounselorBot',
        loading: 'Kontrollerar åtkomst...',
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
                    <GroupsPanel />
                </div>
                <div className="mt-10">
                    <AdministrationPlansPanel />
                </div>
            </section>
        </div>
    );
}
