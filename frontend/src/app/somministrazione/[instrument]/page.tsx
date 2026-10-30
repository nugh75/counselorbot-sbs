'use client';

import { useParams } from 'next/navigation';
import { QuestionnaireRunner } from '@/components/administration/QuestionnaireRunner';
import { useUserAccess } from '@/lib/use-user-access';
import { isToolAllowed } from '@/lib/user-access';
import { useI18n } from '@/lib/i18n-context';
import { PreviousPageButton } from '@/components/ui/PreviousPageButton';
import { Card } from '@/components/ui/Card';

// La lingua non sta piu' nell'URL: e' quella dell'interfaccia. Se lo strumento
// non e' certificato in quella lingua, il runner lo dice invece di ripiegare.
export default function AdministrationPage() {
    const params = useParams<{ instrument: string }>();
    const { t } = useI18n();
    const { access, loading } = useUserAccess();

    if (loading) {
        return (
            <Card className="max-w-xl mx-auto p-8 text-center space-y-4">
                <p className="text-sm text-ink-muted" role="status">{t('base.catalog.loading')}</p>
            </Card>
        );
    }

    if (access?.restricted && !isToolAllowed(access, params.instrument)) {
        return (
            <Card className="max-w-xl mx-auto p-8 text-center space-y-4">
                <h1 className="text-2xl font-semibold text-ink">{t('detail.disabledForClass.title')}</h1>
                <p className="text-ink-muted">{t('detail.disabledForClass.body')}</p>
                <div className="flex items-center justify-center gap-4">
                    <PreviousPageButton fallbackHref="/?view=home" />
                </div>
            </Card>
        );
    }

    return <QuestionnaireRunner instrument={params.instrument} />;
}
