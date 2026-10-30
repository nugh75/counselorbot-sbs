'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { PreviousPageButton } from '@/components/ui/PreviousPageButton';
import { ForwardButton } from '@/components/ui/ForwardButton';
import { Card } from '@/components/ui/Card';
import {
    QUESTIONNAIRES,
    QuestionnaireType,
    QuestionnaireConfig,
    buildDynamicQuestionnaireConfig,
} from '@/lib/questionnaires';
import { fetchInstruments } from '@/lib/instruments-api';
import { useUserAccess } from '@/lib/use-user-access';
import { isToolAllowed } from '@/lib/user-access';
import { useI18n } from '@/lib/i18n-context';
import { STRATEGIC_COMPETENCES_URLS, STRATEGIC_COMPETENCES_CODE, STRATEGIC_COMPETENCES_PASSWORD } from '@/lib/questionnaire-sources';

const STATIC_AVAILABLE_INSTRUMENTS: QuestionnaireType[] = ['QSA', 'QSAr', 'QPCS', 'QPCC', 'ZTPI', 'QAP', 'SAVICKAS', 'EVENTO_STUDIO', 'EVENTO_PROFESSIONALE', 'OBIETTIVO_STUDIO', 'OBIETTIVO_DOCENZA', 'IDEA'];
const QUESTIONNAIRE_SELECTION_HREF = '/?view=home';

