'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import {
    X,
    Palette,
    Upload,
    Sparkles,
    Check,
    Copy,
    ExternalLink,
    RotateCcw,
    AlertCircle,
    Loader2,
    ImagePlus,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { apiFetch } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import type { StudentGroup } from './class-group-types';
import {
    CLASS_COVER_PRESETS,
    getClassCoverUrl,
    composeClassCoverAIPrompt,
} from '@/lib/class-cover-presets';

export interface ClassImageModalProps {
    open: boolean;
    onClose: () => void;
    group: StudentGroup;
    onUpdated: (updatedGroup: StudentGroup) => void;
}

type TabType = 'presets' | 'upload' | 'ai';

export function ClassImageModal({
    open,
    onClose,
    group,
    onUpdated,
}: ClassImageModalProps) {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof teacherAreaText>[1]) => teacherAreaText(lang, key);

    const [activeTab, setActiveTab] = useState<TabType>('presets');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Upload state
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // AI prompt copied state
    const [copied, setCopied] = useState(false);

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

    // Cleanup preview URL on unmount or file change
    useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    if (!open || typeof document === 'undefined') return null;

    const currentCoverUrl = getClassCoverUrl(group);
    const isCustomCover = Boolean(group.image_url && group.image_url.trim());
    const aiPrompt = composeClassCoverAIPrompt(group.name, group.description || undefined);

    // Handle selecting a graphic preset
    const handleSelectPreset = async (presetUrl: string) => {
        setSaving(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await apiFetch(`/api/admin/groups/${group.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_url: presetUrl }),
            });
            if (!res.ok) {
                throw new Error(l('classCoverUploadError'));
            }
            const updated: StudentGroup = await res.json();
            onUpdated(updated);
            setSuccessMessage(l('classCoverUploadSuccess'));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : l('classCoverUploadError'));
        } finally {
            setSaving(false);
        }
    };

    // Handle resetting cover to default
    const handleResetDefault = async () => {
        setSaving(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await apiFetch(`/api/admin/groups/${group.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_url: '' }),
            });
            if (!res.ok) {
                throw new Error(l('classCoverUploadError'));
            }
            const updated: StudentGroup = await res.json();
            onUpdated(updated);
            setSuccessMessage(l('classCoverUploadSuccess'));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : l('classCoverUploadError'));
        } finally {
            setSaving(false);
        }
    };

    // Handle file selection from dropzone or input
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setError(null);
        setSuccessMessage(null);
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            setError(l('classCoverUploadError'));
            return;
        }

        setSelectedFile(file);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(file));
    };

    // Handle submitting the uploaded image
    const handleUploadSubmit = async () => {
        if (!selectedFile) return;
        setSaving(true);
        setError(null);
        setSuccessMessage(null);

        const formData = new FormData();
        formData.append('file', selectedFile);

        try {
            const res = await apiFetch(`/api/admin/groups/${group.id}/image`, {
                method: 'POST',
                body: formData,
            });
            if (!res.ok) {
                const data = await res.json().catch(() => null);
                throw new Error(data?.detail || l('classCoverUploadError'));
            }
            const updated: StudentGroup = await res.json();
            onUpdated(updated);
            setSelectedFile(null);
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
            }
            setSuccessMessage(l('classCoverUploadSuccess'));
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : l('classCoverUploadError'));
        } finally {
            setSaving(false);
        }
    };

    // Handle copying AI prompt
    const handleCopyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(aiPrompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            // Fallback for clipboard
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
                aria-labelledby="class-cover-modal-title"
                className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                    <div>
                        <h2 id="class-cover-modal-title" className="text-base font-bold text-slate-900 sm:text-lg">
                            {l('classCoverModalTitle')}
                        </h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                            {l('classCoverModalSubtitle')}
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        disabled={saving}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        aria-label={l('classCoverClose')}
                    >
                        <X className="h-5 w-5" aria-hidden />
                    </Button>
                </div>

                {/* Banner anteprima attuale */}
                <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                            <div className="relative aspect-[16/9] h-14 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-slate-100 shadow-2xs">
                                <Image
                                    src={currentCoverUrl}
                                    alt={group.name}
                                    fill
                                    unoptimized
                                    className="object-cover"
                                />
                            </div>
                            <div className="min-w-0">
                                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                                    {l('classCoverCurrentPreview')}
                                </span>
                                <p className="truncate text-sm font-semibold text-slate-800" title={group.name}>
                                    {group.name}
                                </p>
                            </div>
                        </div>

                        {isCustomCover && (
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={saving}
                                onClick={() => void handleResetDefault()}
                                className="inline-flex min-h-[36px] items-center gap-1.5 self-start text-xs font-medium text-slate-600 sm:self-auto"
                            >
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                                <span>{l('classCoverResetDefault')}</span>
                            </Button>
                        )}
                    </div>
                </div>

                {/* Tabs Switcher */}
                <div className="flex border-b border-slate-200 bg-white px-5">
                    <button
                        type="button"
                        onClick={() => setActiveTab('presets')}
                        className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs sm:text-sm font-semibold transition ${
                            activeTab === 'presets'
                                ? 'border-indigo-600 text-indigo-700'
                                : 'border-transparent text-slate-500 hover:text-slate-800'
                        }`}
                    >
                        <Palette className="h-4 w-4" aria-hidden />
                        <span>{l('classCoverTabPresets')}</span>
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
                        <span>{l('classCoverTabUpload')}</span>
                    </button>

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
                        <span>{l('classCoverTabAI')}</span>
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
                    {/* 1. Scheda PRESET GRAFICI */}
                    {activeTab === 'presets' && (
                        <div className="space-y-3">
                            <p className="text-xs text-slate-500">
                                {l('classCoverPresetsDesc')}
                            </p>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
                                {CLASS_COVER_PRESETS.map((preset) => {
                                    const isSelected = group.image_url === preset.url;
                                    const presetName = l(preset.labelKey as Parameters<typeof teacherAreaText>[1]);
                                    return (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            disabled={saving}
                                            onClick={() => void handleSelectPreset(preset.url)}
                                            className={`group/preset relative flex flex-col overflow-hidden rounded-xl border text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
                                                isSelected
                                                    ? 'border-indigo-600 ring-2 ring-indigo-500/30 shadow-sm'
                                                    : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs'
                                            }`}
                                        >
                                            <div className="relative aspect-[16/9] w-full overflow-hidden bg-slate-900">
                                                <Image
                                                    src={preset.url}
                                                    alt={presetName}
                                                    fill
                                                    unoptimized
                                                    className="object-cover transition group-hover/preset:scale-105"
                                                />
                                                {isSelected && (
                                                    <div className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white shadow-xs">
                                                        <Check className="h-3 w-3 stroke-[3]" aria-hidden />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="p-2">
                                                <p className="line-clamp-1 text-xs font-semibold text-slate-800 group-hover/preset:text-indigo-700">
                                                    {presetName}
                                                </p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 2. Scheda CARICA DAL COMPUTER */}
                    {activeTab === 'upload' && (
                        <div className="space-y-4">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp,image/gif"
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
                                            setError(l('classCoverUploadError'));
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
                                    {selectedFile ? selectedFile.name : l('classCoverUploadButton')}
                                </h3>
                                <p className="mt-1 max-w-sm text-xs text-slate-500">
                                    {l('classCoverUploadHint')}
                                </p>
                            </div>

                            {previewUrl && (
                                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                        {l('classCoverSelectedPreview')}
                                    </span>
                                    <div className="relative aspect-[16/9] w-full max-h-48 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={previewUrl}
                                            alt={l('classCoverPreviewAlt')}
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
                                            {l('classCoverCancel')}
                                        </Button>
                                        <Button
                                            type="button"
                                            disabled={saving}
                                            onClick={() => void handleUploadSubmit()}
                                            className="inline-flex items-center gap-2"
                                        >
                                            {saving ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                                    <span>{l('classCoverUploadSaving')}</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Upload className="h-4 w-4" aria-hidden />
                                                    <span>{l('classCoverSave')}</span>
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 3. Scheda CREA CON IA */}
                    {activeTab === 'ai' && (
                        <div className="space-y-4">
                            <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50/60 to-orange-50/40 p-4 text-xs leading-relaxed text-slate-700">
                                <div className="flex items-start gap-2.5">
                                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                                    <div>
                                        <strong className="font-semibold text-slate-900">
                                            {l('classCoverAIHeading')}
                                        </strong>
                                        <p className="mt-1">
                                            {l('classCoverAIGuide')}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="ai-cover-prompt" className="text-xs font-semibold text-slate-700">
                                        {l('classCoverAIPromptLabel')}
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
                                                <span className="text-emerald-700">{l('classCoverPromptCopied')}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="h-3.5 w-3.5" aria-hidden />
                                                <span>{l('classCoverCopyPrompt')}</span>
                                            </>
                                        )}
                                    </Button>
                                </div>

                                <textarea
                                    id="ai-cover-prompt"
                                    readOnly
                                    rows={4}
                                    value={aiPrompt}
                                    className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 focus:outline-hidden"
                                />
                            </div>

                            <div className="flex flex-wrap items-center gap-3 pt-2">
                                <span className="text-xs font-semibold text-slate-500">
                                    {l('classCoverAIGenerateOn')}
                                </span>
                                <a
                                    href="https://chatgpt.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                                >
                                    <span>{l('classCoverOpenChatGPT')}</span>
                                    <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                                </a>
                                <a
                                    href="https://gemini.google.com"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                                >
                                    <span>{l('classCoverOpenGemini')}</span>
                                    <ExternalLink className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                                </a>
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
                        {l('classCoverClose')}
                    </Button>
                </div>
            </div>
        </div>,
        document.body
    );
}
