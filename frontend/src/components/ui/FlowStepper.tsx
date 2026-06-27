import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// Stepper di orientamento del percorso: mostra "dove sei" tra le fasi
// (Scegli → Inserisci → Profilo → Conversa → Fine). Su mobile mostra solo i
// numeri/spunte; le etichette compaiono da sm in su.
interface FlowStepperProps {
    steps: string[];
    current: number;
}

export function FlowStepper({ steps, current }: FlowStepperProps) {
    return (
        <ol className="flex items-center gap-1 sm:gap-2 overflow-x-auto py-1 text-xs">
            {steps.map((label, i) => {
                const done = i < current;
                const active = i === current;
                return (
                    <li key={label} className="flex shrink-0 items-center gap-1 sm:gap-2">
                        <span
                            className={cn(
                                'flex items-center gap-1.5 rounded-full px-2 py-1 font-medium whitespace-nowrap transition-colors',
                                active ? 'bg-indigo-600 text-white' : done ? 'text-indigo-700' : 'text-slate-400',
                            )}
                        >
                            <span
                                className={cn(
                                    'flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold',
                                    active ? 'bg-white/25 text-white' : done ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400',
                                )}
                            >
                                {done ? <Check className="h-3 w-3" /> : i + 1}
                            </span>
                            <span className="hidden sm:inline">{label}</span>
                        </span>
                        {i < steps.length - 1 && (
                            <span className={cn('h-px w-3 sm:w-6', done ? 'bg-indigo-300' : 'bg-slate-200')} />
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
