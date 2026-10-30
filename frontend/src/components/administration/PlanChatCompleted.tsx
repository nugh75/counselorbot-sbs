"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n-context";
import { administrationStepText } from "@/lib/i18n-administration-steps";
import { Card } from "@/components/ui/Card";
import { PlanActivityReview } from './PlanActivityReview';

// Same final choices as the chat started from the home, with the way back to the plan.
export function PlanChatCompleted({ sessionId, questionnaireType, embedded = false }: { sessionId: string; questionnaireType: string; embedded?: boolean }) {
  const { lang, t } = useI18n();
  return <div className="max-w-xl mx-auto">
    <Card className="p-8 text-center space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink">{t('completed.title')}</h2>
        <p className="text-ink-muted mt-2">{t('completed.body1')} <strong>{questionnaireType}</strong>.</p>
      </div>
      <PlanActivityReview sessionId={sessionId} instrument={questionnaireType} />
      {!embedded && <Link href="/profilo/piani-operativi"
        className="inline-flex min-h-control w-full items-center justify-center rounded-control border border-line-strong bg-surface px-6 py-4 text-sm font-semibold text-ink-body hover:bg-surface-sunken">
        {administrationStepText(lang, 'back')}
      </Link>}
    </Card>
  </div>;
}
