'use client';

import { FileType } from 'lucide-react';
import { useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';
import { QuestionnaireConfig } from '@/lib/questionnaires';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';

interface PDFUploaderProps {
    onUploadComplete: (scores: Record<string, number>) => void;
    questionnaire: QuestionnaireConfig;
    onBack?: () => void;
}

function isScoreMap(value: unknown): value is Record<string, number> {
    return typeof value === 'object' && value !== null
        && Object.values(value).every((score) => typeof score === 'number' && score >= 1 && score <= 9);
}

export function PDFUploader({ onUploadComplete, questionnaire, onBack }: PDFUploaderProps) {
    const { t, lang } = useI18n();
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [fileInputRef, setFileInputRef] = useState<HTMLInputElement | null>(null);
    const [uploadError, setUploadError] = useState('');

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
        setUploadError('');
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('questionnaire_type', questionnaire.id);
            // Lingua dell'interfaccia: l'errore del ripiego OCR arriva localizzato.
            formData.append('lang', lang);
            
            // Adjust the URL if necessary based on your Next.js proxy or backend URL
            // Assuming Next.js rewrites /api -> Backend
            // If direct to backend: http://localhost:8000/qsa/upload
            const response = await apiFetch('/api/qsa/upload', {
                method: 'POST',
                body: formData,
            });
            
            if (!response.ok) {
                const errorData = await response.json() as { detail?: string };
                throw new Error(errorData.detail ?? 'Upload failed');
            }
            
            const data: unknown = await response.json();
            if (data && typeof data === 'object') {
                if (isScoreMap(data)) {
                    onUploadComplete(data);
                } else {
                    throw new Error('Invalid scores returned by extractor');
                }
            } else {
                throw new Error('Invalid scores returned by extractor');
            }
            
        } catch (error) {
            console.error("Upload error:", error);
            // La finestra nativa non segue il tema, non traduce il suo pulsante
            // e interrompe il caricamento con un blocco modale: l'errore resta
            // nella pagina, dove sta il comando che l'ha prodotto.
            const errMsg = error instanceof Error ? error.message : String(error);
            setUploadError(`${t('pdf.error')} (${errMsg})`);
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="w-full space-y-5 animate-fade-in-up">
            <div className="flex items-center gap-3">
                {onBack && <BackButton onClick={onBack} label={t('nav.back')} />}
            </div>
            <div className="w-full max-w-xl mx-auto space-y-4">
            {uploadError && <Callout variant="danger">{uploadError}</Callout>}
            <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={cn(
                    "relative flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-card transition-colors bg-surface",
                    isDragging ? "border-brand bg-brand-soft" : "border-line-strong hover:border-brand-line",
                    isUploading ? "pointer-events-none opacity-50" : ""
                )}
            >
                {isUploading ? (
                    <div className="flex flex-col items-center animate-pulse">
                        <p className="text-lg font-semibold text-ink">{t('pdf.analyzing.title')}</p>
                        <p className="text-sm text-ink-muted mt-2">
                            {t('pdf.analyzing.sub')} ({questionnaire.factors.length})
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="p-4 rounded-control bg-brand-soft mb-4">
                            <FileType className="w-8 h-8 text-link" />
                        </div>
                        <p className="text-lg font-semibold text-ink mb-1">{t('pdf.drop')}</p>
                        <p className="text-sm text-ink-muted mb-6">{t('pdf.or')}</p>
                        <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png"
                            ref={setFileInputRef}
                            onChange={handleFileSelect}
                        />
                        <Button size="lg" onClick={triggerFileSelect}>
                            {t('pdf.select')}
                        </Button>
                    </>
                )}
            </div>
            <p className="text-center text-xs text-ink-muted mt-4">
                {t('pdf.support')}
            </p>
            </div>
        </div>
    );
}
