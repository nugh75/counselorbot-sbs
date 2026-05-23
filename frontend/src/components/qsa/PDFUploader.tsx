'use client';

import { UploadCloud, FileType } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';

interface PDFUploaderProps {
    onUploadComplete: (mockData: any) => void;
}

export function PDFUploader({ onUploadComplete }: PDFUploaderProps) {
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
            
            // Adjust the URL if necessary based on your Next.js proxy or backend URL
            // Assuming Next.js rewrites /api -> Backend
            // If direct to backend: http://localhost:8000/qsa/upload
            const response = await fetch('/api/qsa/upload', {
                method: 'POST',
                body: formData,
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Upload failed');
            }
            
            const data = await response.json();
            onUploadComplete(data);
            
        } catch (error) {
            console.error("Upload error:", error);
            alert(t('pdf.error'));
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="w-full max-w-xl mx-auto">
            <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={cn(
                    "relative flex flex-col items-center justify-center h-64 border-2 border-dashed rounded-2xl transition-all duration-300 bg-white/5",
                    isDragging ? "border-blue-500 bg-blue-500/10" : "border-white/20 hover:border-white/40",
                    isUploading ? "pointer-events-none opacity-50" : ""
                )}
            >
                {isUploading ? (
                    <div className="flex flex-col items-center animate-pulse">
                        <UploadCloud className="w-12 h-12 text-blue-400 mb-4 animate-bounce" />
                        <p className="text-lg font-medium">{t('pdf.analyzing.title')}</p>
                        <p className="text-sm text-muted-foreground mt-2">{t('pdf.analyzing.sub')}</p>
                    </div>
                ) : (
                    <>
                        <div className="p-4 rounded-full bg-white/5 mb-4">
                            <FileType className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <p className="text-lg font-medium mb-1">{t('pdf.drop')}</p>
                        <p className="text-sm text-muted-foreground mb-6">{t('pdf.or')}</p>
                        <input
                            type="file"
                            className="hidden"
                            accept=".pdf,.jpg,.jpeg,.png"
                            ref={setFileInputRef}
                            onChange={handleFileSelect}
                        />
                        <button
                            onClick={triggerFileSelect}
                            className="px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors font-medium text-sm"
                        >
                            {t('pdf.select')}
                        </button>
                    </>
                )}
            </div>
            <p className="text-center text-xs text-muted-foreground mt-4">
                {t('pdf.support')}
            </p>
        </div>
    );
}
