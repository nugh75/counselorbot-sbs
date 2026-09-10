'use client';

// Una connessione sul tavolo. Tre canali visivi, uno per informazione:
// il colore dice la famiglia (quattro tinte, non tredici), lo spessore dice
// quanto pesa, il tratteggio dice che e' un'ipotesi. La parola sull'arco dice
// quale verbo dentro la famiglia, e se la persona ne ha scritta una sua dice
// quella.
//
// Il filo non parte da un aggancio fisso: parte dal bordo che guarda l'altro
// pezzo. Con due soli agganci ogni filo usciva dal fondo ed entrava in cima, e
// oltre i tre o quattro archi si accavallavano; cosi' invece il disegno resta
// leggibile da qualunque parte si trascinino i pezzi, e non c'e' niente in piu'
// da salvare.

import { memo } from 'react';
import {
    BaseEdge, EdgeLabelRenderer, Position, getBezierPath, useInternalNode,
    type EdgeProps, type InternalNode, type Node,
} from '@xyflow/react';
import { FAMILY_STROKE, familyOf, type TavoloForm, type TavoloRel, type TavoloState } from '@/lib/tavolo';
import { relLabel } from '@/lib/i18n-tavolo';
import type { PieceData } from './TavoloPieceNode';

export interface LinkData extends Record<string, unknown> {
    rel: TavoloRel;
    label?: string | null;
    strength: number;
    hypothesis: boolean;
    state: TavoloState;
    locale: string;
}

const WIDTH: Record<number, number> = { 1: 1, 2: 1.8, 3: 3 };

// Quanto e' lontano il bordo, nella direzione data, in multipli del raggio.
// Rettangolo, rombo ed ellisse sono la stessa formula con tre norme diverse:
// cosi' il filo tocca la figura che si vede e non il rettangolo che la
// contiene. Gli angoli arrotondati del concetto restano un'approssimazione da
// pochi pixel, e nessuno la nota.
const NORM: Record<TavoloForm, (x: number, y: number) => number> = {
    concept: (x, y) => Math.max(Math.abs(x), Math.abs(y)),
    action: (x, y) => Math.max(Math.abs(x), Math.abs(y)),
    decision: (x, y) => Math.abs(x) + Math.abs(y),
    outcome: (x, y) => Math.hypot(x, y),
};

type Piece = InternalNode<Node<PieceData>>;
type Point = { x: number; y: number };

const centre = (node: Piece): Point => ({
    x: node.internals.positionAbsolute.x + (node.measured.width ?? 0) / 2,
    y: node.internals.positionAbsolute.y + (node.measured.height ?? 0) / 2,
});

function border(node: Piece, towards: Point): Point {
    const from = centre(node);
    const a = (node.measured.width ?? 0) / 2;
    const b = (node.measured.height ?? 0) / 2;
    const dx = towards.x - from.x;
    const dy = towards.y - from.y;
    if (!a || !b) return from;
    const reach = NORM[node.data.form](dx / a, dy / b);
    return reach ? { x: from.x + dx / reach, y: from.y + dy / reach } : from;
}

// Il lato da cui la curva esce: quello verso cui il filo va davvero. Serve solo
// alla bezier, per piegare dalla parte giusta.
const side = (dx: number, dy: number) => (Math.abs(dx) > Math.abs(dy)
    ? (dx > 0 ? Position.Right : Position.Left)
    : (dy > 0 ? Position.Bottom : Position.Top));

function Link({ id, source, target, data, markerStart, markerEnd }: EdgeProps & { data: LinkData }) {
    const from = useInternalNode<Node<PieceData>>(source);
    const to = useInternalNode<Node<PieceData>>(target);
    if (!from || !to) return null;

    const start = border(from, centre(to));
    const end = border(to, centre(from));
    const dx = centre(to).x - centre(from).x;
    const dy = centre(to).y - centre(from).y;
    const [path, labelX, labelY] = getBezierPath({
        sourceX: start.x, sourceY: start.y, sourcePosition: side(dx, dy),
        targetX: end.x, targetY: end.y, targetPosition: side(-dx, -dy),
    });
    const pending = data.state === 'pending';
    const colour = pending ? 'var(--color-ochre-400)' : FAMILY_STROKE[familyOf(data.rel)];
    const word = data.label?.trim() || relLabel(data.rel, data.locale);

    return (
        <>
            <BaseEdge
                id={id}
                path={path}
                markerStart={markerStart}
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
