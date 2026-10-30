'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';
import { getRealIdentity } from '@/lib/auth';
import { canUseResearchConsole } from '@/lib/roles';
import { useI18n } from '@/lib/i18n-context';
import { AdminChatSandbox } from '@/components/admin/AdminChatSandbox';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

function PreviewChatContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { t } = useI18n();

    const instrumentCode = searchParams?.get('instrument') || '';
    const [authState, setAuthState] = useState<'loading' | 'admin' | 'forbidden'>('loading');

    useEffect(() => {
        getRealIdentity().then((id) => {
            setAuthState(id?.authenticated && (id.is_admin || canUseResearchConsole(id)) ? 'admin' : 'forbidden');
        });
    }, []);

    if (authState === 'loading') {
        return (
            <div className="min-h-screen flex items-center justify-center text-ink-muted">
                <Loader2 className="w-6 h-6 animate-spin text-brand" />
            </div>
        );
    }

    if (authState === 'forbidden') {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-surface-sunken">
                <Card className="max-w-md w-full p-8 text-center space-y-4">
                    <div className="mx-auto w-12 h-12 bg-danger-soft rounded-lg flex items-center justify-center">
                        <ShieldAlert className="w-6 h-6 text-danger" />
                    </div>
                    <h2 className="text-xl font-semibold text-ink">{t('admin.forbidden.title')}</h2>
                    <p className="text-ink-muted text-sm">
                        {t('admin.forbidden.body')}
                    </p>
                    <Button
                        onClick={() => router.push('/')}
                        className="w-full"
                    >
                        {t('admin.forbidden.cta')}
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-surface-raised flex flex-col p-2 sm:p-4 md:p-6">
            <div className="w-full max-w-6xl mx-auto flex-1 flex flex-col bg-surface rounded-card shadow-card border border-line overflow-hidden min-h-[85vh]">
                <AdminChatSandbox
                    instrumentCode={instrumentCode}
                    onClose={() => router.push(`/admin?tab=promptExperiments&instrument=${encodeURIComponent(instrumentCode)}`)}
                    isModal={false}
                />
            </div>
        </main>
    );
}

export default function PreviewChatPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center text-ink-muted">
                    <Loader2 className="w-6 h-6 animate-spin text-brand" />
                </div>
            }
        >
            <PreviewChatContent />
        </Suspense>
    );
}
