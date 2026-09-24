'use client';
import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/lib/i18n-context';
import { goalFormat, goalText, type GoalTextKey } from '@/lib/i18n-goals';
import type { GoalGroup, PersonalGoal } from '@/lib/goals';
import { effectiveShares, progress, type TreeNode } from '@/lib/goal-network';

type Props = { goals: PersonalGoal[]; forest: TreeNode[]; groups: GoalGroup[]; onOpen: (id: number) => void; onAddChild: (id: number) => void };

/** Nested disclosure lists: later occurrences of a multi-parent goal start collapsed. */
export function GoalTree({ goals, forest, groups, onOpen, onAddChild }: Props) {
    const { lang } = useI18n(); const l = (key: GoalTextKey) => goalText(lang, key);
    const [flipped, setFlipped] = useState<Set<string>>(new Set());
    const flip = (key: string) => setFlipped(previous => { const next = new Set(previous); if (!next.delete(key)) next.add(key); return next; });
    const render = (node: TreeNode): ReactNode => {
        const goal = node.goal; const open = node.repeat === flipped.has(node.key);
        const { done, total } = progress(goals, goal.id);
        const shares = [...effectiveShares(goals, goal.id).keys()].map(id => groups.find(group => group.id === id)?.name ?? `#${id}`);
        return <li key={node.key} className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-slate-200 bg-white p-2 sm:p-3">
                {node.children.length > 0
                    ? <button type="button" aria-expanded={open} aria-label={`${l(open ? 'collapse' : 'expand')} ${goal.title}`} onClick={() => flip(node.key)} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-slate-100">{open ? <ChevronDown className="h-5 w-5" aria-hidden /> : <ChevronRight className="h-5 w-5" aria-hidden />}</button>
                    : <span className="w-11 shrink-0" aria-hidden />}
                <button type="button" onClick={() => onOpen(goal.id)} className="min-h-11 min-w-0 flex-1 break-words text-left font-semibold hover:underline">{goal.title}</button>
                <span className="text-sm text-slate-600">{l(goal.status as GoalTextKey)}{goal.review_date && ` · ${l('reviewDate')}: ${goal.review_date}`}{total > 0 && ` · ${done}/${total} ${l('subgoalsDone')}`}</span>
                {shares.length > 0 && <span className="inline-flex items-center gap-1 text-sm text-slate-600"><Users className="h-4 w-4" aria-hidden /><span className="sr-only">{l('share')}:</span>{shares.join(', ')}</span>}
                <Button type="button" variant="ghost" aria-label={`${l('addSubgoal')}: ${goal.title}`} onClick={() => onAddChild(goal.id)}><Plus className="h-5 w-5" aria-hidden /></Button>
                {node.otherParents.length > 0 && <p className="basis-full pl-13 text-xs text-slate-500">⧉ {l('alsoUnder')}: {node.otherParents.map(parent => parent.title).join(', ')}</p>}
                {node.depth >= 4 && <p className="basis-full pl-13 text-xs text-slate-500">↳ {goalFormat(lang, 'level', { n: node.depth + 1 })}</p>}
            </div>
            {open && node.children.length > 0 && <ul className={`space-y-1 ${node.depth < 3 ? 'pl-3 sm:pl-6' : ''}`}>{node.children.map(render)}</ul>}
        </li>;
    };
    return <ul className="space-y-2" aria-label={l('goals')}>{forest.map(render)}</ul>;
}
