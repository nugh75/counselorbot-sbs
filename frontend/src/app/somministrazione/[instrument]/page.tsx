'use client';

import { useParams } from 'next/navigation';
import { QuestionnaireRunner } from '@/components/administration/QuestionnaireRunner';
import { useUserAccess } from '@/lib/use-user-access';
import { isToolAllowed } from '@/lib/user-access';
import { useI18n } from '@/lib/i18n-context';
import { PreviousPageButton } from '@/components/ui/PreviousPageButton';

// La lingua non sta piu' nell'URL: e' quella dell'interfaccia. Se lo strumento
// non e' certificato in quella lingua, il runner lo dice invece di ripiegare.
export default function AdministrationPage() {
    const params = useParams<{ instrument: string }>();
    const { t } = useI18n();
    const { access, loading } = useUserAccess();

    if (loading) {
        return (
            <div className="max-w-xl mx-auto glass-panel p-8 text-center space-y-4">
                <p className="text-sm text-slate-500" role="status">{t('base.catalog.loading')}</p>
            </div>
        );
    }

    if (access?.restricted && !isToolAllowed(access, params.instrument)) {
        return (
            <div className="max-w-xl mx-auto glass-panel p-8 text-center space-y-4">
                <h1 className="text-xl font-bold text-slate-900">{t('detail.disabledForClass.title')}</h1>
                <p className="text-slate-600">{t('detail.disabledForClass.body')}</p>
                <div className="flex items-center justify-center gap-3">
                    <PreviousPageButton fallbackHref="/?view=questionnaires" />
                </div>
            </div>
        );
    }

    return <QuestionnaireRunner instrument={params.instrument} />;
}
