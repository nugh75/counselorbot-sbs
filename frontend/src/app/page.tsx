'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { QuestionnaireConfig, QUESTIONNAIRES } from '@/lib/questionnaires';
import { QuestionnaireSelector } from '@/components/questionnaire/QuestionnaireSelector';
import { InputMethodSelector } from '@/components/qsa/InputMethodSelector';
import { ScoreInputForm } from '@/components/qsa/ScoreInputForm';
import { PDFUploader } from '@/components/qsa/PDFUploader';
import { ProfileVisualization } from '@/components/qsa/ProfileVisualization';
import { GuidedChatInterface } from '@/components/qsa/GuidedChatInterface';
import { ArrowLeft, MessageSquare, RotateCcw, LogOut } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

type Step = 'questionnaire-select' | 'method-select' | 'manual-input' | 'upload-input' | 'dashboard' | 'interaction' | 'completed';

export default function Home() {
    const { t } = useI18n();
    const [step, setStep] = useState<Step>('questionnaire-select');
    const [selectedQuestionnaire, setSelectedQuestionnaire] = useState<QuestionnaireConfig | null>(null);
    const [scores, setScores] = useState<Record<string, number> | null>(null);
    const [sessionId, setSessionId] = useState<string>('');
    const handleQuestionnaireSelect = (questionnaire: QuestionnaireConfig) => {
        setSelectedQuestionnaire(questionnaire);
        if (questionnaire.id === 'SAVICKAS') {
            setScores({});
            setSessionId(generateUUID());
            setStep('interaction');
            return;
        }
        setStep('method-select');
    };

    const handleMethodSelect = (method: 'manual' | 'upload') => {
        setStep(method === 'manual' ? 'manual-input' : 'upload-input');
    };

    const handleScoresSubmit = (data: Record<string, number>) => {
        setScores(data);
        setStep('dashboard');
    };

    const handleUploadComplete = (data: any) => {
        setScores(data);
        setStep('manual-input');
    };

    // Safe UUID generation that works in HTTP (non-secure) contexts
    const generateUUID = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    };

    const startInteraction = async () => {
        const newSessionId = generateUUID();
        setSessionId(newSessionId);

        // Log Audit
        try {
            await fetch('/api/qsa/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scores: scores,
                    session_id: newSessionId,
                    questionnaire_type: selectedQuestionnaire?.id || 'QSA',
                }),
            });
        } catch (e) {
            console.error("Failed to log audit", e);
        }

        setStep('interaction');
    };

    const handleInteractionComplete = () => {
        setStep('completed');
    };

    const analyzeAnother = () => {
        setScores(null);
        setSelectedQuestionnaire(null);
        setStep('questionnaire-select');
    };

    const goBack = () => {
        if (step === 'method-select') setStep('questionnaire-select');
        else if (step === 'manual-input' || step === 'upload-input') setStep('method-select');
        else if (step === 'dashboard') setStep('manual-input');
        else if (step === 'interaction') setStep(selectedQuestionnaire?.id === 'SAVICKAS' ? 'questionnaire-select' : 'dashboard');
        else if (step === 'completed') setStep('dashboard');
    };

    const getStepTitle = () => {
        switch (step) {
            case 'questionnaire-select': return 'CounselorBot';
            case 'method-select': return `${selectedQuestionnaire?.name} — ${t('step.methodSelect.titleSuffix')}`;
            case 'manual-input': return t('step.manualInput.title');
            case 'upload-input': return t('step.uploadInput.title');
            case 'dashboard': return t('step.dashboard.title');
            case 'interaction': return selectedQuestionnaire?.id === 'SAVICKAS' ? t('step.interaction.title.savickas') : t('step.interaction.title.guided');
            case 'completed': return t('step.completed.title');
            default: return 'CounselorBot';
        }
    };

    const getStepDescription = () => {
        switch (step) {
            case 'questionnaire-select': return t('step.questionnaireSelect.desc');
            case 'method-select': return t('step.methodSelect.desc');
            case 'manual-input': return t('step.manualInput.desc');
            case 'upload-input': return t('step.uploadInput.desc');
            case 'dashboard': return `${t('step.dashboard.descPrefix')} ${selectedQuestionnaire?.name}`;
            case 'interaction':
                return selectedQuestionnaire?.id === 'SAVICKAS'
                    ? t('step.interaction.desc.savickas')
                    : `${t('step.interaction.desc.guidedPrefix')} ${selectedQuestionnaire?.name}`;
            case 'completed': return t('step.completed.desc');
            default: return '';
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                {step !== 'questionnaire-select' && step !== 'completed' && (
                    <button onClick={goBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <ArrowLeft className="w-6 h-6 text-slate-600" />
                    </button>
                )}
                <div>
                    <h1 className="text-3xl font-bold text-slate-800">{getStepTitle()}</h1>
                    <p className="text-slate-500">{getStepDescription()}</p>
                </div>

            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={step}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                >
                    {/* Step: Questionnaire Selection */}
                    {step === 'questionnaire-select' && (
                        <>
                            <QuestionnaireSelector onSelect={handleQuestionnaireSelect} />

                            <div className="flex justify-center pt-8 border-t border-slate-200/60 mt-8">
                                <Link
                                    href="/questionario"
                                    className="group flex items-center gap-3 px-6 py-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-300 rounded-xl transition-all shadow-sm hover:shadow-md"
                                >
                                    <span className="text-xl">📝</span>
                                    <div className="text-left">
                                        <div className="text-sm font-semibold text-slate-700 group-hover:text-blue-700 transition-colors">
                                            {t('feedback.cta.title')}
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {t('feedback.cta.sub')}
                                        </div>
                                    </div>
                                </Link>
                            </div>
                        </>
                    )}

                    {/* Step: Input Method Selection */}
                    {step === 'method-select' && selectedQuestionnaire && (
                        <InputMethodSelector onSelect={handleMethodSelect} questionnaire={selectedQuestionnaire} />
                    )}

                    {/* Step: Manual Input */}
                    {step === 'manual-input' && selectedQuestionnaire && (
                        <ScoreInputForm questionnaire={selectedQuestionnaire} onSubmit={handleScoresSubmit} initialScores={scores || undefined} />
                    )}

                    {/* Step: PDF Upload */}
                    {step === 'upload-input' && (
                        <PDFUploader onUploadComplete={handleUploadComplete} />
                    )}

                    {/* Step: Dashboard with Profile */}
                    {step === 'dashboard' && scores && selectedQuestionnaire && (
                        <div className="space-y-8 animate-fade-in-up">
                            <ProfileVisualization scores={scores} questionnaire={selectedQuestionnaire} />

                            <div className="flex justify-center pt-8">
                                <div className="glass-panel p-8 rounded-2xl text-center max-w-lg space-y-6">
                                    <div className="w-16 h-16 mx-auto rounded-full bg-blue-100 flex items-center justify-center">
                                        <MessageSquare className="w-8 h-8 text-blue-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold text-slate-800">{t('dashboard.ready.title')}</h3>
                                        <p className="text-slate-500 mt-2">
                                            {t('dashboard.ready.sub')}
                                        </p>
                                    </div>
                                    <button
                                        onClick={startInteraction}
                                        className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                                    >
                                        <MessageSquare className="w-5 h-5" />
                                        {t('dashboard.ready.btn')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step: Guided Chat Interaction */}
                    {step === 'interaction' && scores && selectedQuestionnaire && (
                        <GuidedChatInterface
                            scores={scores}
                            questionnaireType={selectedQuestionnaire.id}
                            onComplete={handleInteractionComplete}
                            sessionId={sessionId}
                        />
                    )}

                    {/* Step: Completed - Ask for another analysis */}
                    {step === 'completed' && (
                        <div className="max-w-xl mx-auto">
                            <div className="glass-panel p-8 rounded-2xl text-center space-y-6">
                                <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                                    <span className="text-4xl">🎉</span>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-800">{t('completed.title')}</h2>
                                    <p className="text-slate-500 mt-3">
                                        {t('completed.body1')} <strong>{selectedQuestionnaire?.name}</strong>.
                                        <br />
                                        {t('completed.body2')}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-4">
                                    <button
                                        onClick={analyzeAnother}
                                        className="py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                                    >
                                        <RotateCcw className="w-5 h-5" />
                                        {t('completed.another')}
                                    </button>
                                    <button
                                        onClick={() => setStep('questionnaire-select')}
                                        className="py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                                    >
                                        <LogOut className="w-5 h-5" />
                                        {t('completed.end')}
                                    </button>
                                </div>

                                <div className="pt-4 border-t border-slate-100">
                                    <p className="text-sm text-slate-400 mb-3">
                                        {t('completed.thanks')}
                                    </p>
                                    <a
                                        href="/questionario"
                                        className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                                    >
                                        {t('completed.feedbackLink')}
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