export default function InstrumentDetailsPage() {
    const { t, tf, lang } = useI18n();
    const params = useParams<{ id: string }>();
    const id = params.id as QuestionnaireType;

    const staticConfig = QUESTIONNAIRES[id as keyof typeof QUESTIONNAIRES] ?? null;
    const [questionnaire, setQuestionnaire] = useState<QuestionnaireConfig | null>(staticConfig);
    const [loading, setLoading] = useState<boolean>(!staticConfig);
    const { access, loading: accessLoading } = useUserAccess();
    const assessmentUrl = lang === 'it' && id in STRATEGIC_COMPETENCES_URLS ? STRATEGIC_COMPETENCES_URLS[id] : undefined;
    // La somministrazione in-app compare solo se lo strumento e' certificato
    // nella lingua dell'interfaccia. Niente ripiego sull'inglese: il registro
    // decide, e una lingua non pronta si dice, non si sostituisce.
    const [availableLocales, setAvailableLocales] = useState<string[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchInstruments()
            .then((rows) => {
                if (cancelled) return;
                const found = rows.find((r) => r.code === id);
                if (found) {
                    setAvailableLocales(found.available_locales ?? []);
                    if (found.is_active === false) {
                        setQuestionnaire(null);
                    } else if (!staticConfig) {
                        setQuestionnaire(buildDynamicQuestionnaireConfig(found, lang));
                    }
                } else if (!staticConfig) {
                    setQuestionnaire(null);
                }
                setLoading(false);
            })
            .catch(() => {
                if (!cancelled) {
                    setAvailableLocales([]);
                    setLoading(false);
                }
            });
        return () => { cancelled = true; };
    }, [id, staticConfig, lang]);

    const inAppAvailable = availableLocales?.includes(lang) ?? false;
    const isClassDisabled = Boolean(access?.restricted && !isToolAllowed(access, id));

    if (loading || accessLoading) {
        return (
            <Card className="max-w-xl mx-auto p-8 text-center space-y-4">
                <p className="text-sm text-ink-muted" role="status">{t('base.catalog.loading')}</p>
            </Card>
        );
    }

    if (isClassDisabled) {
        return (
            <Card className="max-w-xl mx-auto p-8 text-center space-y-4">
                <h1 className="text-2xl font-semibold text-ink">{t('detail.disabledForClass.title')}</h1>
                <p className="text-ink-muted">{t('detail.disabledForClass.body')}</p>
                <div className="flex items-center justify-center gap-4">
                    <PreviousPageButton fallbackHref={QUESTIONNAIRE_SELECTION_HREF} />
                </div>
            </Card>
        );
    }

    if (!questionnaire) {
        return (
            <Card className="max-w-xl mx-auto p-8 text-center space-y-4">
                <h1 className="text-2xl font-semibold text-ink">{t('detail.unavailable.title')}</h1>
                <p className="text-ink-muted">{t('detail.unavailable.body')}</p>
                <div className="flex items-center justify-center gap-4">
                    <PreviousPageButton fallbackHref={QUESTIONNAIRE_SELECTION_HREF} />
                </div>
            </Card>
        );
    }

    return (
        <div className="page-narrow space-y-6">
            <div className="flex items-center gap-4">
                <PreviousPageButton fallbackHref={QUESTIONNAIRE_SELECTION_HREF} />
                <ForwardButton href={`/?start=${questionnaire.id}`} label={t('selector.start')} />
            </div>

            <Card as="section" className="sm:p-8">
                <span className="text-xs font-semibold text-link">{t('detail.kicker')}</span>
                <h1 className="font-display mt-1 text-2xl font-semibold text-ink">{tf(`q.${questionnaire.id}.name`, questionnaire.name)}</h1>
                <p className="mt-1 text-lg text-ink-body">{tf(`q.${questionnaire.id}.fullName`, questionnaire.fullName)}</p>
                <p className="mt-4 text-ink-muted leading-relaxed">{tf(`q.${questionnaire.id}.description`, questionnaire.description)}</p>
            </Card>

            <div className="grid md:grid-cols-3 gap-6">
                {(['focus', 'path', 'input'] as const).map((topic) => {
                    const fallbackText = topic === 'focus'
                        ? (questionnaire.description || t('detail.default.focus'))
                        : topic === 'path'
                        ? t('detail.default.path')
                        : (questionnaire.agentOnly ? t('detail.default.input.agent') : t('detail.default.input.assessment'));
                    return (
                        <div key={topic}>
                            <span className="block h-0.5 w-10 rounded-full bg-brand" />
                            <h2 className="mt-4 text-sm font-semibold text-ink-muted">
                                {t(`detail.${topic}.title`)}
                            </h2>
                            <p className="mt-2 text-sm text-ink-body leading-relaxed">
                                {tf(`detail.${questionnaire.id}.${topic}`, fallbackText)}
                            </p>
                        </div>
                    );
                })}
            </div>

            {inAppAvailable && (
                <section className="rounded-card border border-warning-line bg-warning-soft p-6 flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1">
                        <h2 className="font-semibold text-warning-ink">
                            {t('detail.assessment.inapp.title')}
                        </h2>
                        <p className="text-sm text-warning-ink mt-1 leading-relaxed">
                            {t('detail.assessment.inapp.body')}
                        </p>
                    </div>
                    <Link
                        href={`/somministrazione/${id}`}
                        className="inline-flex shrink-0 items-center justify-center min-h-control rounded-control bg-move px-4 py-2 text-sm font-semibold text-ink-on-brand hover:bg-move-hover transition-colors"
                    >
                        {t('detail.assessment.inapp.link')}
                    </Link>
                </section>
            )}

            {assessmentUrl && (
                <section className="rounded-card border border-info-line bg-info-soft p-6 flex flex-col md:flex-row md:items-center gap-4">
                    <div className="flex-1">
                        <h2 className="font-semibold text-ink">{t('detail.assessment.title')}</h2>
                        <p className="text-sm text-ink-body mt-1 leading-relaxed">{t('detail.assessment.body')}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0">
                        <div className="rounded-control border border-info-line bg-surface px-4 py-2 text-sm text-ink-body">
                            {t('detail.assessment.codeLabel')}: <strong className="text-lg text-ink">{STRATEGIC_COMPETENCES_CODE}</strong>
                        </div>
                        <div className="rounded-control border border-info-line bg-surface px-4 py-2 text-sm text-ink-body">
                            {t('detail.assessment.passwordLabel')}: <strong className="text-lg text-ink">{STRATEGIC_COMPETENCES_PASSWORD}</strong>
                        </div>
                        <a
                            href={assessmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center gap-2 min-h-control rounded-control border border-info-line bg-surface px-4 py-2 text-sm font-semibold text-info-ink hover:bg-brand-soft transition-colors"
                        >
                            {t('detail.assessment.link')}
                            <ExternalLink className="w-4 h-4" />
                        </a>
                    </div>
                </section>
            )}

            <section className="rounded-card bg-brand-soft border border-brand-line p-6">
                <p className="text-sm text-ink">{t('detail.ready')}</p>
            </section>
        </div>
    );
}
