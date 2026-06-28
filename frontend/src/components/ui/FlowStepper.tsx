import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// Binario di misura: orienta il percorso (Scegli → Counselor → Inserisci → Profilo
// → Conversa → Fine). Tratto percorso in petrol, "sei qui" in ocra (nodo pieno con
// anello), tappe future come tacca vuota. Su mobile restano solo i nodi; le etichette
// (maiuscoletto spaziato, registro "strumento") compaiono da sm in su.
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
                                'flex items-center gap-2 whitespace-nowrap transition-colors',
                                active ? 'text-ochre-700 font-semibold' : done ? 'text-indigo-700 font-medium' : 'text-slate-400',
                            )}
                        >
                            <span
                                className={cn(
                                    'flex items-center justify-center text-[10px] font-bold transition-all',
                                    active
                                        ? 'h-5 w-5 rounded-full bg-ochre-500 text-white ring-4 ring-ochre-500/15'
                                        : done
                                            ? 'h-5 w-5 rounded-full bg-indigo-600 text-white'
                                            : 'h-2.5 w-2.5 rounded-full border-2 border-slate-300',
                                )}
                            >
                                {done ? <Check className="h-3 w-3" /> : active ? i + 1 : null}
                            </span>
                            <span className="hidden sm:inline text-[11px] uppercase tracking-[0.08em]">{label}</span>
                        </span>
                        {i < steps.length - 1 && (
                            <span className={cn('h-px w-4 sm:w-8 transition-colors', done ? 'bg-indigo-400' : 'bg-slate-200')} />
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
