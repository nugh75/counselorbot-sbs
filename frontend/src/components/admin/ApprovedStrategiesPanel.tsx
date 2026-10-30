'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';

type Lang = 'it' | 'en' | 'es' | 'fr' | 'de' | 'sv';

const LANGS: Lang[] = ['it', 'en', 'es', 'fr', 'de', 'sv'];
const EMPTY_TEXTS: Record<Lang, string> = { it: '', en: '', es: '', fr: '', de: '', sv: '' };

interface ApprovedStrategy {
    id: string;
    status: 'approved' | 'draft' | string;
    questionnaires: string[];
    keywords: string | null;
    texts: Record<string, string>;
}

interface ApprovedStrategiesResponse {
    source: 'db' | 'file' | string;
    strategies: ApprovedStrategy[];
}

type FormState = {
    id: string;
    status: 'approved' | 'draft';
    questionnaires: string;
    keywords: string;
    texts: Record<string, string>;
};

const EMPTY: FormState = {
    id: '',
    status: 'draft',
    questionnaires: 'QSA',
    keywords: '',
    texts: { ...EMPTY_TEXTS },
};

export function ApprovedStrategiesPanel() {
    const { t } = useI18n();
    const [strategies, setStrategies] = useState<ApprovedStrategy[]>([]);
    const [source, setSource] = useState<string>('file');
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [lang, setLang] = useState<Lang>('it');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/approved-strategies');
            if (res.status === 401 || res.status === 403) { window.location.href = '/'; return; }
            if (!res.ok) throw new Error('load failed');
            const data: ApprovedStrategiesResponse = await res.json();
            setStrategies(data.strategies || []);
            setSource(data.source || 'file');
        } catch (e) {
            console.error('Failed to load approved strategies', e);
            setError(t('admin.approvedStrategies.error.load'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { void refresh(); }, [refresh]);

    const startNew = () => {
        setForm({ ...EMPTY, texts: { ...EMPTY_TEXTS } });
        setLang('it');
        setEditingId('new');
        setError(null);
    };

    const startEdit = (strategy: ApprovedStrategy) => {
        setForm({
            id: strategy.id,
            status: strategy.status === 'approved' ? 'approved' : 'draft',
            questionnaires: (strategy.questionnaires || []).join(', '),
            keywords: strategy.keywords || '',
            texts: { ...EMPTY_TEXTS, ...(strategy.texts || {}) },
        });
        setLang('it');
        setEditingId(strategy.id);
        setError(null);
    };

    const cancel = () => {
        setEditingId(null);
        setForm({ ...EMPTY, texts: { ...EMPTY_TEXTS } });
        setError(null);
    };

    const buildBody = () => {
        const texts = Object.fromEntries(
            Object.entries(form.texts)
                .map(([key, value]) => [key, value.trim()])
                .filter(([, value]) => value),
        );
        return {
            id: form.id.trim(),
            status: form.status,
            questionnaires: form.questionnaires.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean),
            keywords: form.keywords.trim() || null,
            texts,
        };
    };

    const save = async () => {
        if (!form.id.trim()) {
            setError(t('admin.approvedStrategies.error.idRequired'));
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const method = editingId === 'new' ? 'POST' : 'PUT';
            const url = editingId === 'new'
                ? '/api/admin/approved-strategies'
                : `/api/admin/approved-strategies/${encodeURIComponent(String(editingId))}`;
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildBody()),
            });
            if (!res.ok) throw new Error(await res.text());
            cancel();
            await refresh();
        } catch (e) {
            console.error('Failed to save approved strategy', e);
            setError(t('admin.approvedStrategies.error.save'));
        } finally {
            setSaving(false);
        }
    };

    const [confirmDelete, setConfirmDelete] = useState<string | number | null>(null);
    const remove = async (id: string) => {
        setError(null);
        try {
            const res = await fetch(`/api/admin/approved-strategies/${encodeURIComponent(id)}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await res.text());
            await refresh();
        } catch (e) {
            console.error('Failed to delete approved strategy', e);
            setError(t('admin.approvedStrategies.error.delete'));
        }
    };

    const inputCls = 'h-9 w-full rounded-control border border-line bg-surface px-2 text-sm text-ink-body outline-none focus:border-focus';
    const areaCls = 'min-h-[90px] w-full rounded-control border border-line bg-surface px-2 py-1 text-sm text-ink-body outline-none focus:border-focus';

    const renderForm = () => (
        <div className="rounded-lg border border-brand-line bg-brand-soft/40 p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col text-xs font-semibold text-ink-muted">
                    {t('admin.approvedStrategies.field.id')}
                    <input className={inputCls} value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="qsa-planning-next-step" />
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">
                    {t('admin.approvedStrategies.field.status')}
                    <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as FormState['status'] })}>
                        <option value="approved">{t('admin.approvedStrategies.status.approved')}</option>
                        <option value="draft">{t('admin.approvedStrategies.status.draft')}</option>
                    </select>
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">
                    {t('admin.approvedStrategies.field.questionnaires')}
                    <input className={inputCls} value={form.questionnaires} onChange={(e) => setForm({ ...form, questionnaires: e.target.value })} placeholder="QSA, QSAr" />
                </label>
                <label className="flex flex-col text-xs font-semibold text-ink-muted">
                    {t('admin.approvedStrategies.field.keywords')}
                    <input className={inputCls} value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="C2 pianificazione obiettivo" />
                </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-1">
                {LANGS.map((item) => (
                    <button
                        key={item}
                        type="button"
                        onClick={() => setLang(item)}
                        className={`min-h-control rounded-control border px-2 py-1 text-xs font-semibold ${lang === item ? 'border-brand-line bg-brand-soft text-link' : 'border-line bg-surface text-ink-muted'}`}
                    >
                        {item}
                    </button>
                ))}
            </div>
            <label className="mt-2 flex flex-col text-xs font-semibold text-ink-muted">
                {t('admin.approvedStrategies.field.text', { lang })}
                <textarea
                    className={areaCls}
                    value={form.texts[lang] || ''}
                    onChange={(e) => setForm((current) => ({ ...current, texts: { ...current.texts, [lang]: e.target.value } }))}
                    placeholder={t('admin.approvedStrategies.placeholder.text')}
                />
            </label>

            <div className="mt-4 flex items-center gap-2">
                <Button type="button" disabled={saving} onClick={() => void save()}>
                    <Check className="h-4 w-4" /> {t('common.save')}
                </Button>
                <Button variant="secondary" type="button" onClick={cancel}>
                    <X className="h-4 w-4" /> {t('common.cancel')}
                </Button>
            </div>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-line bg-surface p-4">
                <div>
                    <h2 className="text-lg font-semibold text-ink">{t('admin.approvedStrategies.title')}</h2>
                    <p className="text-sm text-ink-muted">
                        {t('admin.approvedStrategies.subtitle', { source: source === 'db' ? t('admin.approvedStrategies.source.db') : t('admin.approvedStrategies.source.file') })}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" type="button" onClick={() => void refresh()} aria-label={t('common.refresh')} title={t('common.refresh')} className="w-control px-0">
                        <RefreshCw className="h-4 w-4" aria-hidden />
                    </Button>
                    {editingId === null && (
                        <Button type="button" onClick={startNew}>
                            <Plus className="h-4 w-4" /> {t('admin.approvedStrategies.new')}
                        </Button>
                    )}
                </div>
            </div>

            {error && <Callout variant="danger">{error}</Callout>}
            {editingId === 'new' && renderForm()}

            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-line text-xs text-ink-muted">
                        <tr>
                            <th className="px-4 py-2 font-semibold">{t('admin.approvedStrategies.table.strategy')}</th>
                            <th className="px-4 py-2 font-semibold">{t('admin.approvedStrategies.table.questionnaires')}</th>
                            <th className="px-4 py-2 font-semibold">{t('admin.approvedStrategies.table.status')}</th>
                            <th className="px-4 py-2 font-semibold">{t('admin.approvedStrategies.table.keyword')}</th>
                            <th className="px-4 py-2 text-right font-semibold">{t('admin.approvedStrategies.table.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                        {loading && <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">{t('common.loading')}</td></tr>}
                        {!loading && strategies.length === 0 && editingId !== 'new' && (
                            <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-muted">{t('admin.approvedStrategies.empty')}</td></tr>
                        )}
                        {strategies.map((strategy) => (
                            editingId === strategy.id ? (
                                <tr key={strategy.id}><td colSpan={5} className="px-4 py-4">{renderForm()}</td></tr>
                            ) : (
                                <tr key={strategy.id}>
                                    <td className="px-4 py-2">
                                        <div className="font-mono text-xs font-semibold text-ink">{strategy.id}</div>
                                        <div className="mt-1 max-w-xl truncate text-xs text-ink-muted">{strategy.texts.it || strategy.texts.en || '-'}</div>
                                    </td>
                                    <td className="px-4 py-2 text-xs text-ink-muted">{(strategy.questionnaires || []).join(', ') || '-'}</td>
                                    <td className="px-4 py-2">
                                        <span className={`rounded px-2 py-1 text-xs font-semibold ${strategy.status === 'approved' ? 'bg-success-soft text-success' : 'bg-surface-raised text-ink-muted'}`}>
                                            {strategy.status === 'approved' ? t('admin.approvedStrategies.status.approved') : t('admin.approvedStrategies.status.draft')}
                                        </span>
                                    </td>
                                    <td className="max-w-xs truncate px-4 py-2 text-xs text-ink-muted">{strategy.keywords || '-'}</td>
                                    <td className="px-4 py-2">
                                        <div className="flex justify-end gap-1">
                                            <button type="button" onClick={() => startEdit(strategy)} className="inline-flex min-h-control min-w-control items-center justify-center rounded p-2 text-ink-muted hover:bg-surface-raised hover:text-ink" aria-label={t('admin.approvedStrategies.editAria', { id: strategy.id })}><Pencil className="h-4 w-4" /></button>
                                            {confirmDelete === strategy.id
                                                ? <ConfirmInline question={t('admin.approvedStrategies.confirmDelete', { id: strategy.id })} onConfirm={() => { setConfirmDelete(null); void remove(strategy.id); }} onCancel={() => setConfirmDelete(null)} />
                                                : <button type="button" onClick={() => setConfirmDelete(strategy.id)} className="inline-flex min-h-control min-w-control items-center justify-center rounded p-2 text-danger hover:bg-danger-soft" aria-label={t('admin.approvedStrategies.deleteAria', { id: strategy.id })}><Trash2 className="h-4 w-4" /></button>}
                                        </div>
                                    </td>
                                </tr>
                            )
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
