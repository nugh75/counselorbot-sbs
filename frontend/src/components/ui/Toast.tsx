'use client';

import { useSyncExternalStore } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';

// Toast minimale senza dipendenze: store a livello di modulo + <Toaster/> montato
// una volta nel layout. Le pagine chiamano toast.success/error(...) al posto di
// console.error silenzioso.
type ToastType = 'success' | 'error' | 'info';
interface ToastItem { id: number; type: ToastType; message: string }

const EMPTY: ToastItem[] = [];
let items: ToastItem[] = EMPTY;
const listeners = new Set<() => void>();
let nextId = 0;

function emit() {
    listeners.forEach((l) => l());
}

function push(type: ToastType, message: string) {
    const item: ToastItem = { id: ++nextId, type, message };
    items = [...items, item];
    emit();
    setTimeout(() => {
        items = items.filter((t) => t.id !== item.id);
        emit();
    }, 4000);
}

function dismiss(id: number) {
    items = items.filter((t) => t.id !== id);
    emit();
}

export const toast = {
    success: (m: string) => push('success', m),
    error: (m: string) => push('error', m),
    info: (m: string) => push('info', m),
};

function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
}

const STYLES: Record<ToastType, { box: string; icon: typeof CheckCircle2 }> = {
    success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CheckCircle2 },
    error: { box: 'border-red-200 bg-red-50 text-red-900', icon: XCircle },
    info: { box: 'border-sky-200 bg-sky-50 text-sky-900', icon: Info },
};

export function Toaster() {
    const { t } = useI18n();
    const list = useSyncExternalStore(subscribe, () => items, () => EMPTY);
    if (list.length === 0) return null;
    return (
        <div className="fixed bottom-4 right-4 z-[100] flex w-[min(92vw,22rem)] flex-col gap-2">
            {list.map((item) => {
                const s = STYLES[item.type];
                const Icon = s.icon;
                return (
                    <div
                        key={item.id}
                        role="status"
                        className={cn('flex items-start gap-2 rounded-xl border p-3 text-sm shadow-lg animate-fade-in-up', s.box)}
                    >
                        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1">{item.message}</span>
                        <button onClick={() => dismiss(item.id)} className="shrink-0 opacity-60 hover:opacity-100" aria-label={t('common.close')}>
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
