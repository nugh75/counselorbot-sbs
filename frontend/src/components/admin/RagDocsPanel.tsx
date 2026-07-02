'use client';

// Pannello admin: gestione delle basi di conoscenza RAG dell'assistente.
// - collezioni builtin (graphify/plain) + collezioni dinamiche create qui;
// - upload/eliminazione di documenti .md/.pdf con reindicizzazione automatica;
// - reindicizzazione manuale e stato dell'indice per collezione.

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Database, Download, Eye, FolderPlus, GitBranch, Loader2, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

interface RagCollection {
    id: string;
    label: string;
    mode: 'graphify' | 'plain' | string;
    builtin: boolean;
    upload_dir?: string | null;
    graph_available?: boolean;
}

interface RagDoc {
    source: string;
    chunks: number;
    indexed: boolean;
    on_disk: boolean;
    deletable: boolean;
    size: number | null;
    mtime: number | null;
    scope_included: boolean;
    scope_default: boolean;
    scope_forced: boolean;
    index_status: 'indexed' | 'out_of_scope' | 'in_scope_not_indexed' | string;
}

interface RagStats {
    n_chunks: number;
    n_sources: number;
    embedding_model: string;
    built_at: number;
}

interface RagDocsResponse {
    collection: string;
    upload_dir: string | null;
    stats: RagStats;
    docs: RagDoc[];
}

interface RagPreview {
    source: string;
    title: string;
    kind: 'pdf' | 'markdown';
    url: string;
    content?: string;
    loading: boolean;
    error?: string;
}

