'use client';

import { cn } from '@/lib/utils';
import { QUESTIONNAIRE_LIST, QuestionnaireType, QuestionnaireConfig } from '@/lib/questionnaires';
import { ChevronRight, ClipboardList } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

const ACTIVE_QUESTIONNAIRES: QuestionnaireType[] = ['QSA', 'ZTPI', 'SAVICKAS'];

interface QuestionnaireSelectorProps {
    onSelect: (questionnaire: QuestionnaireConfig) => void;
}

export function QuestionnaireSelector({ onSelect }: QuestionnaireSelectorProps) {
    const { t } = useI18n();
    return (
        <div className="space-y-6">
            <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto rounded-full bg-blue-100 flex items-center justify-center mb-4">
                    <ClipboardList className="w-8 h-8 text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800">{t('selector.title')}</h2>
                <p className="text-slate-500 mt-2">{t('selector.subtitle')}</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {QUESTIONNAIRE_LIST.map((q) => {
                    const isActive = ACTIVE_QUESTIONNAIRES.includes(q.id);
                    const fullName = isActive ? t(`q.${q.id}.fullName`) : q.fullName;
                    const description = isActive ? t(`q.${q.id}.description`) : q.description;
                    return (
                        <button
                            key={q.id}
                            onClick={() => onSelect(q)}
                            className={cn(
                                "group glass-panel glass-panel-hover p-5 rounded-xl text-left transition-all",
                                "hover:shadow-lg hover:scale-[1.02]",
                                !isActive && "opacity-70"
                            )}
                        >
                            <div className="flex items-start gap-4">
                                <div className={cn(
                                    "w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0",
                                    q.color.replace('bg-', 'bg-opacity-20 bg-'),
                                )}>
                                    {q.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-slate-800">{q.name}</h3>
                                        {isActive ? (
                                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">
                                                {t('selector.active')}
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-full">
                                                {t('selector.soon')}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                                        {fullName}
                                    </p>
                                    <p className="text-[11px] text-slate-400 mt-2 line-clamp-2">
                                        {description}
                                    </p>
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0 mt-1" />
                            </div>
                        </button>
                    );
                })}
            </div>

            <p className="text-center text-xs text-slate-400 mt-6">
                {t('selector.footer')}
            </p>
        </div>
    );
}
