'use client';

import { Archive, BookOpen, ChevronDown, ChevronRight, GitBranch, ListTodo, MessageSquare, RotateCcw, Target, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { Tooltip } from '@/components/ui/Tooltip';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { recommendationText } from '@/lib/i18n-recommendations';
import type { RecommendationTextKey } from '@/lib/i18n-recommendations';
import {
    linkedSegments,
    normalizeRecommendationCatalog,
    provenanceKind,
    recommendationPatchUrl,
    studentRequestText,
    studentRequestUrl,
} from '@/lib/recommendations';
import type {
    AdviceRecommendation,
    ReadingRecommendation,
    RecommendationCatalog,
    RecommendationPatch,
    RecommendationType,
    StrategyRecommendation,
    StudentRequest,
} from '@/lib/recommendations';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Field';

type Tab = RecommendationType | 'diagram';

interface RecommendationsPanelProps {
    catalog: RecommendationCatalog;
    expanded?: boolean;
    sessionId?: string;
    /** Il catalogo aggiornato torna al genitore: qui non si tiene stato dei dati. */
    onCatalogChange?: (catalog: RecommendationCatalog) => void;
    /** Consegna la domanda alla casella della chat. Non invia: scrive e basta. */
    onDiscuss?: (prompt: string) => void;
    /** I diagrammi della conversazione, in ordine di disegno. */
    diagrams?: { id: string; title: string }[];
    /** Riprende un diagramma nel suo messaggio: non lo ridisegna. */
    onOpenDiagram?: (id: string) => void;
}

// Chiave di un intervento in corso o fallito: una card per volta, per tipo.
const cardKey = (type: RecommendationType, slug: string) => `${type}:${slug}`;

export function RecommendationsPanel({
    catalog,
    expanded = false,
    sessionId,
    onCatalogChange,
    onDiscuss,
    diagrams = [],
    onOpenDiagram,
}: RecommendationsPanelProps) {
    const { t, lang } = useI18n();

    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>(catalog.reading.length ? 'reading' : 'strategy');
    const [pending, setPending] = useState<Record<string, boolean>>({});
    const [failed, setFailed] = useState<Record<string, RecommendationPatch>>({});
    const [showArchived, setShowArchived] = useState<Record<RecommendationType, boolean>>({ reading: false, strategy: false, advice: false, request: false });

    const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ reading: null, strategy: null, advice: null, request: null, diagram: null });

    const ids = useId();
    const tabId = (tab: Tab) => `${ids}-tab-${tab}`;
    const panelId = (tab: Tab) => `${ids}-panel-${tab}`;

    const tabs: Tab[] = ['reading', 'strategy', 'advice', 'request', 'diagram'];
    const tabSize = (tab: Tab) => tab === 'diagram' ? diagrams.length : catalog[tab].length;
    const visibleTab: Tab = tabSize(activeTab) ? activeTab
        : tabs.find((tab) => tabSize(tab)) ?? activeTab;
    const readings = split(catalog.reading);
    const strategies = split(catalog.strategy);
    const advice = split(catalog.advice);
    const openRequests = catalog.request.filter((item) => item.status === 'proposed');
    const proposedCount = readings.open.length + strategies.open.length + advice.open.length + openRequests.length;
    const rec = (key: RecommendationTextKey, vars?: Record<string, string | number>) => recommendationText(key, lang, vars);

    // Le azioni si mostrano solo se possono davvero salvare: senza sessione o
    // senza il genitore che adotta il catalogo resterebbero comandi finti.
    const canAct = Boolean(sessionId && onCatalogChange);

    const sendPatch = async (type: RecommendationType, slug: string, patch: RecommendationPatch) => {
        if (!sessionId || !onCatalogChange) return;
        const key = cardKey(type, slug);
        setPending((state) => ({ ...state, [key]: true }));
        setFailed((state) => {
            if (!(key in state)) return state;
            const next = { ...state };
            delete next[key];
            return next;
        });
        try {
            const response = await apiFetch(`${recommendationPatchUrl(sessionId, type, slug)}?lang=${lang}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(patch),
            });
            if (!response.ok) throw new Error(String(response.status));
            // Lo stato visibile cambia solo dopo la conferma del server.
            onCatalogChange(normalizeRecommendationCatalog(await response.json()));
        } catch {
            setFailed((state) => ({ ...state, [key]: patch }));
        } finally {
            setPending((state) => ({ ...state, [key]: false }));
        }
    };

    // Lista «da riprendere»: aggiungere e togliere sono dello studente, lo stato passa dal PATCH comune.
    const changeRequests = async (method: 'POST' | 'DELETE', slug?: string, text?: string) => {
        if (!sessionId || !onCatalogChange) return false;
        const key = cardKey('request', slug || 'new');
        setPending((state) => ({ ...state, [key]: true }));
        try {
            const response = await apiFetch(`${studentRequestUrl(sessionId, slug)}?lang=${lang}`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: method === 'POST' ? JSON.stringify({ text }) : undefined,
            });
            if (!response.ok) throw new Error(String(response.status));
            onCatalogChange(normalizeRecommendationCatalog(await response.json()));
            return true;
        } catch {
            return false;
        } finally {
            setPending((state) => ({ ...state, [key]: false }));
        }
    };

    const onTabKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
        const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        const next: Tab = event.key === 'Home' ? tabs[0]
            : event.key === 'End' ? tabs[tabs.length - 1]
                : tabs[(tabs.indexOf(visibleTab) + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
        setActiveTab(next);
        tabRefs.current[next]?.focus();
    };

    if (!tabs.some(tabSize)) return null;

    const cardState = (type: RecommendationType, slug: string) => ({
        pending: Boolean(pending[cardKey(type, slug)]),
        failed: failed[cardKey(type, slug)],
        onRetry: () => {
            const patch = failed[cardKey(type, slug)];
            if (patch) void sendPatch(type, slug, patch);
        },
    });

    return (
        <Card
            as="section" variant="flat" className="overflow-hidden py-0"
            aria-label={t('recommendations.title')}
        >
            <button
                type="button"
                onClick={() => setIsOpen((open) => !open)}
                aria-expanded={isOpen}
                aria-controls="guided-recommendations-panel"
                className={cn('flex w-full items-center gap-2 p-4 text-left lg:hidden', expanded && 'hidden')}
            >
                <BookOpen className="h-4 w-4 text-link" />
                <span id="recommendations-title" className="min-w-0 flex-1 text-sm font-semibold text-ink-body">
                    {t('recommendations.title')}
                </span>
                <span className="text-xs tabular-nums text-ink-muted">{proposedCount}</span>
                <ChevronRight className={cn('h-4 w-4 text-ink-muted transition-transform', isOpen && 'rotate-90')} />
            </button>

            <div
                id="guided-recommendations-panel"
                tabIndex={-1}
                className={cn('space-y-3 px-4 pb-4 lg:block lg:p-4', expanded ? 'pt-4' : !isOpen && 'hidden lg:block')}
            >
                <div className="hidden items-center gap-2 lg:flex">
                    <BookOpen className="h-4 w-4 text-link" />
                    <h3 id="recommendations-title-desktop" className="text-sm font-semibold text-ink-body">
                        {t('recommendations.title')}
                    </h3>
                    <span className="ml-auto text-xs tabular-nums text-ink-muted">{proposedCount}</span>
                </div>

                <div className="grid grid-cols-4 gap-1 rounded-card bg-surface-raised p-1" role="tablist">
                    <TabButton
                        ref={(node) => { tabRefs.current.reading = node; }}
                        active={visibleTab === 'reading'}
                        count={readings.open.length}
                        id={tabId('reading')}
                        controls={panelId('reading')}
                        label={t('recommendations.reading')}
                        icon={<BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />}
                        onClick={() => setActiveTab('reading')}
                        onKeyDown={onTabKeys}
                    />
                    <TabButton
                        ref={(node) => { tabRefs.current.strategy = node; }}
                        active={visibleTab === 'strategy'}
                        count={strategies.open.length}
                        id={tabId('strategy')}
                        controls={panelId('strategy')}
                        label={t('recommendations.strategy')}
                        icon={<Target className="h-4 w-4 shrink-0" aria-hidden="true" />}
                        onClick={() => setActiveTab('strategy')}
                        onKeyDown={onTabKeys}
                    />
                    <TabButton
                        ref={(node) => { tabRefs.current.advice = node; }}
                        active={visibleTab === 'advice'} count={advice.open.length}
                        id={tabId('advice')} controls={panelId('advice')}
                        label={rec('advice.tab')} onClick={() => setActiveTab('advice')}
                        icon={<MessageSquare className="h-4 w-4 shrink-0" aria-hidden="true" />}
                        onKeyDown={onTabKeys}
                    />
                    <TabButton
                        ref={(node) => { tabRefs.current.request = node; }}
                        active={visibleTab === 'request'} count={openRequests.length}
                        id={tabId('request')} controls={panelId('request')}
                        label={rec('request.tab')} onClick={() => setActiveTab('request')}
                        icon={<ListTodo className="h-4 w-4 shrink-0" aria-hidden="true" />}
                        onKeyDown={onTabKeys}
                    />
                    <TabButton
                        ref={(node) => { tabRefs.current.diagram = node; }}
                        active={visibleTab === 'diagram'} count={diagrams.length}
                        id={tabId('diagram')} controls={panelId('diagram')}
                        label={rec('diagram.tab')} onClick={() => setActiveTab('diagram')}
                        icon={<GitBranch className="h-4 w-4 shrink-0" aria-hidden="true" />}
                        onKeyDown={onTabKeys}
                    />
                </div>

                {visibleTab === 'diagram' ? (
                    <div className="space-y-2" role="tabpanel" id={panelId('diagram')} aria-labelledby={tabId('diagram')} tabIndex={0}>
                        <h4 className="text-sm font-semibold text-ink-body">{rec('diagram.tab')}</h4>
                        {diagrams.length ? (
                            <ol className="space-y-1">
                                {diagrams.map((item) => (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            onClick={() => onOpenDiagram?.(item.id)}
                                            disabled={!onOpenDiagram}
                                            aria-label={rec('diagram.open', { title: item.title })}
                                            className="flex min-h-control w-full items-center gap-2 rounded-control px-3 py-2 text-left text-sm text-ink-body transition-colors hover:bg-surface-sunken focus-visible:ring-2 focus-visible:ring-focus"
                                        >
                                            <GitBranch className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
                                            <span className="min-w-0 flex-1 truncate">{item.title}</span>
                                        </button>
                                    </li>
                                ))}
                            </ol>
                        ) : <EmptyState text={rec('diagram.empty')} />}
                    </div>
                ) : visibleTab === 'request' ? (
                    <div className="space-y-2" role="tabpanel" id={panelId('request')} aria-labelledby={tabId('request')} tabIndex={0}>
                        <h4 className="text-sm font-semibold text-ink-body">{rec('request.tab')}</h4>
                        <p className="text-xs text-ink-muted">{rec('request.help')}</p>
                        {catalog.request.length ? (
                            <ul className="space-y-2">
                                {catalog.request.map((item) => (
                                    <RequestCard key={item.slug} item={item} canAct={canAct}
                                        onPatch={(patch) => void sendPatch('request', item.slug, patch)}
                                        onRemove={() => void changeRequests('DELETE', item.slug)}
                                        {...cardState('request', item.slug)} />
                                ))}
                            </ul>
                        ) : <EmptyState text={rec('request.empty')} />}
                        {canAct ? <AddRequest pending={Boolean(pending[cardKey('request', 'new')])}
                            onAdd={(text) => changeRequests('POST', undefined, text)} /> : null}
                    </div>
                ) : visibleTab === 'reading' ? (
                    <div
                        className="space-y-2"
                        role="tabpanel"
                        id={panelId('reading')}
                        aria-labelledby={tabId('reading')}
                        tabIndex={0}
                    >
                        <h4 className="text-sm font-semibold text-ink-body">{t('recommendations.reading')}</h4>
                        {readings.open.map((item) => (
                            <ReadingCard
                                key={item.slug}
                                item={item}
                                canAct={canAct}
                                onPatch={(patch) => void sendPatch('reading', item.slug, patch)}
                                onDiscuss={onDiscuss}
                                {...cardState('reading', item.slug)}
                            />
                        ))}
                        {!catalog.reading.length ? <EmptyState text={t('recommendations.noneReading')} /> : null}
                        <ArchivedList
                            items={readings.archived.map((item) => ({ slug: item.slug, label: item.title || item.slug }))}
                            open={showArchived.reading}
                            onToggle={() => setShowArchived((state) => ({ ...state, reading: !state.reading }))}
                            onRestore={(slug) => void sendPatch('reading', slug, { status: 'proposed' })}
                            canAct={canAct}
                            pending={pending}
                            type="reading"
                        />
                    </div>
                ) : visibleTab === 'strategy' ? (
                    <div
                        className="space-y-2"
                        role="tabpanel"
                        id={panelId('strategy')}
                        aria-labelledby={tabId('strategy')}
                        tabIndex={0}
                    >
                        <h4 className="text-sm font-semibold text-ink-body">{t('recommendations.strategy')}</h4>
                        {strategies.open.map((item) => (
                            <StrategyCard
                                key={item.slug}
                                item={item}
                                canAct={canAct}
                                onPatch={(patch) => void sendPatch('strategy', item.slug, patch)}
                                onDiscuss={onDiscuss}
                                {...cardState('strategy', item.slug)}
                            />
                        ))}
                        {!catalog.strategy.length ? <EmptyState text={t('recommendations.noneStrategy')} /> : null}
                        <ArchivedList
                            items={strategies.archived.map((item) => ({ slug: item.slug, label: item.name || item.slug }))}
                            open={showArchived.strategy}
                            onToggle={() => setShowArchived((state) => ({ ...state, strategy: !state.strategy }))}
                            onRestore={(slug) => void sendPatch('strategy', slug, { status: 'proposed' })}
                            canAct={canAct}
                            pending={pending}
                            type="strategy"
                        />
                    </div>
                ) : (
                    <div className="space-y-2" role="tabpanel" id={panelId('advice')} aria-labelledby={tabId('advice')} tabIndex={0}>
                        <h4 className="text-sm font-semibold text-ink-body">{rec('advice.tab')}</h4>
                        {advice.open.map((item) => (
                            <AdviceCard key={item.slug} item={item} canAct={canAct}
                                onPatch={(patch) => void sendPatch('advice', item.slug, patch)}
                                onDiscuss={onDiscuss} {...cardState('advice', item.slug)} />
                        ))}
                        {!catalog.advice.length ? <EmptyState text={rec('advice.empty')} /> : null}
                        <ArchivedList items={advice.archived.map((item) => ({ slug: item.slug, label: item.name || item.slug }))}
                            open={showArchived.advice} onToggle={() => setShowArchived((state) => ({ ...state, advice: !state.advice }))}
                            onRestore={(slug) => void sendPatch('advice', slug, { status: 'proposed' })}
                            canAct={canAct} pending={pending} type="advice" />
                    </div>
                )}
            </div>
        </Card>
    );
}

function RequestCard({ item, canAct, pending, failed, onRetry, onPatch, onRemove }: CardControls & { item: StudentRequest; onRemove: () => void }) {
    const { lang } = useI18n();
    const rec = (key: RecommendationTextKey, vars?: Record<string, string | number>) => recommendationText(key, lang, vars);
    const open = item.status === 'proposed';
    const label: RecommendationTextKey = open ? 'request.open'
        : item.closed_by === 'conversation' ? 'request.discussedInTalk' : 'request.discussed';
    const phase = typeof item.step_order === 'number' ? ` \u00b7 ${item.step_order}` : '';
    return (
        <li className="rounded-card border border-line bg-surface p-3">
            <p className={`text-2xs font-semibold ${open ? 'text-link' : 'text-ink-muted'}`}>
                {rec(label)}{phase}{item.source === 'student' ? ` \u00b7 ${rec('request.byStudent')}` : ''}
            </p>
            <p className="mt-1 break-words text-xs leading-relaxed text-ink-body">{item.name || item.slug}</p>
            {canAct ? (
                <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" disabled={pending} onClick={() => onPatch({ status: open ? 'closed' : 'proposed' })}
                        className="min-h-control rounded-control border border-line px-2.5 text-xs font-semibold text-link disabled:opacity-60">
                        {rec(open ? 'request.close' : 'request.reopen')}
                    </button>
                    <button type="button" disabled={pending} onClick={onRemove}
                        className="inline-flex min-h-control items-center gap-1 rounded-control px-2.5 text-xs font-semibold text-ink-muted disabled:opacity-60">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{rec('request.remove')}
                    </button>
                </div>
            ) : null}
            {failed ? <p role="alert" className="text-xs text-danger-ink">{rec('error')} <button type="button" onClick={onRetry} className="min-h-control underline">{rec('retry')}</button></p> : null}
        </li>
    );
}

function AddRequest({ pending, onAdd }: { pending: boolean; onAdd: (text: string) => Promise<boolean> }) {
    const { lang } = useI18n();
    const rec = (key: RecommendationTextKey) => recommendationText(key, lang);
    const inputId = useId();
    const [value, setValue] = useState('');
    const [failed, setFailed] = useState(false);
    const text = studentRequestText(value);
    return (
        <form className="space-y-1" onSubmit={async (event) => {
            event.preventDefault();
            if (!text) return;
            const saved = await onAdd(text);
            setFailed(!saved);
            if (saved) setValue('');
        }}>
            <label htmlFor={inputId} className="block text-xs font-semibold text-ink-body">{rec('request.add.label')}</label>
            <div className="flex gap-2">
                <Input id={inputId} value={value} maxLength={300} onChange={(event) => setValue(event.target.value)}
                    placeholder={rec('request.add.placeholder')}
                    className="flex-1 text-xs" />
                <button type="submit" disabled={pending || !text}
                    className="min-h-control shrink-0 rounded-control border border-line px-2.5 text-xs font-semibold text-link disabled:opacity-60">
                    {rec('request.add.submit')}
                </button>
            </div>
            {failed ? <p role="alert" className="text-xs text-danger-ink">{rec('error')}</p> : null}
        </form>
    );
}

function split<T extends { status?: string }>(items: T[]): { open: T[]; archived: T[] } {
    return {
        open: items.filter((item) => item.status !== 'dismissed'),
        archived: items.filter((item) => item.status === 'dismissed'),
    };
}

interface CardControls {
    canAct: boolean;
    pending: boolean;
    failed?: RecommendationPatch;
    onRetry: () => void;
    onPatch: (patch: RecommendationPatch) => void;
    onDiscuss?: (prompt: string) => void;
}

function ReadingCard({ item, canAct, pending, failed, onRetry, onPatch, onDiscuss }: CardControls & { item: ReadingRecommendation }) {
    const { t, lang } = useI18n();
    const rec = (key: RecommendationTextKey, vars?: Record<string, string | number>) => recommendationText(key, lang, vars);
    const [expanded, setExpanded] = useState(false);
    const cardId = useId();
    const detailsId = `${cardId}-details`;
    const title = item.title || item.slug;
    const details = [item.summary, item.synopsis].filter(Boolean) as string[];

    return (
        <article className="rounded-card border border-line bg-brand-soft p-3">
            <div className="text-xs text-ink-muted">
                {item.kind_label || item.kind}
            </div>
            <h4 className="mt-0.5 text-sm font-semibold leading-snug text-ink">{title}</h4>
            {(item.creators || item.year || item.publisher) && (
                <p className="mt-0.5 text-xs text-ink-muted">
                    {[item.creators, item.year, item.publisher].filter(Boolean).join(' · ')}
                </p>
            )}

            {item.why ? <LabeledText label={t('recommendations.why')} text={item.why} /> : null}

            {details.length ? (
                <>
                    <button
                        type="button"
                        onClick={() => setExpanded((open) => !open)}
                        aria-expanded={expanded}
                        aria-controls={detailsId}
                        className="mt-2 inline-flex min-h-control items-center gap-1 rounded-control text-xs font-semibold text-link hover:text-link"
                    >
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
                        {expanded ? rec('synopsis.hide') : rec('synopsis.show')}
                    </button>
                    <div id={detailsId} hidden={!expanded}>
                        {item.summary ? <LabeledText label={rec('summary')} text={item.summary} /> : null}
                        {item.synopsis ? <p className="mt-2 text-xs leading-relaxed text-ink-muted">{item.synopsis}</p> : null}
                    </div>
                </>
            ) : null}

            {item.languages?.length ? (
                <LabeledText
                    label={t('recommendations.availableIn')}
                    text={item.languages.map((code) => languageLabel(code, lang)).join(', ')}
                />
            ) : null}
            {item.where ? <LinkedText label={t('recommendations.where')} text={item.where} /> : null}
            {item.warning ? <LabeledText label={t('recommendations.warning')} text={item.warning} warning /> : null}

            <Provenance item={item} />

            <CardActions
                pending={pending}
                failed={failed}
                onRetry={onRetry}
                selectLabel={rec('reading.select')}
                triedLabel={rec('reading.tried')}
                status={item.status}
                canAct={canAct}
                onPatch={onPatch}
                discuss={onDiscuss ? () => onDiscuss(rec('discuss.reading.prompt', { title })) : undefined}
                discussLabel={rec('discuss')}
                dismissLabel={rec('dismiss')}
            />
        </article>
    );
}

function StrategyCard({ item, canAct, pending, failed, onRetry, onPatch, onDiscuss }: CardControls & { item: StrategyRecommendation }) {
    const { t, lang } = useI18n();
    const rec = (key: RecommendationTextKey, vars?: Record<string, string | number>) => recommendationText(key, lang, vars);
    const name = item.name || item.slug;

    return (
        <article className="rounded-card border border-line bg-brand-soft p-3">
            <div className="flex items-start gap-2">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-link" />
                <h4 className="text-sm font-semibold leading-snug text-ink">{name}</h4>
            </div>
            {item.recommended_when ? (
                <LabeledText label={t('recommendations.recommendedWhen')} text={item.recommended_when} />
            ) : null}
            {item.description ? <p className="mt-2 text-xs leading-relaxed text-ink-muted">{item.description}</p> : null}

            <Provenance item={item} />

            <CardActions
                pending={pending}
                failed={failed}
                onRetry={onRetry}
                selectLabel={rec('strategy.select')}
                triedLabel={rec('strategy.tried')}
                status={item.status}
                canAct={canAct}
                onPatch={onPatch}
                discuss={onDiscuss ? () => onDiscuss(rec('discuss.strategy.prompt', { name })) : undefined}
                discussLabel={rec('discuss')}
                dismissLabel={rec('dismiss')}
            >
                {canAct ? (
                    <HelpfulRow
                        helpful={item.helpful ?? null}
                        pending={pending}
                        onPatch={onPatch}
                    />
                ) : null}
            </CardActions>
        </article>
    );
}

function AdviceCard({ item, canAct, pending, failed, onRetry, onPatch, onDiscuss }: CardControls & { item: AdviceRecommendation }) {
    const { lang } = useI18n();
    const rec = (key: RecommendationTextKey, vars?: Record<string, string | number>) => recommendationText(key, lang, vars);
    const name = item.name || item.slug;
    const question = item.kind === 'question';
    // Quattro destini, un vocabolario di colore solo: petrol se la domanda e'
    // ancora in gioco, neutro se e' stata chiusa o superata. I ruoli semantici
    // (sky/amber/emerald/red) sono dei Callout, e altre tinte sarebbero un
    // secondo vocabolario di stato che la guida vieta: a distinguere i quattro
    // casi e' la parola, che e' tradotta in tutte e sei le lingue.
    const open = item.status === 'proposed';
    const questionLabel: RecommendationTextKey = item.status === 'stale' ? 'question.stale'
        : item.status === 'closed'
            ? (item.closed_by === 'conversation' ? 'question.answeredInTalk' : 'question.closed')
            : 'question.open';
    const phase = typeof item.step_order === 'number' ? ` \u00b7 ${item.step_order}` : '';
    return (
        <article className="rounded-card border border-line bg-surface p-3">
            <p className={`text-2xs font-semibold ${question && !open ? 'text-ink-muted' : 'text-link'}`}>
                {question ? `${rec(questionLabel)}${phase}` : rec('advice.label')}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-body">{name}</p>
            {question && canAct ? (
                <button type="button" disabled={pending} onClick={() => onPatch({ status: open ? 'closed' : 'proposed' })}
                    className="mt-2 min-h-control rounded-control border border-line px-2.5 text-xs font-semibold text-link disabled:opacity-60">
                    {rec(open ? 'question.close' : 'question.reopen')}
                </button>
            ) : null}
            {question && failed ? <p role="alert" className="text-xs text-danger-ink">{rec('error')} <button type="button" onClick={onRetry} className="min-h-control underline">{rec('retry')}</button></p> : null}
            <CardActions pending={pending} failed={question ? undefined : failed} onRetry={onRetry} status={item.status}
                canAct={canAct && !question} onPatch={onPatch} selectLabel={rec('advice.select')} triedLabel={rec('advice.tried')}
                discuss={onDiscuss ? () => onDiscuss(rec('discuss.advice.prompt', { name })) : undefined}
                discussLabel={rec('discuss')} dismissLabel={rec('dismiss')} />
        </article>
    );
}

interface CardActionsProps {
    status?: RecommendationPatch['status'];
    canAct: boolean;
    pending: boolean;
    failed?: RecommendationPatch;
    onRetry: () => void;
    onPatch: (patch: RecommendationPatch) => void;
    selectLabel: string;
    triedLabel: string;
    discuss?: () => void;
    discussLabel: string;
    dismissLabel: string;
    children?: ReactNode;
}

function CardActions({
    status, canAct, pending, failed, onRetry, onPatch,
    selectLabel, triedLabel, discuss, discussLabel, dismissLabel, children,
}: CardActionsProps) {
    const { lang } = useI18n();
    const rec = (key: RecommendationTextKey) => recommendationText(key, lang);

    // Senza sessione e senza chat non resta nessun comando: niente cornice vuota.
    if (!canAct && !discuss) return null;

    return (
        <div className="mt-3 space-y-2 border-t border-line pt-2">
            <div className="flex flex-wrap items-center gap-1.5">
                {canAct ? (
                    <>
                        <ToggleAction
                            label={selectLabel}
                            pressed={status === 'selected'}
                            disabled={pending}
                            onClick={() => onPatch({ status: status === 'selected' ? 'proposed' : 'selected' })}
                        />
                        <ToggleAction
                            label={triedLabel}
                            pressed={status === 'tried'}
                            disabled={pending}
                            onClick={() => onPatch({ status: status === 'tried' ? 'proposed' : 'tried' })}
                        />
                    </>
                ) : null}
                {discuss ? (
                    <button
                        type="button"
                        onClick={discuss}
                        className="inline-flex min-h-control items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 text-xs font-semibold text-ink-body hover:bg-surface-sunken"
                    >
                        <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                        {discussLabel}
                    </button>
                ) : null}
                {canAct ? (
                    <button
                        type="button"
                        onClick={() => onPatch({ status: 'dismissed' })}
                        disabled={pending}
                        className="inline-flex min-h-control items-center gap-1.5 rounded-control px-2.5 text-xs font-semibold text-ink-muted hover:text-ink-body disabled:opacity-60"
                    >
                        <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                        {dismissLabel}
                    </button>
                ) : null}
            </div>

            {children}

            {failed ? (
                <p className="flex flex-wrap items-center gap-2 text-2xs text-danger-ink" role="alert">
                    {rec('error')}
                    <button type="button" onClick={onRetry} className="min-h-control font-semibold underline">
                        {rec('retry')}
                    </button>
                </p>
            ) : null}
        </div>
    );
}

function ToggleAction({ label, pressed, disabled, onClick }: { label: string; pressed: boolean; disabled: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'inline-flex min-h-control items-center rounded-control border px-2.5 text-xs font-semibold transition-colors disabled:opacity-60',
                pressed
                    ? 'border-brand bg-brand text-ink-on-brand hover:bg-brand-hover'
                    : 'border-line bg-surface text-ink-body hover:bg-surface-sunken',
            )}
        >
            {label}
        </button>
    );
}

function HelpfulRow({ helpful, pending, onPatch }: { helpful: boolean | null; pending: boolean; onPatch: (patch: RecommendationPatch) => void }) {
    const { lang } = useI18n();
    const rec = (key: RecommendationTextKey) => recommendationText(key, lang);

    return (
        <div className="flex items-center gap-1 text-2xs text-ink-muted">
            <span>{rec('helpful.question')}</span>
            <button
                type="button"
                aria-label={rec('helpful.yes')}
                aria-pressed={helpful === true}
                disabled={pending}
                onClick={() => onPatch({ helpful: helpful === true ? null : true })}
                className={cn('tap-icon rounded-control text-ink-muted hover:text-success disabled:opacity-60', helpful === true && 'text-success')}
            >
                <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
                type="button"
                aria-label={rec('helpful.no')}
                aria-pressed={helpful === false}
                disabled={pending}
                onClick={() => onPatch({ helpful: helpful === false ? null : false })}
                className={cn('tap-icon rounded-control text-ink-muted hover:text-danger disabled:opacity-60', helpful === false && 'text-danger')}
            >
                <ThumbsDown className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

interface ArchivedListProps {
    items: { slug: string; label: string }[];
    open: boolean;
    onToggle: () => void;
    onRestore: (slug: string) => void;
    canAct: boolean;
    pending: Record<string, boolean>;
    type: RecommendationType;
}

// Archiviare non cancella: la voce scende qui sotto e da qui puo' risalire.
function ArchivedList({ items, open, onToggle, onRestore, canAct, pending, type }: ArchivedListProps) {
    const { lang } = useI18n();
    const rec = (key: RecommendationTextKey, vars?: Record<string, string | number>) => recommendationText(key, lang, vars);
    const sectionId = useId();
    const listId = `${sectionId}-archived`;

    if (!items.length) return null;

    return (
        <div className="rounded-card border border-dashed border-line p-2">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                aria-controls={listId}
                className="flex min-h-control w-full items-center gap-1 text-left text-2xs font-semibold text-ink-muted hover:text-ink-body"
            >
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
                {open ? rec('archived.hide') : rec('archived.show', { count: items.length })}
            </button>
            <ul id={listId} hidden={!open} className="mt-1 space-y-1">
                {items.map((item) => (
                    <li key={item.slug} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">{item.label}</span>
                        {canAct ? (
                            <button
                                type="button"
                                onClick={() => onRestore(item.slug)}
                                disabled={Boolean(pending[cardKey(type, item.slug)])}
                                className="inline-flex min-h-control shrink-0 items-center gap-1 rounded-control px-2 text-2xs font-semibold text-link hover:underline disabled:opacity-60"
                            >
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                {rec('restore')}
                            </button>
                        ) : null}
                    </li>
                ))}
            </ul>
        </div>
    );
}

// `matched_on` porta marcatori tecnici (temi del catalogo, codici fattore,
// `scope:STRUMENTO`). Si dice il tipo di aggancio, non il marcatore; se non c'e'
// provenienza non si scrive niente invece di inventarla.
const PROVENANCE_KEYS = {
    themes: 'provenance.themes',
    scores: 'provenance.scores',
    scope: 'provenance.scope',
} as const;

function Provenance({ item }: { item: { matched_on?: string[] } }) {
    const { lang } = useI18n();
    const kind = provenanceKind(item);
    if (!kind) return null;
    return (
        <p className="mt-2 text-2xs italic text-ink-muted">
            {recommendationText(PROVENANCE_KEYS[kind], lang)}
        </p>
    );
}

interface TabButtonProps {
    active: boolean;
    count: number;
    id: string;
    controls: string;
    label: string;
    icon: ReactNode;
    onClick: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
    ref: (node: HTMLButtonElement | null) => void;
}

function TabButton({ active, count, id, controls, label, icon, onClick, onKeyDown, ref }: TabButtonProps) {
    return (
        <Tooltip content={label} side="top">
            <button
                ref={ref}
                type="button"
                role="tab"
                id={id}
                aria-label={`${label} (${count})`}
                aria-selected={active}
                aria-controls={controls}
                tabIndex={active ? 0 : -1}
                onClick={onClick}
                onKeyDown={onKeyDown}
                className={cn(
                    'flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 whitespace-nowrap rounded-control px-1 py-1.5 text-xs font-semibold transition-colors',
                    active ? 'bg-surface text-link shadow-card' : 'text-ink-muted hover:text-ink-body',
                )}
            >
                <span className="flex items-center gap-1.5">
                    {icon}
                    <span className="text-2xs tabular-nums">{count}</span>
                </span>
                <span aria-hidden="true" className="block h-3 max-w-full truncate text-2xs leading-3">
                    {active ? label : ''}
                </span>
            </button>
        </Tooltip>
    );
}

function LabeledText({ label, text, warning = false }: { label: string; text: string; warning?: boolean }) {
    return (
        <p className={cn('mt-2 text-xs leading-relaxed text-ink-muted', warning && 'text-warning-ink')}>
            <span className="font-semibold">{label}:</span> {text}
        </p>
    );
}

// "Dove trovarlo" e' prosa: diventa un link solo la parte che e' davvero
// http(s), il resto della frase resta testo.
function LinkedText({ label, text }: { label: string; text: string }) {
    return (
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            <span className="font-semibold">{label}:</span>{' '}
            {linkedSegments(text).map((segment, index) => (
                segment.href ? (
                    <a
                        key={`${segment.href}-${index}`}
                        href={segment.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-mono text-link underline hover:text-link"
                    >
                        {segment.text}
                    </a>
                ) : (
                    <span key={`text-${index}`}>{segment.text}</span>
                )
            ))}
        </p>
    );
}

function EmptyState({ text }: { text: string }) {
    return <p className="rounded-card border border-dashed border-line p-3 text-xs text-ink-muted">{text}</p>;
}

// Le lingue arrivano come codici ("it", "en"): al lettore si mostra il nome
// nella sua lingua, e si torna al codice se il browser non lo sa tradurre.
const languageNames = new Map<string, Intl.DisplayNames | null>();

function languageLabel(code: string, lang: string): string {
    if (!languageNames.has(lang)) {
        try {
            languageNames.set(lang, new Intl.DisplayNames([lang], { type: 'language' }));
        } catch {
            languageNames.set(lang, null);
        }
    }
    try {
        return languageNames.get(lang)?.of(code) ?? code;
    } catch {
        return code;
    }
}
