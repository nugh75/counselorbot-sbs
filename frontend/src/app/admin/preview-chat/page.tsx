'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ShieldAlert } from 'lucide-react';
import { getRealIdentity } from '@/lib/auth';
import { canUseResearchConsole } from '@/lib/roles';
import { useI18n } from '@/lib/i18n-context';
import { AdminChatSandbox } from '@/components/admin/AdminChatSandbox';

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
            <div className="min-h-screen flex items-center justify-center text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
        );
    }

    if (authState === 'forbidden') {
        return (
            <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
                <div className="max-w-md w-full bg-white border border-slate-200 p-8 rounded-lg text-center space-y-4 shadow-sm">
                    <div className="mx-auto w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
                        <ShieldAlert className="w-6 h-6 text-red-600" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">{t('admin.forbidden.title')}</h2>
                    <p className="text-slate-500 text-sm">
                        {t('admin.forbidden.body')}
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium transition-colors"
                    >
                        {t('admin.forbidden.cta')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-slate-100 flex flex-col p-2 sm:p-4 md:p-6">
            <div className="w-full max-w-6xl mx-auto flex-1 flex flex-col bg-white rounded-xl shadow-md border border-slate-200 overflow-hidden min-h-[85vh]">
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
                <div className="min-h-screen flex items-center justify-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                </div>
            }
        >
            <PreviewChatContent />
        </Suspense>
    );
}
