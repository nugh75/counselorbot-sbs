'use client';

import { useCallback, useEffect, useState } from 'react';
import {
    Settings, FileText, BarChart3, RefreshCw, Trash2, Save, ChevronRight, ChevronDown, CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';

// pQBL admin (metodo Jemstedt & Bälter). Stringhe via i18n-admin (admin.pqbl.*).
// API: vedi backend/routes/pqbl.py (endpoint /admin/pqbl/*).

const PQBL_CONFIG_KEYS = [
    'pqbl_skill_extraction_prompt',
    'pqbl_question_generation_prompt',
    'pqbl_onboarding_text',
    'pqbl_model',
];

interface ConfigItem { key: string; value: string; description: string }

interface PqblDoc {
    document_id: string;
    username: string | null;
    filename: string | null;
    language: string;
    size: number;
    status: string;
    error_detail: string | null;
    provider: string | null;
    chunks_total: number;
    chunks_done: number;
    n_questions: number;
    n_sessions: number;
    created_at: string | null;
}

interface PqblOption { key: string; text: string; correct?: boolean; feedback?: string }
interface PqblQuestion { id: number; skill: string; position: number; question_text: string; options: PqblOption[] }

interface Analytics {
    n_documents: number; n_questions: number; n_sessions: number; n_sessions_finished: number; n_attempts: number;
    first_try_correct: number; first_try_total: number; first_try_pct: number;
    by_skill: { skill: string; first_try: number; first_try_correct: number; pct: number }[];
}

type SubTab = 'config' | 'documents' | 'analytics';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function PqblAdminPanel() {
    const { t } = useI18n();
    const [sub, setSub] = useState<SubTab>('documents');

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-lg font-semibold text-slate-900">{t('admin.pqbl.title')}</h2>
                <p className="text-sm text-slate-500 mt-1">{t('admin.pqbl.subtitle')}</p>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
                <SubTabButton icon={<FileText className="w-4 h-4" />} label={t('admin.pqbl.tab.documents')} active={sub === 'documents'} onClick={() => setSub('documents')} />
                <SubTabButton icon={<BarChart3 className="w-4 h-4" />} label={t('admin.pqbl.tab.analytics')} active={sub === 'analytics'} onClick={() => setSub('analytics')} />
                <SubTabButton icon={<Settings className="w-4 h-4" />} label={t('admin.pqbl.tab.config')} active={sub === 'config'} onClick={() => setSub('config')} />
            </div>

            {sub === 'documents' && <DocumentsTab />}
            {sub === 'analytics' && <AnalyticsTab />}
            {sub === 'config' && <ConfigTab />}
        </div>
    );
}

function SubTabButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors border',
                active ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50',
            )}
        >
            {icon}
            {label}
        </button>
    );
}

