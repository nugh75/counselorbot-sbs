'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '@/lib/i18n-context';
import { AdminChatSandbox } from './AdminChatSandbox';

export interface AdminChatSandboxModalProps {
    open: boolean;
    instrumentCode: string;
    instrumentName?: string;
    isActive?: boolean;
    onClose: () => void;
}

export function AdminChatSandboxModal({
    open,
    instrumentCode,
    instrumentName,
    isActive,
    onClose,
}: AdminChatSandboxModalProps) {
    const { t } = useI18n();
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!open || typeof document === 'undefined') return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-2 sm:p-4 backdrop-blur-xs"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={t('admin.sandbox.title')}
                className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-300"
            >
                <AdminChatSandbox
                    instrumentCode={instrumentCode}
                    instrumentName={instrumentName}
                    isActive={isActive}
                    onClose={onClose}
                    isModal={true}
                />
            </div>
        </div>,
        document.body
    );
}
