'use client';

// Un pezzo sul tavolo. La forma dice che genere di cosa e', con lo stesso
// vocabolario dei diagrammi in chat: scatola arrotondata, scatola squadrata,
// rombo, ellisse — piu' la card d'immagine, dove il file del catalogo e'
// quasi tutto il pezzo. Il tratteggio dice che e' una proposta e non ancora
// contenuto del tavolo.
//
// Il pezzo si scrive dentro se stesso: un doppio clic lo mette in modifica e
// il testo si cambia lì, senza passare dal pannello. E si toglie dal suo
// bordo: il bidone compare al passaggio o alla selezione e porta via con lui
// anche i fili collegati.
//
// Gli agganci sono quattro, uno per lato, e sono tutti sorgenti: la tela sta in
// modalita' permissiva, dove un aggancio riceve anche quello che gli arriva.
// Cosi' un filo si tira da qualunque parte del pezzo senza salvare da quale.

import { memo, useEffect, useRef } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Trash2 } from 'lucide-react';
import type { TavoloColor, TavoloForm, TavoloState } from '@/lib/tavolo';
import { iconUrl } from '@/lib/tavolo-icons';
import { tavoloImageUrl } from '@/lib/tavolo-images';

export interface PieceData extends Record<string, unknown> {
    label: string;
    form: TavoloForm;
    state: TavoloState;
    byModel: boolean;
    accent: boolean;
    color: TavoloColor | null;
    icon: string | null;
    image: string | null;
    editing: boolean;
    locale: string;
    onCommitLabel?: (label: string) => void;
    onCancelEdit?: () => void;
    onDelete?: () => void;
    deleteLabel: string;
}

// Le tinte del raggruppamento. Il petrolio non e' fra queste: e' il pezzo senza
// gruppo, cioe' il caso normale. L'ocra nemmeno, perche' qui dice gia'
// "proposta".
const TINT: Record<TavoloColor, string> = {
    green: 'border-emerald-400 bg-emerald-50',
    blue: 'border-sky-400 bg-sky-50',
    violet: 'border-violet-400 bg-violet-50',
    pink: 'border-rose-400 bg-rose-50',
    grey: 'border-slate-400 bg-slate-100',
};

const SIDES: [Position, string][] = [
    [Position.Top, 't'], [Position.Right, 'r'], [Position.Bottom, 'b'], [Position.Left, 'l'],
];

// Rombo ed ellisse crescono in tutte e due le direzioni: la stessa riga li
// gonfia molto piu' di un rettangolo, percio' partono piu' strette. La card
// d'immagine non ha imbottitura: il file tocca i bordi e il nome sta sotto.
const SHAPE: Record<TavoloForm, string> = {
    concept: 'rounded-xl',
    action: 'rounded-none',
    decision: 'rounded-none [clip-path:polygon(50%_0,100%_50%,50%_100%,0_50%)] px-8 py-6',
    outcome: 'rounded-full px-6',
    image: 'rounded-xl overflow-hidden p-0 flex-col',
};

const WIDTH: Record<TavoloForm, string> = {
    concept: 'w-44', action: 'w-44', decision: 'w-52', outcome: 'w-48', image: 'w-48',
};

function Piece({ data, selected }: NodeProps & { data: PieceData }) {
    const pending = data.state === 'pending';
    const isImage = data.form === 'image';
    const inputRef = useRef<HTMLInputElement>(null);
    const done = useRef(false);
    useEffect(() => { inputRef.current?.select(); }, []);
    const commit = () => {
        if (done.current) return;
        done.current = true;
        const value = (inputRef.current?.value ?? '').trim().slice(0, 80);
        if (value && value !== data.label) data.onCommitLabel?.(value);
        else data.onCancelEdit?.();
    };
    return (
        // Il guscio porta il bidone: sta fuori dalla forma, perche' il rombo
        // con il clip-path taglierebbe tutto quello che spunta dai suoi bordi.
        <div className={`group relative ${isImage ? 'w-48' : ''}`}>
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
                            // Lo stato batte il gruppo: una proposta e il punto si
                            // vedono per quello che sono, il colore aspetta.
                            : `text-slate-800 ${data.color ? TINT[data.color] : 'border-indigo-400 bg-indigo-50'}`,
                    selected ? 'ring-2 ring-indigo-500 ring-offset-1' : '',
                ].join(' ')}
            >
                {SIDES.map(([position, key]) => (
                    <Handle key={key} id={key} type="source" position={position}
                        className="!h-2 !w-2 !border-0 !bg-slate-400" />
                ))}
                {isImage && data.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tavoloImageUrl(data.image)} alt="" className="h-28 w-full object-cover" />
                )}
                {data.editing ? (
                    // La modifica sta nel pezzo: `nodrag` tiene il trascinamento
                    // di React Flow lontano dalla tastiera, `nowheel` lo zoom.
                    <input
                        ref={inputRef}
                        defaultValue={data.label}
                        maxLength={80}
                        aria-label={data.label}
                        className="nodrag nowheel w-full rounded border border-indigo-300 bg-white px-1 py-0.5 text-sm text-slate-900"
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                inputRef.current?.blur();
                            } else if (event.key === 'Escape') {
                                done.current = true;
                                data.onCancelEdit?.();
                            }
                        }}
                        onBlur={commit}
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                    />
                ) : (
                    <span className={`flex min-w-0 items-center gap-1.5 ${isImage ? 'px-2 pb-2' : ''} ${data.form === 'decision' ? 'flex-col' : ''}`}>
                        {data.image && !isImage && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={tavoloImageUrl(data.image)} alt="" aria-hidden="true"
                                className={`h-8 w-8 shrink-0 rounded object-cover ${data.accent && data.state !== 'pending' ? 'bg-white p-0.5' : ''}`} />
                        )}
                        {!data.image && data.icon && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={iconUrl(data.icon)} alt="" width={20} height={20} aria-hidden="true"
                                className={`h-5 w-5 shrink-0 ${data.accent && data.state !== 'pending' ? 'rounded bg-white p-0.5' : ''}`} />
                        )}
                        <span className="break-words">{data.label}</span>
                    </span>
                )}
            </div>
            {data.onDelete && (
                <button type="button" onClick={() => data.onDelete?.()}
                    aria-label={data.deleteLabel} title={data.deleteLabel}
                    className={`nodrag absolute -right-2 -top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 shadow-sm hover:bg-rose-50 hover:text-rose-600 ${selected || data.editing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
            )}
        </div>
    );
}

export const TavoloPieceNode = memo(Piece);