// ---------------------------------------------------------------------------
// Configurazione: prompt pQBL (sottoinsieme di /admin/config)
// ---------------------------------------------------------------------------
function ConfigTab() {
    const { t, lang } = useI18n();
    const [items, setItems] = useState<ConfigItem[]>([]);
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [savingKey, setSavingKey] = useState<string | null>(null);
    const [savedKey, setSavedKey] = useState<string | null>(null);

    useEffect(() => {
        // pqbl_onboarding_text è mostrato allo studente: si edita la variante della
        // lingua selezionata (chiave suffissata, stesso schema di guided_text_i18n).
        const keys = PQBL_CONFIG_KEYS.map(k =>
            k === 'pqbl_onboarding_text' && lang !== 'it' ? `${k}__${lang}` : k,
        );
        setLoading(true);
        fetch('/api/admin/config')
            .then(r => r.json())
            .then((all: ConfigItem[]) => {
                const filtered = all.filter(c => keys.includes(c.key));
                filtered.sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key));
                setItems(filtered);
                setDrafts(Object.fromEntries(filtered.map(c => [c.key, c.value || ''])));
            })
            .catch(() => setItems([]))
            .finally(() => setLoading(false));
    }, [lang]);

    const save = async (item: ConfigItem) => {
        setSavingKey(item.key);
        try {
            const res = await fetch('/api/admin/config', {
                method: 'POST',
                headers: JSON_HEADERS,
                body: JSON.stringify({ key: item.key, value: drafts[item.key] ?? '', description: item.description }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setSavedKey(item.key);
            setTimeout(() => setSavedKey(k => (k === item.key ? null : k)), 2000);
        } catch {
            alert(t('admin.pqbl.config.saveError'));
        } finally {
            setSavingKey(null);
        }
    };

    if (loading) return <p className="text-sm text-slate-500">{t('admin.pqbl.loading')}</p>;
    if (items.length === 0) return <p className="text-sm text-slate-500">{t('admin.pqbl.config.empty')}</p>;

    return (
        <div className="space-y-5">
            {items.map(item => {
                const isModel = item.key === 'pqbl_model';
                // Descrizione localizzata via i18n-admin; fallback alla descrizione DB (italiana).
                const descI18nKey = `admin.pqbl.config.desc.${item.key.split('__')[0]}`;
                const localizedDesc = t(descI18nKey);
                const description = localizedDesc === descI18nKey ? item.description : localizedDesc;
                return (
                    <div key={item.key} className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-medium text-slate-800 text-sm">
                                    {item.key}
                                    {item.key.includes('__') && (
                                        <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 uppercase">
                                            {t('admin.config.editingLang')}: {lang.toUpperCase()}
                                        </span>
                                    )}
                                </p>
                                <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                            </div>
                            <button
                                onClick={() => save(item)}
                                disabled={savingKey === item.key || (drafts[item.key] ?? '') === (item.value || '')}
                                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                            >
                                {savedKey === item.key ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                                {savedKey === item.key ? t('admin.pqbl.saved') : t('admin.pqbl.save')}
                            </button>
                        </div>
                        {isModel ? (
                            <input
                                type="text"
                                value={drafts[item.key] ?? ''}
                                onChange={e => setDrafts(d => ({ ...d, [item.key]: e.target.value }))}
                                placeholder={t('admin.pqbl.config.modelPlaceholder')}
                                className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono"
                            />
                        ) : (
                            <textarea
                                value={drafts[item.key] ?? ''}
                                onChange={e => setDrafts(d => ({ ...d, [item.key]: e.target.value }))}
                                rows={item.key.startsWith('pqbl_onboarding_text') ? 4 : 8}
                                className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono leading-relaxed"
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Documenti e domande
// ---------------------------------------------------------------------------
function DocumentsTab() {
    const { t } = useI18n();
    const [docs, setDocs] = useState<PqblDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);

    const fetchDocs = useCallback((active = { v: true }) => {
        return fetch('/api/admin/pqbl/documents')
            .then(r => r.json())
            .then(d => { if (active.v) setDocs(d.documents || []); })
            .catch(() => { if (active.v) setDocs([]); })
            .finally(() => { if (active.v) setLoading(false); });
    }, []);

    const load = useCallback(() => { setLoading(true); fetchDocs(); }, [fetchDocs]);

    useEffect(() => {
        const active = { v: true };
        fetchDocs(active);
        return () => { active.v = false; };
    }, [fetchDocs]);

    const deleteDoc = async (id: string) => {
        if (!confirm(t('admin.pqbl.docs.confirmDelete'))) return;
        const res = await fetch(`/api/admin/pqbl/documents/${id}`, { method: 'DELETE' });
        if (res.ok) { setExpanded(null); load(); } else alert(t('admin.pqbl.docs.deleteError'));
    };

    if (loading) return <p className="text-sm text-slate-500">{t('admin.pqbl.loading')}</p>;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{t('admin.pqbl.docs.count', { n: docs.length })}</p>
                <button onClick={load} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    <RefreshCw className="w-3.5 h-3.5" /> {t('admin.pqbl.refresh')}
                </button>
            </div>

            {docs.length === 0 && <p className="text-sm text-slate-500">{t('admin.pqbl.docs.empty')}</p>}

            {docs.map(doc => (
                <div key={doc.document_id} className="rounded-lg border border-slate-200 bg-white">
                    <div className="flex items-center gap-3 p-3">
                        <button onClick={() => setExpanded(e => (e === doc.document_id ? null : doc.document_id))} className="text-slate-400 hover:text-slate-600">
                            {expanded === doc.document_id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm text-slate-800 truncate">{doc.filename || t('admin.pqbl.docs.noName')}</p>
                            <p className="text-xs text-slate-500">
                                {doc.username || t('admin.pqbl.docs.anon')} · {doc.language} · {doc.n_questions} {t('admin.pqbl.docs.questions')} · {doc.n_sessions} {t('admin.pqbl.docs.sessions')}
                                {doc.created_at ? ` · ${new Date(doc.created_at).toLocaleDateString()}` : ''}
                            </p>
                        </div>
                        <StatusBadge status={doc.status} />
                        <button onClick={() => deleteDoc(doc.document_id)} className="text-slate-400 hover:text-red-600 p-1" title={t('admin.pqbl.docs.deleteTitle')}>
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                    {expanded === doc.document_id && <QuestionList documentId={doc.document_id} />}
                </div>
            ))}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const { t } = useI18n();
    const map: Record<string, string> = {
        ready: 'bg-green-50 text-green-700 border-green-200',
        processing: 'bg-amber-50 text-amber-700 border-amber-200',
        error: 'bg-red-50 text-red-700 border-red-200',
    };
    const label = t(`admin.pqbl.status.${status}`);
    return (
        <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', map[status] || 'bg-slate-50 text-slate-600 border-slate-200')}>
            {label.startsWith('admin.pqbl.status.') ? status : label}
        </span>
    );
}

function QuestionList({ documentId }: { documentId: string }) {
    const { t } = useI18n();
    const [questions, setQuestions] = useState<PqblQuestion[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`/api/admin/pqbl/documents/${documentId}/questions`)
            .then(r => r.json())
            .then(d => setQuestions(d.questions || []))
            .catch(() => setQuestions([]))
            .finally(() => setLoading(false));
    }, [documentId]);

    if (loading) return <p className="px-4 pb-4 text-sm text-slate-500">{t('admin.pqbl.q.loading')}</p>;
    if (questions.length === 0) return <p className="px-4 pb-4 text-sm text-slate-500">{t('admin.pqbl.q.empty')}</p>;

    return (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
            {questions.map(q => <QuestionEditor key={q.id} question={q} />)}
        </div>
    );
}

function QuestionEditor({ question }: { question: PqblQuestion }) {
    const { t } = useI18n();
    const [draft, setDraft] = useState<PqblQuestion>(question);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const setOption = (idx: number, patch: Partial<PqblOption>) => {
        setDraft(d => ({ ...d, options: d.options.map((o, i) => (i === idx ? { ...o, ...patch } : o)) }));
    };
    const setCorrect = (idx: number) => {
        setDraft(d => ({ ...d, options: d.options.map((o, i) => ({ ...o, correct: i === idx })) }));
    };

    const save = async () => {
        setSaving(true); setError(null);
        try {
            const res = await fetch(`/api/admin/pqbl/questions/${question.id}`, {
                method: 'PUT',
                headers: JSON_HEADERS,
                body: JSON.stringify({ question_text: draft.question_text, skill: draft.skill, options: draft.options }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.detail || `HTTP ${res.status}`);
            }
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-400">#{question.position + 1}</span>
                <input
                    value={draft.skill}
                    onChange={e => setDraft(d => ({ ...d, skill: e.target.value }))}
                    className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-indigo-700"
                    placeholder={t('admin.pqbl.q.skillPlaceholder')}
                />
            </div>
            <textarea
                value={draft.question_text}
                onChange={e => setDraft(d => ({ ...d, question_text: e.target.value }))}
                rows={2}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="space-y-2">
                {draft.options.map((o, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                        <input
                            type="radio"
                            name={`correct-${question.id}`}
                            checked={!!o.correct}
                            onChange={() => setCorrect(idx)}
                            className="mt-2"
                            title={t('admin.pqbl.q.correctTitle')}
                        />
                        <div className="flex-1 space-y-1">
                            <input
                                value={o.text}
                                onChange={e => setOption(idx, { text: e.target.value })}
                                className={cn('w-full rounded-md border px-2 py-1 text-sm', o.correct ? 'border-green-300 bg-green-50' : 'border-slate-200')}
                                placeholder={`${t('admin.pqbl.q.optionPlaceholder')} ${o.key || idx + 1}`}
                            />
                            <input
                                value={o.feedback || ''}
                                onChange={e => setOption(idx, { feedback: e.target.value })}
                                className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500"
                                placeholder={t('admin.pqbl.q.feedbackPlaceholder')}
                            />
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex items-center gap-3">
                <button
                    onClick={save}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
                >
                    {saved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                    {saved ? t('admin.pqbl.saved') : t('admin.pqbl.q.save')}
                </button>
                {error && <span className="text-xs text-red-600">{error}</span>}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Analitiche
// ---------------------------------------------------------------------------
function AnalyticsTab() {
    const { t } = useI18n();
    const [data, setData] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback((active = { v: true }) => {
        return fetch('/api/admin/pqbl/analytics')
            .then(r => r.json())
            .then(d => { if (active.v) setData(d); })
            .catch(() => { if (active.v) setData(null); })
            .finally(() => { if (active.v) setLoading(false); });
    }, []);

    const load = useCallback(() => { setLoading(true); fetchData(); }, [fetchData]);

    useEffect(() => {
        const active = { v: true };
        fetchData(active);
        return () => { active.v = false; };
    }, [fetchData]);

    if (loading) return <p className="text-sm text-slate-500">{t('admin.pqbl.loading')}</p>;
    if (!data) return <p className="text-sm text-slate-500">{t('admin.pqbl.analytics.empty')}</p>;

    return (
        <div className="space-y-5">
            <div className="flex justify-end">
                <button onClick={load} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    <RefreshCw className="w-3.5 h-3.5" /> {t('admin.pqbl.refresh')}
                </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label={t('admin.pqbl.analytics.stat.documents')} value={data.n_documents} />
                <StatCard label={t('admin.pqbl.analytics.stat.questions')} value={data.n_questions} />
                <StatCard label={t('admin.pqbl.analytics.stat.sessions')} value={data.n_sessions} />
                <StatCard label={t('admin.pqbl.analytics.stat.finished')} value={data.n_sessions_finished} />
                <StatCard label={t('admin.pqbl.analytics.stat.attempts')} value={data.n_attempts} />
                <StatCard label={t('admin.pqbl.analytics.stat.firstTryPct')} value={`${data.first_try_pct}%`} highlight />
            </div>

            <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">{t('admin.pqbl.analytics.bySkill')}</h3>
                {data.by_skill.length === 0 ? (
                    <p className="text-sm text-slate-500">{t('admin.pqbl.analytics.noAttempts')}</p>
                ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                                <tr>
                                    <th className="text-left px-3 py-2 font-medium">{t('admin.pqbl.analytics.col.skill')}</th>
                                    <th className="text-right px-3 py-2 font-medium">{t('admin.pqbl.analytics.col.attempts')}</th>
                                    <th className="text-right px-3 py-2 font-medium">{t('admin.pqbl.analytics.col.correct')}</th>
                                    <th className="text-right px-3 py-2 font-medium">{t('admin.pqbl.analytics.col.pct')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {data.by_skill.map(s => (
                                    <tr key={s.skill}>
                                        <td className="px-3 py-2 text-slate-700">{s.skill}</td>
                                        <td className="px-3 py-2 text-right text-slate-600">{s.first_try}</td>
                                        <td className="px-3 py-2 text-right text-slate-600">{s.first_try_correct}</td>
                                        <td className="px-3 py-2 text-right font-medium text-slate-800">{s.pct}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function StatCard({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
    return (
        <div className={cn('rounded-lg border p-3', highlight ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-white')}>
            <p className="text-xs text-slate-500">{label}</p>
            <p className={cn('text-xl font-bold mt-1', highlight ? 'text-indigo-700' : 'text-slate-900')}>{value}</p>
        </div>
    );
}
