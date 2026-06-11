'use client';

// Strumento pQBL da PDF (pure Question-Based Learning, Jemstedt & Bälter 2025).
// Flusso: upload PDF + scelta dimensione → attesa generazione (polling) →
// onboarding → domande con feedback immediato (tentativi multipli ammessi) →
// riepilogo → test finale opzionale (submit unico, feedback alla fine).

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft, ArrowRight, BookOpen, CheckCircle2, FileType, Lightbulb,
    ListChecks, Loader2, RotateCcw, Target, UploadCloud, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';

type Phase = 'setup' | 'generating' | 'onboarding' | 'quiz' | 'summary' | 'final' | 'finalResults';

interface PqblOption { key: string; text: string; }
interface PqblQuestion {
    id: number;
    skill: string;
    position: number;
    question: string;
    options: PqblOption[];
}
interface PqblDocumentInfo {
    document_id: string;
    status: string;
    error_detail: string | null;
    filename: string | null;
    language: string;
    size: number;
    n_questions: number;
    n_total: number;
    chunks_total: number;
    chunks_done: number;
    skills: string[];
    onboarding_text: string;
}
interface AnswerResult { correct: boolean; feedback: string; first_try: boolean; }
interface SkillSummary { skill: string; total: number; answered: number; first_try_correct: number; }
interface SessionSummary {
    total_questions: number;
    answered_questions: number;
    first_try_correct: number;
    first_try_pct: number;
    by_skill: SkillSummary[];
    estimated_seconds: number;
}
interface FinalResultRow {
    question_id: number;
    skill: string;
    question: string;
    selected_key: string | null;
    correct: boolean;
    feedback: string;
}
interface FinalResult { score: number; total: number; results: FinalResultRow[]; }

const SESSION_SIZES = [10, 20, 30] as const;
const PQBL_PROVIDERS = [
    { value: '', label: 'Predefinito' },
    { value: 'gemini', label: 'Gemini' },
    { value: 'openrouter', label: 'OpenRouter' },
    { value: 'openai', label: 'OpenAI' },
] as const;
const POLL_INTERVAL_MS = 4000;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail ?? `Request failed (${res.status})`);
    }
    return res.json() as Promise<T>;
}

