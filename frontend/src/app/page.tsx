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

type Step = 'questionnaire-select' | 'method-select' | 'manual-input' | 'upload-input' | 'dashboard' | 'interaction' | 'completed';

export default function Home() {
    const [step, setStep] = useState<Step>('questionnaire-select');
    const [selectedQuestionnaire, setSelectedQuestionnaire] = useState<QuestionnaireConfig | null>(null);
    const [scores, setScores] = useState<Record<string, number> | null>(null);
    const [sessionId, setSessionId] = useState<string>('');

    const handleQuestionnaireSelect = (questionnaire: QuestionnaireConfig) => {
        setSelectedQuestionnaire(questionnaire);
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
            await fetch('/counselorbot/api/qsa/audit', {
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
        else if (step === 'interaction') setStep('dashboard');
        else if (step === 'completed') setStep('dashboard');
    };

    const getStepTitle = () => {
        switch (step) {
            case 'questionnaire-select': return 'CounselorBot';
            case 'method-select': return `${selectedQuestionnaire?.name} - Inserimento Dati`;
            case 'manual-input': return 'Inserimento Punteggi';
            case 'upload-input': return 'Caricamento Documento';
            case 'dashboard': return 'Il Tuo Profilo';
            case 'interaction': return 'Consulenza Guidata';
            case 'completed': return 'Analisi Completata';
            default: return 'CounselorBot';
        }
    };

    const getStepDescription = () => {
        switch (step) {
            case 'questionnaire-select': return 'Scegli quale questionario analizzare';
            case 'method-select': return 'Come vuoi inserire i punteggi?';
            case 'manual-input': return 'Inserisci i punteggi da 1 a 9 per ogni fattore';
            case 'upload-input': return "L'IA estrarrà automaticamente i dati";
            case 'dashboard': return `Profilo ${selectedQuestionnaire?.name}`;
            case 'interaction': return `Analisi guidata ${selectedQuestionnaire?.name}`;
            case 'completed': return 'Grazie per aver utilizzato CounselorBot!';
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
                                            Lascia un Feedback
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            Aiutaci a migliorare CounselorBot
                                        </div>
                                    </div>
                                </Link>
                            </div>
                        </>
                    )}

                    {/* Step: Input Method Selection */}
                    {step === 'method-select' && (
                        <InputMethodSelector onSelect={handleMethodSelect} />
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
                                        <h3 className="text-xl font-semibold text-slate-800">Pronto per l'analisi?</h3>
                                        <p className="text-slate-500 mt-2">
                                            Inizia una consulenza guidata in tre fasi con CounselorBot.
                                        </p>
                                    </div>
                                    <button
                                        onClick={startInteraction}
                                        className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                                    >
                                        <MessageSquare className="w-5 h-5" />
                                        Inizia Interazione Guidata
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
                                    <h2 className="text-2xl font-bold text-slate-800">Analisi Completata!</h2>
                                    <p className="text-slate-500 mt-3">
                                        Hai concluso l'analisi del questionario <strong>{selectedQuestionnaire?.name}</strong>.
                                        <br />
                                        Vuoi analizzare un altro questionario?
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-4 pt-4">
                                    <button
                                        onClick={analyzeAnother}
                                        className="py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                                    >
                                        <RotateCcw className="w-5 h-5" />
                                        Altro Questionario
                                    </button>
                                    <button
                                        onClick={() => setStep('questionnaire-select')}
                                        className="py-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                                    >
                                        <LogOut className="w-5 h-5" />
                                        Termina Sessione
                                    </button>
                                </div>

                                <div className="pt-4 border-t border-slate-100">
                                    <p className="text-sm text-slate-400 mb-3">
                                        Grazie per aver utilizzato CounselorBot! 👋
                                    </p>
                                    <a
                                        href="/questionario"
                                        className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                                    >
                                        📝 Lascia un feedback sulla tua esperienza
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
