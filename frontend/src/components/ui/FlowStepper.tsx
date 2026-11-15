import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// Binario di misura: orienta il percorso (Scegli → Counselor → Inserisci → Profilo
// → Conversa → Fine). Tratto percorso in petrol, "sei qui" in ocra (nodo pieno con
// anello), tappe future come tacca vuota. Su mobile restano solo i nodi; le etichette
// (testo spaziato, registro "strumento") compaiono da sm in su.
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
                    <li key={label} aria-current={active ? 'step' : undefined} className="flex shrink-0 items-center gap-1 sm:gap-2">
                        <span
                            className={cn(
                                'flex items-center gap-2 whitespace-nowrap transition-colors',
                                active ? 'font-semibold text-move-hover' : done ? 'text-link' : 'text-ink-muted',
                            )}
                        >
                            <span
                                className={cn(
                                    'flex items-center justify-center text-2xs font-semibold transition-all',
                                    active
                                        ? 'h-5 w-5 rounded-full bg-move text-ink-on-brand ring-4 ring-move/15'
                                        : done
                                            ? 'h-5 w-5 rounded-full bg-brand text-ink-on-brand'
                                            : 'h-2.5 w-2.5 rounded-full border-2 border-line-strong',
                                )}
                            >
                                {done ? <Check className="h-3 w-3" /> : active ? i + 1 : null}
                            </span>
                            {/* Sotto sm restava solo il passo attivo come numero dentro il
                                pallino: una riga per dire "4", senza dire di che cosa. Il
                                nome della tappa corrente resta sempre visibile, le altre
                                compaiono da sm in su. */}
                            <span className={cn('text-xs tracking-[0.08em]', active ? 'inline' : 'hidden sm:inline')}>{label}</span>
                        </span>
                        {i < steps.length - 1 && (
                            <span className={cn('h-px w-4 sm:w-8 transition-colors', done ? 'bg-brand' : 'bg-line')} />
                        )}
                    </li>
                );
            })}
        </ol>
    );
}
