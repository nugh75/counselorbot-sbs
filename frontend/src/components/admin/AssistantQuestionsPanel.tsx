'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import type { AdminAssistantQuestion } from '@/lib/assistant-questions';

// Topic allineati a TOPICS_BY_COLLECTION_AUDIENCE della pagina /assistente.
// Solo questi vengono renderizzati nell'assistente, quindi l'admin sceglie tra questi.
const TOPICS = [
    'cs_strumenti',
    'cs_risultati',
    'cs_approfondire',
    'cs_metodologia',
    'cs_validazione',
    'cs_didattica',
    'cs_materiali',
    'cb_piattaforma',
    'cb_strumenti',
    'cb_percorso',
    'cb_console',
    'cb_counselor',
    'cb_guida',
    'fw_teoria',
    'fw_articoli',
    'fw_autori',
    'q_strumenti',
    'q_fattori',
    'q_scoring',
] as const;
const LANGUAGES = ['it', 'en', 'es', 'fr', 'de', 'sv'] as const;

type FormState = {
    topic: string;
    language: string;
    text: string;
    sort_order: number;
    is_active: boolean;
};

const EMPTY: FormState = {
    topic: 'cs_strumenti',
    language: 'it',
    text: '',
    sort_order: 0,
    is_active: true,
};

