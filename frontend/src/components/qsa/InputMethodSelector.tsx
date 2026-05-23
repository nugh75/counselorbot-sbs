'use client';

import { FileText, Keyboard, ArrowRight, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuestionnaireConfig } from '@/lib/questionnaires';
import { useI18n } from '@/lib/i18n-context';

interface InputMethodSelectorProps {
    onSelect: (method: 'manual' | 'upload') => void;
    questionnaire?: QuestionnaireConfig;
}

export function InputMethodSelector({ onSelect, questionnaire }: InputMethodSelectorProps) {
    const { t } = useI18n();
    const manualDescription = questionnaire
        ? t('method.manual.descTpl', { name: questionnaire.name, codes: questionnaire.factors.map(f => f.code).join(', ') })
        : t('method.manual.descNoQ');

    return (
        <div className="grid md:grid-cols-2 gap-6 w-full max-w-4xl mx-auto p-4">
            {/* Manual Entry Card */}
            <button
                onClick={() => onSelect('manual')}
                className="group relative flex flex-col items-center justify-center p-8 h-64 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-blue-500 hover:shadow-md transition-all text-left"
            >
                <div className="absolute top-4 right-4 p-2 rounded-full bg-slate-50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight className="w-5 h-5 text-blue-600" />
                </div>
                <div className="mb-6 p-4 rounded-full bg-blue-50 border border-blue-100 group-hover:scale-110 transition-transform duration-300">
                    <Keyboard className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-slate-900">{t('method.manual.title')}</h3>
                <p className="text-sm text-center text-slate-600 px-4">
                    {manualDescription}
                </p>
            </button>

            {/* Upload/AI Entry Card */}
            <button
                onClick={() => onSelect('upload')}
                className="group relative flex flex-col items-center justify-center p-8 h-64 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-purple-500 hover:shadow-md transition-all text-left"
            >
                <div className="absolute top-4 top-0 right-4 p-2 rounded-full bg-slate-50 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight className="w-5 h-5 text-purple-600" />
                </div>

                <div className="absolute top-4 left-4">
                    <span className="px-2 py-1 rounded text-xs font-medium bg-purple-50 text-purple-700 border border-purple-100">
                        {t('method.upload.badge')}
                    </span>
                </div>

                <div className="mb-6 p-4 rounded-full bg-purple-50 border border-purple-100 group-hover:scale-110 transition-transform duration-300">
                    <Upload className="w-8 h-8 text-purple-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-slate-900">{t('method.upload.title')}</h3>
                <p className="text-sm text-center text-slate-600 px-4">
                    {t('method.upload.desc')}
                </p>
            </button>
        </div>
    );
}
