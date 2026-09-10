'use client';

// Un pezzo sul tavolo. La forma dice che genere di cosa e', con lo stesso
// vocabolario dei diagrammi in chat: scatola arrotondata, scatola squadrata,
// rombo, ellisse. Il tratteggio dice che e' una proposta e non ancora
// contenuto del tavolo.
//
// Gli agganci sono quattro, uno per lato, e sono tutti sorgenti: la tela sta in
// modalita' permissiva, dove un aggancio riceve anche quello che gli arriva.
// Cosi' un filo si tira da qualunque parte del pezzo senza salvare da quale.

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TavoloForm, TavoloState } from '@/lib/tavolo';

export interface PieceData extends Record<string, unknown> {
    label: string;
    form: TavoloForm;
    state: TavoloState;
    byModel: boolean;
    accent: boolean;
}

const SIDES: [Position, string][] = [
    [Position.Top, 't'], [Position.Right, 'r'], [Position.Bottom, 'b'], [Position.Left, 'l'],
];

// Rombo ed ellisse crescono in tutte e due le direzioni: la stessa riga li
// gonfia molto piu' di un rettangolo, percio' partono piu' strette.
const SHAPE: Record<TavoloForm, string> = {
    concept: 'rounded-xl',
    action: 'rounded-none',
    decision: 'rounded-none [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)] px-8 py-6',
    outcome: 'rounded-full px-6',
};

const WIDTH: Record<TavoloForm, string> = {
    concept: 'w-44', action: 'w-44', decision: 'w-52', outcome: 'w-48',
};

function Piece({ data, selected }: NodeProps & { data: PieceData }) {
    const pending = data.state === 'pending';
    return (
        <div
            className={[
                'flex min-h-14 items-center justify-center border-2 px-4 py-3 text-center text-sm leading-snug',
                SHAPE[data.form], WIDTH[data.form],
                pending
                    // L'accento aspetta: finche' e' una proposta il pezzo dice
                    // di essere una proposta, che e' l'informazione piu' urgente.
                    ? 'border-dashed border-ochre-400 bg-ochre-50 text-slate-600'
                    // Il pezzo che conta si riempie di petrolio invece di
                    // prendere l'ocra: l'ocra qui vuol dire gia' "proposta", e
                    // un accento che sembra una proposta non accentua niente.
                    : data.accent
                        ? 'border-indigo-700 bg-indigo-600 font-medium text-white'
                        : 'border-indigo-400 bg-indigo-50 text-slate-800',
                selected ? 'ring-2 ring-indigo-500 ring-offset-1' : '',
            ].join(' ')}
        >
            {SIDES.map(([position, key]) => (
                <Handle key={key} id={key} type="source" position={position}
                    className="!h-2 !w-2 !border-0 !bg-slate-400" />
            ))}
            <span className="break-words">{data.label}</span>
        </div>
    );
}

export const TavoloPieceNode = memo(Piece);
