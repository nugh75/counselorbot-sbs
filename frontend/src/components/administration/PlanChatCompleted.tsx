"use client";
import Link from "next/link";
import { useI18n } from "@/lib/i18n-context";
import { administrationStepText } from "@/lib/i18n-administration-steps";
import { PlanActivityReview } from './PlanActivityReview';

// Same final choices as the chat started from the home, with the way back to the plan.
export function PlanChatCompleted({ sessionId, questionnaireType, embedded = false }: { sessionId: string; questionnaireType: string; embedded?: boolean }) {
  const { lang, t } = useI18n();
  return <div className="max-w-xl mx-auto">
    <div className="glass-panel p-8 text-center space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">{t('completed.title')}</h2>
        <p className="text-slate-500 mt-2">{t('completed.body1')} <strong>{questionnaireType}</strong>.</p>
      </div>
      <PlanActivityReview sessionId={sessionId} instrument={questionnaireType} />
      {!embedded && <Link href="/profilo/piani-operativi"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
        {administrationStepText(lang, 'back')}
      </Link>}
    </div>
  </div>;
}
