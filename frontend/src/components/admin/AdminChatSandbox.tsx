'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ChevronLeft,
    ExternalLink,
    FlaskConical,
    Info,
    Loader2,
    RotateCcw,
    TriangleAlert,
    X,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';
import { fetchCounselors, type PublicCounselor } from '@/lib/counselor';
import { GuidedChatInterface } from '@/components/qsa/GuidedChatInterface';
import { ChatViewport } from '@/components/qsa/ChatViewport';

export interface AdminChatSandboxProps {
    instrumentCode: string;
    instrumentName?: string;
    isActive?: boolean;
    onClose?: () => void;
    isModal?: boolean;
}

function generateSandboxSessionId(code: string): string {
    const cleanCode = (code || 'instrument').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const rand = Math.random().toString(36).slice(2, 7);
    return `sandbox-${cleanCode}-${Date.now()}-${rand}`;
}

export function AdminChatSandbox({
    instrumentCode,
    instrumentName,
    isActive: initialIsActive,
    onClose,
    isModal = false,
}: AdminChatSandboxProps) {
    const { t, tf, lang } = useI18n();

    const [sessionId, setSessionId] = useState<string>(() => generateSandboxSessionId(instrumentCode));
    const [sessionKey, setSessionKey] = useState(1);
    const [completed, setCompleted] = useState(false);
    const [counselors, setCounselors] = useState<PublicCounselor[]>([]);
    const [selectedCounselorId, setSelectedCounselorId] = useState<number | null>(null);

    const [hasSteps, setHasSteps] = useState<boolean | null>(null);
    const [resolvedName, setResolvedName] = useState<string>(
        instrumentName || tf(`q.${instrumentCode}.fullName`, tf(`q.${instrumentCode}.name`, instrumentCode))
    );
    const [isActive, setIsActive] = useState<boolean>(initialIsActive ?? true);

    const sessionIdRef = useRef(sessionId);

    // Ephemeral memory cleanup: delete memory on component unmount
    useEffect(() => {
        sessionIdRef.current = sessionId;
    }, [sessionId]);

    useEffect(() => {
        return () => {
            const sid = sessionIdRef.current;
            if (sid) {
                void apiFetch(`/api/memory/${encodeURIComponent(sid)}`, { method: 'DELETE' }).catch(() => {});
            }
        };
    }, []);

    // Load instrument metadata and step count
    useEffect(() => {
        let active = true;

        // Check if steps exist via guided-ui-texts
        apiFetch(`/api/qsa/guided-ui-texts?questionnaire_type=${encodeURIComponent(instrumentCode)}&lang=${lang}`)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!active) return;
                const steps = data?.guided_steps;
                setHasSteps(Array.isArray(steps) ? steps.length > 0 : false);
            })
            .catch(() => {
                if (active) setHasSteps(false);
            });

        // Load active status if not provided
        if (initialIsActive === undefined) {
            apiFetch('/api/admin/instruments')
                .then((res) => (res.ok ? res.json() : []))
                .then((list: Array<{ code: string; is_active?: boolean; name_it?: string }>) => {
                    if (!active) return;
                    const found = list.find((item) => item.code.toUpperCase() === instrumentCode.toUpperCase());
                    if (found) {
                        if (typeof found.is_active === 'boolean') setIsActive(found.is_active);
                        if (!instrumentName && found.name_it) setResolvedName(found.name_it);
                    }
                })
                .catch(() => {});
        }

        return () => {
            active = false;
        };
    }, [instrumentCode, instrumentName, initialIsActive, lang]);

    // Load counselors for this instrument
    useEffect(() => {
        let active = true;
        fetchCounselors(lang, undefined, instrumentCode).then((items) => {
            if (!active) return;
            setCounselors(items);
            if (items.length > 0) {
                // Prefer first suitable counselor, otherwise first active
                const preferred = items.find((c) => c.suitable) || items[0];
                setSelectedCounselorId((prev) => (prev ?? preferred?.id ?? null));
            }
        });

        return () => {
            active = false;
        };
    }, [instrumentCode, lang]);

    const handleRestart = useCallback(() => {
        const oldId = sessionIdRef.current;
        const newId = generateSandboxSessionId(instrumentCode);

        setSessionId(newId);
        setSessionKey((prev) => prev + 1);
        setCompleted(false);

        if (oldId) {
            void apiFetch(`/api/memory/${encodeURIComponent(oldId)}`, { method: 'DELETE' }).catch(() => {});
        }
    }, [instrumentCode]);

    const handleCounselorChange = useCallback(
        (id: number | null) => {
            setSelectedCounselorId(id);
            handleRestart();
        },
        [handleRestart]
    );

    return (
        <section aria-labelledby="sandbox-heading" className="flex flex-col h-full bg-slate-50 text-slate-800">
            {/* Top Toolbar */}
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-2xs">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
                        <FlaskConical className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 id="sandbox-heading" className="text-sm font-bold text-slate-900">
                                {t('admin.sandbox.title')}
                            </h2>
                            <span className="font-mono text-xs font-semibold rounded bg-slate-100 px-2 py-0.5 text-slate-700 border border-slate-200">
                                {instrumentCode}
                            </span>
                            <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                    isActive
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}
                            >
                                <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                {isActive ? t('admin.sandbox.activeBadge') : t('admin.sandbox.draftBadge')}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                                {t('admin.sandbox.badge')}
                            </span>
                        </div>
                        {resolvedName && resolvedName !== instrumentCode && (
                            <p className="text-xs text-slate-500 truncate mt-0.5 max-w-md">
                                {resolvedName}
                            </p>
                        )}
                    </div>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-2">
                    {counselors.length > 0 && (
                        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                            <span className="hidden sm:inline">{t('admin.sandbox.selectCounselor')}</span>
                            <select
                                value={selectedCounselorId ?? ''}
                                onChange={(e) => handleCounselorChange(e.target.value ? Number(e.target.value) : null)}
                                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-800 shadow-2xs outline-none focus:border-indigo-500"
                            >
                                {counselors.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.suitable ? c.name : `${c.name} (${t('admin.sandbox.notSuitable')})`}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}

                    <button
                        type="button"
                        onClick={handleRestart}
                        title={t('admin.sandbox.restart')}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                    >
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">{t('admin.sandbox.restart')}</span>
                    </button>

                    {isModal && (
                        <a
                            href={`/admin/preview-chat?instrument=${encodeURIComponent(instrumentCode)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={t('admin.sandbox.openFullscreen')}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                        >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="hidden sm:inline">{t('admin.sandbox.openFullscreen')}</span>
                        </a>
                    )}

                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label={isModal ? t('admin.sandbox.close') : t('admin.sandbox.backToAdmin')}
                            className={
                                isModal
                                    ? 'rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                                    : 'inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs'
                            }
                        >
                            {isModal ? (
                                <X className="h-5 w-5" aria-hidden="true" />
                            ) : (
                                <>
                                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>{t('admin.sandbox.backToAdmin')}</span>
                                </>
                            )}
                        </button>
                    )}
                </div>
            </header>

            {/* Ephemeral Disclaimer Banner */}
            <div className="flex items-start gap-2 border-b border-indigo-100 bg-indigo-50/70 px-4 py-2.5 text-xs text-indigo-900">
                <Info className="h-4 w-4 shrink-0 text-indigo-600 mt-0.5" aria-hidden="true" />
                <p className="flex-1 leading-relaxed">
                    {t('admin.sandbox.disclaimer')}
                </p>
            </div>

            {/* Completed state banner */}
            {completed && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-200 bg-emerald-50 px-4 py-3">
                    <div>
                        <h3 className="text-xs font-bold text-emerald-900">{t('admin.sandbox.completedTitle')}</h3>
                        <p className="mt-0.5 text-xs text-emerald-700">{t('admin.sandbox.completedBody')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleRestart}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-emerald-700"
                        >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('admin.sandbox.restart')}
                        </button>
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                            >
                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                                {t('admin.sandbox.close')}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Main Interactive Area */}
            <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden">
                {hasSteps === null ? (
                    <div className="flex-1 flex items-center justify-center gap-2 text-slate-500 text-xs">
                        <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
                        <span>{t('admin.sandbox.loading')}</span>
                    </div>
                ) : hasSteps === false ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                        <div className="max-w-md w-full rounded-xl border border-amber-200 bg-amber-50/60 p-6 shadow-xs space-y-3">
                            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                                <TriangleAlert className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <h3 className="text-sm font-bold text-slate-800">{t('admin.sandbox.title')}</h3>
                            <p className="text-xs text-slate-600 leading-relaxed">
                                {t('admin.sandbox.noSteps')}
                            </p>
                        </div>
                    </div>
                ) : (
                    <ChatViewport>
                        <GuidedChatInterface
                            key={sessionKey}
                            counselorId={selectedCounselorId}
                            scores={{}}
                            questionnaireType={instrumentCode}
                            sessionId={sessionId}
                            onComplete={() => setCompleted(true)}
                            locale={lang}
                            preview={true}
                        />
                    </ChatViewport>
                )}
            </div>
        </section>
    );
}
