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
    Controls,
    MarkerType,
    ReactFlow,
    ReactFlowProvider,
    applyNodeChanges,
    useReactFlow,
    type Connection,
    type Edge,
    type Node,
    type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Dagre from '@dagrejs/dagre';
import { Plus, Trash2 } from 'lucide-react';
import {
    FAMILIES,
    RELS_BY_FAMILY,
    edgeKey,
    familyOf,
    type TavoloEdgeData,
    type TavoloForm,
    type TavoloGraph,
    type TavoloRel,
} from '@/lib/tavolo';
import { familyLabel, relLabel, tavoloLabel } from '@/lib/i18n-tavolo';
import { TavoloPieceNode, type PieceData } from './TavoloPieceNode';
import { TavoloLinkEdge, type LinkData } from './TavoloLinkEdge';

const nodeTypes = { piece: TavoloPieceNode };
const edgeTypes = { link: TavoloLinkEdge };
const FORMS: TavoloForm[] = ['concept', 'action', 'decision', 'outcome'];
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
}) {
    return (
        <ReactFlowProvider>
            <Canvas {...props} />
        </ReactFlowProvider>
    );
}

function Canvas({ graph, locale, onChange }: {
    graph: TavoloGraph; locale: string; onChange: (graph: TavoloGraph) => void;
}) {
    const { fitView } = useReactFlow();
    const [selected, setSelected] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null);
    const label = useCallback((key: Parameters<typeof tavoloLabel>[0]) => tavoloLabel(key, locale), [locale]);
    // Il seme si dispone una volta sola: rifarlo a ogni render rimetterebbe in
    // riga i pezzi che la persona ha appena spostato.
    const laid = useRef(false);
    useEffect(() => {
        if (laid.current) return;
        laid.current = true;
        const placed = seeded(graph);
        if (placed !== graph) onChange(placed);
        window.setTimeout(() => fitView({ padding: 0.2 }), 0);
    }, [graph, onChange, fitView]);

    const nodes: Node<PieceData>[] = useMemo(() => graph.nodes
        .filter((node) => node.state !== 'dropped')
        .map((node) => ({
            id: node.id,
            type: 'piece',
            position: { x: node.x, y: node.y },
            selected: selected?.kind === 'node' && selected.id === node.id,
            data: { label: node.label, form: node.form, state: node.state, byModel: node.by === 'model' },
        })), [graph.nodes, selected]);

    const edges: Edge<LinkData>[] = useMemo(() => graph.edges
        .filter((edge) => edge.state !== 'dropped')
        .map((edge) => ({
            id: edgeKey(edge),
            source: edge.from,
            target: edge.to,
            type: 'link',
            selected: selected?.kind === 'edge' && selected.id === edgeKey(edge),
            markerEnd: familyOf(edge.rel) === 'part'
                ? undefined
                : { type: MarkerType.ArrowClosed, width: 16, height: 16 },
            data: {
                rel: edge.rel, label: edge.label, strength: edge.strength,
                hypothesis: edge.hypothesis, state: edge.state, locale,
            },
        })), [graph.edges, selected, locale]);

    const onNodesChange = useCallback((changes: NodeChange[]) => {
        const moved = applyNodeChanges(changes, nodes);
        const position = new Map(moved.map((node) => [node.id, node.position]));
        onChange({
            ...graph,
            nodes: graph.nodes.map((node) => {
                const spot = position.get(node.id);
                return spot ? { ...node, x: spot.x, y: spot.y } : node;
            }),
        });
    }, [graph, nodes, onChange]);

    const onConnect = useCallback((connection: Connection) => {
        if (!connection.source || !connection.target || connection.source === connection.target) return;
        const key = `${connection.source}->${connection.target}`;
        if (graph.edges.some((edge) => edgeKey(edge) === key)) return;
        const edge: TavoloEdgeData = {
            from: connection.source, to: connection.target, rel: DEFAULT_REL,
            strength: 2, hypothesis: false, by: 'person', state: 'live',
        };
        onChange({ ...graph, edges: [...graph.edges, edge] });
        setSelected({ kind: 'edge', id: key });
    }, [graph, onChange]);

    const addPiece = () => {
        const id = `n${Date.now().toString(36)}`;
        onChange({
            ...graph,
            nodes: [...graph.nodes, {
                id, label: label('newNode'), form: 'concept', by: 'person', state: 'live',
                x: 40 + graph.nodes.length * 24, y: 40 + graph.nodes.length * 16,
            }],
        });
        setSelected({ kind: 'node', id });
    };

    const removeSelected = () => {
        if (!selected) return;
        if (selected.kind === 'node') {
            onChange({
                ...graph,
                nodes: graph.nodes.filter((node) => node.id !== selected.id),
                edges: graph.edges.filter((edge) => edge.from !== selected.id && edge.to !== selected.id),
            });
        } else {
            onChange({ ...graph, edges: graph.edges.filter((edge) => edgeKey(edge) !== selected.id) });
        }
        setSelected(null);
    };

    const patchNode = (id: string, change: Partial<{ label: string; form: TavoloForm }>) =>
        onChange({
            ...graph,
            nodes: graph.nodes.map((node) => (node.id === id ? { ...node, ...change } : node)),
        });

    const patchEdge = (key: string, change: Partial<TavoloEdgeData>) =>
        onChange({
            ...graph,
            edges: graph.edges.map((edge) => (edgeKey(edge) === key ? { ...edge, ...change } : edge)),
        });

    const node = selected?.kind === 'node' ? graph.nodes.find((item) => item.id === selected.id) : undefined;
    const edge = selected?.kind === 'edge' ? graph.edges.find((item) => edgeKey(item) === selected.id) : undefined;

    return (
        <div className="flex h-full min-h-0 w-full">
            <div className="min-w-0 flex-1" data-tavolo-canvas>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onNodesChange={onNodesChange}
                    onConnect={onConnect}
                    onNodeClick={(_event, clicked) => setSelected({ kind: 'node', id: clicked.id })}
                    onEdgeClick={(_event, clicked) => setSelected({ kind: 'edge', id: clicked.id })}
                    onPaneClick={() => setSelected(null)}
                    proOptions={{ hideAttribution: false }}
                    fitView
                >
                    <Background />
                    <Controls showInteractive={false} />
                </ReactFlow>
            </div>

            <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-200 bg-white p-3">
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

                {node && (
                    <div className="space-y-3">
                        <label className="block text-xs font-medium text-slate-500">
                            {label('rename')}
                            <input
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
                    </div>
                )}

                {edge && (
                    <div className="space-y-3">
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
                    </div>
                )}

                {!node && !edge && (
                    <p className="text-sm text-slate-500">{label('proposalHint')}</p>
                )}
            </aside>
        </div>
    );
}
