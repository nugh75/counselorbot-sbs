'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    X,
    Sparkles,
    Upload,
    Link as LinkIcon,
    Check,
    Copy,
    ExternalLink,
    Loader2,
    ImagePlus,
    Compass,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { CounselorCover } from '@/components/questionnaire/CounselorCover';
import type { PublicCounselor } from '@/lib/counselor';
import {
    COUNSELOR_METAPHOR_PRESETS,
    composeCounselorCoverAIPrompt,
} from '@/lib/counselor-cover-prompt';

export interface CounselorCoverModalProps {
    open: boolean;
    onClose: () => void;
    counselorId?: number | 'new' | null;
    counselorName?: string;
    counselorSlug?: string;
    description?: string;
    persona?: string;
    currentAvatar?: string | null;
    approachCategories?: string[];
    onAvatarSaved: (newAvatarUrl: string) => void;
}

type TabType = 'ai' | 'upload' | 'url';

export function CounselorCoverModal({
    open,
    onClose,
    counselorId,
    counselorName = '',
    counselorSlug = '',
    description = '',
    persona = '',
    currentAvatar = null,
    approachCategories = [],
    onAvatarSaved,
}: CounselorCoverModalProps) {
    const { t } = useI18n();

    const [activeTab, setActiveTab] = useState<TabType>('ai');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // AI prompt state
    const [selectedMetaphor, setSelectedMetaphor] = useState<string>(
        COUNSELOR_METAPHOR_PRESETS[0]?.label || ''
    );
    const [customMetaphor, setCustomMetaphor] = useState<string>('');
    const [copied, setCopied] = useState(false);

    // Upload state
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Manual URL state
    const [manualUrl, setManualUrl] = useState<string>(currentAvatar || '');

    // Cleanup object URL
    useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    // Handle Escape key
    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !saving) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, saving, onClose]);

    if (!open || typeof document === 'undefined') return null;

    const isExistingCounselor = typeof counselorId === 'number';
    const effectiveMetaphor = customMetaphor.trim() || selectedMetaphor;
    const aiPrompt = composeCounselorCoverAIPrompt({
        name: counselorName,
        approach: description,
        persona,
        metaphor: effectiveMetaphor,
    });

    const activeCover = previewUrl || (activeTab === 'url' && manualUrl.trim() ? manualUrl.trim() : currentAvatar);

    const previewCounselor: PublicCounselor = {
        id: typeof counselorId === 'number' ? counselorId : 0,
        slug: counselorSlug || 'counselor',
        name: counselorName || 'Counselor',
        description: description || null,
        approach_categories: approachCategories || [],
        avatar: activeCover || null,
        avatar_url: activeCover || null,
        language: ['*'],
        is_active: true,
    };

    const handleCopyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(aiPrompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = aiPrompt;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setError(null);
        setSuccessMessage(null);
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            setError(t('admin.counselorCover.uploadError'));
            return;
        }

        setSelectedFile(file);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(file));
    };

    const handleUploadSubmit = async () => {
        if (!selectedFile) return;

        if (!isExistingCounselor) {
            setError(t('admin.counselorCover.saveForNewNotice'));
            return;
        }

        setSaving(true);
        setError(null);
        setSuccessMessage(null);

        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            const res = await apiFetch(`/api/admin/counselors/${counselorId}/avatar`, {
                method: 'POST',
                body: formData,
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.detail || t('admin.counselorCover.uploadError'));
            }
            const updated = await res.json();
            const newAvatar = updated.avatar || `/api/counselors/${counselorId}/avatar`;
            onAvatarSaved(newAvatar);
            setSelectedFile(null);
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
            }
            setSuccessMessage(t('admin.counselorCover.uploadSuccess'));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : t('admin.counselorCover.uploadError'));
        } finally {
            setSaving(false);
        }
    };

    const handleApplyUrl = () => {
        const trimmed = manualUrl.trim();
        onAvatarSaved(trimmed);
        setSuccessMessage(t('admin.counselorCover.uploadSuccess'));
    };

    return createPortal(
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-5 backdrop-blur-xs"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget && !saving) onClose();
            }}
            role="presentation"
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="counselor-cover-modal-title"
                className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                    <div>
                        <h2 id="counselor-cover-modal-title" className="text-base font-bold text-slate-900 sm:text-lg">
                            {t('admin.counselorCover.modalTitle')}
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                            {t('admin.counselorCover.modalSubtitle')}
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={t('admin.counselorCover.close')}
                    >
                        <X className="h-5 w-5" aria-hidden />
                    </Button>
                </div>

                {/* Banner anteprima 16:9 live */}
                <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="relative aspect-[16/9] h-14 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 shadow-2xs">
                                <CounselorCover
                                    counselor={previewCounselor}
                                    src={activeCover}
                                    alt={counselorName || 'Counselor'}
                                    compact
                                />
                            </div>
                            <div className="min-w-0">
                                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                    {t('admin.counselorCover.currentPreview')}
                                </span>
                                <p className="truncate text-sm font-semibold text-slate-800" title={counselorName}>
                                    {counselorName || 'Counselor'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs Switcher */}
                <div className="flex border-b border-slate-200 bg-white px-5">
                    <button
                        type="button"
                        onClick={() => setActiveTab('ai')}
                        className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs sm:text-sm font-semibold transition ${
                            activeTab === 'ai'
                                ? 'border-indigo-600 text-indigo-700'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <Sparkles className="h-4 w-4 text-amber-500" aria-hidden />
                        <span>{t('admin.counselorCover.tabAI')}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('upload')}
                        className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs sm:text-sm font-semibold transition ${
                            activeTab === 'upload'
                                ? 'border-indigo-600 text-indigo-700'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <Upload className="h-4 w-4" aria-hidden />
                        <span>{t('admin.counselorCover.tabUpload')}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('url')}
                        className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs sm:text-sm font-semibold transition ${
                            activeTab === 'url'
                                ? 'border-indigo-600 text-indigo-700'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <LinkIcon className="h-4 w-4" aria-hidden />
                        <span>{t('admin.counselorCover.tabUrl')}</span>
                    </button>
                </div>

                {/* Alert messaggi */}
                {error && (
                    <div className="p-4 pb-0">
                        <Callout variant="danger">{error}</Callout>
                    </div>
                )}
                {successMessage && (
                    <div className="p-4 pb-0">
                        <Callout variant="success">{successMessage}</Callout>
                    </div>
                )}

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-5">
                    {/* 1. Scheda CREA CON IA */}
                    {activeTab === 'ai' && (
                        <div className="space-y-4">
                            <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50/60 to-orange-50/40 p-4 text-xs leading-relaxed text-slate-700">
                                <div className="flex items-start gap-2.5">
                                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                                    <div>
                                        <strong className="font-semibold text-slate-900">
                                            {t('admin.counselorCover.aiHeading')}
                                        </strong>
                                        <p className="mt-1">
                                            {t('admin.counselorCover.aiGuide')}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Selettore Metafora */}
                            <div className="space-y-1.5">
                                <label htmlFor="counselor-metaphor-select" className="text-xs font-semibold text-slate-700">
                                    {t('admin.counselorCover.metaphorLabel')}
                                </label>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    <div className="relative">
                                        <select
                                            id="counselor-metaphor-select"
                                            value={selectedMetaphor}
                                            onChange={(e) => {
                                                setSelectedMetaphor(e.target.value);
                                                setCustomMetaphor('');
                                            }}
                                            className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 outline-none focus:border-indigo-500"
                                        >
                                            {COUNSELOR_METAPHOR_PRESETS.map((preset) => (
                                                <option key={preset.id} value={preset.label}>
                                                    {preset.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <input
                                        type="text"
                                        value={customMetaphor}
                                        onChange={(e) => setCustomMetaphor(e.target.value)}
                                        placeholder={t('admin.counselorCover.metaphorPlaceholder')}
                                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-800 outline-none focus:border-indigo-500"
                                    />
                                </div>
                            </div>

                            {/* Prompt TextArea */}
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="ai-counselor-cover-prompt" className="text-xs font-semibold text-slate-700">
                                        {t('admin.counselorCover.promptLabel')}
                                    </label>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => void handleCopyPrompt()}
                                        className="inline-flex min-h-[32px] items-center gap-1.5 text-xs font-semibold"
                                    >
                                        {copied ? (
                                            <>
                                                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                                                <span className="text-emerald-700">{t('admin.counselorCover.promptCopied')}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="h-3.5 w-3.5" aria-hidden />
                                                <span>{t('admin.counselorCover.copyPrompt')}</span>
                                            </>
                                        )}
                                    </Button>
                                </div>

                                <textarea
                                    id="ai-counselor-cover-prompt"
                                    readOnly
                                    rows={5}
                                    value={aiPrompt}
                                    className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 focus:outline-hidden"
                                />
                            </div>

                            {/* Link a ChatGPT e Gemini */}
                            <div className="flex flex-wrap items-center gap-3 pt-2">
                                <a
                                    href="https://chatgpt.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                                >
                                    <span>{t('admin.counselorCover.openChatGPT')}</span>
                                    <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                                </a>
                                <a
                                    href="https://gemini.google.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                                >
                                    <span>{t('admin.counselorCover.openGemini')}</span>
                                    <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                                </a>
                            </div>
                        </div>
                    )}

                    {/* 2. Scheda CARICA DA COMPUTER */}
                    {activeTab === 'upload' && (
                        <div className="space-y-4">
                            {!isExistingCounselor && (
                                <Callout variant="warning">
                                    {t('admin.counselorCover.saveForNewNotice')}
                                </Callout>
                            )}

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                                onChange={handleFileChange}
                                className="hidden"
                            />

                            <div
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const file = e.dataTransfer.files?.[0];
                                    if (file) {
                                        if (file.size > 5 * 1024 * 1024) {
                                            setError(t('admin.counselorCover.uploadError'));
                                            return;
                                        }
                                        setSelectedFile(file);
                                        if (previewUrl) URL.revokeObjectURL(previewUrl);
                                        setPreviewUrl(URL.createObjectURL(file));
                                    }
                                }}
                                className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50/30"
                            >
                                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                                    <ImagePlus className="h-6 w-6" aria-hidden />
                                </div>
                                <h3 className="mt-3 text-sm font-semibold text-slate-900">
                                    {selectedFile ? selectedFile.name : t('admin.counselorCover.uploadDropzone')}
                                </h3>
                                <p className="mt-1 max-w-sm text-xs text-slate-500">
                                    {t('admin.counselorCover.uploadHint')}
                                </p>
                            </div>

                            {previewUrl && (
                                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                        {t('admin.counselorCover.selectedPreview')}
                                    </span>
                                    <div className="relative aspect-[16/9] w-full max-h-48 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={previewUrl}
                                            alt={counselorName || 'Counselor'}
                                            className="h-full w-full object-cover"
                                        />
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            onClick={() => {
                                                setSelectedFile(null);
                                                if (previewUrl) URL.revokeObjectURL(previewUrl);
                                                setPreviewUrl(null);
                                            }}
                                            disabled={saving}
                                        >
                                            {t('admin.counselorCover.cancel')}
                                        </Button>
                                        {isExistingCounselor && (
                                            <Button
                                                type="button"
                                                disabled={saving}
                                                onClick={() => void handleUploadSubmit()}
                                                className="inline-flex items-center gap-2"
                                            >
                                                {saving ? (
                                                    <>
                                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                                        <span>{t('admin.counselorCover.uploadSaving')}</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Upload className="h-4 w-4" aria-hidden />
                                                        <span>{t('admin.counselorCover.uploadButton')}</span>
                                                    </>
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 3. Scheda URL O PRESET MANUALE */}
                    {activeTab === 'url' && (
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label htmlFor="counselor-manual-url" className="text-xs font-semibold text-slate-700">
                                    {t('admin.counselorCover.urlLabel')}
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        id="counselor-manual-url"
                                        type="text"
                                        value={manualUrl}
                                        onChange={(e) => setManualUrl(e.target.value)}
                                        placeholder={t('admin.counselorCover.urlPlaceholder')}
                                        className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-800 outline-none focus:border-indigo-500"
                                    />
                                    <Button
                                        type="button"
                                        onClick={handleApplyUrl}
                                        disabled={!manualUrl.trim()}
                                        className="shrink-0"
                                    >
                                        {t('admin.counselorCover.applyUrl')}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-5 py-3">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={onClose}
                        disabled={saving}
                    >
                        {t('admin.counselorCover.close')}
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
}
