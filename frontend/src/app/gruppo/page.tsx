'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Users } from 'lucide-react';

// ponytail: testi inline it/en come il resto della UI gruppi/Telegram.
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
    },
};

interface JoinedGroup {
    title: string;
    instrument_code: string;
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
                        {texts.joined}: {group.title}
                    </p>
                    <p className="text-sm text-slate-500">
                        {texts.instrument}: <span className="font-mono font-semibold">{group.instrument_code}</span>
                    </p>
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
