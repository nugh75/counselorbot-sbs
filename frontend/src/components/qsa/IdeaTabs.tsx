'use client';

import { useState, type ReactNode } from 'react';
import { BookOpen, GitBranch, MessageSquare, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';

export type IdeaTab = 'chat' | 'map' | 'branches' | 'sources';

interface IdeaTabsProps {
    chat: ReactNode;
    map: ReactNode;
    branches: ReactNode;
    sources: ReactNode;
}

const TABS: { key: IdeaTab; label: string; icon: typeof MessageSquare }[] = [
    { key: 'chat', label: 'idea.tabs.chat', icon: MessageSquare },
    { key: 'map', label: 'idea.tabs.map', icon: Network },
    { key: 'branches', label: 'idea.tabs.branches', icon: GitBranch },
    { key: 'sources', label: 'idea.tabs.sources', icon: BookOpen },
];

// Su telefono i quattro pezzi di Idea non stanno uno sotto l'altro: sarebbe una
// colonna lunga da percorrere a ogni turno. Sono schede, e si passa da una
// all'altra restando dove si era.
export function IdeaTabs({ chat, map, branches, sources }: IdeaTabsProps) {
    const { t } = useI18n();
    const [active, setActive] = useState<IdeaTab>('chat');

    const pane = (key: IdeaTab, content: ReactNode, scrolls = true) => (
        <div
            role="tabpanel"
            id={`idea-tab-${key}`}
            aria-labelledby={`idea-tab-button-${key}`}
            hidden={active !== key}
            className={cn('min-h-0 flex-1', scrolls && 'overflow-y-auto')}
        >
            {content}
        </div>
    );

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div role="tablist" aria-label={t('idea.tabs.label')} className="mb-2 flex gap-1 overflow-x-auto">
                {TABS.map(({ key, label, icon: Icon }) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        id={`idea-tab-button-${key}`}
                        aria-selected={active === key}
                        aria-controls={`idea-tab-${key}`}
                        onClick={() => setActive(key)}
                        className={cn(
                            'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-colors',
                            active === key
                                ? 'bg-teal-700 text-white'
                                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                        )}
                    >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {t(label)}
                    </button>
                ))}
            </div>
            {/* I riquadri restano montati: smontare la chat perderebbe la
                risposta in arrivo e il punto della trascrizione. */}
            {pane('chat', chat, false)}
            {pane('map', map)}
            {pane('branches', branches)}
            {pane('sources', sources)}
        </div>
    );
}
