'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { createTerminalSession, TerminalSession } from '@/lib/opencode-terminal';
import { QuestionnaireConfig } from '@/lib/questionnaires';
import { RefreshCw, Terminal, Eye, FileText, AlertCircle, BarChart3 } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import '@xterm/xterm/css/xterm.css';

interface OpenCodeExperienceProps {
    scores: Record<string, number>;
    questionnaire: QuestionnaireConfig;
    pdfToken?: string;
    sessionId: string;
    locale: string;
}

export function OpenCodeExperience({
    scores,
    questionnaire,
    pdfToken,
    sessionId,
    locale,
}: OpenCodeExperienceProps) {
    const { t, tf } = useI18n();
    const ocRef = useRef<TerminalSession | null>(null);
    const mountRef = useRef<HTMLDivElement | null>(null);
    const workspaceKeyRef = useRef('');

    const [ocActive, setOcActive] = useState(false);
    const [ocStatus, setOcStatus] = useState('');
    const [ocBusy, setOcBusy] = useState(false);
    const [ocError, setOcError] = useState('');
    const [showPdf, setShowPdf] = useState(!!pdfToken);
    const invertedSet = useMemo(() => new Set(questionnaire.invertedFactors || []), [questionnaire]);
    const factorNameMap = useMemo(() => {
        const map: Record<string, string> = {};
        for (const f of questionnaire.factors) {
            map[f.code] = tf(`factor.${f.code}.name`, f.name);
        }
        return map;
    }, [questionnaire, tf]);

    const scoreGroups = useMemo(() => {
        return questionnaire.factorPrefix
            .filter(prefix => Object.keys(scores).some(k => k.startsWith(prefix)))
            .map(prefix => ({
                prefix,
                entries: Object.entries(scores)
                    .filter(([k]) => k.startsWith(prefix))
                    .sort(([a], [b]) => a.localeCompare(b)),
            }));
    }, [scores, questionnaire]);

    function getBarColor(code: string, score: number): string {
        const isInverted = invertedSet.has(code);
        if (score <= 3) return isInverted ? 'bg-green-500' : 'bg-red-500';
        if (score <= 6) return 'bg-yellow-500';
        return isInverted ? 'bg-red-500' : 'bg-green-500';
    }

    const PREFIX_COLORS: Record<string, string> = {
        C: 'text-blue-600', A: 'text-purple-600', T: 'text-amber-600',
        S: 'text-purple-600', K: 'text-indigo-600', AD: 'text-green-600',
    };

    const statusLabel = ocStatus ? t(`opencode.status.${ocStatus}`) : '';

    const startOpenCode = useCallback(async () => {
        setOcBusy(true);
        setOcError('');
        try {
            // Prepara il workspace OpenCode isolato sul backend
            const response = await fetch('/api/opencode/workspace', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workspace_id: sessionId,
                    questionnaire_type: questionnaire.id,
                    scores: scores,
                    pdf_token: pdfToken || null,
                    locale: locale,
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || t('opencode.httpError', { status: response.status }));
            }
            workspaceKeyRef.current = data.key;

            // Distrugge sessioni xterm precedenti se attive
            ocRef.current?.destroy();

            // Crea una nuova sessione e la connette via WebSocket
            const session = createTerminalSession();
            ocRef.current = session;
            session.connect({
                key: data.key,
                onStatus: setOcStatus,
            });

            setOcActive(true);
        } catch (err: unknown) {
            console.error("Failed to start OpenCode:", err);
            setOcError(err instanceof Error ? err.message : t('opencode.connectionError'));
        } finally {
            setOcBusy(false);
        }
    }, [locale, pdfToken, questionnaire.id, scores, sessionId, t]);

    const syncMemory = useCallback((keepalive = false) => {
        const key = workspaceKeyRef.current;
        if (!key) return;
        void fetch(`/api/opencode/workspace/${encodeURIComponent(key)}/sync-memory`, {
            method: 'POST',
            keepalive,
        }).catch(() => {
            // La prossima sincronizzazione periodica ritenterà automaticamente.
        });
    }, []);

    // Gestione attach/detach del terminale al DOM
    useEffect(() => {
        if (ocActive && mountRef.current && ocRef.current) {
            ocRef.current.attach(mountRef.current);
        }
        return () => {
            ocRef.current?.detach();
        };
    }, [ocActive]);

    // Avvio automatico al montaggio del componente
    useEffect(() => {
        startOpenCode();
        const memorySyncTimer = window.setInterval(() => syncMemory(), 5000);
        return () => {
            window.clearInterval(memorySyncTimer);
            syncMemory(true);
            ocRef.current?.destroy();
            ocRef.current = null;
        };
    }, [startOpenCode, syncMemory]);

    return (
        <div className="w-full flex flex-col xl:flex-row gap-6 h-[80vh] min-h-[600px]">
            {/* Pannello di Sinistra: PDF o Punteggi compatti */}
            <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm h-full">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="font-semibold text-slate-800 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-indigo-600" />
                        {t('opencode.studentProfile')}
                    </span>
                    {pdfToken && (
                        <button
                            onClick={() => setShowPdf(p => !p)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                                showPdf
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            {showPdf ? <Eye className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                            {showPdf ? t('opencode.scores') : t('opencode.pdf')}
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 bg-slate-50/50 p-3 space-y-4">
                    {showPdf && pdfToken ? (
                        <iframe
                            src={`/api/opencode/pdf/${pdfToken}`}
                            className="w-full h-full border border-slate-200 rounded-lg bg-white shadow-inner min-h-[450px]"
                            title={t('opencode.pdfTitle')}
                        />
                    ) : (
                        scoreGroups.length > 0 ? scoreGroups.map((group) => (
                            <div key={group.prefix} className="bg-white rounded-lg border border-slate-200 shadow-sm p-3">
                                <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${PREFIX_COLORS[group.prefix] || 'text-slate-600'}`}>
                                    {t(`profile.section.${group.prefix}`)}
                                </div>
                                <div className="space-y-2">
                                    {group.entries.map(([code, score]) => (
                                        <div key={code} className="space-y-0.5">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="font-semibold text-slate-700">{code}</span>
                                                <span className="text-slate-500 ml-1 truncate">{factorNameMap[code] || code}</span>
                                                <span className="font-bold text-slate-700 ml-auto tabular-nums">{score}/9</span>
                                            </div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${getBarColor(code, score)}`}
                                                    style={{ width: `${(score / 9) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )) : (
                            <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 text-center text-sm text-slate-400">
                                {t('opencode.noScores')}
                            </div>
                        )
                    )}
                </div>
            </div>

            {/* Pannello di Destra: OpenCode Terminal */}
            <div className="flex-1 flex flex-col bg-[#0b0f17] rounded-xl border border-slate-800 overflow-hidden shadow-md h-full">
                <div className="px-4 py-3 bg-[#131924] border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-sky-400" />
                        <span className="font-semibold text-slate-200 text-sm">{t('opencode.chatTitle')}</span>
                        {ocStatus && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                                ocStatus === 'connected'
                                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                    : ocStatus === 'connecting'
                                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}>
                                {statusLabel}
                            </span>
                        )}
                    </div>

                    <button
                        onClick={startOpenCode}
                        disabled={ocBusy}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors disabled:opacity-50 flex items-center gap-1.5 text-xs"
                        title={t('opencode.restartTitle')}
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${ocBusy ? 'animate-spin' : ''}`} />
                        {ocBusy ? t('opencode.restarting') : t('opencode.restart')}
                    </button>
                </div>

                <div className="flex-1 p-2 min-h-0 relative flex flex-col">
                    {ocError ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-300">
                            <AlertCircle className="w-12 h-12 text-rose-500 mb-3" />
                            <p className="font-medium text-slate-200 mb-2">{ocError}</p>
                            <button
                                onClick={startOpenCode}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm transition-colors"
                            >
                                {t('opencode.retry')}
                            </button>
                        </div>
                    ) : (
                        <div
                            ref={mountRef}
                            className="flex-1 min-h-0 rounded-lg overflow-hidden bg-[#0b0f17] p-2"
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
