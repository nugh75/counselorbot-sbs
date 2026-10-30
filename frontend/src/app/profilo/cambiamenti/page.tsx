'use client';

import { useEffect, useState } from 'react';
import { User, ShieldAlert } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { PageHeader } from '@/components/ui/PageHeader';
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
            <div className="max-w-md mx-auto my-12 p-8 bg-surface border border-line rounded-card text-center space-y-6 shadow-card">
                <div className="mx-auto w-12 h-12 bg-brand-soft rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-link" />
                </div>
                <h1 className="text-2xl font-semibold text-ink">{t('profile.loginRequired')}</h1>
                <p className="text-ink-muted text-sm">{t('profile.loginRequiredDesc')}</p>
                <button
                    onClick={() => window.location.href = '/'}
                    className="w-full min-h-control py-2 bg-brand hover:bg-brand-hover text-ink-on-brand rounded-control font-semibold transition-colors"
                >
                    {t('profile.backToHomeToLogin')}
                </button>
            </div>
        );
    }

    if (!canUsePersonalPage(identity)) {
        return (
            <div className="max-w-md mx-auto my-12 p-8 bg-surface border border-line rounded-card text-center space-y-6 shadow-card">
                <div className="mx-auto w-12 h-12 bg-warning-soft rounded-full flex items-center justify-center">
                    <ShieldAlert className="w-6 h-6 text-warning" />
                </div>
                <h1 className="text-2xl font-semibold text-ink">{t('profile.restrictedTitle')}</h1>
                <p className="text-ink-muted text-sm">{t('profile.restrictedDesc')}</p>
                <button
                    onClick={() => window.location.href = '/'}
                    className="w-full min-h-control py-2 bg-brand hover:bg-brand-hover text-ink-on-brand rounded-control font-semibold transition-colors"
                >
                    {t('profile.backToHomeToLogin')}
                </button>
            </div>
        );
    }

    return (
        <div className="page-wide px-4 py-8 space-y-6">
            <PageHeader backHref="/profilo/taccuino" title={t('profileChanges.title')} />
            <ProfileChangeReflection lang={lang} />
        </div>
    );
}