function fmtSize(bytes: number | null): string {
    if (bytes == null) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(ts: number | null): string {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleDateString();
}

function docFileUrl(collection: string, source: string, download = false): string {
    const qs = new URLSearchParams({ collection, source });
    if (download) qs.set('download', 'true');
    return `/api/admin/rag/docs/file?${qs.toString()}`;
}

function graphUrl(collection: string): string {
    const qs = new URLSearchParams({ collection });
    return `/api/admin/rag/graph?${qs.toString()}`;
}

export function RagDocsPanel() {
    const { t } = useI18n();
    const [collections, setCollections] = useState<RagCollection[]>([]);
    const [selected, setSelected] = useState<string>('');
    const [docs, setDocs] = useState<RagDoc[]>([]);
    const [stats, setStats] = useState<RagStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [docsLoading, setDocsLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [reindexing, setReindexing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [newId, setNewId] = useState('');
    const [newLabel, setNewLabel] = useState('');
    const [creating, setCreating] = useState(false);
    const [preview, setPreview] = useState<RagPreview | null>(null);
    const [scopingSource, setScopingSource] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const loadCollections = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/rag/collections');
            if (res.status === 401 || res.status === 403) { window.location.href = '/'; return; }
            if (!res.ok) throw new Error('load failed');
            const data: RagCollection[] = await res.json();
            setCollections(data);
            setSelected((prev) => (prev && data.some((c) => c.id === prev) ? prev : (data[0]?.id ?? '')));
        } catch (e) {
            console.error('Failed to load RAG collections', e);
            setError(t('admin.rag.error.load'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    const loadDocs = useCallback(async (collection: string) => {
        if (!collection) return;
        setDocsLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/rag/docs?collection=${encodeURIComponent(collection)}`);
            if (!res.ok) throw new Error('load failed');
            const data: RagDocsResponse = await res.json();
            setDocs(data.docs || []);
            setStats(data.stats || null);
        } catch (e) {
            console.error('Failed to load RAG docs', e);
            setError(t('admin.rag.error.load'));
        } finally {
            setDocsLoading(false);
        }
    }, [t]);

    useEffect(() => { void loadCollections(); }, [loadCollections]);
    useEffect(() => { if (selected) void loadDocs(selected); }, [selected, loadDocs]);
    useEffect(() => { setPreview(null); }, [selected]);

    const currentCollection = collections.find((c) => c.id === selected);

    const handleCreate = async () => {
        const slug = newId.trim().toLowerCase();
        if (!slug) return;
        setCreating(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/rag/collections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: slug, label: newLabel.trim() || slug }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.detail || 'create failed');
            }
            setNewId('');
            setNewLabel('');
            setShowCreate(false);
            await loadCollections();
            setSelected(slug);
        } catch (e) {
            setError(e instanceof Error && e.message !== 'create failed' ? e.message : t('admin.rag.error.create'));
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteCollection = async () => {
        if (!currentCollection || currentCollection.builtin) return;
        if (!window.confirm(t('admin.rag.confirmDeleteCollection').replace('{id}', currentCollection.id))) return;
        setError(null);
        try {
            const res = await fetch(`/api/admin/rag/collections/${encodeURIComponent(currentCollection.id)}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('delete failed');
            setSelected('');
            await loadCollections();
        } catch (e) {
            console.error('Failed to delete collection', e);
            setError(t('admin.rag.error.delete'));
        }
    };

    const handleUpload = async (file: File) => {
        if (!selected) return;
        setUploading(true);
        setError(null);
        setNotice(null);
        try {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch(`/api/admin/rag/docs?collection=${encodeURIComponent(selected)}`, {
                method: 'POST',
                body: form,
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.detail || 'upload failed');
            if (body?.warning) setNotice(body.warning);
            await loadDocs(selected);
        } catch (e) {
            setError(e instanceof Error && e.message !== 'upload failed' ? e.message : t('admin.rag.error.upload'));
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const handleDeleteDoc = async (doc: RagDoc) => {
        if (!selected) return;
        if (!window.confirm(t('admin.rag.confirmDeleteDoc').replace('{name}', doc.source))) return;
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/rag/docs?collection=${encodeURIComponent(selected)}&source=${encodeURIComponent(doc.source)}`,
                { method: 'DELETE' },
            );
            if (!res.ok) throw new Error('delete failed');
            await loadDocs(selected);
        } catch (e) {
            console.error('Failed to delete doc', e);
            setError(t('admin.rag.error.delete'));
        }
    };

    const handleReindex = async () => {
        if (!selected) return;
        setReindexing(true);
        setError(null);
        try {
            const res = await fetch(`/api/site-chat/reindex?collection=${encodeURIComponent(selected)}`, { method: 'POST' });
            if (!res.ok) throw new Error('reindex failed');
            await loadDocs(selected);
        } catch (e) {
            console.error('Failed to reindex', e);
            setError(t('admin.rag.error.reindex'));
        } finally {
            setReindexing(false);
        }
    };

    const handleScope = async (doc: RagDoc, inScope: boolean) => {
        if (!selected) return;
        setScopingSource(doc.source);
        setError(null);
        try {
            const res = await fetch('/api/admin/rag/docs/scope', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ collection: selected, source: doc.source, in_scope: inScope }),
            });
            if (!res.ok) throw new Error('scope failed');
            await loadDocs(selected);
        } catch (e) {
            console.error('Failed to update doc scope', e);
            setError(t('admin.rag.error.scope'));
        } finally {
            setScopingSource(null);
        }
    };

    const handlePreview = async (doc: RagDoc) => {
        if (!selected || !doc.on_disk) return;
        const url = docFileUrl(selected, doc.source);
        const title = doc.source.split('/').pop() || doc.source;
        if (doc.source.toLowerCase().endsWith('.pdf')) {
            setPreview({ source: doc.source, title, kind: 'pdf', url, loading: false });
            return;
        }
        setPreview({ source: doc.source, title, kind: 'markdown', url, loading: true });
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(t('admin.rag.previewUnavailable'));
            const body = await res.json();
            setPreview({
                source: doc.source,
                title: body.title || title,
                kind: 'markdown',
                url,
                content: body.content || '',
                loading: false,
            });
        } catch (e) {
            setPreview({
                source: doc.source,
                title,
                kind: 'markdown',
                url,
                loading: false,
                error: e instanceof Error ? e.message : t('admin.rag.previewUnavailable'),
            });
        }
    };

    if (loading) {
        return <div className="glass-panel p-8 text-center text-slate-500">{t('admin.rag.loading')}</div>;
    }

    return (
        <div className="space-y-6">
            <div className="glass-panel p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Database className="h-5 w-5 text-indigo-600" />
                            {t('admin.rag.title')}
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">{t('admin.rag.subtitle')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowCreate((v) => !v)}
                        className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
                    >
                        <FolderPlus className="h-4 w-4" />
                        {t('admin.rag.newCollection')}
                    </button>
                </div>

                {showCreate && (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('admin.rag.field.id')}</label>
                                <input
                                    value={newId}
                                    onChange={(e) => setNewId(e.target.value)}
                                    placeholder="es. normativa-scuola"
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                />
                                <p className="text-[11px] text-slate-400 mt-1">{t('admin.rag.field.idHint')}</p>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">{t('admin.rag.field.label')}</label>
                                <input
                                    value={newLabel}
                                    onChange={(e) => setNewLabel(e.target.value)}
                                    placeholder="es. Normativa scolastica"
                                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                />
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                disabled={creating || !newId.trim()}
                                onClick={handleCreate}
                                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                                {t('admin.rag.create')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowCreate(false)}
                                className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-100"
                            >
                                {t('admin.rag.cancel')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Selettore collezione */}
                <div className="mt-4 flex flex-wrap gap-2">
                    {collections.map((c) => (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => setSelected(c.id)}
                            className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                                selected === c.id
                                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            {c.label}
                            <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">
                                {c.builtin ? c.mode : t('admin.rag.dynamic')}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
            )}
            {notice && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    {notice}
                </div>
            )}

            {currentCollection && (
                <div className="glass-panel p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 className="font-bold text-slate-900">{currentCollection.label}</h3>
                            {stats && (
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {t('admin.rag.stats')
                                        .replace('{chunks}', String(stats.n_chunks))
                                        .replace('{sources}', String(stats.n_sources))
                                        .replace('{model}', stats.embedding_model || '—')}
                                </p>
                            )}
                            {currentCollection.mode === 'graphify' && (
                                <p className="text-[11px] text-amber-600 mt-1">{t('admin.rag.graphifyNote')}</p>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
                                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                {uploading ? t('admin.rag.uploading') : t('admin.rag.upload')}
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".md,.pdf"
                                    className="hidden"
                                    onChange={(e) => {
                                        const f = e.target.files?.[0];
                                        if (f) void handleUpload(f);
                                    }}
                                />
                            </label>
                            {currentCollection.graph_available && (
                                <a
                                    href={graphUrl(currentCollection.id)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
                                >
                                    <GitBranch className="h-4 w-4" />
                                    {t('admin.rag.openGraph')}
                                </a>
                            )}
                            <button
                                type="button"
                                disabled={reindexing}
                                onClick={handleReindex}
                                className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                            >
                                <RefreshCw className={`h-4 w-4 ${reindexing ? 'animate-spin' : ''}`} />
                                {reindexing ? t('admin.rag.reindexing') : t('admin.rag.reindex')}
                            </button>
                            {!currentCollection.builtin && (
                                <button
                                    type="button"
                                    onClick={handleDeleteCollection}
                                    className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    {t('admin.rag.deleteCollection')}
                                </button>
                            )}
                        </div>
                    </div>

                    {docsLoading ? (
                        <div className="py-8 text-center text-sm text-slate-500">{t('admin.rag.loading')}</div>
                    ) : docs.length === 0 ? (
                        <div className="py-8 text-center text-sm text-slate-500">{t('admin.rag.empty')}</div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                                        <th className="py-2 pr-3 font-semibold">{t('admin.rag.table.doc')}</th>
                                        <th className="py-2 pr-3 font-semibold">{t('admin.rag.table.size')}</th>
                                        <th className="py-2 pr-3 font-semibold">{t('admin.rag.table.mtime')}</th>
                                        <th className="py-2 pr-3 font-semibold">{t('admin.rag.table.scope')}</th>
                                        <th className="py-2 pr-3 font-semibold">{t('admin.rag.table.chunks')}</th>
                                        <th className="py-2 font-semibold">{t('admin.rag.table.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {docs.map((doc) => (
                                        <Fragment key={doc.source}>
                                            <tr className="border-b border-slate-100">
                                                <td className="py-2 pr-3 text-slate-700 break-all">{doc.source}</td>
                                                <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{fmtSize(doc.size)}</td>
                                                <td className="py-2 pr-3 text-slate-500 whitespace-nowrap">{fmtDate(doc.mtime)}</td>
                                                <td className="py-2 pr-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={scopingSource === doc.source}
                                                            onClick={() => void handleScope(doc, !doc.scope_included)}
                                                            title={doc.scope_included ? t('admin.rag.scope.exclude') : t('admin.rag.scope.include')}
                                                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium disabled:opacity-60 ${
                                                                doc.scope_included
                                                                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                            }`}
                                                        >
                                                            {scopingSource === doc.source && <Loader2 className="h-3 w-3 animate-spin" />}
                                                            {doc.scope_included ? t('admin.rag.scope.in') : t('admin.rag.scope.out')}
                                                        </button>
                                                        {doc.scope_forced && (
                                                            <span className="text-[10px] font-medium uppercase tracking-wide text-amber-600">
                                                                {t('admin.rag.scope.manual')}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-2 pr-3 whitespace-nowrap">
                                                    {doc.indexed ? (
                                                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                                            {doc.chunks} chunk
                                                        </span>
                                                    ) : !doc.scope_included ? (
                                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                                                            {t('admin.rag.index.outOfScope')}
                                                        </span>
                                                    ) : (
                                                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                                                            {t('admin.rag.index.inScopeMissing')}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2">
                                                    <div className="flex items-center gap-1">
                                                        {doc.on_disk && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => void handlePreview(doc)}
                                                                    title={t('admin.rag.previewDoc')}
                                                                    aria-label={t('admin.rag.previewDoc')}
                                                                    className="rounded-md p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                                                                >
                                                                    <Eye className="h-4 w-4" />
                                                                </button>
                                                                <a
                                                                    href={docFileUrl(selected, doc.source, true)}
                                                                    title={t('admin.rag.downloadDoc')}
                                                                    aria-label={t('admin.rag.downloadDoc')}
                                                                    className="rounded-md p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                                                                >
                                                                    <Download className="h-4 w-4" />
                                                                </a>
                                                            </>
                                                        )}
                                                        {doc.deletable && (
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleDeleteDoc(doc)}
                                                                title={t('admin.rag.deleteDoc')}
                                                                aria-label={t('admin.rag.deleteDoc')}
                                                                className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {preview?.source === doc.source && (
                                                <tr className="border-b border-slate-100 bg-slate-50">
                                                    <td colSpan={6} className="p-0">
                                                        <div className="m-3 rounded-lg border border-slate-200 bg-white">
                                                            <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3">
                                                                <Eye className="h-4 w-4 shrink-0 text-indigo-600" />
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="truncate text-sm font-semibold text-slate-800" title={preview.source}>{preview.title}</p>
                                                                    <p className="truncate text-xs text-slate-400">{preview.source}</p>
                                                                </div>
                                                                <a
                                                                    href={docFileUrl(selected, preview.source, true)}
                                                                    title={t('admin.rag.downloadDoc')}
                                                                    aria-label={t('admin.rag.downloadDoc')}
                                                                    className="rounded-md p-1.5 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                                                                >
                                                                    <Download className="h-4 w-4" />
                                                                </a>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPreview(null)}
                                                                    title={t('admin.rag.closePreview')}
                                                                    aria-label={t('admin.rag.closePreview')}
                                                                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </button>
                                                            </div>
                                                            <div className="h-[min(70vh,42rem)] overflow-hidden">
                                                                {preview.kind === 'pdf' ? (
                                                                    <iframe title={preview.title} src={preview.url} className="h-full w-full" />
                                                                ) : preview.loading ? (
                                                                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                                                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                                        {t('admin.rag.previewLoading')}
                                                                    </div>
                                                                ) : preview.error ? (
                                                                    <div className="p-4 text-sm text-red-700">{preview.error}</div>
                                                                ) : (
                                                                    <pre className="h-full overflow-auto whitespace-pre-wrap p-4 text-sm leading-relaxed text-slate-700">{preview.content}</pre>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