export function AssistantQuestionsPanel() {
    const { t } = useI18n();
    const [items, setItems] = useState<AdminAssistantQuestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editingId, setEditingId] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [message, setMessage] = useState('');
    const [filterTopic, setFilterTopic] = useState<string>('all');
    const [filterLang, setFilterLang] = useState<string>('all');

    const refresh = useCallback(async () => {
        setLoading(true);
        setMessage('');
        try {
            const res = await fetch('/api/admin/assistant-questions');
            if (res.status === 401 || res.status === 403) {
                window.location.href = '/';
                return;
            }
            if (!res.ok) throw new Error('load failed');
            setItems(await res.json());
        } catch (e) {
            console.error('Failed to load assistant questions', e);
            setMessage(t('admin.aq.error.load'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const filtered = useMemo(() => {
        return items.filter((q) =>
            (filterTopic === 'all' || q.topic === filterTopic) &&
            (filterLang === 'all' || q.language === filterLang),
        );
    }, [items, filterTopic, filterLang]);

    const countsByTopic = useMemo(() => {
        const map: Record<string, number> = {};
        for (const q of items) {
            if (q.is_active) map[q.topic] = (map[q.topic] ?? 0) + 1;
        }
        return map;
    }, [items]);

    const startNew = () => {
        const lang = filterLang === 'all' ? 'it' : filterLang;
        const topic = filterTopic === 'all' ? 'cs_strumenti' : filterTopic;
        // Append in coda al topic+lingua corrente.
        const maxOrder = items
            .filter((q) => q.topic === topic && q.language === lang)
            .reduce((m, q) => Math.max(m, q.sort_order), -1);
        setForm({ ...EMPTY, topic, language: lang, sort_order: maxOrder + 1 });
        setEditingId('new');
        setMessage('');
    };

    const startEdit = (q: AdminAssistantQuestion) => {
        setForm({
            topic: q.topic,
            language: q.language,
            text: q.text,
            sort_order: q.sort_order,
            is_active: q.is_active,
        });
        setEditingId(q.id);
        setMessage('');
    };

    const cancel = () => {
        setEditingId(null);
        setForm(EMPTY);
        setMessage('');
    };

    const save = async () => {
        if (!form.text.trim()) {
            setMessage(t('admin.aq.error.textRequired'));
            return;
        }
        setSaving(true);
        setMessage('');
        try {
            const body = {
                topic: form.topic,
                language: form.language,
                text: form.text.trim(),
                sort_order: form.sort_order,
                is_active: form.is_active,
            };
            const url = editingId === 'new' ? '/api/admin/assistant-questions' : `/api/admin/assistant-questions/${editingId}`;
            const method = editingId === 'new' ? 'POST' : 'PUT';
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(await res.text());
            cancel();
            await refresh();
        } catch (e) {
            console.error('Failed to save assistant question', e);
            setMessage(t('admin.aq.error.save'));
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (q: AdminAssistantQuestion) => {
        try {
            const res = await fetch(`/api/admin/assistant-questions/${q.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: !q.is_active }),
            });
            if (!res.ok) throw new Error('toggle failed');
            await refresh();
        } catch (e) {
            console.error('Failed to toggle assistant question', e);
            setMessage(t('admin.aq.error.save'));
        }
    };

    const remove = async (q: AdminAssistantQuestion) => {
        if (!window.confirm(t('admin.aq.confirmDelete'))) return;
        setMessage('');
        try {
            const res = await fetch(`/api/admin/assistant-questions/${q.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('delete failed');
            await refresh();
        } catch (e) {
            console.error('Failed to delete assistant question', e);
            setMessage(t('admin.aq.error.delete'));
        }
    };

    const inputCls = 'mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none focus:border-indigo-400';

    const topicLabel = (topic: string) => t(`admin.aq.topic.${topic}`) || topic;

    const renderForm = () => (
        <section className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
            <div className="grid gap-3 md:grid-cols-3">
                <label className="text-xs font-semibold uppercase text-slate-500">
                    {t('admin.aq.form.topic')}
                    <select className={inputCls} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}>
                        {TOPICS.map((topic) => <option key={topic} value={topic}>{topicLabel(topic)}</option>)}
                    </select>
                </label>
                <label className="text-xs font-semibold uppercase text-slate-500">
                    {t('admin.aq.form.language')}
                    <select className={inputCls} value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                        {LANGUAGES.map((lang) => <option key={lang} value={lang}>{lang.toUpperCase()}</option>)}
                    </select>
                </label>
                <label className="text-xs font-semibold uppercase text-slate-500">
                    {t('admin.aq.form.order')}
                    <input
                        type="number"
                        className={inputCls}
                        value={form.sort_order}
                        onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) || 0 })}
                    />
                </label>
            </div>
            <label className="mt-3 block text-xs font-semibold uppercase text-slate-500">
                {t('admin.aq.form.text')}
                <textarea
                    className="mt-1 min-h-[80px] w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400"
                    value={form.text}
                    onChange={(e) => setForm({ ...form, text: e.target.value })}
                    placeholder={t('admin.aq.form.textPlaceholder')}
                />
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                {t('admin.aq.form.active')}
            </label>
            <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}
                    className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    <Check className="h-4 w-4" />
                    {t('admin.aq.save')}
                </button>
                <button
                    type="button"
                    onClick={cancel}
                    className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                    <X className="h-4 w-4" />
                    {t('admin.aq.cancel')}
                </button>
            </div>
        </section>
    );

    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">{t('admin.aq.title')}</h2>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500">{t('admin.aq.subtitle')}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => void refresh()}
                            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                            {t('admin.aq.refresh')}
                        </button>
                        {editingId === null && (
                            <button
                                type="button"
                                onClick={startNew}
                                className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-semibold text-white hover:bg-indigo-700"
                            >
                                <Plus className="h-4 w-4" />
                                {t('admin.aq.new')}
                            </button>
                        )}
                    </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {TOPICS.map((topic) => (
                        <div key={topic} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs font-semibold uppercase text-slate-500">{topicLabel(topic)}</p>
                            <p className="mt-1 text-2xl font-bold text-slate-900">{countsByTopic[topic] ?? 0}</p>
                            <p className="text-xs text-slate-400">{t('admin.aq.activeIt')}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold uppercase text-slate-500">
                        {t('admin.aq.filter.topic')}
                        <select className={inputCls} value={filterTopic} onChange={(e) => setFilterTopic(e.target.value)}>
                            <option value="all">{t('admin.aq.filter.all')}</option>
                            {TOPICS.map((topic) => <option key={topic} value={topic}>{topicLabel(topic)}</option>)}
                        </select>
                    </label>
                    <label className="text-xs font-semibold uppercase text-slate-500">
                        {t('admin.aq.filter.language')}
                        <select className={inputCls} value={filterLang} onChange={(e) => setFilterLang(e.target.value)}>
                            <option value="all">{t('admin.aq.filter.all')}</option>
                            {LANGUAGES.map((lang) => <option key={lang} value={lang}>{lang.toUpperCase()}</option>)}
                        </select>
                    </label>
                </div>
            </section>

            {editingId === 'new' && renderForm()}
            {message && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>}

            <div className="space-y-2">
                {loading && (
                    <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400">
                        {t('admin.aq.loading')}
                    </section>
                )}
                {!loading && filtered.length === 0 && editingId !== 'new' && (
                    <section className="rounded-lg border border-slate-200 bg-white p-8 text-center text-slate-400">
                        {t('admin.aq.empty')}
                    </section>
                )}
                {filtered.map((q) => (
                    editingId === q.id ? (
                        <div key={q.id}>{renderForm()}</div>
                    ) : (
                        <section key={q.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">{topicLabel(q.topic)}</span>
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{q.language.toUpperCase()}</span>
                                    <span className="text-xs text-slate-400">#{q.sort_order}</span>
                                    {!q.is_active && (
                                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{t('admin.aq.inactive')}</span>
                                    )}
                                </div>
                                <p className={`mt-1 text-sm leading-relaxed ${q.is_active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{q.text}</p>
                            </div>
                            <div className="flex shrink-0 gap-1">
                                <button type="button" onClick={() => void toggleActive(q)} className="rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100" title={t('admin.aq.toggle')}>
                                    {q.is_active ? t('admin.aq.disable') : t('admin.aq.enable')}
                                </button>
                                <button type="button" onClick={() => startEdit(q)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title={t('admin.aq.edit')}>
                                    <Pencil className="h-4 w-4" />
                                </button>
                                <button type="button" onClick={() => void remove(q)} className="rounded-md p-2 text-red-500 hover:bg-red-50" title={t('admin.aq.delete')}>
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </section>
                    )
                ))}
            </div>
        </div>
    );
}
