'use client';
import { memo, useMemo } from 'react';
import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import Dagre from '@dagrejs/dagre';
import { useI18n } from '@/lib/i18n-context';
import { goalText, type GoalTextKey } from '@/lib/i18n-goals';
import type { PersonalGoal } from '@/lib/goals';
import { effectiveShares, progress } from '@/lib/goal-network';

type GoalNodeData = { goal: PersonalGoal; detail: string; shared: boolean; onOpen: (id: number) => void };
const WIDTH = 220; const HEIGHT = 76;

const GoalNode = memo(function GoalNode({ data }: NodeProps<Node<GoalNodeData>>) {
    return <div style={{ width: WIDTH }}>
        <Handle type="target" position={Position.Top} isConnectable={false} />
        <button type="button" onClick={() => data.onOpen(data.goal.id)} className="block w-full rounded-lg border border-slate-300 bg-white p-2 text-left shadow-sm hover:border-indigo-400 focus-visible:outline-2 focus-visible:outline-cyan-600">
            <span className="line-clamp-2 break-words text-sm font-semibold">{data.goal.title}</span>
            <span className="block text-xs text-slate-600">{data.detail}{data.shared && ' · 👥'}</span>
        </button>
        <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>;
});
const nodeTypes = { goal: GoalNode };

/** Desktop-only reading view: structure changes stay in the dialog, never by dragging. */
export function GoalMap({ goals, all, onOpen }: { goals: PersonalGoal[]; all: PersonalGoal[]; onOpen: (id: number) => void }) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const { nodes, edges } = useMemo(() => {
        const ids = new Set(goals.map(goal => goal.id));
        const layout = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
        layout.setGraph({ rankdir: 'TB', ranksep: 70, nodesep: 40 });
        goals.forEach(goal => layout.setNode(String(goal.id), { width: WIDTH, height: HEIGHT }));
        const edges: Edge[] = goals.flatMap(goal => goal.parent_ids.filter(parent => ids.has(parent)).map(parent => {
            layout.setEdge(String(parent), String(goal.id));
            return { id: `${parent}-${goal.id}`, source: String(parent), target: String(goal.id) };
        }));
        Dagre.layout(layout);
        const nodes: Node<GoalNodeData>[] = goals.map(goal => {
            const at = layout.node(String(goal.id)); const { done, total } = progress(all, goal.id);
            const detail = [l(goal.status as GoalTextKey), goal.review_date, total ? `${done}/${total}` : ''].filter(Boolean).join(' · ');
            return { id: String(goal.id), type: 'goal', position: { x: at.x - WIDTH / 2, y: at.y - HEIGHT / 2 }, data: { goal, detail, shared: effectiveShares(all, goal.id).size > 0, onOpen } };
        });
        return { nodes, edges };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- l depends only on lang
    }, [goals, all, lang, onOpen]);
    return <section aria-label={l('mapLabel')} className="hidden h-[70vh] overflow-hidden rounded-xl border border-slate-200 bg-slate-50 lg:block">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2 }}
            nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} proOptions={{ hideAttribution: true }}>
            <Background /><Controls showInteractive={false} />
        </ReactFlow>
    </section>;
}
