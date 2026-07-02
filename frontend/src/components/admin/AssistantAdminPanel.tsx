'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot, ExternalLink, FileText, FolderOpen, Gauge, MessageCircleQuestion, RefreshCw, Settings, Users } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

type TargetTab = 'config' | 'ragDocs' | 'assistantQuestions' | 'counselors' | 'logs';

interface Props {
    onOpenTab: (tab: TargetTab) => void;
}

interface ConfigItem {
    key: string;
    value: string;
    description?: string;
}

interface CollectionInfo {
    id: string;
    label: string;
    builtin: boolean;
    graph_available?: boolean;
}

interface RagStats {
    loaded?: boolean;
    n_chunks?: number;
    n_sources?: number;
    n_graph_nodes?: number;
    embedding_model?: string;
    built_at?: number;
}

interface AssistantQuestion {
    topic: string;
    language: string;
    is_active: boolean;
}

interface Counselor {
    is_active?: boolean;
    show_in_assistant?: boolean;
}

function graphUrl(collection: string): string {
    const qs = new URLSearchParams({ collection });
    return `/api/admin/rag/graph?${qs.toString()}`;
}

function fmtNumber(value: number | undefined): string {
    return value == null ? '-' : String(value);
}

export function AssistantAdminPanel({ onOpenTab }: Props) {
    const { t } = useI18n();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [config, setConfig] = useState<Record<string, string>>({});
    const [collections, setCollections] = useState<CollectionInfo[]>([]);
    const [statsByCollection, setStatsByCollection] = useState<Record<string, RagStats>>({});
    const [questions, setQuestions] = useState<AssistantQuestion[]>([]);
    const [counselors, setCounselors] = useState<Counselor[]>([]);
    const [selectedCollection, setSelectedCollection] = useState('');
    const [reindexing, setReindexing] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [configRes, collectionsRes, questionsRes, counselorsRes] = await Promise.all([
                fetch('/api/admin/config'),
                fetch('/api/site-chat/collections'),
                fetch('/api/admin/assistant-questions'),
                fetch('/api/admin/counselors'),
            ]);
            if (!configRes.ok || !collectionsRes.ok || !questionsRes.ok || !counselorsRes.ok) {
                throw new Error('load failed');
            }
            const configItems: ConfigItem[] = await configRes.json();
            const collectionItems: CollectionInfo[] = await collectionsRes.json();
            const questionItems: AssistantQuestion[] = await questionsRes.json();
            const counselorItems: Counselor[] = await counselorsRes.json();
            const configMap = Object.fromEntries(configItems.map((item) => [item.key, item.value]));
            const statsPairs = await Promise.all(collectionItems.map(async (collection) => {
                try {
                    const res = await fetch(`/api/site-chat/status?collection=${encodeURIComponent(collection.id)}`);
                    return [collection.id, res.ok ? await res.json() : {}] as const;
                } catch {
                    return [collection.id, {}] as const;
                }
            }));
            setConfig(configMap);
            setCollections(collectionItems);
            setStatsByCollection(Object.fromEntries(statsPairs));
            setQuestions(questionItems);
            setCounselors(counselorItems);
            setSelectedCollection((prev) => (
                prev && collectionItems.some((collection) => collection.id === prev)
                    ? prev
                    : (collectionItems[0]?.id ?? '')
            ));
        } catch (e) {
            console.error('Failed to load assistant admin status', e);
            setError(t('admin.assistant.error.load'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        void load();
    }, [load]);

    const selected = collections.find((collection) => collection.id === selectedCollection);
    const selectedStats = statsByCollection[selectedCollection] ?? {};
    const activeQuestions = questions.filter((question) => question.is_active);
    const activeCounselors = counselors.filter((counselor) => counselor.is_active !== false);
    const assistantCounselors = activeCounselors.filter((counselor) => counselor.show_in_assistant !== false);
    const questionLanguages = new Set(activeQuestions.map((question) => question.language)).size;
    const questionTopics = new Set(activeQuestions.map((question) => question.topic)).size;

    const reindex = async () => {
        if (!selectedCollection) return;
        setReindexing(true);
        setError(null);
        try {
            const res = await fetch(`/api/site-chat/reindex?collection=${encodeURIComponent(selectedCollection)}`, { method: 'POST' });
            if (!res.ok) throw new Error('reindex failed');
            const body = await res.json();
            setStatsByCollection((prev) => ({ ...prev, [selectedCollection]: body.stats ?? {} }));
        } catch (e) {
            console.error('Failed to reindex assistant collection', e);
            setError(t('admin.assistant.error.reindex'));
        } finally {
            setReindexing(false);
        }
    };

    const statCards = [
        { label: t('admin.assistant.stat.collections'), value: collections.length },
        { label: t('admin.assistant.stat.sources'), value: selectedStats.n_sources ?? 0 },
        { label: t('admin.assistant.stat.chunks'), value: selectedStats.n_chunks ?? 0 },
        { label: t('admin.assistant.stat.questions'), value: activeQuestions.length },
    ];

    if (loading) {
        return <div className="glass-panel p-8 text-center text-slate-500">{t('admin.assistant.loading')}</div>;
    }

    return (
        <div className="space-y-6">
            <section className="glass-panel p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                            <Bot className="h-5 w-5 text-indigo-600" />
                            {t('admin.assistant.title')}
                        </h2>
                        <p className="mt-1 max-w-3xl text-sm text-slate-500">{t('admin.assistant.subtitle')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link
                            href="/assistente"
                            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                        >
                            <ExternalLink className="h-4 w-4" />
                            {t('admin.assistant.openAssistant')}
                        </Link>
                        <button
                            type="button"
                            onClick={() => void load()}
                            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                        >
                            <RefreshCw className="h-4 w-4" />
                            {t('admin.assistant.refresh')}
                        </button>
                    </div>
                </div>
                {error && (
                    <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
                )}
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {statCards.map((card) => (
                        <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{card.label}</p>
                            <p className="mt-2 text-2xl font-bold text-slate-900">{card.value}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="flex items-center gap-2 font-bold text-slate-900">
                            <Settings className="h-4 w-4 text-indigo-600" />
                            {t('admin.assistant.model.title')}
                        </h3>
                        <button type="button" onClick={() => onOpenTab('config')} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                            {t('admin.assistant.edit')}
                        </button>
                    </div>
                    <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                            <dt className="text-xs font-semibold uppercase text-slate-400">{t('admin.assistant.model.provider')}</dt>
                            <dd className="mt-1 font-medium text-slate-800">{config.active_provider || '-'}</dd>
                        </div>
                        <div>
                            <dt className="text-xs font-semibold uppercase text-slate-400">{t('admin.assistant.model.model')}</dt>
                            <dd className="mt-1 font-medium text-slate-800">{config.model_name || '-'}</dd>
                        </div>
                        <div>
                            <dt className="text-xs font-semibold uppercase text-slate-400">{t('admin.assistant.model.topK')}</dt>
                            <dd className="mt-1 font-medium text-slate-800">{config.site_chat_top_k || '-'}</dd>
                        </div>
                        <div>
                            <dt className="text-xs font-semibold uppercase text-slate-400">{t('admin.assistant.model.minScore')}</dt>
                            <dd className="mt-1 font-medium text-slate-800">{config.site_chat_min_score || '-'}</dd>
                        </div>
                    </dl>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-5">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="flex items-center gap-2 font-bold text-slate-900">
                            <FolderOpen className="h-4 w-4 text-indigo-600" />
                            {t('admin.assistant.rag.title')}
                        </h3>
                        <button type="button" onClick={() => onOpenTab('ragDocs')} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                            {t('admin.assistant.manage')}
                        </button>
                    </div>
                    <label className="mt-4 block text-xs font-semibold uppercase text-slate-400">
                        {t('admin.assistant.rag.collection')}
                        <select
                            value={selectedCollection}
                            onChange={(event) => setSelectedCollection(event.target.value)}
                            className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800"
                        >
                            {collections.map((collection) => (
                                <option key={collection.id} value={collection.id}>{collection.label}</option>
                            ))}
                        </select>
                    </label>
                    <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                        <div className="rounded-md bg-slate-50 p-3">
                            <p className="text-xs font-semibold uppercase text-slate-400">{t('admin.assistant.stat.sources')}</p>
                            <p className="mt-1 text-lg font-bold text-slate-900">{fmtNumber(selectedStats.n_sources)}</p>
                        </div>
                        <div className="rounded-md bg-slate-50 p-3">
                            <p className="text-xs font-semibold uppercase text-slate-400">{t('admin.assistant.stat.chunks')}</p>
                            <p className="mt-1 text-lg font-bold text-slate-900">{fmtNumber(selectedStats.n_chunks)}</p>
                        </div>
                        <div className="rounded-md bg-slate-50 p-3">
                            <p className="text-xs font-semibold uppercase text-slate-400">{t('admin.assistant.rag.graphNodes')}</p>
                            <p className="mt-1 text-lg font-bold text-slate-900">{fmtNumber(selectedStats.n_graph_nodes)}</p>
                        </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={reindexing || !selectedCollection}
                            onClick={() => void reindex()}
                            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                        >
                            <RefreshCw className={`h-4 w-4 ${reindexing ? 'animate-spin' : ''}`} />
                            {reindexing ? t('admin.assistant.rag.reindexing') : t('admin.assistant.rag.reindex')}
                        </button>
                        {selected?.graph_available && (
                            <a
                                href={graphUrl(selected.id)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
                            >
                                <ExternalLink className="h-4 w-4" />
                                {t('admin.assistant.rag.openGraph')}
                            </a>
                        )}
                    </div>
                </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-5">
                    <h3 className="flex items-center gap-2 font-bold text-slate-900">
                        <MessageCircleQuestion className="h-4 w-4 text-indigo-600" />
                        {t('admin.assistant.questions.title')}
                    </h3>
                    <p className="mt-3 text-sm text-slate-500">
                        {t('admin.assistant.questions.summary')
                            .replace('{active}', String(activeQuestions.length))
                            .replace('{total}', String(questions.length))
                            .replace('{topics}', String(questionTopics))
                            .replace('{languages}', String(questionLanguages))}
                    </p>
                    <button type="button" onClick={() => onOpenTab('assistantQuestions')} className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700">
                        {t('admin.assistant.questions.open')}
                    </button>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-5">
                    <h3 className="flex items-center gap-2 font-bold text-slate-900">
                        <Users className="h-4 w-4 text-indigo-600" />
                        {t('admin.assistant.counselors.title')}
                    </h3>
                    <p className="mt-3 text-sm text-slate-500">
                        {t('admin.assistant.counselors.summary')
                            .replace('{visible}', String(assistantCounselors.length))
                            .replace('{active}', String(activeCounselors.length))}
                    </p>
                    <button type="button" onClick={() => onOpenTab('counselors')} className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700">
                        {t('admin.assistant.counselors.open')}
                    </button>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-5">
                    <h3 className="flex items-center gap-2 font-bold text-slate-900">
                        <Gauge className="h-4 w-4 text-indigo-600" />
                        {t('admin.assistant.monitoring.title')}
                    </h3>
                    <p className="mt-3 text-sm text-slate-500">{t('admin.assistant.monitoring.body')}</p>
                    <button type="button" onClick={() => onOpenTab('logs')} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700">
                        <FileText className="h-4 w-4" />
                        {t('admin.assistant.monitoring.open')}
                    </button>
                </div>
            </section>
        </div>
    );
}
