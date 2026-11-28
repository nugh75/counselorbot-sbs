'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { PreviousPageButton } from '@/components/ui/PreviousPageButton';
import { ForwardButton } from '@/components/ui/ForwardButton';
import { ButtonLink } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import ToolIllustration from '@/components/ui/ToolIllustration';
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
import { instrumentStartHref } from '@/lib/home-entry';
import { STRATEGIC_COMPETENCES_URLS, STRATEGIC_COMPETENCES_CODE, STRATEGIC_COMPETENCES_PASSWORD } from '@/lib/questionnaire-sources';
import { RIASEC_CREDIT_EN, riasecText } from '@/lib/i18n-riasec';

const STATIC_AVAILABLE_INSTRUMENTS: QuestionnaireType[] = ['QSA', 'QSAr', 'QPCS', 'QPCC', 'ZTPI', 'QAP', 'SAVICKAS', 'EVENTO_STUDIO', 'EVENTO_PROFESSIONALE', 'OBIETTIVO_STUDIO', 'OBIETTIVO_DOCENZA', 'IDEA'];
const QUESTIONNAIRE_SELECTION_HREF = '/profilo';

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
            <PreviousPageButton fallbackHref={QUESTIONNAIRE_SELECTION_HREF} />

            <section className="flex flex-wrap items-center gap-6">
                <ToolIllustration id={questionnaire.id} category={questionnaire.agentOnly ? 'guided' : 'assessment'} className="h-28 w-28 shrink-0 object-contain" />
                <div className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-link">{t('detail.kicker')}</span>
                    <h1 className="font-display mt-1 text-2xl font-semibold text-ink">{tf(`q.${questionnaire.id}.name`, questionnaire.name)}</h1>
                    <p className="mt-1 text-lg text-ink-body">{tf(`q.${questionnaire.id}.fullName`, questionnaire.fullName)}</p>
                    <p className="mt-4 text-ink-muted leading-relaxed">{tf(`q.${questionnaire.id}.description`, questionnaire.description)}</p>
                </div>
            </section>

            {/* Start and "Compila sul sito" live here, not in the Student area list (#864). */}
            <div className="flex flex-wrap items-center gap-4">
                <ForwardButton href={instrumentStartHref(questionnaire.id, true)} label={t(questionnaire.agentOnly ? 'base.instrument.startPath' : 'base.instrument.analyze')} />
                {assessmentUrl && !questionnaire.agentOnly && (
                    <ButtonLink href={assessmentUrl} target="_blank" rel="noopener noreferrer" variant="secondary">
                        {t('selector.openStrategic')}<ExternalLink className="h-4 w-4" />
                    </ButtonLink>
                )}
            </div>

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
                <Callout variant="warning">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center">
                        <div className="flex-1">
                            <h2 className="font-semibold">
                                {t('detail.assessment.inapp.title')}
                            </h2>
                            <p className="mt-1 leading-relaxed">
                                {t('detail.assessment.inapp.body')}
                            </p>
                        </div>
                        <ButtonLink
                            href={`/somministrazione/${id}`}
                            variant="accent"
                            className="shrink-0"
                        >
                            {t('detail.assessment.inapp.link')}
                        </ButtonLink>
                    </div>
                </Callout>
            )}

            {assessmentUrl && (
                <Callout variant="info">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center">
                        <div className="flex-1">
                            <h2 className="font-semibold">{t('detail.assessment.title')}</h2>
                            <p className="mt-1 leading-relaxed">{t('detail.assessment.body')}</p>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row md:flex-col shrink-0">
                            <p>
                                {t('detail.assessment.codeLabel')}: <strong className="font-mono text-lg">{STRATEGIC_COMPETENCES_CODE}</strong>
                            </p>
                            <p>
                                {t('detail.assessment.passwordLabel')}: <strong className="font-mono text-lg">{STRATEGIC_COMPETENCES_PASSWORD}</strong>
                            </p>
                            <ButtonLink
                                href={assessmentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                variant="secondary"
                            >
                                {t('detail.assessment.link')}
                                <ExternalLink className="w-4 h-4" />
                            </ButtonLink>
                        </div>
                    </div>
                </Callout>
            )}

            {id === 'RIASEC' && (
                <section className="border-t border-line pt-6" aria-label={riasecText(lang, 'credit.heading')}>
                    <h2 className="text-sm font-semibold text-ink-muted">{riasecText(lang, 'credit.heading')}</h2>
                    <p className="mt-2 max-w-3xl text-xs leading-relaxed text-ink-muted">{RIASEC_CREDIT_EN}</p>
                </section>
            )}

            <section className="border-t border-line pt-6">
                <p className="text-sm text-ink">{t('detail.ready')}</p>
            </section>
        </div>
    );
}
