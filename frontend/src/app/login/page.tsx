'use client';

import { useEffect, useState } from 'react';
import { ai4authLoginUrl, getIdentity, isLocalAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { Card } from '@/components/ui/Card';

// Accesso all'app. In produzione resta il redirect ad ai4auth (comportamento
// invariato). Con il fornitore locale (guscio desktop, ADR-0002 §3.3) non si
// esce mai da questo host: se la sessione `cb_session` e' valida si entra
// nell'area docente, altrimenti si spiega come aprire il link monouso.
export default function LoginPage() {
    const { t } = useI18n();
    const [localWithoutSession, setLocalWithoutSession] = useState(false);

    useEffect(() => {
        if (!isLocalAuth()) {
            window.location.replace(ai4authLoginUrl('/admin'));
            return;
        }
        let active = true;
        getIdentity()
            .then((identity) => {
                if (!active) return;
                if (identity?.authenticated) {
                    window.location.replace('/docente');
                    return;
                }
                setLocalWithoutSession(true);
            })
            .catch(() => { if (active) setLocalWithoutSession(true); });
        return () => { active = false; };
    }, []);

    if (!localWithoutSession) return null;

    return (
        <section className="page-narrow py-16">
            <Card className="p-8 text-center">
                <h1 className="text-2xl font-semibold text-ink">{t('localAuth.login.title')}</h1>
                <p className="mt-4 text-sm leading-relaxed text-ink-muted">{t('localAuth.login.body')}</p>
            </Card>
        </section>
    );
}
