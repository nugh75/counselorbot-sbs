import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Forma condivisa delle tre superfici di conversazione (chat guidata, Bussola,
// assistente). Erano tre linguaggi visivi per la stessa interazione: bolla
// bianca con angolo tagliato, bolla grigia con angolo pieno, bolla bianca senza
// angolo; attesa segnalata da un pallino pulsante in una e da uno spinner nelle
// altre due. Nessuna era sbagliata: erano tre.
// Vince il trattamento della chat guidata, che e' quella piu' usata e piu'
// disegnata; l'attesa vince lo spinner, che sta dentro il vocabolario di
// movimento dichiarato in design.md §4 (il pallino pulsante non c'era).

const BASE = 'min-w-0 break-words rounded-lg px-4 py-3 text-sm leading-relaxed shadow-sm sm:px-5 sm:py-3.5';

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

// Attesa della risposta, allineata a sinistra come una bolla dell'assistente.
export function ChatPending({ label }: { label: string }) {
    return (
        <div className="flex justify-start">
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-600" />
                <span className="text-xs font-medium text-slate-500">{label}</span>
            </div>
        </div>
    );
}
