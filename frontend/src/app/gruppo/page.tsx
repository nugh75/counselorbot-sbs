'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Users } from 'lucide-react';

// Local copy is complete for every supported interface language.
const TEXTS = {
    it: {
        title: 'Invito al gruppo',
        joining: 'Iscrizione in corso...',
        joined: 'Sei nel gruppo',
        instrument: 'Strumento del gruppo',
        goTools: 'Vai agli strumenti',
        goProfile: 'Vai al tuo profilo',
        invalid: 'Invito non valido o scaduto. Chiedi al docente un nuovo link.',
        missing: 'Link senza codice gruppo.',
        privacy: "Nota: il docente/ricercatore del gruppo puo' vedere i tuoi risultati e le conversazioni con il counselor AI.",
    },
    en: {
        title: 'Group invitation',
        joining: 'Joining the group...',
        joined: 'You joined the group',
        instrument: 'Group instrument',
        goTools: 'Go to the instruments',
        goProfile: 'Go to your profile',
        invalid: 'Invalid or expired invitation. Ask your teacher for a new link.',
        missing: 'The link has no group code.',
        privacy: 'Note: the group teacher/researcher can see your results and your conversations with the AI counselor.',
    },
    es: {
        title: 'Invitación al grupo', joining: 'Uniéndote al grupo...', joined: 'Te has unido al grupo',
        instrument: 'Instrumento del grupo', goTools: 'Ir a los instrumentos', goProfile: 'Ir a tu perfil',
        invalid: 'Invitación no válida o caducada. Pide un nuevo enlace a tu docente.', missing: 'El enlace no contiene el código del grupo.',
        privacy: 'Nota: el docente o investigador del grupo puede ver tus resultados y tus conversaciones con el orientador de IA.',
    },
    fr: {
        title: 'Invitation au groupe', joining: 'Inscription au groupe...', joined: 'Vous avez rejoint le groupe',
        instrument: 'Outil du groupe', goTools: 'Accéder aux outils', goProfile: 'Accéder à votre profil',
        invalid: 'Invitation non valide ou expirée. Demandez un nouveau lien à votre enseignant.', missing: 'Le lien ne contient aucun code de groupe.',
        privacy: 'Remarque : l’enseignant ou le chercheur du groupe peut consulter vos résultats et vos conversations avec le conseiller IA.',
    },
    de: {
        title: 'Gruppeneinladung', joining: 'Beitritt zur Gruppe...', joined: 'Sie sind der Gruppe beigetreten',
        instrument: 'Instrument der Gruppe', goTools: 'Zu den Instrumenten', goProfile: 'Zu Ihrem Profil',
        invalid: 'Ungültige oder abgelaufene Einladung. Bitten Sie Ihre Lehrkraft um einen neuen Link.', missing: 'Der Link enthält keinen Gruppencode.',
        privacy: 'Hinweis: Die Lehrkraft oder Forschungsperson der Gruppe kann Ihre Ergebnisse und Unterhaltungen mit dem KI-Counselor einsehen.',
    },
    sv: {
        title: 'Gruppinbjudan', joining: 'Går med i gruppen...', joined: 'Du har gått med i gruppen',
        instrument: 'Gruppens instrument', goTools: 'Gå till instrumenten', goProfile: 'Gå till din profil',
        invalid: 'Ogiltig eller utgången inbjudan. Be din lärare om en ny länk.', missing: 'Länken saknar gruppkod.',
        privacy: 'Obs! Gruppens lärare eller forskare kan se dina resultat och dina samtal med AI-vägledaren.',
    },
};

interface JoinedGroup {
    name: string;
}

function GroupJoinInner() {
    const { lang } = useI18n();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const searchParams = useSearchParams();
    const code = (searchParams.get('g') || searchParams.get('code') || '').trim();
    const [group, setGroup] = useState<JoinedGroup | null>(null);
    const [failed, setFailed] = useState(false);
    const error = !code ? texts.missing : (failed ? texts.invalid : '');

    useEffect(() => {
        if (!code) return;
        let cancelled = false;
        apiFetch('/api/groups/join', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
        })
            .then(async (res) => {
                if (!res.ok) throw new Error('join failed');
                const payload = await res.json() as JoinedGroup;
                if (!cancelled) setGroup(payload);
            })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [code]);

    return (
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
            <Users className="h-10 w-10 text-slate-500" aria-hidden />
            <h1 className="text-2xl font-bold text-slate-800">{texts.title}</h1>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {!error && !group && <p className="text-sm text-slate-500">{texts.joining}</p>}
            {group && (
                <>
                    <p className="text-lg font-semibold text-slate-700">
                        {texts.joined}: {group.name}
                    </p>
                    <p className="max-w-sm text-xs text-slate-400">{texts.privacy}</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Link
                            href="/strumenti"
                            className="rounded-md bg-indigo-600 px-6 py-3 text-base font-semibold text-white hover:bg-indigo-700"
                        >
                            {texts.goTools}
                        </Link>
                        <Link
                            href="/profilo"
                            className="rounded-md border border-slate-300 px-6 py-3 text-base font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            {texts.goProfile}
                        </Link>
                    </div>
                </>
            )}
        </main>
    );
}

export default function GroupJoinPage() {
    return (
        <Suspense fallback={null}>
            <GroupJoinInner />
        </Suspense>
    );
}
