'use client';

// La tela del tavolo. Possiede il grafo mentre lo si lavora e lo restituisce a
// chi la ospita a ogni mossa; il salvataggio, le proposte e il server sono
// affari della pagina.
//
// Il pannello a destra e' anche il posto in cui si sceglie la connessione:
// collegare due pezzi crea un legame di serie e lo seleziona, e li' si sceglie
// prima la famiglia (quattro bottoni) e poi il verbo. Un pannello che c'e' gia'
// evita una finestra che comparirebbe a ogni filo tirato.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Background,
    ConnectionMode,
    MarkerType,
    Panel,
    ReactFlow,
    ReactFlowProvider,
    useNodesState,
    useNodesInitialized,
    useReactFlow,
    type Connection,
    type Edge,
    type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Dagre from '@dagrejs/dagre';
import { PanelRightClose, PanelRightOpen, Plus, Scan, Star, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import {
    FAMILIES,
    NODE_COLORS,
    RELS_BY_FAMILY,
    edgeKey,
    familyOf,
    type TavoloColor,
    type TavoloEdgeData,
    type TavoloForm,
    type TavoloGraph,
    type TavoloRel,
} from '@/lib/tavolo';
import { familyLabel, relLabel, tavoloLabel } from '@/lib/i18n-tavolo';
import { fetchIcons, iconUrl, matchIcons, type IconEntry } from '@/lib/tavolo-icons';
import {
    fetchTavoloImages, matchTavoloImages, tavoloImageUrl, type TavoloImageEntry,
} from '@/lib/tavolo-images';
import { TavoloPieceNode, type PieceData } from './TavoloPieceNode';
import { TavoloLinkEdge, type LinkData } from './TavoloLinkEdge';

const nodeTypes = { piece: TavoloPieceNode };
const edgeTypes = { link: TavoloLinkEdge };
const FORMS: TavoloForm[] = ['concept', 'action', 'decision', 'outcome', 'image'];
// Le pastiglie della tavolozza: le stesse tinte dei pezzi, in piccolo.
const SWATCH: Record<string, string> = {
    none: 'border-indigo-400 bg-indigo-50',
    green: 'border-emerald-400 bg-emerald-50',
    blue: 'border-sky-400 bg-sky-50',
    violet: 'border-violet-400 bg-violet-50',
    pink: 'border-rose-400 bg-rose-50',
    grey: 'border-slate-400 bg-slate-100',
};
const DEFAULT_REL: TavoloRel = 'causes';

/** Il seme arriva senza posizioni: si dispone una volta, poi e' della persona. */
function seeded(graph: TavoloGraph): TavoloGraph {
    if (graph.nodes.some((node) => node.x !== 0 || node.y !== 0)) return graph;
    const layout = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    layout.setGraph({ rankdir: 'TB', ranksep: 90, nodesep: 60 });
    graph.nodes.forEach((node) => layout.setNode(node.id, { width: 180, height: 64 }));
    graph.edges.forEach((edge) => layout.setEdge(edge.from, edge.to));
    Dagre.layout(layout);
    return {
        ...graph,
        nodes: graph.nodes.map((node) => {
            const placed = layout.node(node.id);
            return placed ? { ...node, x: placed.x - 90, y: placed.y - 32 } : node;
        }),
    };
}

export function TavoloCanvas(props: {
    graph: TavoloGraph;
    locale: string;
    onChange: (graph: TavoloGraph) => void;
    onSave?: () => Promise<unknown>;
    busy?: boolean;
    focusIds?: string[];
}) {
    return (
        <ReactFlowProvider>
            <Canvas {...props} />
        </ReactFlowProvider>
    );
}

function Canvas({ graph, locale, onChange, onSave, busy = false, focusIds }: {
    graph: TavoloGraph; locale: string; onChange: (graph: TavoloGraph) => void;
    onSave?: () => Promise<unknown>; busy?: boolean; focusIds?: string[];
}) {
    const { fitView, zoomIn, zoomOut, screenToFlowPosition } = useReactFlow();
    const surface = useRef<HTMLDivElement>(null);
    const nodesReady = useNodesInitialized();
    const [connecting, setConnecting] = useState(false);
    // Il pezzo che si scrive dentro se stesso: un doppio clic lo apre, Enter o
    // un clic fuori lo chiudono. Uno per volta, come la selezione.
    const [editingId, setEditingId] = useState<string | null>(null);
    const [fromId, setFromId] = useState('');
    const [toId, setToId] = useState('');
    const [words, setWords] = useState('');
    // Il pannello si chiude: su un tavolo fitto le settanta colonne a destra
    // sono lo spazio che manca al disegno.
    const [panelOpen, setPanelOpen] = useState(true);
    const [selected, setSelected] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null);
    const label = useCallback((key: Parameters<typeof tavoloLabel>[0]) => tavoloLabel(key, locale), [locale]);

    // Il catalogo arriva una volta per lingua: il selettore lo filtra a video,
    // non lo richiede a ogni tasto premuto.
    const [icons, setIcons] = useState<IconEntry[]>([]);
    const [iconQuery, setIconQuery] = useState('');
    useEffect(() => {
        let alive = true;
        fetchIcons(locale).then((next) => { if (alive) setIcons(next); }).catch(() => undefined);
        return () => { alive = false; };
    }, [locale]);

    // Le immagini del catalogo caricato dall'amministrazione: una volta per
    // tela, e il selettore le filtra a video sul nome e sull'utilizzo.
    const [images, setImages] = useState<TavoloImageEntry[]>([]);
    const [imageQuery, setImageQuery] = useState('');
    useEffect(() => {
        let alive = true;
        fetchTavoloImages().then((next) => { if (alive) setImages(next); }).catch(() => undefined);
        return () => { alive = false; };
    }, []);

    // Position incoming proposals without moving pieces already arranged by the person.
    const known = useRef<Set<string> | null>(null);
    useEffect(() => {
        const previous = known.current;
        known.current = new Set(graph.nodes.map((node) => node.id));
        if (!previous) {
            const placed = seeded(graph);
            if (placed !== graph) onChange(placed);
            return;
        }
        const added = graph.nodes.filter((node) => !previous.has(node.id) && node.x === 0 && node.y === 0);
        if (!added.length) return;
        const bottom = Math.max(0, ...graph.nodes.filter((node) => previous.has(node.id)).map((node) => node.y)) + 160;
        onChange({ ...graph, nodes: graph.nodes.map((node) => {
            const index = added.findIndex((item) => item.id === node.id);
            return index < 0 ? node : { ...node, x: (index % 3) * 260, y: bottom + Math.floor(index / 3) * 150 };
        }) });
    }, [graph, onChange]);

    useEffect(() => {
        if (!nodesReady || !focusIds?.length) return;
        void fitView({ nodes: focusIds.map((id) => ({ id })), padding: 0.3, maxZoom: 1.5 });
    }, [focusIds, nodesReady, fitView]);

    // React Flow tiene la propria copia dei nodi, e ci tiene attaccata la misura
    // che prende dal DOM. Ricostruire gli oggetti a ogni render gliela toglieva,
    // e un nodo senza misura resta `visibility: hidden`: la tela si disegnava e
    // non si vedeva niente. Qui il grafo resta l'autorita' su cosa c'e' e dove
    // sta, ma la misura di prima viaggia con lui.
    const [nodes, setNodes, onNodesChange] = useNodesState<Node<PieceData>>([]);
    useEffect(() => {
        setNodes((previous) => {
            const measured = new Map(previous.map((node) => [node.id, node]));
            return graph.nodes
                .filter((node) => node.state !== 'dropped')
                .map((node) => ({
                    ...measured.get(node.id),
                    id: node.id,
                    type: 'piece',
                    position: { x: node.x, y: node.y },
                    selected: selected?.kind === 'node' && selected.id === node.id,
                    data: {
                        label: node.label, form: node.form, state: node.state,
                        byModel: node.by === 'model', accent: Boolean(node.accent),
                        color: node.color ?? null, icon: node.icon ?? null,
                        image: node.image ?? null, locale,
                        editing: editingId === node.id,
                        onCommitLabel: (label: string) => { patchNode(node.id, { label }); setEditingId(null); },
                        onCancelEdit: () => setEditingId(null),
                        onDelete: () => removePiece(node.id),
                        deleteLabel: label('deleteNode'),
                    },
                }));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- i callback del pannello leggono il grafo corrente a ogni render
    }, [graph.nodes, selected, editingId, setNodes, locale]);

    const removeEdge = useCallback((key: string) => {
        onChange({ ...graph, edges: graph.edges.filter((edge) => edgeKey(edge) !== key) });
        if (selected?.kind === 'edge' && selected.id === key) {
            setSelected(null);
        }
    }, [graph, onChange, selected]);

    const edges: Edge<LinkData>[] = useMemo(() => graph.edges
        .filter((edge) => edge.state !== 'dropped')
        .map((edge) => {
            const key = edgeKey(edge);
            return {
                id: key,
                source: edge.from,
                target: edge.to,
                type: 'link',
                selected: selected?.kind === 'edge' && selected.id === key,
                markerEnd: familyOf(edge.rel) === 'part'
                    ? undefined
                    : { type: MarkerType.ArrowClosed, width: 16, height: 16 },
                // La punta all'altro capo dice che il verbo si legge anche
                // all'incontrario. L'appartenenza non ne ha nessuna: un contenuto
                // non contiene chi lo contiene.
                markerStart: edge.reciprocal && familyOf(edge.rel) !== 'part'
                    ? { type: MarkerType.ArrowClosed, width: 16, height: 16 }
                    : undefined,
                data: {
                    rel: edge.rel, label: edge.label, strength: edge.strength,
                    hypothesis: edge.hypothesis, state: edge.state, locale,
                    onSelect: () => { setSelected({ kind: 'edge', id: key }); setPanelOpen(true); },
                    onDelete: () => removeEdge(key),
                    deleteLabel: label('deleteEdge'),
                },
            };
        }), [graph.edges, selected, locale, label, removeEdge]);

    // Solo la fine del trascinamento esce di qui. Ogni fotogramma di un
    // trascinamento e' un cambio di posizione, e mandarli tutti al grafo
    // riempirebbe lo storico di rumore invece che di pensiero.
    const onNodeDragStop = useCallback((_event: unknown, moved: Node) => {
        onChange({
            ...graph,
            nodes: graph.nodes.map((node) => (node.id === moved.id
                ? { ...node, x: moved.position.x, y: moved.position.y }
                : node)),
        });
    }, [graph, onChange]);

    const onConnect = useCallback((connection: Connection, linkingWords = '') => {
        if (!connection.source || !connection.target || connection.source === connection.target) return;
        const key = `${connection.source}->${connection.target}`;
        if (graph.edges.some((edge) => edgeKey(edge) === key && edge.state !== 'dropped')) {
            setSelected({ kind: 'edge', id: key }); setPanelOpen(true); return;
        }
        const edge: TavoloEdgeData = {
            from: connection.source, to: connection.target, rel: DEFAULT_REL, label: linkingWords.trim() || null,
            strength: 2, hypothesis: false, reciprocal: false, by: 'person', state: 'live',
        };
        onChange({ ...graph, edges: [...graph.edges.filter((item) => edgeKey(item) !== key), edge] });
        setSelected({ kind: 'edge', id: key });
        setPanelOpen(true);
    }, [graph, onChange]);

    const addPiece = () => {
        const id = `n${Date.now().toString(36)}`;
        const bounds = surface.current?.getBoundingClientRect();
        const position = bounds ? screenToFlowPosition({ x: bounds.left + bounds.width / 2 - 80, y: bounds.top + bounds.height / 2 - 30 }) : { x: 40, y: 40 };
        onChange({
            ...graph,
            nodes: [...graph.nodes, {
                id, label: label('newNode'), form: 'concept', by: 'person', state: 'live',
                x: position.x, y: position.y,
            }],
        });
        setSelected({ kind: 'node', id });
    };

    const removePiece = (id: string) => {
        onChange({
            ...graph,
            nodes: graph.nodes.filter((node) => node.id !== id),
            edges: graph.edges.filter((edge) => edge.from !== id && edge.to !== id),
        });
        setSelected(null);
    };

    const removeSelected = () => {
        if (!selected) return;
        if (selected.kind === 'node') removePiece(selected.id);
        else removeEdge(selected.id);
    };

    const patchNode = (id: string, change: Partial<{ label: string; form: TavoloForm; color: TavoloColor | null; icon: string | null; image: string | null }>) =>
        onChange({
            ...graph,
            nodes: graph.nodes.map((node) => (node.id === id ? { ...node, ...change } : node)),
        });

    // L'accento e' uno solo: accentare un pezzo sposta l'enfasi invece di
    // aggiungerne una. Due punti sul tavolo non sono un punto.
    const accent = (id: string, on: boolean) =>
        onChange({
            ...graph,
            nodes: graph.nodes.map((node) => ({ ...node, accent: on && node.id === id })),
        });

    const patchEdge = (key: string, change: Partial<TavoloEdgeData>) =>
        onChange({
            ...graph,
            edges: graph.edges.map((edge) => (edgeKey(edge) === key ? { ...edge, ...change } : edge)),
        });

    const node = selected?.kind === 'node' ? graph.nodes.find((item) => item.id === selected.id) : undefined;
    const edge = selected?.kind === 'edge' ? graph.edges.find((item) => edgeKey(item) === selected.id) : undefined;

    return (
        <div className="flex h-full min-h-0 w-full" inert={busy}>
            <div ref={surface} className="min-w-0 flex-1" data-tavolo-canvas>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onNodesChange={onNodesChange}
                    onNodeDragStop={onNodeDragStop}
                    onConnect={onConnect}
                    onNodeClick={(_event, clicked) => { setSelected({ kind: 'node', id: clicked.id }); setPanelOpen(true); }}
                    onEdgeClick={(_event, clicked) => { setSelected({ kind: 'edge', id: clicked.id }); setPanelOpen(true); }}
                    onNodeDoubleClick={(_event, clicked) => setEditingId(clicked.id)}
                    onPaneClick={() => setSelected(null)}
                    // Permissiva: con quattro agganci tutti sorgenti, e' questa
                    // modalita' a farli valere anche come bersagli.
                    connectionMode={ConnectionMode.Loose}
                    // Il tetto di serie e' 2, e su un tavolo piccolo `fitView`
                    // ci arriva subito: il tasto che ingrandisce non avrebbe
                    // piu' niente da fare. Quattro lascia spazio per leggere.
                    maxZoom={4}
                    proOptions={{ hideAttribution: false }}
                    fitView
                >
                    <Background />
                    <Panel position="top-right" className="flex gap-1">
                        {([
                            ['zoomOut', ZoomOut, () => void zoomOut()],
                            ['zoomIn', ZoomIn, () => void zoomIn()],
                            ['fit', Scan, () => void fitView({ padding: 0.2 })],
                            [panelOpen ? 'widen' : 'panel', panelOpen ? PanelRightClose : PanelRightOpen,
                                () => setPanelOpen((open) => !open)],
                        ] as const).map(([key, Icon, act]) => (
                            <button key={key} type="button" onClick={act} aria-label={label(key)} title={label(key)}
                                className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 ${key === 'widen' || key === 'panel' ? 'ml-2' : ''}`}>
                                <Icon className="h-4 w-4" aria-hidden="true" />
                            </button>
                        ))}
                    </Panel>
                </ReactFlow>
            </div>

            {panelOpen && <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-white p-3">
                <div className="flex gap-2">
                    <button type="button" onClick={addPiece}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700">
                        <Plus className="h-4 w-4" aria-hidden="true" />{label('addNode')}
                    </button>
                    <button type="button" onClick={removeSelected} disabled={!selected}
                        aria-label={label('deleteNode')}
                        className="inline-flex min-h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>

                <button type="button" onClick={() => { setConnecting((open) => !open); setFromId(node?.id ?? graph.nodes.find((item) => item.state === 'live')?.id ?? ''); }}
                    aria-expanded={connecting} className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm text-indigo-700">{label('connectPieces')}</button>
                {connecting && <form className="space-y-2" onSubmit={(event) => {
                    event.preventDefault();
                    if (!fromId || !toId || fromId === toId) return;
                    onConnect({ source: fromId, target: toId, sourceHandle: null, targetHandle: null }, words);
                    setConnecting(false); setWords(''); setToId('');
                }}>
                    <p className="text-xs text-slate-600">{label('connectHint')}</p>
                    {([['fromPiece', fromId, setFromId], ['toPiece', toId, setToId]] as const).map(([key, value, update]) => <label key={key} className="block text-xs text-slate-600">
                        {label(key)}
                        <select aria-label={label(key)} value={value} onChange={(event) => update(event.target.value)} required
                            className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800">
                            <option value="">—</option>
                            {graph.nodes.filter((item) => item.state === 'live').map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                        </select>
                    </label>)}
                    <label className="block text-xs text-slate-600">{label('linkWords')}
                        <input value={words} onChange={(event) => setWords(event.target.value)} maxLength={40}
                            className="mt-1 min-h-11 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-800" />
                    </label>
                    <button disabled={!fromId || !toId || fromId === toId} className="min-h-11 w-full rounded-lg bg-indigo-600 px-3 text-sm text-white disabled:opacity-40">{label('connectPieces')}</button>
                </form>}

                {(node || edge) && onSave && <button type="button" onClick={() => void onSave().then(() => setSelected(null)).catch(() => undefined)}
                    className="min-h-11 rounded-lg bg-indigo-600 px-3 text-sm text-white">{label('saveChanges')}</button>}

                {node && (
                    <div className="space-y-3">
                        <label className="block text-xs font-medium text-slate-500">
                            {label('rename')}
                            <input
                                onKeyDown={(event) => { if (event.key === 'Enter' && onSave) { event.preventDefault(); void onSave().then(() => setSelected(null)).catch(() => undefined); } }}
                                value={node.label}
                                onChange={(event) => patchNode(node.id, { label: event.target.value.slice(0, 80) })}
                                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-800"
                            />
                        </label>
                        <fieldset>
                            <legend className="text-xs font-medium text-slate-500">{label('form')}</legend>
                            <div className="mt-1 grid grid-cols-2 gap-1">
                                {FORMS.map((form) => (
                                    <button key={form} type="button" onClick={() => patchNode(node.id, { form })}
                                        className={`min-h-11 rounded-lg border px-2 text-sm ${node.form === form
                                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                                        {label(form)}
                                    </button>
                                ))}
                            </div>
                        </fieldset>
                        <fieldset>
                            <legend className="text-xs font-medium text-slate-500">{label('color')}</legend>
                            <div className="mt-1 flex flex-wrap gap-1">
                                {([null, ...NODE_COLORS] as (TavoloColor | null)[]).map((tint) => (
                                    <button key={tint ?? 'none'} type="button"
                                        onClick={() => patchNode(node.id, { color: tint })}
                                        aria-pressed={(node.color ?? null) === tint}
                                        aria-label={label(tint ?? 'noColor')} title={label(tint ?? 'noColor')}
                                        className={`h-11 w-11 rounded-lg border-2 ${SWATCH[tint ?? 'none']} ${(node.color ?? null) === tint
                                            ? 'ring-2 ring-slate-800 ring-offset-1'
                                            : ''}`} />
                                ))}
                            </div>
                        </fieldset>
                        <fieldset>
                            <legend className="text-xs font-medium text-slate-500">{label('icon')}</legend>
                            <input value={iconQuery} onChange={(event) => setIconQuery(event.target.value)}
                                placeholder={label('iconSearch')} aria-label={label('iconSearch')}
                                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-800" />
                            <div className="mt-1 grid max-h-48 grid-cols-6 gap-1 overflow-y-auto">
                                <button type="button" onClick={() => patchNode(node.id, { icon: null, image: null })}
                                    aria-label={label('noIcon')} title={label('noIcon')}
                                    aria-pressed={!node.icon}
                                    className={`flex h-11 w-11 items-center justify-center rounded-lg border text-xs ${!node.icon
                                        ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                                    —
                                </button>
                                {matchIcons(icons, iconQuery).map((icon) => (
                                    <button key={icon.id} type="button" onClick={() => patchNode(node.id, { icon: icon.id, image: null })}
                                        aria-label={icon.label} title={icon.label}
                                        aria-pressed={node.icon === icon.id}
                                        className={`flex h-11 w-11 items-center justify-center rounded-lg border ${node.icon === icon.id
                                            ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={iconUrl(icon.id)} alt="" width={20} height={20} className="h-5 w-5" />
                                    </button>
                                ))}
                            </div>
                        </fieldset>
                        <fieldset>
                            <legend className="text-xs font-medium text-slate-500">{label('image')}</legend>
                            <input value={imageQuery} onChange={(event) => setImageQuery(event.target.value)}
                                placeholder={label('imageSearch')} aria-label={label('imageSearch')}
                                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-800" />
                            <div className="mt-1 grid max-h-48 grid-cols-6 gap-1 overflow-y-auto">
                                <button type="button" onClick={() => patchNode(node.id, { image: null })}
                                    aria-label={label('noImage')} title={label('noImage')}
                                    aria-pressed={!node.image}
                                    className={`flex h-11 w-11 items-center justify-center rounded-lg border text-xs ${!node.image
                                        ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                                    —
                                </button>
                                {matchTavoloImages(images, imageQuery).map((image) => (
                                    <button key={image.id} type="button" onClick={() => patchNode(node.id, { image: image.id, icon: null })}
                                        aria-label={image.name}
                                        title={image.usage ? `${image.name} — ${image.usage}` : image.name}
                                        aria-pressed={node.image === image.id}
                                        className={`flex h-11 w-11 items-center justify-center rounded-lg border ${node.image === image.id
                                            ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={tavoloImageUrl(image.id)} alt="" loading="lazy"
                                            className="h-8 w-8 rounded object-cover" />
                                    </button>
                                ))}
                            </div>
                        </fieldset>
                        <button type="button" onClick={() => accent(node.id, !node.accent)}
                            aria-pressed={Boolean(node.accent)}
                            className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border px-2 text-sm ${node.accent
                                ? 'border-indigo-700 bg-indigo-600 text-white'
                                : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                            <Star className="h-4 w-4" aria-hidden="true" />{label('accent')}
                        </button>
                    </div>
                )}

                {edge && (
                    <div className="space-y-3">
                        <label className="block text-xs font-medium text-slate-500">
                            {label('linkWords')}
                            <input
                                value={edge.label ?? ''}
                                placeholder={relLabel(edge.rel, locale)}
                                onChange={(event) => patchEdge(edgeKey(edge), {
                                    label: event.target.value.slice(0, 40) || null,
                                })}
                                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-800"
                            />
                        </label>

                        <fieldset>
                            <legend className="text-xs font-medium text-slate-500">{label('family')}</legend>
                            <div className="mt-1 grid grid-cols-2 gap-1">
                                {FAMILIES.map((family) => (
                                    <button key={family} type="button"
                                        onClick={() => patchEdge(edgeKey(edge), { rel: RELS_BY_FAMILY[family][0] })}
                                        className={`min-h-11 rounded-lg border px-2 text-sm ${familyOf(edge.rel) === family
                                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                                        {familyLabel(family, locale)}
                                    </button>
                                ))}
                            </div>
                        </fieldset>
                        <fieldset>
                            <legend className="text-xs font-medium text-slate-500">{label('connection')}</legend>
                            <div className="mt-1 flex flex-col gap-1">
                                {RELS_BY_FAMILY[familyOf(edge.rel)].map((rel) => (
                                    <button key={rel} type="button" onClick={() => patchEdge(edgeKey(edge), { rel })}
                                        className={`min-h-11 rounded-lg border px-2 text-left text-sm ${edge.rel === rel
                                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                                        {relLabel(rel, locale)}
                                    </button>
                                ))}
                            </div>
                        </fieldset>
                        <fieldset>
                            <legend className="text-xs font-medium text-slate-500">{label('strength')}</legend>
                            <div className="mt-1 grid grid-cols-3 gap-1">
                                {[1, 2, 3].map((strength) => (
                                    <button key={strength} type="button"
                                        onClick={() => patchEdge(edgeKey(edge), { strength })}
                                        className={`min-h-11 rounded-lg border px-1 text-xs ${edge.strength === strength
                                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                                            : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                                        {label(`strength${strength}` as 'strength1')}
                                    </button>
                                ))}
                            </div>
                        </fieldset>
                        <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
                            <input type="checkbox" checked={edge.hypothesis}
                                onChange={(event) => patchEdge(edgeKey(edge), { hypothesis: event.target.checked })} />
                            {label('hypothesis')}
                        </label>
                        {familyOf(edge.rel) !== 'part' && (
                            <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700">
                                <input type="checkbox" checked={Boolean(edge.reciprocal)}
                                    onChange={(event) => patchEdge(edgeKey(edge), { reciprocal: event.target.checked })} />
                                {label('reciprocal')}
                            </label>
                        )}
                    </div>
                )}

                {!node && !edge && (
                    <p className="text-sm text-slate-500">{label('proposalHint')}</p>
                )}
            </aside>}
        </div>
    );
}