export default function PqblPage() {
    const { t, lang } = useI18n();
    const [phase, setPhase] = useState<Phase>('setup');
    const [size, setSize] = useState<number>(10);
    const [provider, setProvider] = useState<string>('');
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string>('');
    const [documentInfo, setDocumentInfo] = useState<PqblDocumentInfo | null>(null);
    const [questions, setQuestions] = useState<PqblQuestion[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    // feedback per opzione della domanda corrente: key -> risultato
    const [optionResults, setOptionResults] = useState<Record<string, AnswerResult>>({});
    const [lastSelected, setLastSelected] = useState<string>('');
    const [summary, setSummary] = useState<SessionSummary | null>(null);
    const [sessionId, setSessionId] = useState<string>('');
    const [finalSessionId, setFinalSessionId] = useState<string>('');
    const [finalQuestions, setFinalQuestions] = useState<PqblQuestion[]>([]);
    const [finalAnswers, setFinalAnswers] = useState<Record<number, string>>({});
    const [finalResult, setFinalResult] = useState<FinalResult | null>(null);
    const [finalWarning, setFinalWarning] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const quizPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const questionsLenRef = useRef(0);
    const sessionIdRef = useRef('');

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);
    const stopQuizPolling = useCallback(() => {
        if (quizPollRef.current) {
            clearInterval(quizPollRef.current);
            quizPollRef.current = null;
        }
    }, []);
    useEffect(() => { stopPolling(); stopQuizPolling(); }, [stopPolling, stopQuizPolling]);

    const startPolling = useCallback((documentId: string) => {
        stopPolling();
        pollRef.current = setInterval(async () => {
            try {
                const info = await fetchJson<PqblDocumentInfo>(`/api/pqbl/documents/${documentId}?lang=${lang}`);
                setDocumentInfo(info);  // aggiorna progress ogni tick
                if (info.status === 'ready') {
                    stopPolling();
                    setPhase('onboarding');
                } else if (info.status === 'error') {
                    stopPolling();
                    setError(info.error_detail ?? t('pqbl.error.title'));
                    setPhase('setup');
                }
            } catch {
                // errore transitorio di rete: il prossimo tick riprova
            }
        }, POLL_INTERVAL_MS);
    }, [stopPolling, t, lang]);

    const startUpload = async (file: File) => {
        setError('');
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('size', String(size));
            formData.append('language', lang);
            if (provider) formData.append('provider', provider);
            const data = await fetchJson<{ document_id: string; status: string }>(
                '/api/pqbl/upload', { method: 'POST', body: formData },
            );
            if (data.status === 'ready') {
                const info = await fetchJson<PqblDocumentInfo>(`/api/pqbl/documents/${data.document_id}?lang=${lang}`);
                setDocumentInfo(info);
                setPhase('onboarding');
            } else {
                setDocumentInfo({ document_id: data.document_id } as PqblDocumentInfo);
                setPhase('generating');
                startPolling(data.document_id);
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : t('pqbl.error.title'));
        } finally {
            setIsUploading(false);
        }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') setIsDragging(true);
        else if (e.type === 'dragleave') setIsDragging(false);
    };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) startUpload(file);
    };

    const pollNewQuestions = useCallback(async (sid: string, docId: string) => {
        try {
            const doc = await fetchJson<PqblDocumentInfo>(`/api/pqbl/documents/${docId}?lang=${lang}`);
            if (doc.n_questions > 0) {
                setDocumentInfo(doc);
            }
        } catch { /* transitorio */ }
    }, [lang]);

    const startLearningSession = async () => {
        if (!documentInfo) return;
        setError('');
        stopQuizPolling();
        try {
            const created = await fetchJson<{ session_id: string }>('/api/pqbl/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ document_id: documentInfo.document_id, mode: 'learning' }),
            });
            const data = await fetchJson<{ questions: PqblQuestion[] }>(
                `/api/pqbl/sessions/${created.session_id}/questions`,
            );
            sessionIdRef.current = created.session_id;
            setSessionId(created.session_id);
            const qs = data.questions;
            setQuestions(qs);
            questionsLenRef.current = qs.length;
            setCurrentIndex(0);
            setOptionResults({});
            setLastSelected('');

            // Se ci sono ancora chunk in generazione, poll per nuove domande
            if (documentInfo.chunks_done < documentInfo.chunks_total) {
                const docId = documentInfo.document_id;
                quizPollRef.current = setInterval(async () => {
                    try {
                        const doc = await fetchJson<PqblDocumentInfo>(`/api/pqbl/documents/${docId}?lang=${lang}`);
                        setDocumentInfo(doc);
                        const currentLen = questionsLenRef.current;
                        if (doc.n_questions > currentLen) {
                            const updated = await fetchJson<{ questions: PqblQuestion[] }>(
                                `/api/pqbl/sessions/${sessionIdRef.current}/questions`,
                            );
                            setQuestions(updated.questions);
                            questionsLenRef.current = updated.questions.length;
                        }
                        if (doc.chunks_done >= doc.chunks_total) {
                            stopQuizPolling();
                        }
                    } catch { /* transitorio */ }
                }, 6000);
            }

            setPhase('quiz');
        } catch (e) {
            setError(e instanceof Error ? e.message : t('pqbl.error.title'));
        }
    };

    const answerOption = async (optionKey: string) => {
        const question = questions[currentIndex];
        if (!question) return;
        // R5: tentativi multipli ammessi, ma una sola registrazione per click su opzione
        if (optionResults[optionKey]) {
            setLastSelected(optionKey);
            return;
        }
        try {
            const result = await fetchJson<AnswerResult>(`/api/pqbl/sessions/${sessionId}/answer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question_id: question.id, option_key: optionKey }),
            });
            setOptionResults((prev) => ({ ...prev, [optionKey]: result }));
            setLastSelected(optionKey);
        } catch (e) {
            setError(e instanceof Error ? e.message : t('pqbl.error.title'));
        }
    };

    const goNext = async () => {
        if (currentIndex + 1 < questions.length) {
            setCurrentIndex(currentIndex + 1);
            setOptionResults({});
            setLastSelected('');
            return;
        }
        try {
            const data = await fetchJson<SessionSummary>(`/api/pqbl/sessions/${sessionId}/summary`);
            setSummary(data);
            setPhase('summary');
        } catch (e) {
            setError(e instanceof Error ? e.message : t('pqbl.error.title'));
        }
    };

    const startFinalTest = async () => {
        if (!documentInfo) return;
        setError('');
        try {
            const created = await fetchJson<{ session_id: string }>('/api/pqbl/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ document_id: documentInfo.document_id, mode: 'final_test' }),
            });
            const data = await fetchJson<{ questions: PqblQuestion[] }>(
                `/api/pqbl/sessions/${created.session_id}/questions`,
            );
            setFinalSessionId(created.session_id);
            setFinalQuestions(data.questions);
            setFinalAnswers({});
            setFinalWarning(false);
            setPhase('final');
        } catch (e) {
            setError(e instanceof Error ? e.message : t('pqbl.error.title'));
        }
    };

    const submitFinalTest = async () => {
        if (finalQuestions.some((q) => !finalAnswers[q.id])) {
            setFinalWarning(true);
            return;
        }
        try {
            const answers: Record<string, string> = {};
            for (const q of finalQuestions) answers[String(q.id)] = finalAnswers[q.id];
            const result = await fetchJson<FinalResult>(
                `/api/pqbl/sessions/${finalSessionId}/final-test`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ answers }),
                },
            );
            setFinalResult(result);
            setPhase('finalResults');
        } catch (e) {
            setError(e instanceof Error ? e.message : t('pqbl.error.title'));
        }
    };

    const restart = () => {
        stopPolling();
        setPhase('setup');
        setDocumentInfo(null);
        setQuestions([]);
        setSummary(null);
        setSessionId('');
        setFinalSessionId('');
        setFinalQuestions([]);
        setFinalAnswers({});
        setFinalResult(null);
        setError('');
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return m > 0 ? `${m} min ${s} s` : `${s} s`;
    };

    const currentQuestion = questions[currentIndex];
    const currentAnsweredCorrect = Object.values(optionResults).some((r) => r.correct);

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/" className="p-2 border border-transparent hover:border-slate-200 hover:bg-white rounded-md transition-colors">
                    <ArrowLeft className="w-5 h-5 text-slate-600" />
                </Link>
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{t('pqbl.title')}</h1>
                    <p className="text-slate-500">{t('pqbl.subtitle')}</p>
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <strong>{t('pqbl.error.title')}:</strong> {error}
                </div>
            )}

            {/* Setup: dimensione sessione + upload */}
            {phase === 'setup' && (
                <div className="space-y-6">
                    <div className="glass-panel rounded-xl p-6">
                        <p className="text-sm font-semibold text-slate-700 mb-3">{t('pqbl.setup.sizeLabel')}</p>
                        <div className="grid grid-cols-3 gap-3">
                            {SESSION_SIZES.map((n) => (
                                <button
                                    key={n}
                                    onClick={() => setSize(n)}
                                    className={cn(
                                        'rounded-lg border-2 py-4 text-center transition-colors',
                                        size === n
                                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                            : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200',
                                    )}
                                >
                                    <div className="text-2xl font-bold">{n}</div>
                                    <div className="text-xs">{t('pqbl.setup.questions')}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="glass-panel rounded-xl p-6">
                        <p className="text-sm font-semibold text-slate-700 mb-3">{t('pqbl.setup.providerLabel')}</p>
                        <div className="grid grid-cols-4 gap-2">
                            {PQBL_PROVIDERS.map((p) => (
                                <button
                                    key={p.value}
                                    onClick={() => setProvider(p.value)}
                                    className={cn(
                                        'rounded-lg border-2 py-3 px-2 text-center text-sm transition-colors',
                                        provider === p.value
                                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                            : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200',
                                    )}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div
                        onDragEnter={handleDrag}
                        onDragOver={handleDrag}
                        onDragLeave={handleDrag}
                        onDrop={handleDrop}
                        className={cn(
                            'relative flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg transition-colors bg-white',
                            isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-indigo-300',
                            isUploading ? 'pointer-events-none opacity-50' : '',
                        )}
                    >
                        {isUploading ? (
                            <div className="flex flex-col items-center animate-pulse space-y-4">
                                <UploadCloud className="w-12 h-12 text-indigo-500 animate-bounce" />
                                <p className="text-lg font-medium text-slate-900">{t('pqbl.upload.analyzing')}</p>
                            </div>
                        ) : (
                            <>
                                <div className="p-4 rounded-md bg-indigo-50 mb-4">
                                    <FileType className="w-8 h-8 text-indigo-600" />
                                </div>
                                <p className="text-lg font-medium text-slate-900 mb-1">{t('pdf.drop')}</p>
                                <p className="text-sm text-slate-500 mb-6">{t('pdf.or')}</p>
                                <input
                                    type="file"
                                    className="hidden"
                                    accept=".pdf"
                                    ref={fileInputRef}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) startUpload(file);
                                    }}
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="px-6 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition-colors font-medium text-sm"
                                >
                                    {t('pdf.select')}
                                </button>
                            </>
                        )}
                    </div>
                    <p className="text-center text-xs text-slate-500">{t('pqbl.upload.hint')}</p>
                </div>
            )}

            {/* Generazione in corso */}
            {phase === 'generating' && (
                <div className="glass-panel rounded-xl p-10 text-center space-y-5">
                    <Loader2 className="w-10 h-10 mx-auto text-indigo-500 animate-spin" />
                    <h2 className="text-xl font-semibold text-slate-800">{t('pqbl.generating.title')}</h2>
                    {documentInfo && documentInfo.chunks_total > 0 && (
                        <>
                            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                                <span>{t('pqbl.generating.chunks', {
                                    done: documentInfo.chunks_done,
                                    total: documentInfo.chunks_total,
                                })}</span>
                            </div>
                            <div className="w-full max-w-xs mx-auto h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                                    style={{ width: `${(100 * documentInfo.chunks_done) / documentInfo.chunks_total}%` }}
                                />
                            </div>
                            {documentInfo.n_questions > 0 && (
                                <p className="text-sm text-slate-400">
                                    {t('pqbl.generating.questionsReady', { n: documentInfo.n_questions })}
                                </p>
                            )}
                            <p className="text-xs text-slate-400 max-w-sm mx-auto">
                                {t('pqbl.generating.sub')}
                            </p>
                        </>
                    )}
                    {(!documentInfo || documentInfo.chunks_total === 0) && (
                        <p className="text-sm text-slate-500 max-w-md mx-auto">{t('pqbl.generating.analyzing')}</p>
                    )}
                </div>
            )}

            {/* Onboarding (R4): le domande non sono un esame */}
            {phase === 'onboarding' && documentInfo && (
                <div className="space-y-4">
                    <div className="glass-panel rounded-xl p-6 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-md bg-amber-50 flex items-center justify-center">
                                <Lightbulb className="w-5 h-5 text-amber-600" />
                            </div>
                            <h2 className="text-xl font-semibold text-slate-800">{t('pqbl.onboarding.title')}</h2>
                        </div>
                        <p className="text-slate-600 leading-relaxed">{documentInfo.onboarding_text}</p>
                    </div>
                    <div className="glass-panel rounded-xl p-6">
                        <div className="flex items-center gap-2 mb-3">
                            <Target className="w-4 h-4 text-indigo-600" />
                            <h3 className="text-sm font-semibold text-slate-700">{t('pqbl.onboarding.skills')}</h3>
                        </div>
                        <ul className="space-y-2">
                            {documentInfo.skills.map((skill) => (
                                <li key={skill} className="flex items-start gap-2 text-sm text-slate-600">
                                    <BookOpen className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" />
                                    {skill}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <button
                        onClick={startLearningSession}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors flex items-center justify-center gap-2"
                    >
                        {t('pqbl.onboarding.start')}
                        <ArrowRight className="w-5 h-5" />
                    </button>
                </div>
            )}

            {/* Quiz: feedback immediato, opzioni sempre cliccabili (R5) */}
            {phase === 'quiz' && currentQuestion && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm text-slate-500">
                        <span>{t('pqbl.quiz.progress', { current: currentIndex + 1, total: questions.length })}</span>
                        <span className="flex items-center gap-2">
                            {documentInfo && documentInfo.chunks_done < documentInfo.chunks_total && (
                                <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    {t('pqbl.quiz.generating')}
                                </span>
                            )}
                            <span className="inline-flex items-center gap-1.5">
                                <Target className="w-4 h-4" />
                                {t('pqbl.quiz.skill')}: {currentQuestion.skill}
                            </span>
                        </span>
                    </div>
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-indigo-500 transition-all"
                            style={{ width: `${(100 * (currentIndex + 1)) / questions.length}%` }}
                        />
                    </div>

                    <div className="glass-panel rounded-xl p-6 space-y-4">
                        <h2 className="text-lg font-semibold text-slate-800">{currentQuestion.question}</h2>
                        <div className="space-y-3">
                            {currentQuestion.options.map((option) => {
                                const result = optionResults[option.key];
                                const isSelected = lastSelected === option.key;
                                return (
                                    <div key={option.key}>
                                        <button
                                            onClick={() => answerOption(option.key)}
                                            className={cn(
                                                'w-full text-left rounded-lg border-2 px-4 py-3 text-sm transition-colors flex items-start gap-3',
                                                result
                                                    ? result.correct
                                                        ? 'border-green-400 bg-green-50'
                                                        : 'border-red-300 bg-red-50'
                                                    : 'border-slate-200 bg-white hover:border-indigo-300',
                                            )}
                                        >
                                            <span className="font-bold text-slate-500 shrink-0">{option.key}</span>
                                            <span className="text-slate-700">{option.text}</span>
                                            {result && (
                                                result.correct
                                                    ? <CheckCircle2 className="w-5 h-5 ml-auto shrink-0 text-green-600" />
                                                    : <XCircle className="w-5 h-5 ml-auto shrink-0 text-red-500" />
                                            )}
                                        </button>
                                        {result && isSelected && (
                                            <div className={cn(
                                                'mt-1 rounded-md px-4 py-3 text-sm leading-relaxed',
                                                result.correct ? 'bg-green-100 text-green-900' : 'bg-amber-50 text-amber-900',
                                            )}>
                                                <strong>{result.correct ? t('pqbl.quiz.correct') : t('pqbl.quiz.incorrect')}</strong>
                                                {' — '}{result.feedback}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {currentAnsweredCorrect && (
                            <p className="text-xs text-slate-400">{t('pqbl.quiz.tryOthers')}</p>
                        )}
                    </div>

                    {currentAnsweredCorrect && (
                        <button
                            onClick={goNext}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors flex items-center justify-center gap-2"
                        >
                            {currentIndex + 1 < questions.length ? t('pqbl.quiz.next') : t('pqbl.quiz.finish')}
                            <ArrowRight className="w-5 h-5" />
                        </button>
                    )}
                </div>
            )}

            {/* Riepilogo sessione (R8) */}
            {phase === 'summary' && summary && (
                <div className="space-y-4">
                    <div className="glass-panel rounded-xl p-6 space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-md bg-green-50 flex items-center justify-center">
                                <ListChecks className="w-5 h-5 text-green-600" />
                            </div>
                            <h2 className="text-xl font-semibold text-slate-800">{t('pqbl.summary.title')}</h2>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                            <div className="rounded-lg bg-slate-50 p-4">
                                <div className="text-2xl font-bold text-indigo-700">
                                    {summary.first_try_correct}/{summary.total_questions}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">{t('pqbl.summary.firstTry')}</div>
                            </div>
                            <div className="rounded-lg bg-slate-50 p-4">
                                <div className="text-2xl font-bold text-slate-700">{summary.answered_questions}</div>
                                <div className="text-xs text-slate-500 mt-1">{t('pqbl.summary.answered')}</div>
                            </div>
                            <div className="rounded-lg bg-slate-50 p-4">
                                <div className="text-2xl font-bold text-slate-700">{formatTime(summary.estimated_seconds)}</div>
                                <div className="text-xs text-slate-500 mt-1">{t('pqbl.summary.time')}</div>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-slate-700 mb-2">{t('pqbl.summary.bySkill')}</h3>
                            <div className="space-y-2">
                                {summary.by_skill.map((row) => (
                                    <div key={row.skill} className="flex items-center justify-between rounded-md border border-slate-100 bg-white px-3 py-2 text-sm">
                                        <span className="text-slate-600">{row.skill}</span>
                                        <span className="font-semibold text-slate-700">{row.first_try_correct}/{row.total}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="glass-panel rounded-xl p-6 space-y-3">
                        <p className="text-sm text-slate-500">{t('pqbl.summary.finalDesc')}</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={startFinalTest}
                                className="py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors"
                            >
                                {t('pqbl.summary.finalCta')}
                            </button>
                            <button
                                onClick={restart}
                                className="py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-md transition-colors flex items-center justify-center gap-2"
                            >
                                <RotateCcw className="w-4 h-4" />
                                {t('pqbl.summary.restart')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Test finale (R7): risposta unica per domanda, feedback alla fine */}
            {phase === 'final' && (
                <div className="space-y-4">
                    <div className="glass-panel rounded-xl p-6">
                        <h2 className="text-xl font-semibold text-slate-800">{t('pqbl.final.title')}</h2>
                        <p className="text-sm text-slate-500 mt-1">{t('pqbl.final.desc')}</p>
                    </div>
                    {finalQuestions.map((q, idx) => (
                        <div key={q.id} className="glass-panel rounded-xl p-6 space-y-3">
                            <h3 className="font-semibold text-slate-800">
                                {idx + 1}. {q.question}
                            </h3>
                            <div className="space-y-2">
                                {q.options.map((option) => (
                                    <button
                                        key={option.key}
                                        onClick={() => {
                                            setFinalAnswers((prev) => ({ ...prev, [q.id]: option.key }));
                                            setFinalWarning(false);
                                        }}
                                        className={cn(
                                            'w-full text-left rounded-lg border-2 px-4 py-2.5 text-sm transition-colors flex items-start gap-3',
                                            finalAnswers[q.id] === option.key
                                                ? 'border-indigo-500 bg-indigo-50'
                                                : 'border-slate-200 bg-white hover:border-indigo-200',
                                        )}
                                    >
                                        <span className="font-bold text-slate-500 shrink-0">{option.key}</span>
                                        <span className="text-slate-700">{option.text}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                    {finalWarning && (
                        <p className="text-sm text-amber-700">{t('pqbl.final.unanswered')}</p>
                    )}
                    <button
                        onClick={submitFinalTest}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors"
                    >
                        {t('pqbl.final.submit')}
                    </button>
                </div>
            )}

            {/* Risultati test finale */}
            {phase === 'finalResults' && finalResult && (
                <div className="space-y-4">
                    <div className="glass-panel rounded-xl p-6 text-center space-y-2">
                        <h2 className="text-xl font-semibold text-slate-800">{t('pqbl.final.score')}</h2>
                        <div className="text-4xl font-bold text-indigo-700">
                            {finalResult.score}/{finalResult.total}
                        </div>
                    </div>
                    {finalResult.results.map((row, idx) => (
                        <div key={row.question_id} className="glass-panel rounded-xl p-6 space-y-2">
                            <h3 className="font-semibold text-slate-800">{idx + 1}. {row.question}</h3>
                            <div className="flex items-center gap-2 text-sm">
                                {row.correct
                                    ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                                    : <XCircle className="w-4 h-4 text-red-500" />}
                                <span className="text-slate-600">
                                    {t('pqbl.final.yourAnswer')}: <strong>{row.selected_key ?? '—'}</strong>
                                </span>
                            </div>
                            <p className={cn(
                                'rounded-md px-4 py-3 text-sm leading-relaxed',
                                row.correct ? 'bg-green-50 text-green-900' : 'bg-amber-50 text-amber-900',
                            )}>
                                {row.feedback}
                            </p>
                        </div>
                    ))}
                    <button
                        onClick={restart}
                        className="w-full py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-md transition-colors flex items-center justify-center gap-2"
                    >
                        <RotateCcw className="w-4 h-4" />
                        {t('pqbl.summary.restart')}
                    </button>
                </div>
            )}
        </div>
    );
}
