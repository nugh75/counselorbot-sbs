import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TypingDots } from '@/components/ui/TypingDots';

// Forma condivisa delle tre superfici di conversazione (chat guidata, Bussola,
// assistente). Erano tre linguaggi visivi per la stessa interazione: bolla
// bianca con angolo tagliato, bolla grigia con angolo pieno, bolla bianca senza
// angolo; attesa segnalata da un pallino pulsante in una e da uno spinner nelle
// altre due. Nessuna era sbagliata: erano tre.
// Vince il trattamento della chat guidata, che e' quella piu' usata e piu'
// disegnata; l'attesa sono tre puntini (design.md §4, #935).

const BASE = 'chat-message min-w-0 max-w-full break-words rounded-card px-4 py-3 text-base leading-relaxed sm:px-5 sm:py-3.5';

const ROLE: Record<'user' | 'assistant', string> = {
    user: 'bg-indigo-600 text-white rounded-tr-sm',
    assistant: 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm',
};

export function ChatBubble({
    role,
    className,
    children,
}: {
    role: 'user' | 'assistant';
    className?: string;
    children: ReactNode;
}) {
    return <div className={cn(BASE, ROLE[role], className)}>{children}</div>;
}

// Spinner e testo dell'attesa: lo stesso segno sia nella pillola in coda sia
// dentro una bolla dell'assistente ancora vuota.
export function ChatPendingIndicator({ label }: { label: string }) {
    return (
        <span className="flex items-center gap-3">
            <TypingDots />
            <span className="text-xs font-medium text-slate-500">{label}</span>
        </span>
    );
}

// Attesa della risposta, allineata a sinistra come una bolla dell'assistente.
export function ChatPending({ label }: { label: string }) {
    return (
        <div className="flex justify-start">
            <div className="rounded-card border border-slate-200 bg-white px-4 py-3">
                <ChatPendingIndicator label={label} />
            </div>
        </div>
    );
}
