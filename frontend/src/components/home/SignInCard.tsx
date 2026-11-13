'use client';

import { LogIn } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { FeedbackEntry } from '@/components/home/FeedbackEntry';
import { loginHref } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';

export function SignInCard({ returnPath }: { returnPath: string }) {
    const { t } = useI18n();
    return (
        <div className="page-narrow">
            <Card className="space-y-6 p-8 text-center">
                <div>
                    <h1 className="text-2xl font-semibold text-ink">{t('home.auth.title')}</h1>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t('home.auth.body')}</p>
                </div>
                <a
                    href={loginHref(returnPath)}
                    onClick={event => { event.currentTarget.href = loginHref(`${location.pathname}${location.search}${location.hash}`); }}
                    className="inline-flex min-h-control items-center gap-2 rounded-control bg-brand px-6 py-2 text-sm font-semibold text-ink-on-brand hover:bg-brand-hover"
                >
                    <LogIn className="h-4 w-4" aria-hidden="true" />
                    {t('home.auth.cta')}
                </a>
            </Card>
            <FeedbackEntry className="mt-6" />
        </div>
    );
}
