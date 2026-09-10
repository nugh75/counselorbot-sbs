'use client';

// Una connessione sul tavolo. Tre canali visivi, uno per informazione:
// il colore dice la famiglia (quattro tinte, non tredici), lo spessore dice
// quanto pesa, il tratteggio dice che e' un'ipotesi. La parola sull'arco dice
// quale verbo dentro la famiglia.

import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { FAMILY_STROKE, familyOf, type TavoloRel, type TavoloState } from '@/lib/tavolo';
import { relLabel } from '@/lib/i18n-tavolo';

export interface LinkData extends Record<string, unknown> {
    rel: TavoloRel;
    label?: string | null;
    strength: number;
    hypothesis: boolean;
    state: TavoloState;
    locale: string;
}

const WIDTH: Record<number, number> = { 1: 1, 2: 1.8, 3: 3 };

function Link({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
    data, markerEnd }: EdgeProps & { data: LinkData }) {
    const [path, labelX, labelY] = getBezierPath({
        sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
    });
    const pending = data.state === 'pending';
    const colour = pending ? 'var(--color-ochre-400)' : FAMILY_STROKE[familyOf(data.rel)];
    const word = data.label?.trim() || relLabel(data.rel, data.locale);

    return (
        <>
            <BaseEdge
                id={id}
                path={path}
                markerEnd={markerEnd}
                style={{
                    stroke: colour,
                    strokeWidth: WIDTH[data.strength] ?? 1.8,
                    // Un legame ipotetico e una proposta si tratteggiano tutti e due:
                    // in entrambi i casi la linea dice "non ancora dato per certo".
                    strokeDasharray: data.hypothesis || pending ? '6 4' : undefined,
                    opacity: pending ? 0.75 : 1,
                }}
            />
            <EdgeLabelRenderer>
                <span
                    // La pastiglia opaca sotto il testo e' la stessa cura dei diagrammi
                    // Graphviz: senza, la linea taglia la parola.
                    className="pointer-events-none absolute rounded bg-white px-1.5 py-0.5 text-[11px] leading-tight text-slate-600"
                    style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
                >
                    {word}
                </span>
            </EdgeLabelRenderer>
        </>
    );
}

export const TavoloLinkEdge = memo(Link);
