'use client';

import { Archive, BookOpen, ChevronDown, ChevronRight, MessageSquare, RotateCcw, Target, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { recommendationText } from '@/lib/i18n-recommendations';
import type { RecommendationTextKey } from '@/lib/i18n-recommendations';
import {
    linkedSegments,
    normalizeRecommendationCatalog,
    provenanceKind,
    recommendationPatchUrl,
} from '@/lib/recommendations';
import type {
    ReadingRecommendation,
    RecommendationCatalog,
    RecommendationPatch,
    RecommendationType,
    StrategyRecommendation,
} from '@/lib/recommendations';
import { cn } from '@/lib/utils';

type Tab = RecommendationType;

interface RecommendationsPanelProps {
    catalog: RecommendationCatalog;
    sessionId?: string;
    /** Il catalogo aggiornato torna al genitore: qui non si tiene stato dei dati. */
    onCatalogChange?: (catalog: RecommendationCatalog) => void;
    /** Consegna la domanda alla casella della chat. Non invia: scrive e basta. */
    onDiscuss?: (prompt: string) => void;
}

// Chiave di un intervento in corso o fallito: una card per volta, per tipo.
const cardKey = (type: RecommendationType, slug: string) => `${type}:${slug}`;

export function RecommendationsPanel({
    catalog,
    sessionId,
    onCatalogChange,
    onDiscuss,
}: RecommendationsPanelProps) {
    const { t, lang } = useI18n();

    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>(catalog.reading.length ? 'reading' : 'strategy');
    const [pending, setPending] = useState<Record<string, boolean>>({});
    const [failed, setFailed] = useState<Record<string, RecommendationPatch>>({});
    const [showArchived, setShowArchived] = useState<Record<Tab, boolean>>({ reading: false, strategy: false });

    const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ reading: null, strategy: null });

    const ids = useId();
    const tabId = (tab: Tab) => `${ids}-tab-${tab}`;
    const panelId = (tab: Tab) => `${ids}-panel-${tab}`;

    const visibleTab: Tab = activeTab === 'reading' && !catalog.reading.length && catalog.strategy.length
        ? 'strategy'
        : activeTab === 'strategy' && !catalog.strategy.length && catalog.reading.length
            ? 'reading'
            : activeTab;

    const readings = split(catalog.reading);
    const strategies = split(catalog.strategy);
    const proposedCount = readings.open.length + strategies.open.length;

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

    const onTabKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
        const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        const next: Tab = event.key === 'Home'
            ? 'reading'
            : event.key === 'End'
                ? 'strategy'
                : visibleTab === 'reading' ? 'strategy' : 'reading';
        setActiveTab(next);
        tabRefs.current[next]?.focus();
    };

    if (!catalog.reading.length && !catalog.strategy.length) return null;

    const cardState = (type: RecommendationType, slug: string) => ({
        pending: Boolean(pending[cardKey(type, slug)]),
        failed: failed[cardKey(type, slug)],
        onRetry: () => {
            const patch = failed[cardKey(type, slug)];
            if (patch) void sendPatch(type, slug, patch);
        },
    });

    return (
        <section
            className="glass-panel overflow-hidden border-l-4 border-l-indigo-400"
            aria-label={t('recommendations.title')}
        >
            <button
                type="button"
                onClick={() => setIsOpen((open) => !open)}
                aria-expanded={isOpen}
                aria-controls="guided-recommendations-panel"
                className="flex w-full items-center gap-2 p-4 text-left lg:hidden"
            >
                <BookOpen className="h-4 w-4 text-indigo-600" />
                <span id="recommendations-title" className="min-w-0 flex-1 text-sm font-semibold text-slate-700">
                    {t('recommendations.title')}
                </span>
                <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{proposedCount}</span>
                <ChevronRight className={cn('h-4 w-4 text-slate-500 transition-transform', isOpen && 'rotate-90')} />
            </button>

            <div
                id="guided-recommendations-panel"
                tabIndex={-1}
                className={cn('space-y-3 px-4 pb-4 lg:block lg:p-4', !isOpen && 'hidden lg:block')}
            >
                <div className="hidden items-center gap-2 lg:flex">
                    <BookOpen className="h-4 w-4 text-indigo-600" />
                    <h3 id="recommendations-title-desktop" className="text-sm font-semibold text-slate-700">
                        {t('recommendations.title')}
                    </h3>
                    <span className="ml-auto rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{proposedCount}</span>
                </div>

                <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
                    <TabButton
                        ref={(node) => { tabRefs.current.reading = node; }}
                        active={visibleTab === 'reading'}
                        count={readings.open.length}
                        id={tabId('reading')}
                        controls={panelId('reading')}
                        label={t('recommendations.reading')}
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
                        onClick={() => setActiveTab('strategy')}
                        onKeyDown={onTabKeys}
                    />
                </div>

                {visibleTab === 'reading' ? (
                    <div
                        className="space-y-2"
                        role="tabpanel"
                        id={panelId('reading')}
                        aria-labelledby={tabId('reading')}
                        tabIndex={0}
                    >
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
                ) : (
                    <div
                        className="space-y-2"
                        role="tabpanel"
                        id={panelId('strategy')}
                        aria-labelledby={tabId('strategy')}
                        tabIndex={0}
                    >
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
                )}
            </div>
        </section>
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
        <article className="rounded-lg border border-slate-200 bg-cyan-50 p-3">
            <div className="text-2xs font-semibold uppercase tracking-wide text-cyan-700">
                {item.kind_label || item.kind}
            </div>
            <h4 className="mt-0.5 text-sm font-semibold leading-snug text-slate-800">{title}</h4>
            {(item.creators || item.year || item.publisher) && (
                <p className="mt-0.5 text-xs text-slate-500">
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
                        className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-md text-xs font-semibold text-indigo-700 hover:text-indigo-600"
                    >
                        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
                        {expanded ? rec('synopsis.hide') : rec('synopsis.show')}
                    </button>
                    <div id={detailsId} hidden={!expanded}>
                        {item.summary ? <LabeledText label={rec('summary')} text={item.summary} /> : null}
                        {item.synopsis ? <p className="mt-2 text-xs leading-relaxed text-slate-600">{item.synopsis}</p> : null}
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
        <article className="rounded-lg border border-slate-200 bg-violet-50 p-3">
            <div className="flex items-start gap-2">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                <h4 className="text-sm font-semibold leading-snug text-slate-800">{name}</h4>
            </div>
            {item.recommended_when ? (
                <LabeledText label={t('recommendations.recommendedWhen')} text={item.recommended_when} />
            ) : null}
            {item.description ? <p className="mt-2 text-xs leading-relaxed text-slate-600">{item.description}</p> : null}

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
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-2">
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
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
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
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-60"
                    >
                        <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                        {dismissLabel}
                    </button>
                ) : null}
            </div>

            {children}

            {/* La regione live esiste anche a riposo, altrimenti l'attesa non
                verrebbe annunciata; da ferma non occupa spazio. */}
            <p role="status" className={cn('text-2xs text-slate-500', !pending && 'sr-only')}>
                {pending ? rec('saving') : ''}
            </p>
            {failed ? (
                <p className="flex flex-wrap items-center gap-2 text-2xs text-red-700" role="alert">
                    {rec('error')}
                    <button type="button" onClick={onRetry} className="min-h-9 font-semibold underline">
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
                'inline-flex min-h-9 items-center rounded-md border px-2.5 text-xs font-semibold transition-colors disabled:opacity-60',
                pressed
                    ? 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
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
        <div className="flex items-center gap-1 text-2xs text-slate-500">
            <span>{rec('helpful.question')}</span>
            <button
                type="button"
                aria-label={rec('helpful.yes')}
                aria-pressed={helpful === true}
                disabled={pending}
                onClick={() => onPatch({ helpful: helpful === true ? null : true })}
                className={cn('tap-icon rounded text-slate-500 hover:text-emerald-600 disabled:opacity-60', helpful === true && 'text-emerald-600')}
            >
                <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
                type="button"
                aria-label={rec('helpful.no')}
                aria-pressed={helpful === false}
                disabled={pending}
                onClick={() => onPatch({ helpful: helpful === false ? null : false })}
                className={cn('tap-icon rounded text-slate-500 hover:text-red-600 disabled:opacity-60', helpful === false && 'text-red-600')}
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
        <div className="rounded-lg border border-dashed border-slate-200 p-2">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                aria-controls={listId}
                className="flex min-h-9 w-full items-center gap-1 text-left text-2xs font-semibold text-slate-500 hover:text-slate-700"
            >
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
                {open ? rec('archived.hide') : rec('archived.show', { count: items.length })}
            </button>
            <ul id={listId} hidden={!open} className="mt-1 space-y-1">
                {items.map((item) => (
                    <li key={item.slug} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{item.label}</span>
                        {canAct ? (
                            <button
                                type="button"
                                onClick={() => onRestore(item.slug)}
                                disabled={Boolean(pending[cardKey(type, item.slug)])}
                                className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-2xs font-semibold text-indigo-700 hover:text-indigo-600 disabled:opacity-60"
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
        <p className="mt-2 text-2xs italic text-slate-500">
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
    onClick: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
    ref: (node: HTMLButtonElement | null) => void;
}

function TabButton({ active, count, id, controls, label, onClick, onKeyDown, ref }: TabButtonProps) {
    return (
        <button
            ref={ref}
            type="button"
            role="tab"
            id={id}
            aria-selected={active}
            aria-controls={controls}
            tabIndex={active ? 0 : -1}
            onClick={onClick}
            onKeyDown={onKeyDown}
            className={cn(
                'min-w-0 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                active ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
            )}
        >
            <span className="block truncate">{label}</span>
            <span className="text-2xs tabular-nums">{count}</span>
        </button>
    );
}

function LabeledText({ label, text, warning = false }: { label: string; text: string; warning?: boolean }) {
    return (
        <p className={cn('mt-2 text-xs leading-relaxed text-slate-600', warning && 'text-amber-800')}>
            <span className="font-semibold">{label}:</span> {text}
        </p>
    );
}

// "Dove trovarlo" e' prosa: diventa un link solo la parte che e' davvero
// http(s), il resto della frase resta testo.
function LinkedText({ label, text }: { label: string; text: string }) {
    return (
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
            <span className="font-semibold">{label}:</span>{' '}
            {linkedSegments(text).map((segment, index) => (
                segment.href ? (
                    <a
                        key={`${segment.href}-${index}`}
                        href={segment.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-mono text-indigo-700 underline hover:text-indigo-600"
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
    return <p className="rounded-lg border border-dashed border-slate-200 p-3 text-xs text-slate-500">{text}</p>;
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
