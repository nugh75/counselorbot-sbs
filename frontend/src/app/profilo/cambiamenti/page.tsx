'use client';

import { useEffect, useState } from 'react';
import { User, ShieldAlert } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { BackButton } from '@/components/ui/BackButton';
import { getIdentity, type Identity } from '@/lib/auth';
import { canUsePersonalPage } from '@/lib/roles';
import { Skeleton } from '@/components/ui/Skeleton';
import { ProfileChangeReflection } from '@/components/profile/ProfileChangeReflection';

export default function ProfileChangesPage() {
    const { t, lang } = useI18n();
    const [identity, setIdentity] = useState<Identity | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const id = await getIdentity();
                if (active) setIdentity(id?.authenticated ? id : null);
            } catch (e) {
                console.error('Failed to load identity', e);
                if (active) setIdentity(null);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, []);

    if (loading) {
        return (
            <div className="page-wide px-4 py-8 space-y-6">
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-96 w-full" />
            </div>
        );
    }

    if (!identity) {
        return (
            <div className="max-w-md mx-auto my-12 p-8 bg-white border border-slate-200 rounded-xl text-center space-y-6 shadow-sm">
                <div className="mx-auto w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-indigo-600" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900">{t('profile.loginRequired')}</h1>
                <p className="text-slate-500 text-sm">{t('profile.loginRequiredDesc')}</p>
                <button
                    onClick={() => window.location.href = '/'}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold transition-colors"
                >
                    {t('profile.backToHomeToLogin')}
                </button>
            </div>
        );
    }

    if (!canUsePersonalPage(identity)) {
        return (
            <div className="max-w-md mx-auto my-12 p-8 bg-white border border-slate-200 rounded-xl text-center space-y-6 shadow-sm">
                <div className="mx-auto w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center">
                    <ShieldAlert className="w-6 h-6 text-amber-600" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900">{t('profile.restrictedTitle')}</h1>
                <p className="text-slate-500 text-sm">{t('profile.restrictedDesc')}</p>
                <button
                    onClick={() => window.location.href = '/'}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold transition-colors"
                >
                    {t('profile.backToHomeToLogin')}
                </button>
            </div>
        );
    }

    return (
        <div className="page-wide px-4 py-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-2xl font-bold text-slate-900">{t('profileChanges.title')}</h1>
                <BackButton variant="labelled" href="/profilo" label={t('profileChanges.backToNotebook')} />
            </div>
            <ProfileChangeReflection lang={lang} />
        </div>
    );
}
