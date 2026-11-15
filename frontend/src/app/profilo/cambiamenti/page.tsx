'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { PersonalAreaHeader } from '@/components/profile/PersonalAreaHeader';
import { getIdentity, type Identity } from '@/lib/auth';
import { canUsePersonalPage } from '@/lib/roles';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
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
            <Card variant="flat" className="mx-auto my-12 max-w-md space-y-6 text-center">
                <h1 className="text-2xl font-semibold text-ink">{t('profile.loginRequired')}</h1>
                <Callout variant="info" className="text-left">{t('profile.loginRequiredDesc')}</Callout>
                <Button className="w-full" onClick={() => window.location.href = '/'}>
                    {t('profile.backToHomeToLogin')}
                </Button>
            </Card>
        );
    }

    if (!canUsePersonalPage(identity)) {
        return (
            <Card variant="flat" className="mx-auto my-12 max-w-md space-y-6 text-center">
                <h1 className="text-2xl font-semibold text-ink">{t('profile.restrictedTitle')}</h1>
                <Callout variant="warning" className="text-left">{t('profile.restrictedDesc')}</Callout>
                <Button className="w-full" onClick={() => window.location.href = '/'}>
                    {t('profile.backToHomeToLogin')}
                </Button>
            </Card>
        );
    }

    return (
        <div className="page-wide px-4 py-8 space-y-6">
            <PersonalAreaHeader slug="cambiamenti" />
            <ProfileChangeReflection lang={lang} />
        </div>
    );
}
