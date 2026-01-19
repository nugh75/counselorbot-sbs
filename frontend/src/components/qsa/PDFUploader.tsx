'use client';

import { UploadCloud, FileType } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface PDFUploaderProps {
    onUploadComplete: (mockData: any) => void;
}

export function PDFUploader({ onUploadComplete }: PDFUploaderProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

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

        // Mock upload process
        const files = e.dataTransfer.files;
        if (files && files[0]) {
            startMockUpload(files[0]);
        }
    };

    const startMockUpload = (file: File) => {
        setIsUploading(true);
        // Simulate API call delay
        setTimeout(() => {
            setIsUploading(false);
            // Return some mock data for demo purposes
            const mockScores = {
                C1: 5, C2: 3, C3: 2, C4: 7, C5: 4, C6: 6, C7: 8,
                A1: 2, A2: 6, A3: 5, A4: 3, A5: 2, A6: 7, A7: 1
            };
            onUploadComplete(mockScores);
        }, 2000);
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
                        <p className="text-lg font-medium">Analizzando il documento con AI...</p>
                        <p className="text-sm text-muted-foreground mt-2">Estrazione dei 14 fattori in corso...</p>
                    </div>
                ) : (
                    <>
                        <div className="p-4 rounded-full bg-white/5 mb-4">
                            <FileType className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <p className="text-lg font-medium mb-1">Trascina qui il tuo file (PDF o Immagine)</p>
                        <p className="text-sm text-muted-foreground mb-6">oppure clicca per selezionare</p>
                        <button className="px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors font-medium text-sm">
                            Seleziona File
                        </button>
                    </>
                )}
            </div>
            <p className="text-center text-xs text-muted-foreground mt-4">
                Supporta: PDF, JPG, PNG. Dimensione massima: 10MB.
            </p>
        </div>
    );
}
