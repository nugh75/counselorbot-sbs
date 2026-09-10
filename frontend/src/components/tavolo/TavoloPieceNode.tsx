'use client';

// Un pezzo sul tavolo. La forma dice che genere di cosa e', con lo stesso
// vocabolario dei diagrammi in chat: scatola arrotondata, scatola squadrata,
// rombo, ellisse. Il tratteggio dice che e' una proposta e non ancora
// contenuto del tavolo.

import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { TavoloForm, TavoloState } from '@/lib/tavolo';

export interface PieceData extends Record<string, unknown> {
    label: string;
    form: TavoloForm;
    state: TavoloState;
    byModel: boolean;
}

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
                    ? 'border-dashed border-ochre-400 bg-ochre-50 text-slate-600'
                    : 'border-indigo-400 bg-indigo-50 text-slate-800',
                selected ? 'ring-2 ring-indigo-500 ring-offset-1' : '',
            ].join(' ')}
        >
            <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-slate-400" />
            <span className="break-words">{data.label}</span>
            <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-slate-400" />
        </div>
    );
}

export const TavoloPieceNode = memo(Piece);
