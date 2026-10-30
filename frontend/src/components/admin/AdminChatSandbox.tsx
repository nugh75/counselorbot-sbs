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
import { Button } from '@/components/ui/Button';

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
        <section aria-labelledby="sandbox-heading" className="flex flex-col h-full bg-surface-sunken text-ink">
            {/* Top Toolbar */}
            <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-surface px-4 py-4 shadow-card">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-soft text-link">
                        <FlaskConical className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <h2 id="sandbox-heading" className="text-sm font-semibold text-ink">
                                {t('admin.sandbox.title')}
                            </h2>
                            <span className="font-mono text-xs font-semibold rounded bg-surface-raised px-2 py-1 text-ink-body border border-line">
                                {instrumentCode}
                            </span>
                            <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-2xs font-semibold ${
                                    isActive
                                        ? 'bg-success-soft text-success border border-success-line'
                                        : 'bg-warning-soft text-warning border border-warning-line'
                                }`}
                            >
                                <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-success' : 'bg-warning'}`} />
                                {isActive ? t('admin.sandbox.activeBadge') : t('admin.sandbox.draftBadge')}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft border border-brand-line px-2 py-1 text-2xs font-semibold text-link">
                                {t('admin.sandbox.badge')}
                            </span>
                        </div>
                        {resolvedName && resolvedName !== instrumentCode && (
                            <p className="text-xs text-ink-muted truncate mt-1 max-w-md">
                                {resolvedName}
                            </p>
                        )}
                    </div>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-2">
                    {counselors.length > 0 && (
                        <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
                            <span className="hidden sm:inline">{t('admin.sandbox.selectCounselor')}</span>
                            <select
                                value={selectedCounselorId ?? ''}
                                onChange={(e) => handleCounselorChange(e.target.value ? Number(e.target.value) : null)}
                                className="rounded-control border border-line-strong bg-surface px-2 py-2 text-xs font-semibold text-ink shadow-card outline-none focus:border-brand"
                            >
                                {counselors.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.suitable ? c.name : `${c.name} (${t('admin.sandbox.notSuitable')})`}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}

                    <Button variant="secondary"
                        type="button"
                        onClick={handleRestart}
                        title={t('admin.sandbox.restart')}
                        className="gap-1 text-xs">
                        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">{t('admin.sandbox.restart')}</span>
                    </Button>

                    {isModal && (
                        <a
                            href={`/admin/preview-chat?instrument=${encodeURIComponent(instrumentCode)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={t('admin.sandbox.openFullscreen')}
                            className="inline-flex items-center gap-1 rounded-control border border-line-strong bg-surface px-2 py-2 text-xs font-semibold text-ink-body hover:bg-surface-sunken shadow-card"
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
                                    ? 'min-h-control min-w-control rounded-lg p-2 text-ink-muted hover:bg-surface-raised hover:text-ink-body'
                                    : 'inline-flex min-h-control items-center gap-1 rounded-control border border-line-strong bg-surface px-2 py-2 text-xs font-semibold text-ink-body hover:bg-surface-sunken shadow-card'
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
            <div className="flex items-start gap-2 border-b border-brand-line bg-brand-soft/70 px-4 py-2 text-xs text-link">
                <Info className="h-4 w-4 shrink-0 text-brand mt-1" aria-hidden="true" />
                <p className="flex-1 leading-relaxed">
                    {t('admin.sandbox.disclaimer')}
                </p>
            </div>

            {/* Completed state banner */}
            {completed && (
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-success-line bg-success-soft px-4 py-4">
                    <div>
                        <h3 className="text-xs font-semibold text-success-ink">{t('admin.sandbox.completedTitle')}</h3>
                        <p className="mt-1 text-xs text-success">{t('admin.sandbox.completedBody')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleRestart}
                            className="min-h-control inline-flex items-center gap-1 rounded-control bg-success px-4 py-2 text-xs font-semibold text-ink-on-brand shadow-card hover:bg-success"
                        >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('admin.sandbox.restart')}
                        </button>
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                className="min-h-control inline-flex items-center gap-1 rounded-control border border-success-line bg-surface px-4 py-2 text-xs font-semibold text-success-ink hover:bg-success-soft"
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
                    <div className="flex-1 flex items-center justify-center gap-2 text-ink-muted text-xs">
                        <Loader2 className="h-4 w-4 animate-spin text-brand" />
                        <span>{t('admin.sandbox.loading')}</span>
                    </div>
                ) : hasSteps === false ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                        <div className="max-w-md w-full rounded-card border border-warning-line bg-warning-soft/60 p-6 shadow-card space-y-4">
                            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-warning-soft text-warning">
                                <TriangleAlert className="h-5 w-5" aria-hidden="true" />
                            </div>
                            <h3 className="text-sm font-semibold text-ink">{t('admin.sandbox.title')}</h3>
                            <p className="text-xs text-ink-muted leading-relaxed">
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
