'use client';

import { FileType } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';
import { QuestionnaireConfig } from '@/lib/questionnaires';
import { BackButton } from '@/components/ui/BackButton';

interface PDFUploaderProps {
    onUploadComplete: (scores: Record<string, number>, pdfToken?: string) => void;
    questionnaire: QuestionnaireConfig;
    onBack?: () => void;
}

function isScoreMap(value: unknown): value is Record<string, number> {
    return typeof value === 'object' && value !== null
        && Object.values(value).every((score) => typeof score === 'number' && score >= 1 && score <= 9);
}

export function PDFUploader({ onUploadComplete, questionnaire, onBack }: PDFUploaderProps) {
    const { t } = useI18n();
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [fileInputRef, setFileInputRef] = useState<HTMLInputElement | null>(null);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setIsDragging(true);
        } else if (e.type === "dragleave") {
            setIsDragging(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files && files[0]) {
            startUpload(files[0]);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files[0]) {
            startUpload(files[0]);
        }
    };

    const triggerFileSelect = () => {
        fileInputRef?.click();
    };

    const startUpload = async (file: File) => {
        setIsUploading(true);
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('questionnaire_type', questionnaire.id);
            
            // Adjust the URL if necessary based on your Next.js proxy or backend URL
            // Assuming Next.js rewrites /api -> Backend
            // If direct to backend: http://localhost:8000/qsa/upload
            const response = await fetch('/api/qsa/upload', {
                method: 'POST',
                body: formData,
            });
            
            if (!response.ok) {
                const errorData = await response.json() as { detail?: string };
                throw new Error(errorData.detail ?? 'Upload failed');
            }
            
            const data: unknown = await response.json();
            if (data && typeof data === 'object') {
                const { pdf_token, ...scores } = data as Record<string, unknown>;
                if (isScoreMap(scores)) {
                    onUploadComplete(scores, typeof pdf_token === 'string' ? pdf_token : undefined);
                } else {
                    throw new Error('Invalid scores returned by extractor');
                }
            } else {
                throw new Error('Invalid scores returned by extractor');
            }
            
        } catch (error) {
            console.error("Upload error:", error);
            const errMsg = error instanceof Error ? error.message : String(error);
            alert(`${t('pdf.error')}\n(${errMsg})`);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="w-full space-y-5 animate-fade-in-up">
            <div className="flex items-center gap-3">
                {onBack && <BackButton onClick={onBack} label={t('nav.back')} />}
            </div>
            <div className="w-full max-w-xl mx-auto">
            <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={cn(
                    "relative flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-lg transition-colors bg-white",
                    isDragging ? "border-indigo-400 bg-indigo-50" : "border-slate-300 hover:border-indigo-300",
                    isUploading ? "pointer-events-none opacity-50" : ""
                )}
            >
                {isUploading ? (
                    <div className="flex flex-col items-center animate-pulse">
                        <p className="text-lg font-medium text-slate-900">{t('pdf.analyzing.title')}</p>
                        <p className="text-sm text-slate-500 mt-2">
                            {t('pdf.analyzing.sub')} ({questionnaire.factors.length})
                        </p>
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
                            accept=".pdf,.jpg,.jpeg,.png"
                            ref={setFileInputRef}
                            onChange={handleFileSelect}
                        />
                        <button
                            onClick={triggerFileSelect}
                            className="px-6 py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition-colors font-medium text-sm"
                        >
                            {t('pdf.select')}
                        </button>
                    </>
                )}
            </div>
            <p className="text-center text-xs text-slate-500 mt-4">
                {t('pdf.support')}
            </p>
            </div>
        </div>
    );
}
