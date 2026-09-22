'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ShieldAlert, Target } from 'lucide-react';
import { getIdentity, type Identity } from '@/lib/auth';
import { canUseTeacherAssistant } from '@/lib/roles';
import { useI18n } from '@/lib/i18n-context';
import { AdministrationPlansPanel } from '@/components/admin/AdministrationPlansPanel';
import { AssignmentsPanel } from '@/components/teacher/AssignmentsPanel';
import { GroupsPanel } from '@/components/admin/GroupsPanel';
import { TeacherCatalogs } from '@/components/teacher/TeacherCatalogs';

// Local copy is complete for every supported interface language.
const TEXTS = {
    it: {
        title: 'Area docenti',
        subtitle: "Configura gli obiettivi, gestisci gruppi, classi e somministrazioni e amplia i cataloghi di strategie, libri, film e altri materiali.",
        goalPathTitle: 'Percorso guidato: obiettivi per la mia classe',
        goalPathDescription: 'Imposta un obiettivo didattico per la tua classe con la tassonomia di Bloom, la prova SMART e l’allineamento con attività e valutazione.',
        forbidden: 'Pagina riservata a docenti, ricercatori e amministratori.',
        back: 'Torna a CounselorBot',
        loading: 'Verifica in corso...',
    },
    en: {
        title: 'Teacher area',
        subtitle: "Configure goals, manage groups, classes and administration plans, and expand the catalogs of strategies, books, films and other resources.",
        goalPathTitle: 'Guided path: objectives for my class',
        goalPathDescription: "Set a didactic objective for your class with Bloom's taxonomy, the SMART check and alignment with activities and assessment.",
        forbidden: 'This page is reserved for teachers, researchers and administrators.',
        back: 'Back to CounselorBot',
        loading: 'Checking access...',
    },
    es: {
        title: 'Área docente',
        subtitle: "Configura objetivos, gestiona grupos, clases y planes de administración y amplía los catálogos de estrategias, libros, películas y otros materiales.",
        goalPathTitle: 'Recorrido guiado: objetivos para mi clase',
        goalPathDescription: 'Fija un objetivo didáctico para tu clase con la taxonomía de Bloom, la prueba SMART y la alineación con actividades y evaluación.',
        forbidden: 'Esta página está reservada a docentes, investigadores y administradores.',
        back: 'Volver a CounselorBot',
        loading: 'Comprobando el acceso...',
    },
    fr: {
        title: 'Espace enseignant',
        subtitle: "Configurez les objectifs, gérez les groupes, les classes et les plans de passation, et enrichissez les catalogues de stratégies, de livres, de films et d’autres ressources.",
        goalPathTitle: 'Parcours guidé : objectifs pour ma classe',
        goalPathDescription: 'Fixez un objectif didactique pour votre classe avec la taxonomie de Bloom, l’épreuve SMART et l’alignement avec les activités et l’évaluation.',
        forbidden: 'Cette page est réservée aux enseignants, chercheurs et administrateurs.',
        back: 'Retour à CounselorBot',
        loading: 'Vérification de l’accès...',
    },
    de: {
        title: 'Lehrkräftebereich',
        subtitle: "Legen Sie Ziele fest, verwalten Sie Gruppen, Klassen und Durchführungspläne und erweitern Sie die Kataloge für Strategien, Bücher, Filme und andere Materialien.",
        goalPathTitle: 'Begleiteter Weg: Ziele für meine Klasse',
        goalPathDescription: 'Legen Sie ein Unterrichtsziel für Ihre Klasse fest: Bloom-Taxonomie, SMART-Test und Abstimmung mit Aktivitäten und Bewertung.',
        forbidden: 'Diese Seite ist Lehrkräften, Forschenden und Administratoren vorbehalten.',
        back: 'Zurück zu CounselorBot',
        loading: 'Zugriff wird geprüft...',
    },
    sv: {
        title: 'Lärarområde',
        subtitle: "Konfigurera mål, hantera grupper, klasser och genomförandeplaner och utöka katalogerna med strategier, böcker, filmer och annat material.",
        goalPathTitle: 'Väglett arbetssätt: mål för min klass',
        goalPathDescription: 'Sätt ett undervisningsmål för din klass med Blooms taxonomi, SMART-testet och anpassning till aktiviteter och bedömning.',
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
                <Link
                    href="/?start=OBIETTIVO_DOCENZA"
                    className="mt-4 flex items-start gap-3 rounded-lg border border-indigo-200 bg-white p-4 transition-colors hover:bg-indigo-50"
                >
                    <Target className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
                    <span>
                        <span className="block font-semibold text-slate-800">{texts.goalPathTitle}</span>
                        <span className="block text-sm text-slate-600">{texts.goalPathDescription}</span>
                    </span>
                </Link>
                <TeacherCatalogs />
                <div className="mt-10"><AssignmentsPanel teacher /></div>
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
